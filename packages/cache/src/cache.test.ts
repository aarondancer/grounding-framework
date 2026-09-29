import { describe, expect, test } from "bun:test";
import { valkeyTest as it } from "@grounding/test-support";
import { createRuntimeCache, ValkeyRuntimeCache } from "./cache.ts";
import { cacheConfigFromEnv } from "./config.ts";
import { type CacheKey, cacheKeyKind, contentKey, leaseKey, revisionedKey } from "./keys.ts";
import { CollectingCacheMetrics } from "./metrics.ts";

const NS = "00000000-0000-0000-0000-000000000000";

describe("cache keys (spec/16 formats)", () => {
  test("revisionedKey: grounding:v1:<kind>:<ns>:<rev>:<sha256>", () => {
    const key = revisionedKey({
      kind: "retrieval-result",
      namespaceId: NS,
      runtimeRevision: 7,
      input: { query: "pipeline" },
    });
    expect(key).toMatch(/^grounding:v1:retrieval-result:.+:7:[0-9a-f]{64}$/);
    expect(cacheKeyKind(key)).toBe("retrieval-result");
  });

  test("canonical serialization: key-order-equivalent inputs hash identically", () => {
    const a = revisionedKey({
      kind: "concept-resolution",
      namespaceId: NS,
      runtimeRevision: 1,
      input: { q: "x", ctx: { a: 1, b: 2 } },
    });
    const b = revisionedKey({
      kind: "concept-resolution",
      namespaceId: NS,
      runtimeRevision: 1,
      input: { ctx: { b: 2, a: 1 }, q: "x" },
    });
    expect(a).toBe(b);
    // Semantically different inputs and revisions produce different keys.
    const c = revisionedKey({
      kind: "concept-resolution",
      namespaceId: NS,
      runtimeRevision: 2,
      input: { q: "x", ctx: { a: 1, b: 2 } },
    });
    expect(c).not.toBe(a);
  });

  test("contentKey is revision-independent; leaseKey is hashed, not raw", () => {
    const ck = contentKey("embedding-content", "cfg", "sem");
    expect(ck as string).toBe("grounding:v1:embedding-content:cfg:sem");
    const lk = leaseKey(ck);
    expect(lk).toMatch(/^grounding:v1:lease:[0-9a-f]{64}$/);
    // Lease key never embeds the raw entry key.
    expect(lk).not.toContain("embedding-content");
    expect(cacheKeyKind(lk)).toBe("lease");
  });
});

describe("cacheConfigFromEnv", () => {
  test("defaults + parsing", () => {
    const def = cacheConfigFromEnv({});
    expect(def).toEqual({
      mode: "standalone",
      addresses: [{ host: "localhost", port: 6379 }],
      useTLS: false,
      requestTimeoutMs: 500,
    });

    const cfg = cacheConfigFromEnv({
      VALKEY_ADDRESSES: "a:1, b:2, c",
      VALKEY_MODE: "cluster",
      VALKEY_TLS: "true",
      VALKEY_REQUEST_TIMEOUT_MS: "250",
      VALKEY_USERNAME: "u",
      VALKEY_PASSWORD: "p",
    });
    expect(cfg.mode).toBe("cluster");
    expect(cfg.addresses).toEqual([
      { host: "a", port: 1 },
      { host: "b", port: 2 },
      { host: "c", port: 6379 },
    ]);
    expect(cfg.useTLS).toBe(true);
    expect(cfg.requestTimeoutMs).toBe(250);
    expect(cfg.username).toBe("u");
    expect(cfg.password).toBe("p");
  });

  test("empty host entry throws", () => {
    expect(() => cacheConfigFromEnv({ VALKEY_ADDRESSES: ",b:2" })).toThrow();
  });
});

describe("ValkeyRuntimeCache semantics (spec/16)", () => {
  it("miss → set → hit → delete; hit/miss metrics per kind", async () => {
    const metrics = new CollectingCacheMetrics();
    const cache = await createRuntimeCache(cacheConfigFromEnv(), metrics);
    try {
      const key = revisionedKey({
        kind: "query-embedding",
        namespaceId: NS,
        runtimeRevision: 0,
        input: { t: "roundtrip" },
      });
      expect(await cache.get(key)).toBeNull();
      await cache.set(key, [1, 2, 3], { ttlMs: 60_000 });
      expect(await cache.get<number[]>(key)).toEqual([1, 2, 3]);
      await cache.delete(key);
      expect(await cache.get(key)).toBeNull();

      const kinds = metrics.events
        .filter((e) => e.type === "hit" || e.type === "miss")
        .map((e) => `${e.type}:${(e as { kind: string }).kind}`);
      expect(kinds).toEqual([
        "miss:query-embedding",
        "hit:query-embedding",
        "miss:query-embedding",
      ]);
    } finally {
      await cache.close();
    }
  });

  it("unknown envelope version is a miss (forward-compat)", async () => {
    const cache = await createRuntimeCache(cacheConfigFromEnv());
    try {
      const key = revisionedKey({
        kind: "retrieval-result",
        namespaceId: NS,
        runtimeRevision: 0,
        input: { t: "envelope" },
      });
      // Write a v99 envelope straight through the client — reads must
      // treat it as absent rather than erroring or returning stale data.
      await (
        cache as unknown as { client: { set(k: string, v: string): Promise<unknown> } }
      ).client.set(key, JSON.stringify({ v: 99, data: "stale" }));
      expect(await cache.get(key)).toBeNull();
      await cache.delete(key);
    } finally {
      await cache.close();
    }
  });

  it("TTL expiry evicts; oversize values are bypassed", async () => {
    const metrics = new CollectingCacheMetrics();
    const cache = await createRuntimeCache(cacheConfigFromEnv(), metrics);
    const small = new ValkeyRuntimeCache((cache as unknown as { client: never }).client, metrics, {
      maxValueBytes: 64,
      pollIntervalMs: 5,
    });
    try {
      const ttlKey = revisionedKey({
        kind: "retrieval-result",
        namespaceId: NS,
        runtimeRevision: 0,
        input: { t: "ttl" },
      });
      await cache.set(ttlKey, "v", { ttlMs: 60 });
      expect(await cache.get<string>(ttlKey)).toBe("v");
      await new Promise((r) => setTimeout(r, 120));
      expect(await cache.get(ttlKey)).toBeNull();

      const bigKey = revisionedKey({
        kind: "retrieval-result",
        namespaceId: NS,
        runtimeRevision: 0,
        input: { t: "oversize" },
      });
      await small.set(bigKey, "x".repeat(4096), { ttlMs: 60_000 });
      expect(await small.get(bigKey)).toBeNull();
      expect(metrics.events.some((e) => e.type === "bypass" && e.reason === "oversize")).toBe(true);
    } finally {
      await cache.close();
    }
  });

  it("getOrCompute: single flight + cross-instance lease contention resolves to the cached value", async () => {
    const config = cacheConfigFromEnv();
    const m1 = new CollectingCacheMetrics();
    const m2 = new CollectingCacheMetrics();
    const c1 = await createRuntimeCache(config, m1);
    const c2 = await createRuntimeCache(config, m2);
    try {
      const key = revisionedKey({
        kind: "assembly-result",
        namespaceId: NS,
        runtimeRevision: 0,
        input: { t: "lease" },
      });
      let c1Computes = 0;
      let c2Computes = 0;
      const slow = async () => {
        c1Computes += 1;
        await new Promise((r) => setTimeout(r, 200));
        return { n: 42 };
      };

      // Same-process concurrent calls share the in-flight promise.
      const [a, b] = await Promise.all([
        c1.getOrCompute(key, { ttlMs: 60_000, leaseMs: 5_000 }, slow),
        c1.getOrCompute(key, { ttlMs: 60_000, leaseMs: 5_000 }, slow),
      ]);
      expect(a).toEqual({ n: 42 });
      expect(b).toEqual({ n: 42 });
      expect(c1Computes).toBe(1);

      // Fresh key: c1 holds the lease; c2 contends, waits, reads the value.
      const key2 = revisionedKey({
        kind: "assembly-result",
        namespaceId: NS,
        runtimeRevision: 0,
        input: { t: "lease-2" },
      });
      const p1 = c1.getOrCompute(key2, { ttlMs: 60_000, leaseMs: 5_000 }, slow);
      await new Promise((r) => setTimeout(r, 50)); // let c1 acquire the lease
      const p2 = c2.getOrCompute(key2, { ttlMs: 60_000, leaseMs: 5_000 }, async () => {
        c2Computes += 1;
        return { n: 0 };
      });
      const [v1, v2] = await Promise.all([p1, p2]);
      expect(v1).toEqual({ n: 42 });
      expect(v2).toEqual({ n: 42 });
      expect(c2Computes).toBe(0);
      expect(m2.events.some((e) => e.type === "lease" && e.outcome === "contention")).toBe(true);
      expect(m1.events.some((e) => e.type === "lease" && e.outcome === "acquired")).toBe(true);
      // Lease released — the key is gone, not left dangling.
      const leaseRaw = await (
        c1 as unknown as { client: { get(k: string): Promise<unknown> } }
      ).client.get(leaseKey(key2) as CacheKey as string);
      expect(leaseRaw).toBeNull();
    } finally {
      await c1.close();
      await c2.close();
    }
  });
});

describe("cache failure is a miss (spec/16)", () => {
  test("broken client: get → null + error metric, set → swallowed", async () => {
    const metrics = new CollectingCacheMetrics();
    const broken = {
      get: async () => {
        throw new Error("down");
      },
      set: async () => {
        throw new Error("down");
      },
      del: async () => {
        throw new Error("down");
      },
      invokeScript: async () => {
        throw new Error("down");
      },
      ping: async () => {
        throw new Error("down");
      },
      close: () => {},
    };
    const cache = new ValkeyRuntimeCache(broken as never, metrics);
    const key = revisionedKey({
      kind: "retrieval-result",
      namespaceId: NS,
      runtimeRevision: 0,
      input: { t: "broken" },
    });
    expect(await cache.get(key)).toBeNull();
    await cache.set(key, "v", { ttlMs: 1000 });
    await cache.delete(key);
    expect(await cache.ping()).toBe(false);
    // Lease failure path: computes directly rather than failing.
    expect(await cache.getOrCompute(key, { ttlMs: 1, leaseMs: 1 }, async () => "computed")).toBe(
      "computed",
    );
    const errors = metrics.events.filter((e) => e.type === "error").length;
    expect(errors).toBeGreaterThanOrEqual(3);
  });
});
