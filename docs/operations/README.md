# Operations

Deployment, rollback, and production configuration for Grounding v1. Normative details live in `implementation-reference/spec/` (01 architecture, 08 postgres, 16 valkey); this is the operator-facing runbook.

## Running the CLI

In-repo the CLI runs via Bun (it is not published to a registry in v1):

```bash
bun run grounding <command>        # root workspace script → apps/cli/src/index.ts
bun run grounding deploy --ref <sha>
```

The `@grounding/cli` package declares `bin.grounding` (`#!/usr/bin/env bun`), so a consumer that installs the workspace links it into `node_modules/.bin`.

## Deploy

```bash
grounding deploy                  # deploy HEAD (committed tree)
grounding deploy --ref <sha|tag>  # deploy an immutable Git revision
grounding deployments             # history for this namespace, newest first
```

`deploy` materializes the *committed* tree via a detached `git worktree` — working-tree edits never leak into a deployment, and the `deployments` row records the resolved commit. It requires a git repository; `grounding build` remains the working-tree/materialize path for local iteration.

Environment is `GROUNDING_ENV` (or `--environment`); each `(namespace, environment)` pair keeps its own runtime state. A successful deploy inserts a `deployments` row and bumps `namespace_runtime_state.runtime_revision` inside the same transaction — revisioned Valkey cache keys make the old generation unreachable immediately and let it age out by TTL (spec/16).

## Rollback

Manual rollback is redeploying a prior revision — no special command:

```bash
grounding deployments --format json   # find the prior git_commit
grounding deploy --ref <prior-sha>
```

Deletes reconcile against actual DB state (ADR-0007), so entities introduced by the newer revision are removed. Rollback increments the runtime revision again — it is a new deployment, not a restore.

A failed materialization leaves the deployment row `failed` with `errorMessage` (the `deploying` row is inserted before the entity transaction precisely so failures are auditable; a stub `namespaces` row may also persist on a first-ever deploy). The previously active revision keeps serving because all entity-row changes commit inside the single materialization transaction.

## Production configuration

Runtime config is environment-only (`implementation-reference/implementation/runtime-configuration.md`); secrets come from the host's secret manager, never `grounding/` files.

```text
DATABASE_URL=postgresql://…        # PG 17 with pgvector, pg_trgm, unaccent
VALKEY_MODE=standalone|cluster
VALKEY_ADDRESSES=host:port[,host:port…]
VALKEY_TLS=true
VALKEY_USERNAME=<acl user>         # optional; from secret manager
VALKEY_PASSWORD=<secret>           # from secret manager
VALKEY_REQUEST_TIMEOUT_MS=500      # short; failures degrade to cache miss
GROUNDING_ENV=production
```

### PostgreSQL / Aurora

Aurora PostgreSQL 17 is the locked managed target (spec/15). The runtime needs `vector`, `pg_trgm`, `unaccent`, `pg_advisory_xact_lock`, and transactional DDL-safe migrations — all supported on Aurora PG 17 with `pgvector` enabled in `shared_preload_libraries` (Aurora supports pgvector ≥ 0.7). Dimension check: `GROUNDING_EMBEDDING_DIMENSIONS` must match the `semantic_entities.embedding` column; `grounding build`/`deploy` refuse mismatches with `EMBEDDING_DIMENSION_MISMATCH`. Compatibility is verified where an Aurora endpoint is available (point `DATABASE_URL` + migrations at it and run `bun run test:integration`); the code uses no RDS-/Aurora-specific calls.

### Valkey topology

- **Replicated/managed (default):** `VALKEY_MODE=standalone`, one endpoint — GLIDE uses `GlideClient`, which handles failover to a promoted replica transparently behind a managed endpoint (ElastiCache, MemoryDB-compatible, self-operated Sentinel/DNS). Point `VALKEY_ADDRESSES` at the managed primary endpoint, not individual nodes.
- **Cluster:** `VALKEY_MODE=cluster`, seed with any subset of node addresses — `GlideClusterClient` discovers topology and follows MOVED/ASK redirects. Use when a single node can't hold the working set.

Production expectations (spec/16): TLS on, ACL auth, network-restricted to the app, `maxmemory` + `allkeys-lru`/`allkeys-lfu` eviction set explicitly, persistence optional (cache correctness never depends on it).

### Metrics and alerts

`CacheMetrics` reports hit/miss/error by kind, command latency, value size, lease acquire/contention/timeout, compute-after-miss duration, avoided embedding calls, and oversize bypasses. Alert on: evictions climbing, memory pressure, connection errors, command p95 latency, and lease contention (stampede symptom). `/healthz` reports Valkey dependency state; `/readyz` policy (degraded-ready vs not-ready on cache failure) is an operator choice — default is fail-open for correctness.

### Failure behavior

Cache failure is always a miss — never an authorization or result change. Reads record a metric and fall through to canonical PostgreSQL; writes drop silently; lease failure degrades to bounded local single-flight. Client reconnect behavior is covered by `packages/cache/src/load.test.ts` (concurrent load, stampede bound, server-side `CLIENT KILL` reconnect) against real Valkey; run the same file against a staging cluster for the topology-level failover check.

## Benchmarks

The benchmark suite measures cached vs uncached retrieval and Agent Assembly against real PostgreSQL + Valkey with deterministic embeddings:

```bash
bun run bench                                           # canonical corpus, default iterations
bun tests/bench/bench.ts --iterations 60 --out tests/bench/baseline.json
```

It reports p50/p95 total and per-stage latency, cache hit/miss/error counts, cache command latency, and lease outcomes. `tests/bench/baseline.json` is the recorded reference baseline from local dev hardware — an engineering measurement, not an SLA. Regenerate it after material changes to the retrieval, assembly, or cache paths and diff against it when assessing regressions.