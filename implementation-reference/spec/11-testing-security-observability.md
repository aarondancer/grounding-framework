# 11 — Testing, Evals, Security, Observability

## Test layers

1. Pure unit: parser, schema validation, normative rule-engine matrix, selection groups, RRF, packing, normalization, chunk IDs, hashes, dependency closure/cycles, prompt ordering/budgeting.
2. Real PostgreSQL integration: migrations, constraints, FTS config, trigram, pgvector, recursive CTEs, closures, materialization transactions.
3. Real Valkey integration: TTLs, revisioned cache keys, serialization-version misses, authorization/context key isolation, single-flight leases, compare-and-delete release, outage/fail-open behavior, and GLIDE standalone/cluster-compatible paths.
4. Deterministic retrieval/assembly evals: fixed/precomputed embeddings and known corpus.
5. Clean-build E2E: source -> empty PostgreSQL -> derived structures -> retrieval/assembly.

## Evals

Live under `grounding/evals` and MUST validate against the supplied eval schemas. Prefer robust assertions (`include`, `exclude`, `within top K`, `A outranks B`) over brittle exact ranks. Chunk references in evals use `knowledgeItemKey#chunkKey` so they remain unambiguous.

Keep real embedding-quality evals separate from deterministic CI mechanics.

## Compiler equivalence invariant

A clean build and any valid incremental build sequence ending at the same source revision must produce logically equivalent runtime state.

## Security

- host layer authenticates GraphQL callers
- grounding authorization evaluates trusted normalized context
- authorization-sensitive dimensions can use `trust: server`
- ordinary clients cannot self-assert server-trusted dimensions
- Explorer simulation is separately privileged
- simulation permission does not imply restricted-content visibility
- authorization evaluation fails closed
- diagnostics observe the same gates; never bypass them
- raw HTML disabled in Markdown v1
- JSONC is data only; never execute source files
- compiled semantic tables are compiler-owned
- no secrets in tool definitions; secrets remain host-owned

### Git repository access caveat

Runtime authorization protects retrieval/API results. It does **not** encrypt canonical source. Anyone with read access to the Git repository can read all authored grounding files in plaintext, including content that runtime authorization would normally hide. Adopters MUST treat repository access as privileged accordingly.

### Restricted diagnostics

For callers without separate restricted-diagnostic permission, candidates excluded by authorization are represented only in aggregate counts. Do not expose their entity IDs, keys, titles, source paths, or content. Privileged simulation, restricted-metadata inspection, and restricted-content inspection are conceptually separate host permissions.

## Resource protection

GraphQL depth/cost limits, max page sizes, request timeouts, hard ceilings on chunks/tokens/skills/tools/graph depth/expression nodes/dependency depth.

## Observability

Instrument structured timings for retrieval and assembly stages using the exact `StageTiming.stage` vocabulary in `spec/14-diagnostic-error-code-registry.md`. Track p50/p95 and candidate counts with a representative benchmark corpus. Avoid logging full request context/query text by default.

## Cache security/reliability

Valkey is never an authorization oracle or canonical store. Cache-key tests MUST prove that every context dimension affecting authorization/applicability contributes to the retrieval/assembly cache hash, and that restricted diagnostics cannot collide with ordinary results. Cache outage tests MUST demonstrate result equivalence to uncached execution.

Production hardening includes a Bun + Valkey GLIDE compatibility smoke/load test on the deployment architecture and a failover/reconnect test against the supported Valkey topology.
