# 09 — GraphQL External API

## Constraint

All externally supported product/domain APIs use GraphQL. Minimal infrastructure `/healthz` and `/readyz` endpoints are allowed outside GraphQL.

There are no authored-content GraphQL mutations in v1. Git/GitHub is the write surface.

## Locked server/client implementation

- Server framework: Elysia.
- GraphQL server: GraphQL Yoga through `@elysiajs/graphql-yoga`.
- Elysia is mounted inside TanStack Start server routes; canonical endpoint remains `/graphql`.
- Explorer client: urql + Graphcache + urql SSR exchange.
- GraphQL Code Generator produces typed operations/resolver/client types.
- Do not add TanStack Query, Apollo Client, Relay, or `graphql-request`.

SSR MUST create per-request urql/Graphcache state; normalized cache objects may never be shared across server requests.

## Key/reference conventions

Unless a field/input is typed as `ID` or `EntityRefInput`, bare `String` identifiers such as `namespace`, `profile`, `template`, `domain`, `concept`, `relationTypes`, and similar fields are **entity keys**, not names or fuzzy search strings.

`EntityRefInput` requires exactly one of `id` or `key` at runtime.

Chunks are different because `chunk_key` is unique only within a knowledge item. `KnowledgeChunkRefInput` accepts either:

- `id`, or
- `knowledgeItem` key + `key` chunk key.

## Main queries

- runtime info
- retrieve
- resolve concepts
- assemble agent
- browse namespace/concepts/domains/knowledge/dimensions/selection groups/retrieval profiles/templates/skills/tools/fragments
- ontology neighborhood

Use cursor pagination for collections.

## Dynamic context

Context is a `JSON` scalar because dimensions are dynamic. Validate against the namespace registry. Unknown keys are `UNKNOWN_CONTEXT_DIMENSION`; no silent ignore. Host middleware rejects ordinary client attempts to set `trust: server` dimensions and injects trusted values itself.

## Runtime revision

`RetrievalResult` and `AgentAssemblyResult` include `runtimeRevision` in addition to `RuntimeInfo`, allowing a client or Explorer capture to correlate a result with the exact active compiled state.

## Concept-resolution ambiguity

`resolveConcepts` is set-valued. Multiple concepts may legitimately share the same exact lexical-normalized name/alias. The API returns all such matches subject to `limit`, each concept once at its strongest match class, and includes diagnostic warnings such as `AMBIGUOUS_EXACT_LEXICAL_MATCH`; it never chooses an arbitrary exact-name/alias winner.

## Retrieval ranking fields

`RetrievalResultItem.score` is the primary RRF score. V1 does not expose a synthetic additive `finalScore` or `qualityAdjustment`. `RetrievalRankingDiagnostic` exposes channel ranks/scores, `rrfScore`, `authorityScore`, and `priority`; final ordering uses the deterministic tuple in `spec/05-retrieval.md`.

## Ontology direction and depth

`RelationDirection` is the controlled enum `OUTGOING | INCOMING | BOTH`; neighborhood input and path diagnostics use the same vocabulary. `OntologyNeighborhoodInput.depth` defaults to `1` and accepts only `1` or `2` in v1. The server MUST reject values below 1 or above 2 with `INVALID_INPUT`; it MUST NOT silently clamp an out-of-range request.

## Selection groups

`SelectionGroup.members` exposes typed members through a GraphQL union (`KnowledgeChunk | Skill | Tool | PromptFragment`). Skill/tool/prompt-fragment browse inputs also support exact selection-group-key filtering. `KnowledgeChunk`, `Skill`, `Tool`, and `PromptFragment` expose their `selectionGroup` when present. This supports Explorer competition/backlink views without client-side reverse engineering.

## Diagnostics security

Diagnostics are typed and first-class, but unauthorized-content existence must not leak.

For a caller without restricted diagnostic permission:

- authorization-excluded candidates contribute to aggregate counts only;
- there is no per-candidate exclusion entry containing ID/key/title/path/content.

For callers with restricted-metadata diagnostic permission, `RetrievalExclusion.chunk` may be populated with a safe entity reference. Full restricted chunk content additionally requires separate restricted-content permission.

`RetrievalExclusion.redacted` tells the Explorer when an entry cannot identify the candidate.

## Error model

GraphQL errors use stable `extensions.code` values from `spec/14-diagnostic-error-code-registry.md`. Do not require clients to parse human messages.

## Runtime availability

In Agent Assembly, omitted `runtime.availableBindings` means all authored bindings are assumed available. Explicit `[]` means none.

## Query protection

Use depth/cost controls, hard page-size limits, request timeouts, DataLoader/batching, and server ceilings on retrieval/assembly budgets.

See `graphql/schema.graphql` for the implementation SDL.
