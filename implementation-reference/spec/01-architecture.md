# 01 — Architecture

## Core flow

```text
Git-authored grounding source
  -> validator/compiler
  -> normalized/resolved IR
  -> incremental materialization plan
  -> PostgreSQL 17 runtime
  -> Retrieval / Agent Assembly services
       <-> Valkey shared cache
  -> Elysia + GraphQL Yoga
  -> TanStack Start
       -> urql/Graphcache
       -> Grounding Explorer
```

## Isolation

`Namespace` is the top-level logical isolation/identity boundary. V1 normally deploys one namespace per service/database deployment, but every semantic table still carries `namespace_id` and cross-namespace references are prohibited.

`Environment` is operational metadata (`local`, `dev`, `staging`, `production`) and is not a canonical authored namespace concept.

## Source vs runtime

- Git = canonical authored state and history.
- PostgreSQL = durable compiled runtime state and deployment/runtime metadata.
- Valkey = disposable shared/server cache and limited ephemeral coordination; never canonical state.
- `.grounding/` = disposable local compiler cache/manifests/locks/logs.
- Embeddings/indexes/closures = derived.

## Graphs

There are two distinct graphs:

1. Ontology graph: concepts + typed directed relations. Cycles may be valid.
2. Tool dependency graph: directed required/optional dependencies. Cycles are compiler errors.

## Runtime performance posture

- PostgreSQL 17 for durable search/runtime data; Valkey for shared cache
- bounded candidate sets
- parallel candidate channels
- no LLM call in core retrieval/assembly
- shallow ontology traversal (typically 1 hop, optionally 2)
- in-process expression evaluation, RRF, selection groups, and packing
- raw SQL through Drizzle for pgvector/FTS/trigram/recursive CTEs

## External API rule

All supported external product/domain APIs use GraphQL. Minimal `/healthz`/`/readyz` HTTP endpoints are allowed as infrastructure exceptions.

## Locked runtime stack

The v1 technology stack is normative in `spec/15-locked-technology-stack.md`. Cache semantics are normative in `spec/16-valkey-caching.md`.
