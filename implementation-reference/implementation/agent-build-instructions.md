# Instructions for Implementation Agents

## Mission

Implement the v1 specification in this package. Do not expand scope merely because a future feature appears useful.

## Priority order

1. Correctness/security invariants.
2. Deterministic validation and reproducibility.
3. Core retrieval behavior.
4. Explainability/diagnostics.
5. Performance.
6. Convenience/UI polish.

## Treat as locked

- `grounding/` root, no `namespaces/` wrapper in v1 default layout
- JSONC + Markdown/JSONC frontmatter; no YAML canonical source
- Git/GitHub is authoring/review/history; Explorer is read-only
- PostgreSQL 17 is the only durable runtime database; Valkey is the required shared cache/ephemeral coordination service
- pgvector + FTS + pg_trgm + unaccent
- Bun + strict TypeScript
- TanStack Start + React for the full-stack Explorer/server shell
- Elysia + GraphQL Yoga for backend/GraphQL
- urql + Graphcache for Explorer GraphQL data; no TanStack Query or graphql-request
- Base UI + Tailwind for UI primitives/styling; no Radix/shadcn primitives
- Drizzle + `pg` for PostgreSQL
- Valkey + `@valkey/valkey-glide` for shared caching; no PostgreSQL cache backend
- OrbStack is the documented local container runtime through standard Docker/Compose compatibility
- GraphQL external product/domain API only
- one namespace per deployment by default, but `namespace_id` remains an isolation field
- no cross-namespace refs
- normalized one-object caller context; no source merge engine
- authorization and applicability are distinct
- authorization is hard/fail-closed
- selection groups and priority/specificity are core
- RRF default fusion
- shallow ontology-derived candidate discovery integrated as an RRF channel
- one embedding dimension per installation v1
- Agent Assembly includes tool dependency graph
- entire tool dependency graph is acyclic, including optional-only cycles
- templates are explicit, not auto-routed
- no first-class capabilities/policies in v1
- no LLM in core retrieval/assembly
- no content GraphQL mutations/admin UI

## Do not silently redesign

If a spec ambiguity prevents implementation, document it in an ADR/proposal and choose the smallest behavior compatible with the locked invariants. Do not introduce generic frameworks, event buses, workflow engines, or control planes without a concrete v1 requirement.

## Source validation

All source changes must pass `grounding validate`. Unknown top-level fields are errors. Fuzzy suggestions may be shown but never used to resolve authored references automatically.

## Database and cache

Use typed relational tables. Do not replace core join tables with JSON blobs. Do not introduce a generic `entities` super-table. Use raw SQL through Drizzle only where PostgreSQL-specific search/recursive behavior is clearer.

Use the central `packages/cache` Valkey implementation for shared caching. Do not issue ad hoc Valkey commands from retrieval/assembly/GraphQL/UI packages. Follow `spec/16-valkey-caching.md` and `skills/valkey-production/SKILL.md`. Cache failure is a miss; never let it change authorization or result semantics.

## Diagnostics

Diagnostics are product behavior. Preserve stable machine codes and causal chains. `StageTiming.stage`, `RetrievalReason.code`, and `AssemblyReason.code` MUST use the v1 vocabularies in `spec/14-diagnostic-error-code-registry.md`; do not invent synonymous strings. A diagnostic path must never bypass authorization.

## Testing expectations

Every milestone requires unit tests; DB-specific semantics require real PostgreSQL tests; cache-specific semantics require real Valkey tests. No mocking pgvector/FTS/trigram semantics as the sole validation. Keep fixed-embedding tests separate from real embedding quality evals.

## Performance

Parallelize independent search channels. Keep candidate pools bounded. Generate one query/task embedding and reuse it. Profile before adding infrastructure.

## Deliverables per PR

- implementation
- tests
- any migration
- validator/schema updates if source contract changes
- relevant eval fixture
- concise ADR only when a previously unspecified design choice is material
