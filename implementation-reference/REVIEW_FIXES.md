# Implementation-Readiness Review Fixes

This pack incorporates three external implementation-review rounds before handoff.

## Review round 1

- `{}` is a valid canonical true applicability expression.
- All tool dependency cycles, including optional-only cycles, are compile errors.
- Unknown context keys are deterministic request errors.
- Omitted `runtime.availableBindings` means all authored bindings are available; explicit `[]` means none.
- Added normative operator/cardinality/type semantics, missing-value behavior, specificity formula, and priority ordering.
- Added deterministic Markdown chunking, `{#heading-id}` syntax, stable chunk keys, no per-section metadata overrides in v1, normalization rules, semantic-text builders, trigram scope, and FTS composition.
- Added stable validator/GraphQL/runtime diagnostic code registry.
- Ontology-derived retrieval is a candidate/RRF channel before hard eligibility and selection-group resolution; relation weights are removed from v1.
- Added eval JSON Schemas and expanded example dimensions so all sample contexts are valid.
- Corrected GraphQL relation direction, selection-group members/backlinks, chunk references, runtime revision fields, and restricted-diagnostic redaction behavior.
- Added missing SQL indexes/FKs, lexical-normalized columns, deterministic FTS configuration, and explicit embedding-dimension mismatch handling.
- Narrowed the required v1 CLI to `validate`, `build`, and `dev` with documented flags.
- Added explicit lifecycle, task-relevant-fragment, budget-clamping, dedupe/diversity, and Git plaintext-access semantics.

## Review round 2

- Confirmed `concept_relations.weight` is absent everywhere normative; relation weights remain out of scope.
- Corrected the implementation-agent invariant to require the entire tool dependency graph to be acyclic.
- Exact normalized concept names/aliases are explicitly set-valued: homonyms are allowed, all exact matches are returned deterministically, and ambiguity is diagnosable.
- PostgreSQL `unaccent()` is the sole lexical accent-folding authority; TypeScript performs only NFKC/whitespace/lowercase pre-normalization. Structural slugging is independent from search normalization.
- `grounding_english` prepends `unaccent` to every mapped English token class while preserving `english_stem` vs `simple`, including mixed/numeric token classes.
- Chunk overflow rules explicitly apply to `intro`; `--part-N` uses minimum two-digit padding with no 99-part limit.
- Dimension `category` is advisory, but authorization may never reference a dimension with `missingValueBehavior: ignore`; suspicious category use is warning-worthy.
- Enum dimensions require non-empty registered values; unknown authored/runtime enum values have dedicated deterministic codes.
- Expression `value: null` is schema-invalid.
- Removed vague additive retrieval quality adjustment. Final ordering is `rrfScore DESC`, `authorityScore DESC`, `priority DESC`, stable chunk UUID ASC.
- Fixed remaining GraphQL prose/diagnostic fields and added concept-resolution warnings.

## Review round 3

- Added normative `StageTiming.stage` names for retrieval and Agent Assembly so independent implementations emit the same observability vocabulary.
- Added stable retrieval and Agent Assembly inclusion-reason code vocabularies while keeping GraphQL fields as strings for forward-compatible code additions.
- `between` operands are semantically validated so `lower <= upper`; reversed ranges fail with `INVALID_EXPRESSION`.
- Precisely defined `EMBEDDING_UNAVAILABLE`: normal retrieval/concept resolution degrades with `VECTOR_CHANNEL_UNAVAILABLE`; v1 Agent Assembly with a non-empty task requires the task embedding and fails if it cannot be produced.
- `ontologyNeighborhood.depth` is explicitly limited to 1 or 2 in v1; out-of-range values are rejected with `INVALID_INPUT` rather than silently clamped.

The normative appendices remain:

- `spec/12-rule-engine-normative.md`
- `spec/13-chunking-normalization-search.md`
- `spec/14-diagnostic-error-code-registry.md`


## Stack-lock revision (revision 5)

- Locked Bun + strict TypeScript as runtime/tooling.
- Locked TanStack Start + React for the full-stack Explorer/server shell.
- Locked Elysia + GraphQL Yoga for the backend/GraphQL implementation.
- Locked urql + Graphcache + SSR exchange for Explorer GraphQL data; removed TanStack Query and `graphql-request` from consideration.
- Locked Base UI + Tailwind for UI primitives/styling; removed Radix/shadcn primitive choices.
- Locked PostgreSQL 17 + Drizzle + `pg` for durable runtime data.
- Locked Valkey as required shared/server cache and `@valkey/valkey-glide` as the production client; PostgreSQL-as-cache is not a v1 option.
- Added normative cache keys, runtime-revision invalidation, stampede protection, fail-open behavior, security isolation, metrics, production topology guidance, and Valkey load/failover acceptance.
- Added OrbStack-compatible local service definition using standard Docker Compose APIs.
- Added the implementation-facing Valkey production skill and runtime configuration guide.
