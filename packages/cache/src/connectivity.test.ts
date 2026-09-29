import { describe, expect, test } from "bun:test";
import { createRuntimeCache } from "./cache.ts";
import { cacheConfigFromEnv } from "./config.ts";
import { revisionedKey } from "./keys.ts";

/**
 * Real-Valkey check — M0 exit criterion "GLIDE can connect to local Valkey
 * under Bun". Skipped when VALKEY_ADDRESSES is unset; CI always sets it.
 */
describe("valkey connectivity", () => {
  const configured = Boolean(process.env.VALKEY_ADDRESSES);
  const it = configured ? test : test.skip;

  it("GLIDE connects, round-trips a value, and pings", async () => {
    const cache = await createRuntimeCache(cacheConfigFromEnv());
    try {
      expect(await cache.ping()).toBe(true);
      const key = revisionedKey({
        kind: "query-embedding",
        namespaceId: "00000000-0000-0000-0000-000000000000",
        runtimeRevision: 0,
        input: { test: "m0-connectivity" },
      });
      await cache.set(key, { ok: true }, { ttlMs: 60_000 });
      expect(await cache.get<{ ok: boolean }>(key)).toEqual({ ok: true });
      await cache.delete(key);
      expect(await cache.get(key)).toBeNull();
    } finally {
      await cache.close();
    }
  });
});
