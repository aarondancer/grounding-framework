# Grounding Platform v1 Implementation Pack

This package is the implementation-ready **revision 5** specification for a Git-authored, PostgreSQL-materialized grounding platform with ontology-aware retrieval, contextual applicability/authorization, and optional Agent Assembly.

## Product identity

The product is a **knowledgebase + ontology + contextual retrieval platform**. It is not an agent framework, not a Markdown IDE, not a collaborative wiki, and not an OpenKnowledge clone. Markdown/JSONC are source formats; the core purpose is structured knowledge modeling, contextual retrieval, ontology traversal, and optional Agent Assembly.

## V1 product surface

- Git/GitHub for authoring/review/history.
- `grounding/` as the canonical source root.
- JSONC for structured authored data; Markdown with JSONC frontmatter for prose-heavy content.
- Deterministic validator and incremental compiler.
- PostgreSQL 17 + pgvector + pg_trgm + unaccent for durable compiled/runtime state.
- Valkey for shared/server caching and cache-adjacent ephemeral coordination.
- Bun + TypeScript, TanStack Start + React, Elysia + GraphQL Yoga, urql/Graphcache, Base UI + Tailwind.
- Hybrid retrieval: vector + FTS + trigram + concept/alias resolution + shallow ontology-derived candidate discovery.
- Dynamic dimensions, authorization, applicability, selection groups, priority/specificity.
- Lean Agent Assembly: templates, skills, prompt fragments, tools, tool dependency graph, bootstrap knowledge.
- GraphQL as the only supported external product/domain API.
- Read-only Grounding Explorer for browsing, visualization, query/context testing, assembly testing, diagnostics, and source links.
- One namespace per deployment by default; namespace remains a schema/runtime isolation boundary.

## Start here

1. `spec/00-product-and-scope.md`
2. `spec/01-architecture.md`
3. `spec/02-source-model.md`
4. `spec/03-conceptual-model.md`
5. `spec/04-context-and-rules.md`
6. `spec/05-retrieval.md`
7. `spec/06-agent-assembly.md`
8. `spec/07-compiler-validator.md`
9. `spec/08-postgres.md`
10. `spec/09-graphql.md`
11. `spec/10-explorer.md`
12. `spec/11-testing-security-observability.md`
13. `spec/12-rule-engine-normative.md`
14. `spec/13-chunking-normalization-search.md`
15. `spec/14-diagnostic-error-code-registry.md`
16. `spec/15-locked-technology-stack.md`
17. `spec/16-valkey-caching.md`
18. `implementation/implementation-plan.md`
19. `implementation/agent-build-instructions.md`
20. `implementation/definition-of-done.md`
21. `implementation/runtime-configuration.md`

Supporting artifacts:
- `REVIEW_FIXES.md`
- `graphql/schema.graphql`
- `sql/schema.sql`
- `schemas/*.schema.json`
- `examples/grounding/`
- `ops/compose.yaml` (OrbStack/Docker-compatible local Postgres + Valkey)
- `skills/valkey-production/SKILL.md`

## Non-goals for v1

No content-management/admin UI, no GraphQL mutations for authored content, no build-artifact promotion system, no preview-environment control plane, no multi-source context merge/trust engine, no first-class capabilities/policies, no workflow engine, no subagent orchestration, no cross-namespace references, no graph database, no LLM in the core retrieval or assembly path.

## Revision note

Revision 5 locks the concrete implementation stack and production cache architecture: Bun/TypeScript, TanStack Start + React, Elysia + GraphQL Yoga, urql + Graphcache, Base UI + Tailwind, PostgreSQL 17/Drizzle/pg, and Valkey + Valkey GLIDE. OrbStack is the documented local container runtime using standard Docker/Compose compatibility. PostgreSQL is no longer considered a cache backend in v1; shared cache behavior is normatively specified in `spec/16-valkey-caching.md`.