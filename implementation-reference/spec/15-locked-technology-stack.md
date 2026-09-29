# 15 — Locked Technology Stack

This section is normative for v1. Implementation agents MUST use these technologies unless a later explicit architecture decision replaces one. Do not substitute an adjacent framework merely because it is familiar.

## Runtime and language

- **TypeScript**, strict mode.
- **Bun** is the application runtime, package manager, workspace manager, script runner, and primary unit-test runner.
- Commit `bun.lock`.
- Project-owned `package.json` dependencies MUST be installed with exact versions, not `^` or `~`. Patch/minor upgrades happen through explicit dependency-update PRs.

## Full-stack web application

- **React 19**.
- **TanStack Start** is the full-stack framework for the Grounding Explorer and server application.
- TanStack Router is used through TanStack Start.
- Do **not** add Next.js, Remix/React Router framework mode, Astro, or a second frontend/full-stack server framework.
- TanStack Start server functions MUST NOT become a second domain API. Explorer/runtime domain reads continue to use the canonical GraphQL API.

## Backend/API

- **Elysia** is the backend framework.
- Elysia runs inside TanStack Start server routes using its Fetch handler integration.
- **GraphQL Yoga** is the GraphQL server through `@elysiajs/graphql-yoga`.
- Canonical GraphQL SDL remains `graphql/schema.graphql`.
- Public domain API endpoint is `/graphql`.
- `/healthz` and `/readyz` are the only ordinary non-GraphQL product-server endpoints.
- Keep the Elysia application in a reusable package/module so it can be tested without booting the entire Explorer UI.

Logical request path:

```text
TanStack Start
├── Explorer SSR/routes
├── /graphql  -> Elysia -> GraphQL Yoga -> domain services
├── /healthz -> Elysia
└── /readyz  -> Elysia
```

## GraphQL client

- **urql** is the only Explorer GraphQL client.
- **Graphcache** (`@urql/exchange-graphcache`) is the normalized client cache.
- Use urql's SSR exchange for TanStack Start server rendering/hydration.
- Create a fresh urql/Graphcache instance for every SSR request. Never share normalized SSR cache state between users/requests.
- The browser owns one client instance after hydration.
- Supply Graphcache with generated/introspected schema information where needed for deterministic fragment and interface handling.
- **GraphQL Code Generator** generates typed operations/documents and resolver/client types.
- Do **not** add `@tanstack/react-query`, Apollo Client, Relay, or `graphql-request`.

The Explorer should obtain domain data through GraphQL during both SSR and browser navigation rather than maintaining separate server-function and browser data paths.

## Explorer UI

- **Base UI** (`@base-ui/react`) provides headless accessible UI primitives.
- **Tailwind CSS 4** is the styling layer.
- Do not add Radix UI or shadcn/Radix-generated primitives. If a reusable styled component is needed, compose it locally from Base UI + Tailwind.
- **React Flow** (`@xyflow/react`) provides ontology and tool-dependency graph interaction.
- **Dagre** (`@dagrejs/dagre`) provides deterministic client-side auto-layout for the initial graph views.
- **TanStack Table** provides headless tabular behavior.
- **CodeMirror 6** is used for the raw GraphQL/context/code-editor surfaces where a code editor materially improves usability.
- Build command-palette/search interactions from Base UI primitives rather than introducing a second primitive system solely for command menus.

## PostgreSQL

- **PostgreSQL 17.x** is the v1 database compatibility baseline.
- Production target: **Amazon Aurora PostgreSQL 17.x**.
- **pgvector**, **pg_trgm**, and **unaccent** are required.
- **Drizzle ORM** owns typed schema, migrations, ordinary queries, and transactions.
- PostgreSQL-specific retrieval/recursive SQL is executed as parameterized raw SQL through Drizzle.
- **node-postgres (`pg`)** is the PostgreSQL driver.
- No SQLite compatibility layer.

Local/CI development uses a PostgreSQL 17 image with pgvector installed. `ops/compose.yaml` pins the local baseline.

## Valkey

- **Valkey is required v1 infrastructure for shared/server caching.**
- Local development baseline: **Valkey 9.1.x**.
- V1 cache commands/features MUST remain compatible with Valkey 8.1+ unless a documented migration intentionally raises the floor.
- **Valkey GLIDE for Node.js** (`@valkey/valkey-glide`) is the locked server client because v1 must support production standalone/replicated and cluster deployments through one supported client family.
- Both `GlideClient` and `GlideClusterClient` deployment modes are supported.
- The implementation MUST run a Bun + GLIDE compatibility smoke/load test in CI on the production target architecture. Runtime incompatibility is a release blocker; do not silently swap clients.
- PostgreSQL is not a runtime cache backend in v1.
- Do not build a pluggable Postgres-vs-Valkey cache abstraction.

An optional bounded process-local L1 may be introduced only behind the cache package after profiling demonstrates value. It is an optimization, never a correctness dependency, and all cross-process/shared cache semantics remain Valkey-owned.

See `spec/16-valkey-caching.md` and `skills/valkey-production/SKILL.md`.

## Source/compiler libraries

- **Microsoft `jsonc-parser`** for JSONC parsing/source locations.
- **Ajv** using JSON Schema 2020-12 for canonical schema validation.
- **unified + remark-parse** for Markdown AST parsing/chunk derivation.
- Raw HTML remains disabled by the source contract.
- **react-markdown** is the Explorer Markdown renderer; do not enable `rehype-raw`.
- **uuid** provides UUIDv7 authored IDs and UUIDv5 deterministic derived-ID namespaces.
- **Commander** implements the `grounding` CLI.
- **fast-glob** performs deterministic source discovery.
- **Chokidar** powers `grounding dev` file watching.

## Testing and quality

- **`bun:test`** is the primary unit/integration test runner.
- **Testing Library** is used for React component behavior.
- **Playwright** owns browser E2E tests.
- Database integration tests use real PostgreSQL.
- Cache integration tests use real Valkey.
- Local services are started through the Docker Compose-compatible specification in `ops/compose.yaml`; **OrbStack** is the documented local container runtime.
- CI may use any OCI/Docker-compatible runner capable of running the same service images.
- **Biome** owns formatting and linting. Do not add an ESLint + Prettier stack unless an unavoidable plugin requirement is documented.

## Observability

- **Pino** for structured application logs.
- OpenTelemetry APIs may be used for traces/metrics instrumentation, with exporter/backend remaining deployment-configurable.
- Retrieval/assembly stage names and diagnostic codes remain those in `spec/14-diagnostic-error-code-registry.md`.

## Deployment shape

V1 has one primary deployable web/server application plus the CLI:

```text
repo/
├── apps/
│   ├── web/                 # TanStack Start: Explorer + server routes
│   └── cli/                 # grounding CLI entrypoint
├── packages/
│   ├── server/              # reusable Elysia app / GraphQL Yoga mounting
│   ├── graphql/             # SDL, resolvers, generated types/loaders
│   ├── core/
│   ├── source/
│   ├── compiler/
│   ├── db/
│   ├── cache/               # Valkey client, keys, TTLs, leases/single-flight helpers
│   ├── embeddings/
│   ├── retrieval/
│   ├── assembly/
│   ├── evals/
│   ├── markdown/
│   ├── observability/
│   └── test-support/
├── grounding/
├── migrations/
├── ops/
└── tests/
```

Use Bun workspaces directly. Do not add Nx, Turborepo, Lerna, or another monorepo orchestrator in v1.

## Version-lock policy

The architecture locks package families, not a forever-frozen patch release. At repository bootstrap:

1. start from current stable releases of the locked package families;
2. install with Bun using exact versions;
3. run typecheck/unit/integration/E2E and production-build smoke tests;
4. commit `package.json` and `bun.lock`;
5. thereafter upgrade only through explicit PRs.

A reference ecosystem snapshot when this revision was written (2026-09-29) included Bun 1.4.2, TanStack Start 1.168.x, React 19.3, Elysia 1.4.x, GraphQL Yoga 5.24.x, urql 5.0.x, Graphcache 9.0.x, Base UI 1.8.x, Tailwind 4.3.x, Valkey 9.1.2, Valkey GLIDE 2.5.x, Drizzle ORM 0.45.x, pg 8.23.x, React Flow 12.11.x, Dagre 3.1.x, and pgvector 0.8.6. This snapshot is informative; the committed lockfile becomes authoritative for an implementation checkout.
