# Valkey Production Skill

Use this guide whenever implementing or reviewing caching, request coalescing, TTLs, distributed leases, cache invalidation, or Valkey deployment behavior for Grounding v1.

## Non-negotiable rules

1. Valkey is cache/ephemeral coordination only; PostgreSQL is canonical runtime state.
2. Use `@valkey/valkey-glide`; do not introduce a second Valkey/Redis client.
3. Every shared cache key is produced by the central cache package.
4. Revision-dependent cache keys include namespace + runtime revision.
5. Never put raw query/context/auth values in key names; hash canonical serialized inputs.
6. Cache failure is a miss; never alter authorization semantics because cache is unavailable.
7. Never use `KEYS` on production request paths.
8. Never use an unbounded lock. Distributed lease acquisition is `SET NX PX`; release is token-checked atomically.
9. Never cache a privileged diagnostic result under a key that an ordinary caller can hit.
10. Do not add a PostgreSQL-cache fallback/backend.

## Implementation checklist

Before adding a cache:
- identify the canonical source from which the value can be recomputed;
- define all semantic inputs to the key;
- choose TTL and maximum value size;
- decide whether cache failure can cause expensive stampede;
- use `getOrCompute` when cross-replica duplication is materially expensive;
- add hit/miss/error/latency metrics;
- add tests for authorization/context key separation;
- verify the cached and uncached result are identical.

## Preferred patterns

### Runtime-revision cache

`grounding:v1:<kind>:<namespace>:<revision>:<hash>`

Do not actively invalidate old revisions. They age out.

### Content-addressed embedding cache

`grounding:v1:embedding-content:<embedding-config-hash>:<semantic-hash>`

This avoids provider work. If evicted, regenerate and continue.

### Stampede protection

Local promise single-flight first, then a short Valkey lease for cross-replica work. Waiters use bounded jitter and recheck the value. Compare token before release.

### Failure policy

GET error -> miss + metric.
SET error -> return computed result + metric.
Lease error -> compute with bounded local concurrency.
Serialization/version mismatch -> miss.

## Production review

Confirm:
- TLS/auth/network restriction;
- memory/maxmemory/eviction configured;
- command and connection timeouts;
- failover/cluster path load-tested;
- GLIDE + Bun smoke-tested on target architecture;
- hit rate, evictions, latency, errors, and lease contention observable;
- no canonical state exists only in Valkey.

Normative details live in `spec/16-valkey-caching.md`.
