# Implementation Plan

## Locked monorepo/package structure

```text
repo/
├── apps/
│   ├── web/                 # TanStack Start: Explorer + server routes
│   └── cli/                 # grounding CLI entrypoint
├── packages/
│   ├── server/              # Elysia app, GraphQL Yoga mount, health/readiness
│   ├── graphql/             # SDL/resolvers/generated types/loaders/errors
│   ├── core/                # domain types, expressions, selection, RRF, packing
│   ├── source/              # JSONC/Markdown parsing + schemas
│   ├── compiler/            # IR, dependency graph, hashes, manifest, materialization plan
│   ├── db/                  # Drizzle schema/migrations/repositories/raw SQL search
│   ├── cache/               # Valkey GLIDE, cache keys/TTLs/leases/single-flight
│   ├── embeddings/          # embedding provider abstraction
│   ├── retrieval/           # concept resolution + hybrid retrieval pipeline
│   ├── assembly/            # Agent Assembly + dependency closure
│   ├── evals/               # eval runner/assertions
│   ├── markdown/            # parsing/chunking/render helpers
│   ├── observability/       # stage timings/logging/metrics interfaces
│   └── test-support/        # fixtures/helpers
├── grounding/               # adopter/project source; example app may include fixtures
├── migrations/
├── ops/
└── tests/
```

Use Bun workspaces directly. Do not introduce Nx, Turborepo, Lerna, or another workspace orchestrator in v1.

## Locked technology choices

Normative details are in `spec/15-locked-technology-stack.md`.

- strict TypeScript on Bun
- TanStack Start + React
- Elysia + GraphQL Yoga (`@elysiajs/graphql-yoga`)
- urql + Graphcache + urql SSR exchange; GraphQL Code Generator
- Base UI + Tailwind CSS
- React Flow + Dagre; TanStack Table
- PostgreSQL 17 / Aurora PostgreSQL 17
- Drizzle ORM + node-postgres (`pg`)
- pgvector + pg_trgm + unaccent
- Valkey + `@valkey/valkey-glide`
- JSONC `jsonc-parser` + Ajv JSON Schema 2020-12
- unified + remark-parse
- Biome
- `bun:test` + Testing Library + Playwright
- OrbStack for local containers through standard Docker/Compose commands

No TanStack Query, `graphql-request`, Apollo Client, Radix UI, shadcn/Radix primitives, SQLite, or PostgreSQL runtime-cache backend.

## Dependency locking

At implementation bootstrap, resolve compatible current stable versions of the locked package families, install exact versions with Bun, commit `bun.lock`, and run the complete production-build smoke suite before treating the lock as baseline. Package-family substitution is not an implementation detail.

# Milestone 0 — skeleton and invariants

Deliver:
- Bun workspace/package structure
- TanStack Start web shell and reusable Elysia server package
- lint/typecheck/test/production-build commands
- `ops/compose.yaml` local PostgreSQL + Valkey services, documented for OrbStack
- PostgreSQL extensions enabled
- Drizzle migration baseline
- Valkey GLIDE client bootstrap and health check
- common domain IDs/types/errors
- CI job running unit + real PostgreSQL + real Valkey tests

Exit criteria:
- clean clone can start PostgreSQL + Valkey, migrate, and run tests
- TanStack Start production build boots and Elysia `/healthz`, `/readyz`, and `/graphql` routing smoke tests pass
- GLIDE can connect to local Valkey under Bun
- no product behavior yet

# Milestone 1 — source parser + deterministic validator

Build this first because every later feature depends on trusted compiled input.

Deliver:
- grounding-root discovery via `grounding.config.jsonc`
- JSONC parser with comments/trailing commas
- Markdown + JSONC frontmatter parser
- JSON Schema validation
- source-location mapping where practical
- exact reference index
- semantic validation framework
- stable diagnostic codes + JSON output
- CLI:
  - `grounding validate`
  - `grounding validate <path>`
  - `grounding validate --changed`
  - `--format json`
  - `--strict`

Must test:
- malformed JSONC
- duplicate keys
- unknown fields
- reference failures
- dimension/operator compatibility
- tool cycles
- hierarchy cycles
- published->draft required dependency error

Exit criteria:
- example grounding corpus validates
- intentionally broken corpus returns deterministic machine-readable diagnostics
- agents can author/edit and repair files using validator output only

# Milestone 2 — compiler IR + PostgreSQL materialization

Deliver:
- normalized/resolved IR for core entities
- UUIDv7 source identity validation
- deterministic derived IDs
- `sourceHash`, `compiledHash`, `semanticHash`, `lexicalHash`
- simple typed dependency graph + reverse dependencies
- `.grounding/manifest.json`
- materialization plan abstraction
- Drizzle schema matching v1 data model
- transactional materializer
- dimension closure derivation
- normative chunk derivation from Markdown headings/sections per `spec/13-chunking-normalization-search.md`
- `grounding build`
- `grounding build --clean`
- `grounding build --dry-run`
- `grounding dev`

Exit criteria:
- source -> empty PostgreSQL succeeds
- edit one entity -> incremental build updates only affected entities
- file deletion removes emitted runtime entities
- source file rename preserving ID does not recreate semantic entity unnecessarily
- clean/incremental results are equivalent

# Milestone 3 — embedding + lexical indexing

Deliver:
- embedding provider interface
- one installation-wide vector dimension
- semantic text builders for concept/chunk/skill/tool/fragment
- Valkey content-addressed embedding-computation cache keyed by config hash + semantic hash
- `semantic_entities` materialization
- chunk `search_text` and compiler-written `tsvector` using the configured FTS config
- concept/alias/title/heading trigram normalization/indexes
- local fake/deterministic embedding provider for tests

Exit criteria:
- changing only priority does not regenerate embedding
- changing semantic text does
- repeated semantic text/config reuses Valkey-cached embedding computation; eviction only causes recomputation
- vector/FTS/trigram SQL tests pass on real PostgreSQL
- lexical normalization/FTS regression tests prove PostgreSQL-authoritative unaccent behavior for accented, ligature-like, and mixed alphanumeric tokens; no JavaScript approximation is treated as authoritative

# Milestone 4 — core context/rule engine

Deliver:
- normalized context validation against dimension registry
- server/request trust metadata support at API boundary
- recursive expression evaluator
- hierarchy-aware enum matching
- authorization fail-closed behavior
- applicability evaluation
- specificity calculation
- selection-group resolution

Exit criteria:
- same evaluator reusable by retrieval and assembly
- full normative unit matrix for missing vs empty, `missingValueBehavior`, cardinality, hierarchy, and every operator
- unknown context keys fail deterministically
- priority/specificity/group-mode ordering matches spec exactly
- enum dimensions require registered values; unknown enum context values fail with `CONTEXT_ENUM_VALUE_UNKNOWN`
- authorization cannot reference a dimension with `missingValueBehavior: ignore`

# Milestone 5 — retrieval vertical slice

Deliver:
- query embedding once per request
- central Valkey cache package integrated below GraphQL
- revisioned cache-key builders for query embeddings, concept resolution, retrieval results, and ontology neighborhoods
- process-local single-flight plus finite Valkey lease for expensive cross-replica duplicate work
- exact/alias/concept resolution
- vector candidate search
- FTS candidate search
- trigram short-field candidate search
- direct concept-linked candidates
- ontology-derived candidate channel
- parallel channel execution
- candidate merge/dedupe
- hard lifecycle/date/auth/applicability gates
- selection groups
- RRF
- graph candidates participate in the same eligibility/selection/RRF path
- deterministic RRF -> authority -> priority -> stable-ID ordering
- deterministic packing
- structured diagnostics + stage timings

Exit criteria:
- GraphQL not required yet; service-level API tested
- deterministic eval corpus passes
- vector outage degrades to lexical/concept/ontology channels with warning; ontology-channel outage preserves direct channels
- unauthorized content cannot be returned through diagnostics
- representative warm retrieval benchmark captured
- cache hit/miss paths return identical domain results
- context/permission/revision cache-key isolation tests pass
- Valkey outage degrades to bounded cache misses without changing authorization or retrieval semantics

# Milestone 6 — Agent Assembly

Deliver:
- explicit template selection
- revisioned Valkey Agent Assembly result cache keyed by template/task/context/runtime-binding/budget inputs
- skill semantic/context selection
- prompt fragment selection
- direct semantic tool selection
- skill tool inclusion
- recursive required/optional dependency closure
- runtime available-binding filter
- failure propagation + causal diagnostics
- bootstrap retrieval using core retrieval engine
- prompt ordering and budgets
- structured result + optional rendered prompt

Exit criteria:
- required dependency unavailable => dependent tool/skill unavailable
- optional dependency unavailable => source remains
- tool cycles impossible after compile
- same task embedding reused for skill/tool/fragment semantic search and bootstrap where compatible
- deterministic assembly evals pass
- privileged diagnostics cannot collide with ordinary assembly cache entries

# Milestone 7 — GraphQL API

Deliver:
- Elysia application mounted inside TanStack Start server routes
- GraphQL Yoga through `@elysiajs/graphql-yoga` at `/graphql`
- SDL aligned with `graphql/schema.graphql`
- GraphQL Code Generator resolver/client types
- query resolvers for retrieval, concept resolution, assembly, runtime info, browse entities, neighborhood
- JSON/DateTime/Long scalars
- cursor pagination
- DataLoader/batching
- stable GraphQL error extension codes
- query depth/cost/page-size controls
- host hooks for authentication and trusted-context injection
- no authored-content mutations
- `/healthz` and `/readyz` only as infrastructure endpoints

Exit criteria:
- Elysia/GraphQL Yoga production build passes under Bun
- Explorer can be built entirely on GraphQL
- all external domain functionality has GraphQL operation
- client cannot self-assert server-trusted dimensions under normal runtime policy

# Milestone 8 — Grounding Explorer

Build only after diagnostics are real, otherwise UI will invent behavior.

Deliver:
- TanStack Start + React Explorer
- urql + Graphcache + SSR exchange with per-request server cache isolation and browser hydration
- Base UI + Tailwind component foundation
- React Flow + Dagre graph foundation
- TanStack Table browse/result tables
- Overview/runtime
- global search/command palette
- concept/ontology browser + local graph neighborhood
- knowledge browser
- domains
- dimensions tree + usage/backlinks
- selection-group visualization
- Agent Assembly entity browsers
- persistent context simulator
- Retrieval Playground
- Agent Assembly Playground
- tool dependency graph
- ranking/pipeline/timing diagnostics
- why/why-not views
- raw GraphQL panel
- exact GitHub source links where configured
- export playground configuration as JSONC eval snippet (download/copy only; no write-back)

Exit criteria:
- an unfamiliar engineer can navigate from a retrieval result to concepts, knowledge, selection group, source file, and reverse dependencies without using SQL
- all visualizations have equivalent structured/tabular fallback
- Explorer remains read-only
- no TanStack Query, graphql-request, Apollo, Radix, or shadcn/Radix primitive dependency is present
- SSR tests prove urql normalized state never leaks between requests

# Milestone 9 — deployment/runtime polish

Deliver:
- simple immutable-Git-revision deployment command/process
- production Valkey topology/configuration guidance (replicated/managed and cluster)
- TLS/auth/secret configuration for Valkey
- cache metrics/alerts, memory/eviction policy guidance, and failure behavior
- Bun + Valkey GLIDE smoke/load/failover test
- `deployments` + runtime state updates
- manual rollback by redeploying prior revision
- runtime revision cache namespace
- production configuration docs
- Aurora compatibility test where available
- production cache behavior validated against real Valkey

Do not implement artifact promotion/control-plane features.

# Milestone 10 — release hardening

Deliver:
- performance benchmark suite and baseline for cached and uncached retrieval/assembly
- Valkey hit/miss/error/latency/lease-contention benchmarks
- clean/incremental equivalence in CI
- security tests for diagnostics/context trust
- schema migration tests
- docs generated/verified from examples
- package/CLI install path
- example repository

## Vertical slice order

The first truly useful demo should be reached after Milestone 5:

```text
JSONC + Markdown
-> validate
-> compile/materialize
-> retrieve against real PostgreSQL
-> explain exactly why results appeared
```

Only then add Agent Assembly, GraphQL, and Explorer. This de-risks the distinctive core before spending time on UI.

## Performance targets (initial engineering targets, not contractual SLA)

Measure rather than promise. For a warm modest corpus, aim initially for:
- database/search/rule pipeline excluding remote embedding: tens of milliseconds
- local embedding + retrieval: low tens to low hundreds of ms
- Agent Assembly: low hundreds of ms or better on warm system

Track p50/p95 per stage and Valkey cache kind. Cache hits should materially reduce expensive embedding/retrieval/assembly work; do not set a contractual sub-millisecond promise in the architecture spec. Do not add Elasticsearch/OpenSearch until benchmark evidence demonstrates candidate discovery is the bottleneck.
