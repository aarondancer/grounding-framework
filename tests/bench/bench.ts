/**
 * Benchmark suite (M10, spec/11 + implementation-plan performance targets):
 * cached vs uncached retrieval and assembly on the canonical corpus, p50/p95
 * per stage, plus Valkey hit/miss/error/latency/lease-contention counters.
 *
 *   DATABASE_URL=… VALKEY_ADDRESSES=… bun tests/bench/bench.ts [--iterations N] [--out file]
 *
 * Measure, don't promise — output is JSON on stdout; `--out` also writes it
 * to a file so baselines can be committed or diffed.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { assembleAgent } from "@grounding/assembly";
import {
  CollectingCacheMetrics,
  cacheConfigFromEnv,
  createRuntimeCache,
  revisionedKey,
} from "@grounding/cache";
import { build } from "@grounding/compiler";
import { hashObject } from "@grounding/core";
import { connect } from "@grounding/db";
import { deterministicProvider } from "@grounding/embeddings";
import { retrieve } from "@grounding/retrieval";
import { findGroundingRoot } from "@grounding/source";

const ITERATIONS = Number(
  process.argv.includes("--iterations")
    ? process.argv[process.argv.indexOf("--iterations") + 1]
    : 30,
);
const WARMUP = 3;
const OUT = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : null;

if (!process.env.DATABASE_URL) {
  console.error("bench: DATABASE_URL is required (real PostgreSQL)");
  process.exit(2);
}
if (!process.env.VALKEY_ADDRESSES) {
  console.error("bench: VALKEY_ADDRESSES is required (real Valkey)");
  process.exit(2);
}

const percentile = (xs: number[], p: number): number => {
  if (xs.length === 0) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
};

type Timing = { stage: string; milliseconds: number };

function summarize(samples: { total: number[]; stages: Map<string, number[]> }) {
  const stages: Record<string, { p50: number; p95: number }> = {};
  for (const [stage, xs] of [...samples.stages.entries()].sort()) {
    stages[stage] = { p50: percentile(xs, 50), p95: percentile(xs, 95) };
  }
  return {
    total: { p50: percentile(samples.total, 50), p95: percentile(samples.total, 95) },
    stages,
  };
}

async function main() {
  const root = findGroundingRoot(process.cwd());
  if (!root) throw new Error("no grounding.config.jsonc found — run from the repo root");

  const { pool, db } = connect();
  const provider = deterministicProvider(1536);
  const environment = "bench";

  try {
    // Materialize the canonical corpus under the bench environment.
    const built = await build(root, db, {
      clean: true,
      provider,
      environment,
    });
    if (!built.ok) {
      throw new Error(`corpus build failed: ${JSON.stringify(built.diagnostics)}`);
    }

    const metrics = new CollectingCacheMetrics();
    const cache = await createRuntimeCache(cacheConfigFromEnv(), metrics);
    const configHash = hashObject({
      provider: "deterministic",
      model: "deterministic",
      dimensions: 1536,
    });
    const embedding = { provider, configHash };

    const uncached = {
      db,
      cache: null as typeof cache | null,
      embedding,
      environment,
    };
    const cached = { db, cache, embedding, environment };

    // diagnostics: true is required to get stage timings; it is part of the
    // result-cache key input, so the cached path still exercises caching.
    const retrievalReq = {
      namespace: "main",
      query: "pipeline conversion",
      diagnostics: true,
    } as const;
    const assemblyReq = {
      namespace: "main",
      template: "analytics-assistant",
      diagnostics: true,
    } as const;

    const run = async (
      label: string,
      cachedRun: boolean,
      fn: (s: typeof uncached) => Promise<{ diagnostics?: { timings: Timing[] } | null }>,
    ) => {
      const samples = { total: [] as number[], stages: new Map<string, number[]>() };
      for (let i = 0; i < WARMUP + ITERATIONS; i++) {
        const t0 = performance.now();
        const result = await fn(cachedRun ? cached : uncached);
        const total = performance.now() - t0;
        if (i < WARMUP) continue; // warmup iterations are not measured
        samples.total.push(total);
        for (const t of result.diagnostics?.timings ?? []) {
          const xs = samples.stages.get(t.stage) ?? [];
          xs.push(t.milliseconds);
          samples.stages.set(t.stage, xs);
        }
      }
      return { label, cached: cachedRun, ...summarize(samples) };
    };

    // Deliberate miss + lease probes so the counter summary exercises the
    // full metric surface (spec/16): cold-key misses, then a concurrent
    // same-key burst that forces distributed-lease contention.
    const probeRevision = built.runtimeRevision ?? 0;
    for (let i = 0; i < 8; i++) {
      await cache.get(
        revisionedKey({
          kind: "retrieval-result",
          namespaceId: "bench",
          runtimeRevision: probeRevision,
          input: { probe: "miss", i },
        }),
      );
    }
    await Promise.all(
      Array.from({ length: 8 }, () =>
        cache.getOrCompute(
          revisionedKey({
            kind: "retrieval-result",
            namespaceId: "bench",
            runtimeRevision: probeRevision,
            input: { probe: "lease" },
          }),
          { ttlMs: 10_000, leaseMs: 2_000 },
          async () => ({ probe: true }),
        ),
      ),
    );

    const report = {
      notes: [
        "cached stage timings are replayed from the stored result — compare cached vs uncached on `total`, not stages",
      ],
      corpus: "canonical grounding/",
      environment,
      iterations: ITERATIONS,
      warmup: WARMUP,
      ranAt: new Date().toISOString(),
      retrieval: {
        uncached: await run("retrieve", false, (s) => retrieve(s, retrievalReq)),
        cached: await run("retrieve", true, (s) => retrieve(s, retrievalReq)),
      },
      assembly: {
        uncached: await run("assemble", false, (s) => assembleAgent(s, assemblyReq)),
        cached: await run("assemble", true, (s) => assembleAgent(s, assemblyReq)),
      },
      cache: summarizeCacheMetrics(metrics),
    };

    const json = `${JSON.stringify(report, null, 2)}\n`;
    process.stdout.write(json);
    if (OUT) {
      mkdirSync(dirname(OUT), { recursive: true });
      writeFileSync(OUT, json);
      console.error(`baseline written to ${OUT}`);
    }
    await cache.close();
  } finally {
    await pool.end();
  }
}

/** Spec/16 metrics list → per-kind counters + latency/lease percentiles. */
function summarizeCacheMetrics(metrics: CollectingCacheMetrics) {
  const counts: Record<string, number> = {};
  const latency: Record<string, number[]> = {};
  const bump = (key: string) => {
    counts[key] = (counts[key] ?? 0) + 1;
  };
  for (const e of metrics.events) {
    if (e.type === "hit" || e.type === "miss" || e.type === "error") {
      bump(`${e.kind}.${e.type}`);
    } else if (e.type === "latency") {
      const bucket = latency[e.operation];
      if (bucket) {
        bucket.push(e.milliseconds);
      } else {
        latency[e.operation] = [e.milliseconds];
      }
    } else if (e.type === "lease") {
      bump(`lease.${e.outcome}`);
    } else if (e.type === "bypass") {
      bump(`bypass.${e.reason}`);
    } else if (e.type === "embedding_avoided") {
      bump("embedding_avoided");
    }
  }
  const latencySummary: Record<string, { p50: number; p95: number }> = {};
  for (const [op, xs] of Object.entries(latency)) {
    latencySummary[op] = { p50: percentile(xs, 50), p95: percentile(xs, 95) };
  }
  return { counts, latency: latencySummary };
}

await main();
