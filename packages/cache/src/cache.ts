import { GlideClient, GlideClusterClient, Script, TimeUnit } from "@valkey/valkey-glide";
import type { CacheConfig } from "./config.ts";
import { type CacheKey, cacheKeyKind, leaseKey } from "./keys.ts";
import { type CacheMetrics, NoopCacheMetrics } from "./metrics.ts";

type Glide = GlideClient | GlideClusterClient;

/**
 * Small typed cache API (spec/16). The only Valkey surface in the codebase;
 * domain services never issue raw Valkey commands.
 */
export interface RuntimeCache {
  get<T>(key: CacheKey): Promise<T | null>;
  set<T>(key: CacheKey, value: T, options: { ttlMs: number }): Promise<void>;
  delete(key: CacheKey): Promise<void>;
  getOrCompute<T>(
    key: CacheKey,
    options: { ttlMs: number; leaseMs: number },
    compute: () => Promise<T>,
  ): Promise<T>;
  /** Dependency state for /healthz. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

const ENVELOPE_VERSION = 1;
/** Skip caching unexpectedly large values (spec/16: no blob storage). */
const MAX_VALUE_BYTES = 1024 * 1024;

/** Atomic token-checked lease release. Never blindly DEL a lease. */
const RELEASE_LEASE_SCRIPT = new Script(`
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
`);

export class ValkeyRuntimeCache implements RuntimeCache {
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(
    private readonly client: Glide,
    private readonly metrics: CacheMetrics = new NoopCacheMetrics(),
    private readonly options: { maxValueBytes?: number; pollIntervalMs?: number } = {},
  ) {}

  async ping(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  async get<T>(key: CacheKey): Promise<T | null> {
    const start = performance.now();
    try {
      const raw = await this.client.get(key);
      this.metrics.record({
        type: "latency",
        operation: "get",
        milliseconds: performance.now() - start,
      });
      if (raw == null) {
        this.metrics.record({ type: "miss", kind: cacheKeyKind(key) });
        return null;
      }
      const envelope = JSON.parse(String(raw)) as { v?: number; data?: T };
      // Unknown future envelope versions are misses (spec/16).
      if (envelope.v !== ENVELOPE_VERSION) {
        this.metrics.record({ type: "miss", kind: cacheKeyKind(key) });
        return null;
      }
      this.metrics.record({ type: "hit", kind: cacheKeyKind(key) });
      return envelope.data as T;
    } catch {
      // Cache failure is a miss; never alters semantics (spec/16).
      this.metrics.record({ type: "error", kind: cacheKeyKind(key) });
      return null;
    }
  }

  async set<T>(key: CacheKey, value: T, options: { ttlMs: number }): Promise<void> {
    const start = performance.now();
    try {
      const payload = JSON.stringify({ v: ENVELOPE_VERSION, data: value });
      const max = this.options.maxValueBytes ?? MAX_VALUE_BYTES;
      this.metrics.record({ type: "value_size", kind: cacheKeyKind(key), bytes: payload.length });
      if (payload.length > max) {
        this.metrics.record({ type: "bypass", reason: "oversize" });
        return;
      }
      await this.client.set(key, payload, {
        expiry: { type: TimeUnit.Milliseconds, count: options.ttlMs },
      });
      this.metrics.record({
        type: "latency",
        operation: "set",
        milliseconds: performance.now() - start,
      });
    } catch {
      // Write failure: canonical result was already computed; skip persistence.
      this.metrics.record({ type: "error", kind: cacheKeyKind(key) });
    }
  }

  async delete(key: CacheKey): Promise<void> {
    try {
      await this.client.del([key]);
    } catch {
      this.metrics.record({ type: "error", kind: cacheKeyKind(key) });
    }
  }

  /**
   * getOrCompute = cache check → process-local single flight → cross-process
   * Valkey lease (SET NX PX + token-checked release) → compute → write.
   * Lease losers wait with bounded jitter and re-check the cache.
   */
  async getOrCompute<T>(
    key: CacheKey,
    options: { ttlMs: number; leaseMs: number },
    compute: () => Promise<T>,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) return cached;

    // Process-local single flight.
    const existing = this.inflight.get(key);
    if (existing) return existing as Promise<T>;

    const work = this.computeWithLease(key, options, compute).finally(() => {
      this.inflight.delete(key);
    });
    this.inflight.set(key, work);
    return work;
  }

  private async computeWithLease<T>(
    key: CacheKey,
    options: { ttlMs: number; leaseMs: number },
    compute: () => Promise<T>,
  ): Promise<T> {
    const lease = leaseKey(key);
    const token = `${process.pid}:${Date.now()}:${Math.random()}`;
    const pollMs = this.options.pollIntervalMs ?? 50;
    const deadline = Date.now() + options.leaseMs;

    for (;;) {
      let acquired = false;
      try {
        const res = await this.client.set(lease, token, {
          conditionalSet: "onlyIfDoesNotExist",
          expiry: { type: TimeUnit.Milliseconds, count: options.leaseMs },
        });
        acquired = res === "OK";
      } catch {
        // Lease subsystem failure: compute directly (bounded by local single flight).
        this.metrics.record({ type: "error", kind: cacheKeyKind(key) });
        acquired = true;
      }

      if (acquired) {
        this.metrics.record({ type: "lease", outcome: "acquired" });
        const start = performance.now();
        try {
          const result = await compute();
          await this.set(key, result, { ttlMs: options.ttlMs });
          this.metrics.record({
            type: "compute",
            kind: cacheKeyKind(key),
            milliseconds: performance.now() - start,
          });
          return result;
        } finally {
          // Token-checked release; ignore failures (lease expires on its own).
          try {
            await this.client.invokeScript(RELEASE_LEASE_SCRIPT, {
              keys: [lease],
              args: [token],
            });
          } catch {
            this.metrics.record({ type: "error", kind: cacheKeyKind(key) });
          }
        }
      }

      this.metrics.record({ type: "lease", outcome: "contention" });

      // Waiter: bounded jitter, then re-check cache.
      if (Date.now() >= deadline) {
        this.metrics.record({ type: "lease", outcome: "timeout" });
        const recheck = await this.get<T>(key);
        if (recheck !== null) return recheck;
        return compute(); // last resort; local single flight still bounds this
      }
      await sleep(pollMs + Math.floor(Math.random() * pollMs));
      const recheck = await this.get<T>(key);
      if (recheck !== null) return recheck;
    }
  }

  async close(): Promise<void> {
    this.client.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function createRuntimeCache(
  config: CacheConfig,
  metrics?: CacheMetrics,
): Promise<ValkeyRuntimeCache> {
  const base = {
    addresses: config.addresses,
    useTLS: config.useTLS,
    requestTimeout: config.requestTimeoutMs,
    ...(config.username !== undefined
      ? { credentials: { username: config.username, password: config.password ?? "" } }
      : config.password !== undefined
        ? { credentials: { password: config.password } }
        : {}),
  };
  const client =
    config.mode === "cluster"
      ? await GlideClusterClient.createClient(base)
      : await GlideClient.createClient(base);
  return new ValkeyRuntimeCache(client, metrics);
}
