# Intentionally Open Implementation Choices

The product semantics and core implementation stack are locked. The remaining choices are deployment/integration details that do not change the public/source/runtime contracts.

- exact embedding provider adapter(s), endpoint/model, and credentials
- host authentication/authorization integration
- production hosting/platform and exact Aurora/managed-Valkey product configuration
- OpenTelemetry exporter/observability backend
- context-packing token counting implementation; deterministic approximation is acceptable unless a tokenizer is configured (chunk boundaries do not depend on it)
- whether a bounded process-local L1 cache is added after profiling; Valkey remains the shared cache either way
- whether ontology recursive CTE or in-memory traversal is used at a given point; semantics must match
- deployment-specific GraphQL/query/cache hard-limit values within the normative safety rules

Not open in v1: Bun, TypeScript, TanStack Start, React, Elysia, GraphQL Yoga, urql/Graphcache, Base UI, Tailwind, PostgreSQL 17, Drizzle, `pg`, Valkey, Valkey GLIDE, JSONC/Ajv parser stack, Markdown parser family, React Flow/Dagre, or OrbStack as the documented local container runtime.

Exact patch versions are resolved and pinned at implementation bootstrap in `package.json` + `bun.lock`; changing package families requires an explicit architecture/spec decision.
