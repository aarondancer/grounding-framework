import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import type { CacheKey, RuntimeCache } from "@grounding/cache";
import {
  CachedEmbedder,
  deterministicProvider,
  openaiCompatibleProvider,
  resolveEmbeddingRuntime,
  resolveProvider,
} from "./index.ts";

describe("deterministicProvider", () => {
  test("stable across calls, respects dimensions, distinguishes texts", async () => {
    const p = deterministicProvider(8);
    const a1 = await p.embed(["hello"]);
    const a2 = await p.embed(["hello"]);
    const b = await p.embed(["world"]);
    expect(a1).toEqual(a2);
    expect(a1[0]?.length).toBe(8);
    expect(a1[0]).not.toEqual(b[0]);
    for (const v of a1[0] ?? []) {
      expect(v).toBeGreaterThanOrEqual(-0.5);
      expect(v).toBeLessThan(0.5);
    }
  });
});

describe("resolveProvider", () => {
  const cfg = { provider: "openai-compatible", model: "m", dimensions: 4 };

  test("env override selects deterministic", () => {
    const p = resolveProvider(cfg, { GROUNDING_EMBEDDING_PROVIDER: "deterministic" });
    expect("embed" in p && p.provider).toBe("deterministic");
  });

  test("openai-compatible without endpoint → EMBEDDING_UNAVAILABLE", () => {
    const p = resolveProvider(cfg, {});
    expect("embed" in p).toBe(false);
    if (!("embed" in p)) expect(p.code).toBe("EMBEDDING_UNAVAILABLE");
  });

  test("openai-compatible with baseUrl resolves", () => {
    const p = resolveProvider(cfg, { GROUNDING_EMBEDDING_BASE_URL: "http://x" });
    expect("embed" in p && p.provider).toBe("openai-compatible");
  });

  test("unknown provider → EMBEDDING_UNAVAILABLE", () => {
    const p = resolveProvider({ ...cfg, provider: "bogus" }, {});
    expect("embed" in p).toBe(false);
  });
});

/** Minimal in-memory RuntimeCache for cache tests. */
function memoryCache() {
  const store = new Map<string, string>();
  const cache: RuntimeCache = {
    async get<T>(key: CacheKey) {
      const raw = store.get(key);
      return raw === undefined ? null : (JSON.parse(raw).data as T);
    },
    async set<T>(key: CacheKey, value: T) {
      store.set(key, JSON.stringify({ v: 1, data: value }));
    },
    async delete(key: CacheKey) {
      store.delete(key);
    },
    async getOrCompute<T>(
      _k: CacheKey,
      _o: { ttlMs: number; leaseMs: number },
      c: () => Promise<T>,
    ) {
      return c();
    },
    async ping() {
      return true;
    },
    async close() {},
  };
  return cache;
}

describe("CachedEmbedder", () => {
  const items = (texts: string[]) =>
    texts.map((semanticText) => ({
      semanticText,
      semanticHash: createHash("sha256").update(semanticText).digest("hex"),
    }));

  test("second embed of same text is served from cache (no provider call)", async () => {
    const p = { ...deterministicProvider(4), calls: 0 };
    const counting = {
      ...p,
      async embed(texts: string[]) {
        p.calls++;
        return p.embed(texts);
      },
    };
    const embedder = new CachedEmbedder(memoryCache(), "cfghash");
    await embedder.embed(counting, items(["alpha", "beta"]));
    expect(p.calls).toBe(1);
    const again = await embedder.embed(counting, items(["alpha", "beta"]));
    expect(p.calls).toBe(1); // fully cached
    expect(again.size).toBe(2);
  });

  test("different config hash → cache miss", async () => {
    const p = { calls: 0, embed: deterministicProvider(4).embed };
    const counting = {
      provider: "deterministic",
      model: "sha256-fixture",
      dimensions: 4,
      async embed(texts: string[]) {
        p.calls++;
        return p.embed(texts);
      },
    };
    const cache = memoryCache();
    await new CachedEmbedder(cache, "a").embed(counting, items(["x"]));
    await new CachedEmbedder(cache, "b").embed(counting, items(["x"]));
    expect(p.calls).toBe(2);
  });
});

describe("resolveEmbeddingRuntime", () => {
  test("resolves provider + configHash from authored config", () => {
    const rt = resolveEmbeddingRuntime(
      { provider: "deterministic", model: "m", dimensions: 8 },
      {},
    );
    expect(rt?.provider.provider).toBe("deterministic");
    expect(rt?.configHash).toMatch(/^[0-9a-f]+$/);
  });

  test("unresolvable config returns null (vector channel degrades)", () => {
    expect(resolveEmbeddingRuntime(undefined, {})).toBeNull();
    expect(resolveEmbeddingRuntime({ provider: "bogus", dimensions: 4 }, {})).toBeNull();
  });

  test("env override changes the config hash (spec/16 key semantics)", () => {
    const authored = resolveEmbeddingRuntime(
      { provider: "deterministic", model: "m", dimensions: 8 },
      {},
    );
    const overridden = resolveEmbeddingRuntime(
      { provider: "deterministic", model: "m", dimensions: 8 },
      {
        GROUNDING_EMBEDDING_PROVIDER: "openai-compatible",
        GROUNDING_EMBEDDING_BASE_URL: "http://x",
      },
    );
    expect(overridden?.provider.provider).toBe("openai-compatible");
    expect(overridden?.configHash).not.toBe(authored?.configHash);
  });
});

describe("openaiCompatibleProvider", () => {
  test("dimension mismatch throws (never pad/truncate)", async () => {
    const p = openaiCompatibleProvider({ baseUrl: "http://x", model: "m", dimensions: 4 });
    // monkeypatch fetch for this test
    const orig = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ data: [{ embedding: [1, 2, 3] }] }), {
        status: 200,
      })) as unknown as typeof fetch;
    try {
      await expect(p.embed(["t"])).rejects.toThrow("dimension 3 != configured 4");
    } finally {
      globalThis.fetch = orig;
    }
  });
});
