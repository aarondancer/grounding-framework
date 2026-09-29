import { createHash } from "node:crypto";
import {
  type CacheMetrics,
  ContentCacheKind,
  contentKey,
  DEFAULT_TTLS_MS,
  NoopCacheMetrics,
  type RuntimeCache,
} from "@grounding/cache";
import { type Diagnostic, RuntimeErrorCode } from "@grounding/core";

/**
 * Embedding providers (spec/15 open decision, spec/16 cache contract).
 *
 * - `embeddings` are computed at materialization time for every entity that
 *   carries semantic text; vectors land in `semantic_entities`.
 * - Provider choice is deployment configuration: `deterministic` for tests
 *   and local dev, `openai-compatible` for a real HTTP embedding service.
 * - The `embedding-content` Valkey cache is content-addressed by
 *   embedding-config-hash + semantic-hash, so an embedding survives cache
 *   eviction only as a recompute (never a semantic difference).
 */

export interface EmbeddingProvider {
  /** Provider identifier as configured (`deterministic`, `openai-compatible`, …). */
  readonly provider: string;
  readonly model: string;
  /** Vector dimension — MUST equal the configured + migrated dimension. */
  readonly dimensions: number;
  embed(texts: string[]): Promise<number[][]>;
}

/**
 * Deterministic local provider: vector = bytes of repeated sha256 rounds of
 * the text mapped into [-1, 1). Stable across runs and processes; NOT a
 * semantic model — tests and dev only.
 */
export function deterministicProvider(dimensions: number): EmbeddingProvider {
  return {
    provider: "deterministic",
    model: "sha256-fixture",
    dimensions,
    async embed(texts) {
      return texts.map((text) => {
        const vec = new Array<number>(dimensions);
        let round = createHash("sha256").update(text).digest();
        for (let i = 0; i < dimensions; i++) {
          const byte = round[i % round.length] ?? 0;
          if (i % round.length === round.length - 1) {
            round = createHash("sha256").update(round).digest();
          }
          vec[i] = byte / 255 - 0.5;
        }
        return vec;
      });
    },
  };
}

/** OpenAI-compatible HTTP adapter (`POST {baseUrl}/embeddings`). */
export function openaiCompatibleProvider(opts: {
  baseUrl: string;
  model: string;
  dimensions: number;
  apiKey?: string;
  batchSize?: number;
}): EmbeddingProvider {
  const batchSize = opts.batchSize ?? 64;
  return {
    provider: "openai-compatible",
    model: opts.model,
    dimensions: opts.dimensions,
    async embed(texts) {
      const out: number[][] = [];
      for (let i = 0; i < texts.length; i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const res = await fetch(`${opts.baseUrl.replace(/\/+$/, "")}/embeddings`, {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: {
            "content-type": "application/json",
            ...(opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {}),
          },
          body: JSON.stringify({ model: opts.model, input: batch }),
        });
        if (!res.ok) {
          throw new Error(`embedding provider responded ${res.status}`);
        }
        const body = (await res.json()) as {
          data?: { embedding: number[]; index?: number }[];
        };
        const data = body.data ?? [];
        if (data.length > 0 && data.every((d) => d.index !== undefined)) {
          data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        }
        const vectors = data.map((d) => d.embedding);
        if (vectors.length !== batch.length) {
          throw new Error(
            `embedding provider returned ${vectors.length} vectors for ${batch.length} inputs`,
          );
        }
        for (const v of vectors) {
          if (v.length !== opts.dimensions) {
            // spec/08: never truncate, pad, or cast embeddings silently.
            throw new Error(`embedding dimension ${v.length} != configured ${opts.dimensions}`);
          }
          out.push(v);
        }
      }
      return out;
    },
  };
}

export type EmbeddingConfig = {
  provider?: string;
  model?: string;
  dimensions?: number;
  baseUrl?: string;
};

/**
 * Resolve the effective provider from grounding.config + deployment env.
 * `GROUNDING_EMBEDDING_PROVIDER` overrides the authored provider so a repo
 * corpus can name the production provider while dev/test pin `deterministic`.
 */
export function resolveProvider(
  config: EmbeddingConfig,
  env: NodeJS.ProcessEnv = process.env,
): EmbeddingProvider | Diagnostic {
  const dimensions = config.dimensions;
  if (typeof dimensions !== "number" || dimensions < 1) {
    return {
      severity: "error",
      code: RuntimeErrorCode.INVALID_INPUT,
      message: "grounding.config embedding.dimensions is required (integer >= 1)",
    };
  }
  const provider = env.GROUNDING_EMBEDDING_PROVIDER ?? config.provider;
  if (provider === "deterministic") {
    return deterministicProvider(dimensions);
  }
  if (provider === "openai-compatible") {
    const baseUrl = env.GROUNDING_EMBEDDING_BASE_URL ?? config.baseUrl;
    if (!baseUrl) {
      return {
        severity: "error",
        code: RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
        message:
          "openai-compatible embedding provider requires a base URL (config embedding.baseUrl or GROUNDING_EMBEDDING_BASE_URL)",
      };
    }
    return openaiCompatibleProvider({
      baseUrl,
      model: config.model ?? "embedding",
      dimensions,
      ...(env.GROUNDING_EMBEDDING_API_KEY !== undefined
        ? { apiKey: env.GROUNDING_EMBEDDING_API_KEY }
        : {}),
    });
  }
  return {
    severity: "error",
    code: RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
    message: `unknown embedding provider "${String(provider)}" (supported: deterministic, openai-compatible)`,
  };
}

/**
 * Content-addressed embedding cache (spec/16 `embedding-content` kind).
 * Cache failure is a miss; a miss recomputes — embeddings never differ.
 *
 * `configHash` MUST identify the resolved effective provider
 * (provider/model/dimensions), not the authored config — env overrides
 * change what a vector means, so they must change the key (spec/16:61).
 */
export class CachedEmbedder {
  constructor(
    private readonly cache: RuntimeCache | null,
    private readonly configHash: string,
    private readonly metrics: CacheMetrics = new NoopCacheMetrics(),
  ) {}

  /**
   * Embeds each item, serving repeated (config, semanticHash) pairs from
   * Valkey and batching misses through the provider in one call. No
   * single-flight lease: build-time embedders are already serialized by
   * the per-namespace advisory lock, so stampedes cannot form here.
   */
  async embed(
    provider: EmbeddingProvider,
    items: { semanticHash: string; semanticText: string }[],
  ): Promise<Map<string, number[]>> {
    const vectors = new Map<string, number[]>();
    const misses = new Map<string, { semanticHash: string; semanticText: string }>();

    for (const item of items) {
      const key = this.keyFor(item.semanticHash);
      const cached = this.cache ? await this.cache.get<number[]>(key) : null;
      if (cached && cached.length === provider.dimensions) {
        vectors.set(item.semanticHash, cached);
        this.metrics.record({ type: "embedding_avoided" });
      } else if (!misses.has(item.semanticHash)) {
        misses.set(item.semanticHash, item);
      }
    }

    const missList = [...misses.values()];
    if (missList.length > 0) {
      const computed = await provider.embed(missList.map((m) => m.semanticText));
      for (let i = 0; i < missList.length; i++) {
        const miss = missList[i];
        const vec = computed[i];
        if (!miss || !vec) continue;
        vectors.set(miss.semanticHash, vec);
        if (this.cache) {
          await this.cache.set(this.keyFor(miss.semanticHash), vec, {
            ttlMs: DEFAULT_TTLS_MS["embedding-content"],
          });
        }
      }
    }
    return vectors;
  }

  private keyFor(semanticHash: string) {
    return contentKey(ContentCacheKind.EMBEDDING_CONTENT, this.configHash, semanticHash);
  }
}
