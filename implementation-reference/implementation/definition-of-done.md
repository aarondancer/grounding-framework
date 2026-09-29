# V1 Definition of Done

V1 is ready when all of the following are true.

## Authoring and validation

- A new repository can add `grounding/grounding.config.jsonc` and `namespace.jsonc` and validate.
- JSONC and Markdown/JSONC-frontmatter files have deterministic schemas.
- `grounding validate`, file validation, changed-file validation, JSON diagnostics, and strict mode work.
- Cross-file refs, unknown context dimensions, enum registry/value validity, every operator/type/cardinality rule (including `between` bound ordering), missing-value semantics, unsafe authorization+`ignore` combinations, hierarchies, lifecycle dependencies, selection groups, chunk-key collisions, eval fixtures, and every required/optional tool dependency cycle are validated.
- Git/GitHub is sufficient to author/review all v1 content.

## Compiler

- Clean build reconstructs runtime from canonical source.
- Incremental build detects add/change/delete/move safely.
- Stable source IDs and deterministic derived IDs/chunk keys work according to the normative heading/chunk algorithm.
- Semantic hash prevents unnecessary re-embedding.
- Manifest/cache deletion does not compromise correctness.
- Materialization is transactional.
- Clean and incremental builds converge to equivalent state.

## Runtime

- Real PostgreSQL 17 is used in local/test/prod-compatible paths.
- Real Valkey is used in local/integration/prod-compatible cache paths; PostgreSQL is not used as the shared runtime cache.
- Local Postgres + Valkey start successfully through `ops/compose.yaml` under OrbStack/Docker-compatible Compose.
- Vector, FTS, trigram, set-valued exact concept resolution, hierarchy closure, and ontology traversal work.
- PostgreSQL-authoritative lexical `unaccent` behavior is regression-tested across ordinary words and mixed/alphanumeric token classes; materialization and query normalization match.
- Authorization/applicability/specificity/selection groups are deterministic and conform to the normative rule-engine matrix.
- Retrieval falls back safely when vector or ontology discovery is unavailable, and graph-derived candidates pass the same eligibility/selection path as direct candidates. `retrieve`/`resolveConcepts` vector outages warn/degrade rather than raising `EMBEDDING_UNAVAILABLE`.
- Retrieval final ordering is exactly RRF score, then authority, then priority, then stable chunk UUID; no synthetic additive quality score exists.
- Context packing honors hard budgets.
- Revisioned Valkey result caches produce byte/logically equivalent domain results to uncached execution and never collide across namespace, runtime revision, or authorization-relevant context.
- Embedding computation reuse uses Valkey content-addressed cache while active materialized semantic vectors remain in PostgreSQL.
- Cache outage behaves as misses with bounded recomputation; authorization/result semantics do not change.
- Cross-replica expensive-work leases use finite TTLs and token-checked atomic release.

## Agent Assembly

- Explicit template + context/task produces structured assembly result.
- Skills/fragments/tools are selected semantically/contextually. A non-empty task requires the shared task embedding; failure to produce it returns `EMBEDDING_UNAVAILABLE` rather than a partial lexical-only task assembly.
- Required and optional tool dependencies resolve recursively.
- Dependency failure propagates correctly.
- Bootstrap retrieval works.
- Budgets cannot break dependency correctness.

## API and locked stack

- TanStack Start + React hosts the Explorer/server application.
- Elysia + GraphQL Yoga serve `/graphql`; GraphQL remains the only supported external domain API.
- urql + Graphcache is the Explorer GraphQL client with per-request SSR cache isolation.
- Base UI + Tailwind are used for Explorer primitives/styling; Radix/shadcn and TanStack Query are absent.
- All supported external domain operations are GraphQL.
- Runtime/browse/retrieval/assembly/diagnostics are available.
- No authored-content mutation API exists.
- Trusted/server context dimensions cannot be client-forged in normal mode.
- Cursor pagination and query resource limits work; `ontologyNeighborhood.depth` accepts only 1 or 2 and rejects out-of-range values with `INVALID_INPUT`.
- Stage timing and retrieval/assembly inclusion-reason values conform exactly to the stable registry in spec/14.

## Explorer

- Read-only Explorer can browse all major entities and backlinks.
- Ontology graph and tool dependency graph are navigable.
- Context simulator is generated from dimension registry and persists across playgrounds.
- Retrieval playground explains stage counts, exclusions, ranking, graph paths, packing, and latency.
- Assembly playground explains skills/fragments/tools/dependencies/bootstrap/budgets.
- Exact Git source links work when repository metadata is configured.
- Explorer can export an eval snippet without writing source.

## Security

- Authorization is fail-closed.
- Unauthorized candidates are aggregate-only in diagnostics unless caller separately has restricted diagnostic metadata/content access.
- Raw HTML from authored Markdown cannot execute.
- JSONC/source files are never executed as code.
- Semantic tables are not mutable through public API.

## Quality/performance

- Unit, DB integration, deterministic retrieval/assembly evals, compiler equivalence, migration tests pass.
- Representative benchmark corpus records p50/p95 stage timings.
- Real Valkey load tests record hit/miss/error/latency/lease-contention behavior and demonstrate fail-open result equivalence.
- Bun + Valkey GLIDE production-build smoke/load test passes on the target architecture.
- No Elasticsearch/OpenSearch dependency exists unless a documented benchmark demonstrates need.
