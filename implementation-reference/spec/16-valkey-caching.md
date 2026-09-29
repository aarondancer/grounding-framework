# 16 — Valkey Caching and Ephemeral Coordination

Valkey is a required v1 runtime dependency. PostgreSQL remains the durable compiled/runtime database; Valkey owns ephemeral/shared caching and limited cache-adjacent coordination.

## Correctness boundary

Valkey is never canonical state.

A missing, evicted, expired, flushed, restarted, or temporarily unavailable cache entry MUST be equivalent to a cache miss. The system must be able to recompute the value from canonical/runtime state and external embedding services where applicable.

Valkey MUST NOT become the authoritative store for:
- concepts, relations, knowledge/chunks, dimensions, selection groups, profiles;
- compiled authorization/applicability rules;
- deployment/runtime revision state;
- semantic vectors required for serving the active compiled revision;
- authored or compiled Agent Assembly entities.

Materialized runtime embeddings remain in PostgreSQL `semantic_entities`. Valkey may cache the result of embedding computations to avoid repeated provider calls.

## What v1 caches

Shared cache categories:

| Cache kind | Example key material | Default TTL posture |
|---|---|---|
| `embedding-content` | embedding-config-hash + semantic-hash | long (days) |
| `query-embedding` | embedding-config-hash + normalized-query-hash | medium (tens of minutes) |
| `concept-resolution` | runtime-revision + normalized-query + profile | medium |
| `retrieval-result` | runtime-revision + query/context/profile/filter/limit hashes | short (minutes) |
| `assembly-result` | runtime-revision + template/task/context/binding/budget hashes | short |
| `ontology-neighborhood` | runtime-revision + seed/direction/depth/relation-filter hash | medium |
| `singleflight-lease` | operation-kind + deterministic work hash | seconds |

These TTLs are defaults, not source-format semantics. Deployment configuration may tune them within hard bounds.

Do not cache arbitrary GraphQL response envelopes. Cache domain-service results below GraphQL so SSR, browser GraphQL, and other GraphQL callers share the same behavior.

Diagnostics-bearing requests require special care. Either bypass shared result caching or include diagnostics mode plus the caller's diagnostic authorization scope in the cache key. A privileged diagnostic result must never be served to an unprivileged caller.

## Key format

All keys MUST be namespaced and versioned:

```text
grounding:v1:<kind>:<namespace-id>:<runtime-revision>:<sha256>
```

Content-addressed caches that are intentionally revision-independent use their content/config hashes instead:

```text
grounding:v1:embedding-content:<embedding-config-hash>:<semantic-hash>
```

Never place raw user query text, permissions, access tokens, email addresses, or other sensitive context values in key names. Hash canonical serialized inputs.

Canonical serialization MUST:
- sort object keys;
- preserve array ordering where semantically ordered;
- sort set-like arrays before hashing;
- distinguish missing from empty;
- include every option that can affect the returned value.

Use SHA-256 for cache input hashes.

## Runtime revision invalidation

The primary invalidation mechanism is revisioned keys.

After a successful compiler/materializer deployment increments the namespace runtime revision:
- new requests use the new revision in cache keys;
- old cache entries immediately become unreachable by normal lookups;
- old keys expire naturally by TTL;
- no mass `DEL`, prefix scan, or global flush is required.

Do not use `KEYS` in production. Administrative cleanup, if ever needed, uses bounded `SCAN` and is not on the request path.

## Cache API

Business/domain services should depend on a small typed package API, not issue arbitrary Valkey commands throughout the codebase.

Minimum package responsibilities:

```ts
interface RuntimeCache {
  get<T>(key: CacheKey): Promise<T | null>
  set<T>(key: CacheKey, value: T, options: { ttlMs: number }): Promise<void>
  delete(key: CacheKey): Promise<void>
  getOrCompute<T>(
    key: CacheKey,
    options: { ttlMs: number; leaseMs: number },
    compute: () => Promise<T>
  ): Promise<T>
}
```

The concrete implementation is Valkey-only in v1. The interface exists for layering/testability and to centralize key construction, serialization, metrics, timeout behavior, and stampede protection—not to support a PostgreSQL cache implementation.

## Stampede protection

Use two levels.

### Process-local single flight

Concurrent identical work inside one Bun process shares one in-flight promise. Remove the entry on both resolve and reject.

### Cross-process lease

For expensive work that can be triggered simultaneously on multiple replicas:
1. check cache;
2. attempt `SET lease-key token NX PX <leaseMs>`;
3. winner computes;
4. winner writes cache result;
5. winner releases only if the lease token still matches;
6. losers wait with bounded jitter and re-check cache;
7. if the lease expires, a waiter may attempt acquisition.

Lease release MUST be compare-and-delete atomically (Lua/script or equivalent supported atomic mechanism). Never blindly `DEL` a lease that may have expired and been reacquired by another worker.

The lease duration must be finite and longer than the expected p99 work duration with reasonable margin. Long-running operations should not use indefinite locks.

## Failure behavior

Valkey errors are cache failures, not authorization/retrieval semantic failures.

For ordinary cache reads/writes:
- use short operation timeouts;
- on read error, record a metric and continue as a cache miss;
- on write error, return the computed canonical result without cache persistence;
- never return stale privileged data because a cache operation failed.

For single-flight/lease failure:
- retain process-local single flight;
- allow canonical recomputation;
- apply concurrency/load safeguards so a cache outage does not create an unbounded embedding/retrieval stampede.

`/healthz` should report Valkey dependency state. Temporary Valkey failure does not make canonical data incorrect; production operators may choose whether `/readyz` treats cache failure as degraded-ready or not-ready according to expected load. The default application behavior is fail-open for correctness.

## Client and topology

Use `@valkey/valkey-glide`.

Support:
- standalone/replication endpoint through `GlideClient`;
- Valkey Cluster through `GlideClusterClient`;
- TLS in production;
- authentication/ACL credentials from secret/environment configuration;
- reconnect/backoff behavior supplied/configured through the client;
- topology-aware production deployment.

Do not use Bun's native Redis client for the v1 production cache client because the locked client must support the production topology requirements consistently. It may be used only in isolated developer experiments, never in committed runtime code.

## Local development

Use the normal Docker Compose-compatible file in `ops/compose.yaml`.

The documented local runtime is OrbStack:

```bash
docker compose -f ops/compose.yaml up -d
docker compose -f ops/compose.yaml ps
```

No OrbStack-specific API is required by application code; compatibility with standard Docker/Compose commands is intentional.

## Production topology

The application must work with:
- a managed or self-operated replicated Valkey service with automatic failover;
- Valkey Cluster when horizontal sharding is required.

Production expectations:
- TLS enabled where supported;
- authentication enabled;
- network access restricted to the application;
- persistence settings are an operations choice because cache correctness cannot depend on persistence;
- memory limit and eviction policy are explicitly configured/monitored;
- alerts exist for memory pressure, evictions, connection errors, command latency, and hit rate.

Recommended cache eviction posture is an all-keys LRU/LFU-style policy suitable for ephemeral cache data. Do not mix canonical durable data into the same logical cache and then rely on no-eviction behavior.

## Serialization/value discipline

- Cache values are versioned envelopes.
- Include a small `schemaVersion` in complex cached payloads.
- Reject/ignore unknown future cache envelope versions as misses.
- Avoid very large values. If a payload is unexpectedly large, skip caching and emit a metric rather than turning Valkey into blob storage.
- Do not store secrets or raw authentication tokens.
- Never rely on cache encryption as a substitute for network/auth controls.

## Security and tenant/context isolation

Every result cache key includes namespace + runtime revision and a cryptographic hash of the full semantically relevant normalized context.

The hash input for retrieval/assembly must include all authorization-sensitive context values that can affect eligibility. Omitting one is a data-leak bug.

Tests MUST prove:
- different permission/role contexts do not collide;
- privileged diagnostics do not collide with ordinary result caches;
- namespace/revision changes do not collide;
- omitted vs empty dimensions produce different keys where semantics differ.

## Metrics

Emit at least:
- cache hit/miss/error count by cache kind;
- command latency histogram;
- value-size histogram;
- lease acquired/contention/timeout counts;
- compute-after-miss duration;
- avoided embedding-call count;
- cache bypass/oversize count.

Do not include raw cache keys containing input hashes in high-cardinality metric labels.

## Performance acceptance

Before production release, run concurrent load tests with real Valkey and PostgreSQL.

At minimum verify:
- cache hit path is materially faster than recomputation;
- cache failures degrade safely without correctness changes;
- repeated concurrent misses produce one bounded expensive computation per key under normal lease operation;
- cluster/replication failover does not create permanent client failure;
- Valkey memory/eviction behavior remains predictable under representative corpus/query churn;
- cache use does not change deterministic retrieval/assembly results.

No Redis-compatible feature should be introduced directly into a domain service. Add it to the cache package with tests and document why the semantic is needed.
