import { describe, expect } from "bun:test";
import { valkeyTest as it } from "@grounding/test-support";
import { GlideClient } from "@valkey/valkey-glide";
import { createRuntimeCache } from "./cache.ts";
import { cacheConfigFromEnv } from "./config.ts";
import { revisionedKey } from "./keys.ts";

/**
 * GLIDE load + reconnect coverage against real Valkey (spec/16 "performance
 * acceptance": concurrent load, failover does not create permanent client
 * failure). Skipped without VALKEY_ADDRESSES; CI always sets it.
 *
 * Cluster/replication failover of the *server* topology is an ops-level check
 * (docs/operations) — it needs a restartable/managed deployment, which the
 * test DB cannot assume. This file covers the client-side contract.
 */

const NS = "00000000-0000-0000-0000-000000000000";
const keyFor = (input: unknown) =>
  revisionedKey({ kind: "retrieval-result", namespaceId: NS, runtimeRevision: 1, input });

describe("valkey load + reconnect", () => {
  it("handles a mixed concurrent load correctly", async () => {
    const cache = await createRuntimeCache(cacheConfigFromEnv());
    try {
      const N = 100;
      const results = await Promise.all(
        Array.from({ length: N }, async (_, i) => {
          const key = keyFor({ load: i });
          if (i % 3 === 0) {
            await cache.set(key, { i }, { ttlMs: 60_000 });
            return cache.get<{ i: number }>(key);
          }
          if (i % 3 === 1) {
            return cache.getOrCompute(key, { ttlMs: 60_000, leaseMs: 5_000 }, async () => ({
              i,
            }));
          }
          return cache.get(keyFor({ load: "missing", i })); // miss path
        }),
      );
      for (let i = 0; i < N; i++) {
        if (i % 3 === 2) expect(results[i]).toBeNull();
        else expect(results[i]).toEqual({ i });
      }
    } finally {
      await cache.close();
    }
  });

  it("bounds computation under a concurrent same-key stampede", async () => {
    const cache = await createRuntimeCache(cacheConfigFromEnv());
    try {
      const key = keyFor({ stampede: Date.now() });
      let computes = 0;
      const results = await Promise.all(
        Array.from({ length: 30 }, () =>
          cache.getOrCompute(key, { ttlMs: 60_000, leaseMs: 10_000 }, async () => {
            computes += 1;
            return { value: "computed" };
          }),
        ),
      );
      expect(results.every((r) => r.value === "computed")).toBe(true);
      // Local single-flight should collapse this to one compute per process.
      expect(computes).toBe(1);
    } finally {
      await cache.close();
    }
  });

  it("recovers after the server drops the client connection", async () => {
    // Raw GLIDE-level reconnect: kill this client's connection server-side
    // via a second client, then confirm the killed client reconnects and
    // serves again (failover must not be a permanent failure — spec/16).
    const victim = await GlideClient.createClient({
      addresses: cacheConfigFromEnv().addresses,
      requestTimeout: 500,
    });
    const killer = await GlideClient.createClient({
      addresses: cacheConfigFromEnv().addresses,
      requestTimeout: 500,
    });
    try {
      const idResult = (await victim.customCommand(["CLIENT", "ID"])) as number | bigint | string;
      const killed = (await killer.customCommand(["CLIENT", "KILL", "ID", String(idResult)])) as
        | number
        | bigint
        | string;
      // If the kill didn't land the reconnect assertion below is vacuous.
      expect(Number(killed)).toBe(1);

      // The killed connection may surface one error before GLIDE reconnects.
      let recovered = false;
      for (let i = 0; i < 40 && !recovered; i++) {
        try {
          await victim.ping();
          recovered = true;
        } catch {
          await new Promise((r) => setTimeout(r, 100));
        }
      }
      expect(recovered).toBe(true);

      // Post-reconnect the client must actually work, not just ping.
      const k = `grounding:v1:reconnect-test:${Date.now()}`;
      await victim.set(k, "alive");
      expect(await victim.get(k)).toBe("alive");
      await victim.del([k]);
    } finally {
      victim.close();
      killer.close();
    }
  });
});
