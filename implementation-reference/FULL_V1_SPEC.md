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

---

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

---

# 00 — Product, Scope, and Locked Decisions

## Purpose

Build a low-latency grounding platform whose core value is **context engineering**: selecting the right knowledge and agent resources for a request based on semantics, ontology, applicability, authorization, precedence, and quality.

## Core axes

1. Content — knowledge items, chunks, provenance.
2. Semantics — concepts, aliases, domains, relation types, ontology graph.
3. Applicability — when/where/for whom knowledge applies and is allowed.
4. Quality — authority, freshness/effective dates, priority, lifecycle.

## V1 must ship

- namespaces (one per deployment by default)
- concepts, aliases, domains, relation types, relations
- knowledge items/chunks/sources
- dimensions and hierarchical dimension values
- authorization/applicability expressions
- selection groups (`highest_priority`, `most_specific`, `all`)
- lifecycle states: `draft`, `published`, `deprecated`
- simple retrieval profiles
- hybrid retrieval and context packing
- Agent Assembly: templates, skills, prompt fragments, tools, tool dependencies, bootstrap knowledge
- Git/GitHub authoring
- deterministic validator/compiler
- PostgreSQL 17 runtime
- Valkey shared/server cache
- GraphQL external API implemented with Elysia + GraphQL Yoga
- read-only Explorer implemented with TanStack Start + React + urql/Graphcache + Base UI

## V1 simplifications

- no full admin/editing UI
- no content audit log beyond Git; deployment/runtime logs only
- no platform-owned feature-flag system; feature flags may be supplied in normalized request context
- retrieval profiles are simple named configs; no inheritance
- concept types are plain strings; no registry
- domains are first-class but lightweight/non-central
- semantic index is generic infrastructure but only opt-in entity types are embedded
- caller supplies one final normalized context object; no multi-source context merging
- one embedding dimensionality per installation in v1
- one runtime revision counter in v1
- one primary source per knowledge item in v1

## Semantic entity types indexed in v1

- concept
- knowledge_chunk
- skill
- tool
- prompt_fragment

## Deferred to v1.5+

First-class capabilities/policies, richer profile management, concept-type registry, multi-source context merging, granular revision counters, deployment promotion/artifact system, preview environments, runtime binding version negotiation, advanced provenance, blue/green embedding migration, automatic rollback, control plane, cross-namespace imports.

## OpenKnowledge distinction

Do not use `OpenKnowledge`, `Open Knowledge`, `OKF`, or `Open Knowledge Format` as internal naming. This platform is not a Markdown workspace/wiki/editor; it is a structured grounding/runtime system.

---

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

---

# 02 — Source Model and Repository Layout

## Canonical layout

```text
grounding/
├── grounding.config.jsonc
├── namespace.jsonc
├── concepts/
├── relations/
├── knowledge/
├── dimensions/
├── selection-groups/
├── retrieval-profiles/
├── agent-assembly/
│   ├── templates/
│   ├── skills/
│   ├── prompt-fragments/
│   └── tools/
└── evals/
    ├── retrieval/
    └── agent-assembly/
```

Generated local state:

```text
.grounding/
├── cache/
├── manifests/
├── locks/
└── logs/
```

## Formats

- `.jsonc` — structured entities/configuration.
- `.md` — prose-heavy knowledge and prompt fragments with JSONC frontmatter.
- strict `.json` may be accepted as a subset.
- no YAML in v1.

JSON Schema is the formal file contract. Eval fixtures are also schema-validated (`schemas/retrieval-eval.schema.json`, `schemas/agent-assembly-eval.schema.json`).

## Markdown metadata

Use `---` delimiters containing JSONC, then Markdown body. Raw HTML in Markdown is disabled in v1.

Knowledge chunking, heading-ID syntax, stable derived keys, per-chunk inheritance, and semantic text builders are normative in `spec/13-chunking-normalization-search.md`.

## Stable identity

- authored first-class entities: UUIDv7 persisted in source
- derived entities: deterministic UUID derived from namespace + parent + type + stable structural key
- `key` is human-readable and renameable
- file path is provenance, not identity
- all stored source paths are relative to grounding root

## References

Resolution order:
1. explicit UUID
2. exact case-sensitive key in expected entity type
3. compile error

Never fuzzy/alias/semantic-resolve canonical references. Search normalization is distinct from canonical key/reference semantics.

## File organization

One major entity per file is the default. Grouped files are permitted for compact collections such as domains, relation types, relations, or dimension values. Nested folders are allowed and have no semantic meaning.

## JSONC rules

- comments allowed
- trailing commas allowed
- duplicate keys are errors
- unknown top-level fields are errors unless inside `metadata`
- no executable config
- normalization removes formatting/comment differences from logical hashes

## Grounding configuration

V1 root config may include compiler-independent repository/embedding/chunking settings. The default chunking limit is deterministic and character-based:

```jsonc
{
  "chunking": {
    "maxCharacters": 6000
  }
}
```

Embedding dimensions are installation-wide in v1. A config/database vector-dimension mismatch is a deployment/build error, never an implicit truncation/padding conversion.

---

# 03 — Conceptual Model

## Core entities

### Concept
Canonical semantic entity with stable ID, key, name, plain-string type, description, aliases, domains, lifecycle, metadata.

### Alias
Alternate name/acronym/legacy term/misspelling. Used for concept resolution; never for compiler reference resolution.

### Domain
Lightweight organizational/semantic grouping. Useful for browse and explicit filtering. Not automatically a ranking or authorization mechanism.

### Relation type / relation
Directed `source concept -> relation type -> target concept`. Shallow recursive traversal powers ontology expansion.

### Knowledge item
Logical authored/imported unit with title, summary, primary provenance, lifecycle, authority score, effective dates.

### Knowledge chunk
Smallest independently retrievable semantic unit. Carries content, linked concepts, lifecycle, priority, authority, dates, selection group, authorization/applicability, token count, lexical/semantic hashes.

### Dimension
Defines a request-context axis. Dynamic per namespace; no migration required for custom dimensions.

### Selection group
Competing variants of one logical slot. Modes: `highest_priority` (default), `most_specific`, `all`.

### Retrieval profile
Simple named validated configuration controlling candidate limits, graph expansion, and packing.

## Agent Assembly entities

### Agent template
Explicit stable shell. Caller selects the template; v1 does not auto-route templates.

### Skill
Context/task-selectable bundle of concepts, prompt fragments, and required tools. Skills do not own duplicated domain knowledge.

### Prompt fragment
Reusable instruction block with inclusion mode: `always`, `applicable`, or `task_relevant`.

### Tool
Concrete external executable interface described/selected by the platform but executed by host runtime. Has logical `runtimeBinding`.

### Tool dependency
Directed `sourceTool -> targetTool`, requirement `required|optional`. The entire dependency graph must be acyclic, including optional-only edges.

---

# 04 — Request Context, Rules, and Precedence

## Request context

Caller provides one final normalized object, e.g.:

```json
{
  "roles": ["manager"],
  "products": ["crm"],
  "regions": ["US-TX"],
  "permissions": ["analytics.read"],
  "featureFlags": ["pipeline-v2"],
  "teamSize": 12
}
```

Every key MUST exist in the namespace dimension registry. Unknown keys are request errors, not ignored warnings. The core does not own users/auth/session state and does not merge multiple context sources in v1.

## Dimension definition fields

- key/name/description
- valueType: `string|number|boolean|date|enum`
- cardinality: `single|multi`
- category: `authorization|eligibility|applicability|ranking|descriptive`
- allowedOperators
- hierarchical
- required
- missingValueBehavior: `no_match|unknown|ignore`
- trust: `server|request`

`trust` only determines whether an ordinary external caller may supply the dimension. It is not a multi-source merge system. Host middleware may inject any trusted value after authentication.

`category` is descriptive/advisory in v1: it drives Explorer organization, diagnostics, and validator warnings, but does not by itself make an expression legal or illegal. A hard safety exception applies to authorization: any dimension referenced by an authorization expression MUST NOT use `missingValueBehavior: "ignore"`; this is `UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR`. Referencing a `descriptive` or `ranking` category from authorization is allowed but should emit `SUSPICIOUS_DIMENSION_CATEGORY_USAGE`.

For `valueType: "enum"`, `values` is required and non-empty. Context enum values are exact authored dimension-value keys. Unknown values are `CONTEXT_ENUM_VALUE_UNKNOWN`. Non-enum dimensions do not declare `values`, and `hierarchical: true` is valid only for enum dimensions.

## Expressions

Recursive form:

```text
Expression = {} | allOf[] | anyOf[] | noneOf[] | leaf
leaf = { dimension, operator, value? }
```

`{}` is the canonical true expression. Boolean arrays are non-empty.

Operators:
`equals`, `not_equals`, `includes`, `includes_all`, `includes_any`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `between`, `exists`, `not_exists`.

The exact operand/cardinality/type semantics, missing-value behavior, and three-valued evaluation rules are normative in `spec/12-rule-engine-normative.md`.

## Missing vs empty

Missing means absent/unknown and is handled by the dimension's `required` and `missingValueBehavior` settings. Explicit empty collections mean explicitly none and still count as present for `exists`.

## Authorization vs applicability

- authorization = hard gate; fail closed
- applicability = hard boolean eligibility gate
- authorization never becomes a soft ranking signal
- only applicability contributes selection-group specificity

## Hierarchical dimensions

Compiler materializes transitive closure including self depth 0. A descendant context may satisfy ancestor enum conditions as specified in the normative rule appendix.

## Selection groups

Higher numeric priority wins.

`highest_priority` order:
1. priority descending
2. specificity descending
3. stable UUID ascending

`most_specific` order:
1. specificity descending
2. priority descending
3. stable UUID ascending

`all` preserves every eligible member.

No hidden fallback. Generic fallback must be explicitly authored as a member with `applicability: {}`.

## Lifecycle participation

Normal runtime behavior uses `published` entities only:

- only published concepts participate in concept resolution and ontology traversal;
- only published knowledge/chunks are retrievable;
- only published skills/tools/prompt fragments are selectable;
- Agent Assembly against a draft/deprecated template is an error (`TEMPLATE_NOT_PUBLISHED`).

Explorer callers with appropriate host permission may browse draft/deprecated entities, but this does not change normal runtime selection semantics.

---

# 05 — Retrieval Pipeline

## Contract

Input: namespace (optional when one configured), query, normalized context, optional retrieval profile, optional hard filters/limits, diagnostics flag.

## Pipeline

```text
context validation
-> query normalization + one query embedding
-> concept resolution / seed concepts
-> candidate generation in parallel
   - vector
   - PostgreSQL FTS
   - trigram short-field search
   - direct concept-linked / exact alias
   - ontology-derived concept-linked
-> merge same chunk IDs across channels
-> hard eligibility
   - published lifecycle
   - effective dates
   - authorization
   - applicability
-> selection-group resolution
-> RRF hybrid fusion across discovery channels
-> deterministic final ordering (RRF, then quality tie-breaks)
-> token/chunk packing + per-item diversity cap
```

Ontology expansion is a candidate-discovery channel, not a post-selection bypass. Graph-derived chunks therefore pass through the exact same lifecycle, authorization, applicability, and selection-group logic as all other candidates.

## Concept resolution

Concept resolution gathers candidates across channels; it does not assume an exact human-readable term maps to only one concept. Each concept is retained once using its strongest match class.

Match-class precedence is:

```text
exact raw key
-> exact lexical-normalized name
-> exact lexical-normalized alias
-> trigram/lexical
-> semantic
```

Exact raw keys are namespace-unique. Exact normalized names/aliases are intentionally **set-valued** because legitimate homonyms can exist. If multiple published concepts share the same exact normalized name/alias, return all matching concepts subject to the requested limit; do not choose an arbitrary winner. Order equal-class exact matches by concept key ascending, then stable UUID ascending. Emit `AMBIGUOUS_EXACT_LEXICAL_MATCH` in diagnostics when an exact normalized term maps to more than one published concept.

Only published concepts participate in normal runtime resolution. Select a small number of seed concepts (profile default ~4).

## Candidate defaults

Illustrative defaults only:
- vector 60
- FTS 40
- trigram 20
- direct concept-linked 30
- ontology-derived candidate limit 30

Tune via evals; these are not architectural constants.

Trigram's exact indexed fields and normalization are defined in `spec/13-chunking-normalization-search.md`.

## Fusion

Use Reciprocal Rank Fusion in TypeScript. Channels are vector, FTS, trigram, direct concept-linked, and ontology-derived. Avoid score calibration between heterogeneous systems. Learned/LLM rerankers are out of scope for v1.

## Ontology-derived channel

Default depth 1; optional depth 2 in high-recall profiles. Depth greater than 2 is outside the v1 retrieval contract. Respect relation-type allowlist and direction. Relation edges have no authored scoring `weight` in v1. Candidate ordering for this channel is deterministic using seed rank, hop depth, relation-type ordering from the profile, concept key/ID tie-break, and linked chunk ID tie-break.

Because graph discovery is one RRF channel, its contribution is naturally bounded relative to direct channels; there is no separate arbitrary `graphAdjustment` coefficient in v1.

## Quality and final ordering

Keep v1 simple and non-calibrated. Selection-group priority remains strong precedence during group resolution. Outside selection groups there is **no additive quality score** in v1. After RRF, order surviving chunks by the deterministic tuple:

```text
rrfScore DESC
authorityScore DESC
priority DESC
stable chunk UUID ASC
```

An absent `authorityScore` is treated as `0.0`; chunk priority defaults to `0`. Authority and ordinary priority are therefore tie-breakers only and cannot numerically overpower a higher RRF score. `RetrievalResultItem.score` is the primary `rrfScore`, not a synthetic combined score.

## Dedupe/diversity

Dedupe merges only the same stable chunk ID discovered through multiple channels. There is no semantic duplicate clustering in v1.

Diversity is enforced during packing with `maxChunksPerItem`.

## Packing

Deterministic, budgeted by max chunks and max tokens, with per-knowledge-item cap. Skip oversized candidates rather than stopping the entire pack. Token counting may be exact or use the configured deterministic approximation; the diagnostic warning `TOKEN_COUNT_APPROXIMATE` indicates approximation.

## Degradation

If query embedding/vector search fails, `retrieve` and `resolveConcepts` degrade to available lexical/concept/ontology channels and surface `VECTOR_CHANNEL_UNAVAILABLE`; they do **not** return `EMBEDDING_UNAVAILABLE` solely because the vector channel is down. If ontology candidate generation fails, retain direct channels and surface `ONTOLOGY_CHANNEL_UNAVAILABLE`. Authorization failures never degrade open.

## No LLM

Core retrieval requires no LLM call. Query embedding may use a local or remote embedding provider.

---

# 06 — Agent Assembly

## Purpose

Given namespace, explicit template, normalized context, and optional task, select/package initial instructions, skills, tools, dependencies, and bootstrap knowledge. The platform does not execute agents or tools.

## Input

- namespace (optional if deployment has one)
- template key (required)
- context
- optional task
- optional retrieval profile
- optional budgets
- optional `runtime.availableBindings`
- diagnostics flag

If `runtime.availableBindings` is absent, all authored runtime bindings are assumed available; runtime availability is a host constraint, not authorization. If it is explicitly `[]`, no runtime bindings are available.

## Pipeline

```text
resolve explicit published template
-> validate context
-> template fragments
-> resolve task concepts if task present
-> parallel candidates: skills, task-relevant fragments, direct tools
-> authorization/applicability
-> selection groups
-> semantic + concept ranking
-> select skills
-> add skill fragments/tools/concepts
-> recursively resolve tool dependency closure
-> recheck dependency authorization/applicability/runtime availability
-> remove unavailable dependent tools/skills
-> bootstrap knowledge retrieval
-> apply effective budgets
-> deterministic fragment ordering
-> structured AgentAssemblyResult
```

## Tool dependency semantics

- `required`: target must be selected and usable; otherwise source tool unavailable.
- `optional`: include when usable; source remains usable if target is not.
- dependencies resolve transitively.
- **all dependency cycles are compiler errors, including optional-only cycles**.
- self-dependencies and unresolved targets are compiler errors.
- failure causes propagate and diagnostics retain the causal chain.

## Skill semantics

Skills' directly referenced tools are required in v1. A skill becomes unavailable if any required direct tool or required transitive dependency is unavailable.

Published skills may not require non-published tools. More generally, a published Agent Assembly entity may not have a required lifecycle dependency on a draft/deprecated entity.

## Task embedding availability

In v1, a non-empty `task` requires one task embedding because task-driven discovery of skills, tools, and `task_relevant` prompt fragments shares that embedding. If the task embedding cannot be produced, `assembleAgent` fails with `EMBEDDING_UNAVAILABLE`; v1 does not silently produce a partial lexical-only task assembly. An assembly request with no task does not require a task embedding and can proceed from template/context rules. Bootstrap knowledge retrieval retains the core retrieval engine's normal vector-channel degradation semantics.

## Direct tool selection

Tools may also be selected semantically from task even without a matching skill.

## Prompt fragments

Modes: `always`, `applicable`, `task_relevant`. Deterministic section/order/key rendering. No prompt scripting DSL.

A `task_relevant` fragment is not considered when no task is supplied. It MUST have `semanticText` in source. `always`/`applicable` fragments need semantic text only if they explicitly opt into semantic indexing.

## Bootstrap knowledge

Uses the normal retrieval engine with selected concepts and task. Small initial context only; ongoing retrieval is a separate runtime concern.

## Budgets

Template budgets provide the normal maximums. Request budgets may only tighten them. Installation hard ceilings always apply.

For each budget dimension:

```text
effective = min(templateLimit if present, requestLimit if present, installationHardLimit)
```

Absent values are ignored from the minimum. Required dependency closure and required prompt content are indivisible. If required content alone exceeds an effective budget, assembly fails with `ASSEMBLY_BUDGET_EXCEEDED`; required dependencies are never silently dropped.

## Structured output

Canonical output includes template, runtime revision, context/task hashes, resolved concepts, prompt fragments, skills, tools, dependency provenance, bootstrap knowledge, budget usage, diagnostics. `renderedPrompt` is optional convenience output.

## Runtime availability

Host may supply available logical runtime bindings. Runtime availability is distinct from user authorization. Missing list means all bindings available; explicit empty list means none.

## V1 exclusions

No capabilities/policies as first-class entities, no execution loop, no workflow engine, no subagents, no memory, no template auto-routing, no per-turn auto-refresh.

---

# 07 — Validator and Incremental Compiler

## Validation is first-class

Every authored file must be deterministically validateable before build/deploy.

Validation layers:
1. JSONC / Markdown-frontmatter parse
2. JSON Schema
3. local semantic validation
4. cross-file exact reference resolution
5. namespace-wide invariants
6. graph/dependency validation

Required v1 CLI:

```bash
grounding validate [paths...] [--changed] [--strict] [--format human|json]
grounding build [--clean] [--dry-run]
grounding dev
```

`--changed` is mutually compatible with no explicit paths and validates Git-changed files plus affected dependents. `--strict` promotes configured warnings to errors. `--format json` writes only machine-readable JSON diagnostics to stdout; human/progress logging goes to stderr.

`status`, `diff`, `explain`, and a formal `deploy` CLI are deferred unless explicitly implemented later; implementation agents MUST NOT assume them as v1 requirements.

Machine output uses the stable codes in `spec/14-diagnostic-error-code-registry.md`, path, line/column when available, JSON Pointer, expected type, and deterministic suggestions. Suggestions never auto-correct references.

## Core validation invariants

Validate malformed source, unknown fields, field types, missing fields, duplicate ID/key, unresolved refs, unknown dimensions, operator/type/cardinality mismatch, enum registry/value validity, `hierarchical` only on enum dimensions, authorization references to `missingValueBehavior: ignore`, dimension hierarchy cycles, every tool-dependency cycle, selection-group type mismatch, invalid lifecycle dependencies, duplicate heading IDs, derived chunk-key collisions, and eval schema validity. Exact lexical-normalized name/alias collisions across concepts are warnings, not errors, because homonyms are allowed.

## Compiler stages

```text
discovery
-> parse
-> schema validate
-> normalize
-> resolve references to IDs
-> semantic validate
-> IR generation
-> dependency graph
-> hash comparison / invalidation
-> chunk derivation
-> semantic + lexical text derivation
-> embedding lookup/generation
-> materialization plan
-> transactional Postgres apply
-> verify
-> atomic manifest update
```

## Lean hash model

Required:
- `sourceHash` — normalized authored logical source
- `compiledHash` — resolved compiled entity
- `semanticHash` — semantic text used for embedding
- `lexicalHash` — lexical/search representation

`lexicalHash` is required in the final v1 contract because text-search configuration/composition is now explicitly versioned. Changing only priority/applicability MUST NOT change semantic or lexical hashes.

## Dependencies

Start with simple kinds:
- `reference`
- `semantic`
- `search`
- `structural`
- optional `validation`

Maintain reverse dependencies in manifest for incremental invalidation.

## IDs

Authored entities use UUIDv7 from source. Derived IDs are deterministic from namespace/parent/type/stable structural key. Normative chunk keys/heading IDs are defined in `spec/13-chunking-normalization-search.md`.

## Manifest

Store namespace/source identity, file normalized hashes/entity refs, entity compiled/semantic/lexical hashes, dependencies, reverse dependencies, compiler/source/schema versions required for correctness. Cache/manifest is optimization only; deleting it must permit a correct clean rebuild.

## Materialization

Compiler emits a typed `MaterializationPlan`, not arbitrary SQL strings. Apply normal incremental plan in a transaction; update runtime revision and manifest only after successful commit.

Before semantic materialization, configured embedding dimensions MUST equal the database vector dimension; mismatch fails with `EMBEDDING_DIMENSION_MISMATCH`.

## Watch mode

Debounce file events (~100–300 ms), coalesce edits while build is in progress, lock per namespace, compile only affected entities/stages.

---

# 08 — PostgreSQL Runtime

## Required extensions/configuration

- `vector`
- `pg_trgm`
- `unaccent`
- PostgreSQL FTS (built in)

Create deterministic installation text-search configuration `grounding_english` by copying `pg_catalog.english` and prepending `unaccent` to every mapped token type while preserving that token type's original terminal dictionary (`english_stem` or `simple`). This includes word, hyphenated, numeric/mixed, URL/file, version, and floating/integer token classes. A different installation config is allowed only if index and query generation use the same named config and lexical invalidation is performed when it changes. PostgreSQL's installed `unaccent()` implementation is also authoritative for lexical-normalized name/alias/title/heading columns; TypeScript MUST NOT approximate it independently.

No SQLite and no Apache AGE. PostgreSQL is the only durable runtime database in v1; shared/runtime caching is Valkey-owned and is not implemented as PostgreSQL cache tables.

## Storage principles

- typed tables, not a generic entity table
- every semantic table scoped by `namespace_id`
- composite namespace/reference FKs where practical
- JSONB for compiled recursive expressions and evolving retrieval-profile config
- no content-version history tables; Git owns authored history
- minimal timestamps on semantic tables; timestamps mainly operational
- one embedding dimension per installation in v1

## Main tables

Runtime: `namespaces`, `namespace_runtime_state`, `deployments`.

Ontology: `domains`, `concepts`, `concept_aliases`, `concept_domains`, `relation_types`, `concept_relations`.

Knowledge: `knowledge_sources`, `knowledge_items`, `knowledge_chunks`, `chunk_concepts`.

Context/retrieval: `dimension_definitions`, `dimension_values`, `dimension_value_closure`, `selection_groups`, `retrieval_profiles`, `semantic_entities`.

Agent Assembly: `agent_templates`, `prompt_fragments`, `skills`, `tools`, `template_prompt_fragments`, `skill_prompt_fragments`, `skill_concepts`, `skill_tools`, `tool_concepts`, `prompt_fragment_concepts`, `tool_dependencies`.

See `sql/schema.sql` for implementation-oriented DDL.

## Search/indexing

- HNSW cosine index on `semantic_entities.embedding`
- GIN on chunk `search_vector`
- trigram GIN on PostgreSQL-unaccented materializer-owned lexical-normalized concept key/name/aliases, knowledge-item title, and chunk heading
- relation source/target indexes
- dimension closure descendant index
- published/status/selection-group indexes where useful

`search_vector` is materializer-owned, not a generated column. Its exact weighted composition and trigram scope are normative in `spec/13-chunking-normalization-search.md`.

## Vector dimension

`sql/schema.sql` uses `vector(1536)` as an example placeholder. Migration generation MUST substitute the installation's configured vector dimension. Build/deploy MUST compare `grounding.config.embedding.dimensions` with the migrated DB dimension and fail with `EMBEDDING_DIMENSION_MISMATCH` when they differ. Never truncate, pad, or cast embeddings silently.

## Execution split

Postgres: ANN, FTS, trigram, joins, hierarchy closure lookup, recursive graph traversal.

TypeScript: recursive expression evaluation, selection groups, RRF, deterministic authority/priority tie-break ordering, packing, diagnostics.

## Drizzle

Use Drizzle for schema/migrations/CRUD/transactions/common joins. Use raw SQL through Drizzle for pgvector, FTS, trigram, recursive CTEs, text-search configuration, and special indexes.

---

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

---

# 10 — Grounding Explorer

## Purpose

Read-only observability, navigation, visualization, experimentation, and diagnostics. It is not an admin/CMS.

## Locked implementation

Explorer is a React application built with TanStack Start. Domain data is loaded through urql/Graphcache against the canonical GraphQL API during SSR and client navigation. Base UI provides headless primitives, Tailwind CSS provides styling, React Flow + Dagre provide graph visualization/layout, and TanStack Table provides table behavior. Do not introduce Radix/shadcn primitives or TanStack Query.

## Navigation

```text
Overview
Explore
  Concepts & Ontology
  Knowledge
  Domains
  Dimensions
  Selection Groups
Agent Assembly
  Templates
  Skills
  Tools
  Prompt Fragments
Playgrounds
  Retrieval
  Agent Assembly
Developer
  GraphQL
  Runtime
```

Add global search/command palette across all major entity types.

## Cross-navigation

Every entity view exposes clickable relationships and backlinks (`used by`, `requires`, `linked concepts`, `knowledge using concept`, etc.). Breadcrumbs preserve location. Source link opens exact GitHub file at deployed commit when repository metadata permits.

## Ontology visualization

Interactive local neighborhood graph, not whole-graph hairball. Controls: incoming/outgoing/both, relation filters, depth 1/2, domain filter, expand node, recenter, linked chunks. Selecting a node opens details without losing graph state.

## Dimensions

Render hierarchies as trees and dynamically generate context controls based on value type/cardinality. Provide `used by` counts and backlinks.

## Persistent context simulator

User builds simulated context once; it remains available while browsing and playground testing. Pages can display whether current context is authorized/applicable and which selection-group variant wins.

## Retrieval playground

Inputs: query, context, profile, limits, lifecycle debug toggles (privileged). Visualize pipeline counts and movement, concept resolution, candidates by channel, authorization/applicability exclusions, selection groups, ontology-derived candidate channel, RRF components, packing, timings, why/why-not.

## Agent Assembly playground

Inputs: template, task, context, runtime bindings, budgets/profile. Visualize selected skills/fragments/tools, composition tree, tool dependency graph with required/optional edges, unavailable causes, bootstrap knowledge, rendered prompt, budget usage, timings.

## GraphQL panel

Provide a raw GraphQL query/variables/result panel for developer integration. It uses the same schema; no separate Explorer API.

## Non-goals

No editing, commits, approvals, deployments, user/role management, or generic SQL/database console.

---

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

---

# 12 — Normative Rule Engine Semantics

This section is normative. Implementations MUST produce the same result for the same dimension registry, normalized context, and expression.

## Context validation

A request context is a map from dimension key to a value matching that dimension definition.

- Unknown context keys are errors: `UNKNOWN_CONTEXT_DIMENSION`. They are never silently ignored. This catches typos such as `produts` instead of `products`.
- A dimension with `required: true` MUST be present. Absence is `REQUIRED_CONTEXT_DIMENSION_MISSING`; `missingValueBehavior` does not override `required`.
- `single` dimensions accept one scalar. `multi` dimensions accept an array of scalars; arrays are treated as sets for expression semantics and duplicate values are rejected during normalization.
- No arbitrary coercion is performed. For example, the string `"12"` is not accepted for a numeric dimension.
- `date` values use ISO calendar-date form `YYYY-MM-DD`, interpreted as a date without a time zone.
- For `enum` dimensions, every context value MUST be an exact authored dimension-value key. An unregistered value is `CONTEXT_ENUM_VALUE_UNKNOWN`; it is not treated as an arbitrary string.
- A context key that is present with `[]` on a multi dimension is explicitly empty and is different from an absent key.

## Trivial true expression

The empty object is the canonical authored true expression:

```json
{}
```

It compiles to the internal constant `TRUE`. This is the normal way to author a generic fallback selection-group member.

`allOf`, `anyOf`, and `noneOf` MUST contain at least one child. Empty boolean arrays are invalid because `{}` already provides an unambiguous true expression.

## Leaf operator semantics

The expression's `dimension` identifies the context value. In the table below, `C` is the normalized context value and `R` is the authored rule `value`.

| Operator | Allowed cardinality | Allowed value types | Rule value shape | Semantics |
|---|---|---|---|---|
| `equals` | single | all | scalar | `C == R` |
| `not_equals` | single | all | scalar | `C != R` |
| `includes` | multi | all | scalar | `R` is a member of set `C` |
| `includes_all` | multi | all | non-empty array | every value in `R` is a member of set `C` |
| `includes_any` | multi | all | non-empty array | `C` and `R` have a non-empty intersection |
| `in` | single | all | non-empty array | `C` is a member of `R` |
| `not_in` | single | all | non-empty array | `C` is not a member of `R` |
| `gt` | single | number/date | scalar | `C > R` |
| `gte` | single | number/date | scalar | `C >= R` |
| `lt` | single | number/date | scalar | `C < R` |
| `lte` | single | number/date | scalar | `C <= R` |
| `between` | single | number/date | exactly `[lower, upper]` | inclusive: `lower <= C <= upper` |
| `exists` | single/multi | all | omitted | context key is present, including an explicitly empty multi value |
| `not_exists` | single/multi | all | omitted | context key is absent |

`includes` never means substring search. Comparison operators are invalid on multi-cardinality dimensions in v1. The validator MUST reject an operator not listed in the dimension's `allowedOperators`, and MUST reject operators incompatible with the dimension's type/cardinality even if mistakenly listed there.

For `exists` and `not_exists`, an authored `value` is invalid. Every other leaf operator requires a non-null `value`; explicit JSON `null` is invalid and is never a sentinel for missing data. Array-valued rule operands must also contain only values valid for the referenced dimension type.

For `between`, both bounds are normalized and type-checked using the referenced dimension's comparator, and the validator MUST require `lower <= upper`. A reversed range (`lower > upper`) is invalid source and fails with `INVALID_EXPRESSION`; runtime evaluation never swaps bounds implicitly.

## Enum and hierarchical values

For `enum` dimensions, `values` is required and non-empty. Authored rule values are exact dimension-value keys and compile to stable value IDs. A referenced enum value that does not exist fails validation with `DIMENSION_VALUE_NOT_FOUND`. Non-enum dimensions MUST NOT declare `values`; `hierarchical: true` is valid only for enum dimensions.

For hierarchical dimensions, a context descendant satisfies an ancestor membership/equality rule. Example hierarchy:

```text
US
└── US-TX
    └── US-TX-AUSTIN
```

Context `US-TX-AUSTIN` satisfies rules for `US-TX-AUSTIN`, `US-TX`, and `US`. This applies to `equals`, `includes`, `includes_all`, `includes_any`, and `in` when the compared value is an enum value. Negative operators are evaluated after ancestor expansion.

## Missing-value behavior

`missingValueBehavior` applies only when the dimension is not required and the context key is absent.

- `no_match`: a normal leaf evaluates `FALSE`. `exists` evaluates `FALSE`; `not_exists` evaluates `TRUE`.
- `unknown`: a normal leaf evaluates `UNKNOWN`. `exists` evaluates `FALSE`; `not_exists` evaluates `TRUE`.
- `ignore`: the leaf evaluates `SKIP` and is removed from its parent boolean expression. `exists`/`not_exists` still explicitly test presence and are never skipped.

Boolean evaluation uses four internal states: `TRUE`, `FALSE`, `UNKNOWN`, and `SKIP`.

After removing `SKIP` children:

- `allOf`: `FALSE` if any child is false; `TRUE` if all are true; otherwise `UNKNOWN`.
- `anyOf`: `TRUE` if any child is true; `FALSE` if all are false; otherwise `UNKNOWN`.
- `noneOf`: logical negation of `anyOf`; `FALSE` if any child is true, `TRUE` if all are false, otherwise `UNKNOWN`.
- if all children of a boolean node were skipped, the node evaluates `TRUE`.
- `{}` evaluates `TRUE`.

Only final `TRUE` passes eligibility. `FALSE` and `UNKNOWN` do not. Authorization therefore fails closed.

## Missing vs explicitly empty

For a multi dimension with context `[]`:

- `exists` is `TRUE` because the key is present.
- `not_exists` is `FALSE`.
- `includes` is `FALSE`.
- `includes_any` is `FALSE`.
- `includes_all` is `TRUE` only if the authored array were empty, but empty rule arrays are invalid; therefore it is `FALSE` for every valid `includes_all` rule.

## Authorization and applicability

Authorization and applicability use the same evaluator but have different semantics:

- authorization is a hard gate and never contributes a ranking score;
- applicability is a hard eligibility gate and provides the specificity measurement used by selection groups;
- an evaluator error on authorization fails closed and surfaces a diagnostic rather than returning the entity.

Dimension `category` is advisory metadata in v1 rather than a separate expression type system. However, a dimension referenced anywhere inside an authorization expression MUST NOT have `missingValueBehavior: "ignore"`; validation fails with `UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR` because skipping a missing auth constraint could broaden access. Using a `descriptive` or `ranking` category in authorization is permitted but should emit `SUSPICIOUS_DIMENSION_CATEGORY_USAGE`.

## Priority

Higher numeric priority wins. Default priority is `0`. Negative values are allowed.

Outside a selection group, priority is not added to retrieval score. It is a deterministic tie-breaker after `rrfScore` and `authorityScore`, as defined in `spec/05-retrieval.md`. This prevents implementation-specific score calibration.

## Specificity

Specificity is derived from the successful **applicability** expression only. Authorization never increases specificity.

Specificity is the lexicographic tuple:

```text
(positiveMatchedLeafCount, hierarchyDepthSum)
```

A positive matched leaf is one of:

`equals`, `includes`, `includes_all`, `includes_any`, `in`, `gt`, `gte`, `lt`, `lte`, `between`.

`exists`, `not_exists`, `not_equals`, `not_in`, and anything under `noneOf` contribute zero. This prevents exclusions from artificially making a variant more specific.

Composition:

- `{}` => `(0, 0)`
- positive leaf => `(1, hierarchyDepthIfApplicable)`
- `allOf` => component-wise sum of successful children
- `anyOf` => maximum specificity tuple among successful branches
- `noneOf` => `(0, 0)`
- skipped branches contribute zero

Hierarchy depth is measured from the dimension's hierarchy root, with root depth `0`. Only the matched hierarchical enum constraint contributes hierarchy depth.

## Selection-group ordering

Eligibility is evaluated before group resolution.

`highest_priority`:

```text
priority DESC
specificity DESC
stable UUID ASC
```

`most_specific`:

```text
specificity DESC
priority DESC
stable UUID ASC
```

`all`: keep every eligible member; ordinary retrieval/assembly ranking handles later ordering.

There is no implicit fallback. A generic fallback must be an authored member with `applicability: {}`.

---

# 13 — Normative Chunking, Normalization, and Search Text

This section is normative where marked. Its purpose is to prevent separate implementation agents from producing incompatible chunk identities or lexical behavior.

## Markdown chunk derivation

Knowledge-item Markdown is chunked deterministically.

### Boundary rules

1. The H1 heading is treated as document/title structure and is not by itself a chunk boundary.
2. Non-empty content before the first H2 becomes an `intro` primary chunk.
3. Every H2 starts a primary chunk that extends until the next H2 or end of document.
4. The overflow algorithm below applies to **every primary chunk, including `intro`**. H3+ headings remain inside their parent primary chunk unless that chunk exceeds `chunking.maxCharacters`.
5. If an H2-derived primary chunk exceeds the limit, recursively split on its direct H3 children; still-oversized children split on H4, then deeper headings. An oversized `intro` chunk has no child-heading split stage and proceeds directly to paragraph splitting.
6. If a leaf section or `intro` chunk still exceeds the limit, split on paragraph boundaries.
7. If a single paragraph still exceeds the limit, split the normalized Markdown source text at the character limit. Hard-split fragments use deterministic `--part-N` suffixes with **minimum two-digit zero padding**: `--part-01`, `--part-02`, ... `--part-99`, `--part-100`, etc. There is no 99-part cap.
8. V1 uses zero overlap between chunks.

The default is:

```jsonc
"chunking": {
  "maxCharacters": 6000
}
```

`maxCharacters` counts Unicode scalar values in normalized Markdown source after normalizing line endings to LF and removing the heading-ID suffix itself. It does not depend on an external tokenizer, so separate builds derive the same chunk boundaries.

### Stable heading IDs

V1 supports one small Markdown extension:

```markdown
## Stage progression {#stage-progression}
```

The `{#...}` suffix is recognized only at the end of a heading, is removed from rendered heading text, and supplies that section's stable structural key. IDs MUST match:

```text
^[a-z0-9][a-z0-9._-]*$
```

Duplicate explicit heading IDs within a knowledge item are compile errors.

For an unanchored section, derive its key from the complete heading path using the deterministic slug algorithm below. If two derived section keys collide, compilation fails with `DUPLICATE_DERIVED_CHUNK_KEY` and the author must add explicit heading IDs. The compiler MUST NOT silently append an ordinal to resolve collisions.

Authors who require identity to survive significant section restructuring should use explicit heading IDs.

### Per-chunk metadata

Per-section metadata overrides are intentionally out of scope for v1. Every derived chunk inherits the knowledge item's:

- lifecycle status
- priority
- authority score
- effective dates
- authorization expression
- applicability expression
- selection group
- concept links
- primary source provenance

The runtime duplicates these values onto `knowledge_chunks` because retrieval is chunk-centric. If two sections need different authorization/applicability/precedence, they MUST be authored as separate knowledge items.

## Canonical keys, lexical normalization, and identity

### Entity keys

Authored entity keys are case-sensitive, exact identifiers. Compiler references resolve an exact UUID or exact key only. Do not lowercase, unaccent, fuzzy-match, or alias-resolve canonical references.

### Pre-lexical normalization in TypeScript

Before sending human-searchable text to PostgreSQL for lexical normalization, the compiler/query layer performs exactly:

1. Unicode NFKC normalization.
2. Normalize CRLF/CR to LF where applicable.
3. Trim leading/trailing Unicode whitespace.
4. Collapse internal Unicode whitespace runs to one ASCII space.
5. Apply Unicode-aware, locale-independent lowercase using the runtime equivalent of JavaScript `String.prototype.toLowerCase()`.
6. Preserve punctuation. Do not generally strip punctuation because strings such as `C++`, `.NET`, and `conversion %` are meaningful.

The TypeScript layer MUST NOT attempt to emulate PostgreSQL `unaccent` with NFKD/combining-mark stripping.

### PostgreSQL-authoritative unaccent

PostgreSQL is the single source of truth for accent folding. At materialization time, the pre-normalized string MUST be passed through the database's installed `unaccent()` dictionary/function and the returned value stored in the lexical-normalized column. Query-side exact lexical and trigram lookup MUST apply the same pre-normalization and the same PostgreSQL `unaccent()` implementation before comparison/search.

This requirement intentionally covers mappings that ordinary Unicode decomposition does not reproduce, such as ligatures or characters handled by PostgreSQL's `unaccent.rules` table. Do not vendor a second independent approximation unless it is byte-for-byte derived from the exact deployed PostgreSQL rules and covered by equivalence tests.

`concepts.normalized_key`, `concepts.normalized_name`, `concept_aliases.normalized_alias`, `knowledge_items.normalized_title`, and `knowledge_chunks.normalized_heading` are **lexical-normalized**, materializer-owned values. Exact concept-name/alias resolution compares these lexical-normalized forms. Exact concept-key resolution remains raw exact-key matching; `normalized_key` exists only for fuzzy/trigram discovery.

### Exact name/alias ambiguity

Exact lexical-normalized concept names and aliases are not namespace-unique. Legitimate homonyms are allowed. If multiple published concepts have the same exact lexical-normalized name/alias, concept resolution returns all matching concepts subject to the caller limit; it MUST NOT select an arbitrary winner.

Each concept is emitted once using its strongest match class. Equal match-class exact results sort by concept key ascending, then stable UUID ascending. Diagnostics emit `AMBIGUOUS_EXACT_LEXICAL_MATCH` when one exact normalized query term maps to multiple published concepts. A build/validator MAY surface the same code as a warning for authored collisions, but collisions are not compile errors.

### Derived slug algorithm

Structural slugging is deliberately independent of PostgreSQL search normalization and does **not** use `unaccent`.

For each heading-path component:

1. Unicode NFKC normalize.
2. Apply locale-independent lowercase.
3. Replace each maximal run of characters outside ASCII `[a-z0-9._-]` with `-`.
4. Collapse repeated `-` and trim leading/trailing `-`.
5. Join non-empty heading-path components with `--`.

An empty resulting slug is a validation error requiring an explicit heading ID. Any slug collision is `DUPLICATE_DERIVED_CHUNK_KEY`; authors resolve it with explicit IDs.

## Query normalization

The original query is preserved. Lexical channels use the same pre-lexical normalization plus PostgreSQL-authoritative `unaccent` described above. The core does not perform LLM query rewriting in v1.

## Semantic text builders

Semantic text is deterministic and versioned by the compiler.

- `concept`: `name`, then aliases in authored order, then description; omit absent sections and join non-empty sections with newlines.
- `knowledge_chunk`: knowledge-item title, chunk heading/path if present, then chunk content. Linked concept names are deliberately excluded so renaming a concept does not force chunk re-embedding.
- `skill`: the authored `semanticText` field after line-ending/outer-whitespace normalization.
- `tool`: the authored `semanticText` field after normalization.
- `prompt_fragment`: only fragments with an authored `semanticText` opt into semantic indexing; `task_relevant` fragments MUST provide it. `always`/`applicable` fragments need not be embedded.

Authorization, applicability, priority, UUIDs, and unrelated metadata MUST NOT be inserted into semantic text.

## Trigram channel

Trigram is intentionally restricted to short lexical fields.

Concept resolution searches:

- concept key (using `normalized_key` for fuzzy discovery only)
- concept name
- concept aliases

Knowledge chunk candidate discovery searches:

- knowledge-item title
- chunk heading

V1 MUST NOT trigram-search full chunk bodies. Add trigram indexes on lexical-normalized concept key/name/aliases, knowledge-item title, and chunk heading.

## PostgreSQL FTS

`search_vector` is compiler/materializer-owned, not a generated column, because it combines data from multiple tables.

V1 search-text composition:

- item title and heading/path: weight A
- chunk content: weight B
- directly linked canonical concept names: weight C

The materializer and query side MUST use the same configured text-search configuration. The default installation configuration is `grounding_english`, copied from PostgreSQL `english`, with `unaccent` prepended to **every token type that the copied English configuration maps**, preserving the copied configuration's original terminal dictionary (`english_stem` or `simple`). This includes mixed/alphanumeric token classes such as `numword`, `hword_numpart`, `numhword`, `version`, and `sfloat`, not only ordinary word tokens.

Because `unaccent` is a filtering dictionary and is identity on unaffected ASCII text, prepending it across all mapped English token types gives consistent accent folding without changing normal ASCII behavior. Installations may choose another deterministic configuration, but changing it invalidates `lexicalHash` and requires lexical rematerialization.

Required integration tests include accent-insensitive and mixed-token cases such as `café`/`cafe`, `Æther`/`Aether`, `straße`/`strasse` where supported by the deployed rules table, and an accented alphanumeric token such as `café2`/`cafe2`. Tests MUST assert index/query equivalence using the deployed PostgreSQL configuration rather than a JavaScript approximation.

## Dedupe and diversity

V1 candidate dedupe means only: merge the same stable chunk ID discovered by multiple channels. There is no semantic near-duplicate clustering.

Diversity is enforced during packing via `maxChunksPerItem`; there is no separate diversity model.

---

# 14 — Stable Diagnostic and Error Code Registry

Codes in this file are part of the v1 machine contract. Implementations may add new codes, but MUST NOT reuse an existing code for a different meaning. Human messages may improve without changing the code.

## Source/validator errors

| Code | Meaning |
|---|---|
| `SOURCE_PARSE_ERROR` | JSONC or Markdown/frontmatter cannot be parsed |
| `SCHEMA_VALIDATION_FAILED` | source does not satisfy its JSON Schema |
| `UNKNOWN_FIELD` | unknown top-level field outside `metadata` |
| `MISSING_REQUIRED_FIELD` | required authored field missing |
| `INVALID_FIELD_TYPE` | field has wrong primitive/container type |
| `DUPLICATE_ID` | stable ID appears more than once in the namespace |
| `DUPLICATE_KEY` | key duplicated in an entity registry where keys must be unique |
| `REFERENCE_NOT_FOUND` | exact referenced entity cannot be resolved |
| `REFERENCE_TYPE_MISMATCH` | reference resolves to the wrong expected entity type |
| `INVALID_EXPRESSION` | expression shape/value is invalid |
| `INVALID_OPERATOR_FOR_DIMENSION` | operator incompatible with dimension type/cardinality or not allowed |
| `UNKNOWN_DIMENSION` | authored expression references an undefined dimension |
| `DIMENSION_VALUE_NOT_FOUND` | authored enum expression/value reference is not registered for that dimension |
| `UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR` | authorization expression references a dimension configured with `missingValueBehavior: ignore` |
| `HIERARCHY_CYCLE` | dimension hierarchy contains a cycle |
| `TOOL_DEPENDENCY_CYCLE` | any required/optional tool dependency cycle exists |
| `TOOL_SELF_DEPENDENCY` | tool depends on itself |
| `SELECTION_GROUP_TYPE_MISMATCH` | member type differs from group `entityType` |
| `INVALID_LIFECYCLE_DEPENDENCY` | published Agent Assembly entity requires a non-published required dependency |
| `DUPLICATE_HEADING_ID` | duplicate explicit Markdown heading ID within an item |
| `DUPLICATE_DERIVED_CHUNK_KEY` | unanchored heading structure produces colliding chunk keys |
| `EMBEDDING_DIMENSION_MISMATCH` | configured embedding dimension differs from DB schema dimension |
| `EVAL_SCHEMA_INVALID` | eval fixture does not satisfy the v1 eval schema |

## Runtime input / GraphQL errors

| Code | Meaning |
|---|---|
| `INVALID_INPUT` | generic structured request validation failure |
| `INVALID_CONTEXT` | context contains one or more invalid values |
| `UNKNOWN_CONTEXT_DIMENSION` | request context contains an undefined dimension key |
| `CONTEXT_TYPE_MISMATCH` | context value does not match dimension type/cardinality |
| `CONTEXT_ENUM_VALUE_UNKNOWN` | enum context contains a value key not registered for that dimension |
| `REQUIRED_CONTEXT_DIMENSION_MISSING` | required dimension absent |
| `CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE` | ordinary caller attempted to set `trust: server` dimension |
| `NAMESPACE_NOT_FOUND` | selected namespace does not exist |
| `ENTITY_NOT_FOUND` | requested entity/ref does not exist |
| `PROFILE_NOT_FOUND` | requested retrieval profile does not exist/is not usable |
| `TEMPLATE_NOT_FOUND` | requested template does not exist |
| `TEMPLATE_NOT_PUBLISHED` | template exists but is not published and cannot be assembled normally |
| `AUTHORIZATION_EVALUATION_FAILED` | authorization could not be safely evaluated; request/entity fails closed |
| `ASSEMBLY_REQUIREMENT_UNSATISFIED` | required tool/dependency/fragment requirement cannot be satisfied |
| `ASSEMBLY_BUDGET_EXCEEDED` | indivisible required assembly exceeds effective hard budget |
| `EMBEDDING_UNAVAILABLE` | `assembleAgent` received a non-empty task but the required shared task embedding could not be produced; normal `retrieve`/`resolveConcepts` vector failures use `VECTOR_CHANNEL_UNAVAILABLE` and degrade instead |
| `INTERNAL_ERROR` | unclassified internal failure; no sensitive internals exposed |

## Retrieval exclusion codes

| Code | Meaning |
|---|---|
| `LIFECYCLE_NOT_PUBLISHED` | candidate is draft/deprecated in normal runtime mode |
| `OUTSIDE_EFFECTIVE_WINDOW` | current/effective time outside candidate validity |
| `AUTHORIZATION_NO_MATCH` | authorization evaluates false/unknown |
| `APPLICABILITY_NO_MATCH` | applicability evaluates false/unknown |
| `SELECTION_GROUP_NOT_SELECTED` | another eligible variant won the group |
| `PACKING_ITEM_CAP` | skipped due to per-item diversity cap |
| `PACKING_TOKEN_BUDGET` | skipped because adding it would exceed packing budget |

Unauthorized candidates MUST NOT expose their IDs, keys, titles, paths, or content to callers lacking privileged restricted-diagnostic access. In that case only aggregate counts are returned.

## Agent Assembly codes

| Code | Meaning |
|---|---|
| `RUNTIME_BINDING_UNAVAILABLE` | host explicitly reported tool binding unavailable |
| `REQUIRED_DEPENDENCY_UNAVAILABLE` | required tool dependency is not usable |
| `SKILL_REQUIRED_TOOL_UNAVAILABLE` | skill removed because a required direct/transitive tool is unusable |
| `OPTIONAL_DEPENDENCY_OMITTED` | optional dependency was unavailable and omitted |
| `TASK_REQUIRED_FOR_FRAGMENT` | `task_relevant` fragment not considered because no task exists; normally informational rather than an error |

## Warning codes

| Code | Meaning |
|---|---|
| `VECTOR_CHANNEL_UNAVAILABLE` | retrieval degraded to non-vector channels |
| `ONTOLOGY_CHANNEL_UNAVAILABLE` | ontology-derived candidate channel failed; direct channels preserved |
| `OPTIONAL_TOOL_DEPENDENCY_UNAVAILABLE` | optional dependency could not be included |
| `TOKEN_COUNT_APPROXIMATE` | returned token count uses configured approximation rather than exact target tokenizer |
| `AMBIGUOUS_EXACT_LEXICAL_MATCH` | one exact lexical-normalized query term maps to multiple published concepts; all are retained deterministically |
| `SUSPICIOUS_DIMENSION_CATEGORY_USAGE` | expression usage is legal but unusual for the dimension category, e.g. descriptive/ranking in authorization |

## Stage timing names

`StageTiming.stage` remains a GraphQL `String` so future versions can add stages without changing the SDL, but v1 implementations MUST use the following stable names rather than inventing synonyms. Stages may be omitted when not executed; repeated names are not allowed within one operation's timing list.

### Retrieval / concept-resolution stages

| Stage name | Meaning |
|---|---|
| `context_validation` | validate/normalize request context |
| `query_normalization` | normalize query text before discovery |
| `query_embedding` | produce the shared query embedding |
| `concept_resolution` | resolve/score seed concepts |
| `vector_candidates` | pgvector candidate discovery |
| `fts_candidates` | PostgreSQL FTS candidate discovery |
| `trigram_candidates` | short-field trigram candidate discovery |
| `concept_linked_candidates` | direct concept-linked candidate discovery |
| `ontology_candidates` | shallow ontology-derived candidate discovery |
| `candidate_merge` | merge/dedupe channel candidates by stable chunk ID |
| `lifecycle_filter` | lifecycle/effective-window filtering |
| `authorization` | authorization-expression evaluation |
| `applicability` | applicability-expression evaluation |
| `selection_groups` | competing-variant resolution |
| `rrf_fusion` | reciprocal-rank fusion |
| `final_ordering` | deterministic authority/priority/UUID tie-break ordering |
| `packing` | token/chunk/item-cap context packing |

### Agent Assembly stages

| Stage name | Meaning |
|---|---|
| `template_resolution` | resolve/validate the published template |
| `context_validation` | shared normalized-context validation |
| `task_embedding` | produce the shared task embedding when a task exists |
| `task_concept_resolution` | resolve concepts from the task |
| `skill_discovery` | discover/rank candidate skills |
| `fragment_discovery` | discover/rank candidate prompt fragments |
| `tool_discovery` | discover/rank direct candidate tools |
| `assembly_filtering` | lifecycle/auth/applicability filtering of assembly candidates |
| `selection_groups` | selection-group resolution for assembly entities |
| `skill_selection` | select skills within effective budget |
| `dependency_closure` | recursively resolve tool dependencies and availability |
| `bootstrap_retrieval` | retrieve optional bootstrap knowledge |
| `budget_application` | enforce effective prompt/tool/skill/knowledge budgets |
| `prompt_rendering` | deterministic prompt-fragment rendering/order |

## Inclusion-reason codes

Like error codes, these are stable machine values. The GraphQL fields remain `String` for forward-compatible additions, but v1 emitters MUST use these codes where applicable.

### Retrieval result reasons (`RetrievalReason.code`)

| Code | Meaning |
|---|---|
| `VECTOR_MATCH` | chunk was discovered by the vector channel |
| `FULL_TEXT_MATCH` | chunk was discovered by PostgreSQL FTS |
| `TRIGRAM_MATCH` | chunk was discovered by short-field trigram search |
| `DIRECT_CONCEPT_LINK` | chunk was discovered through a directly resolved/seed concept |
| `ONTOLOGY_CONCEPT_LINK` | chunk was discovered through shallow ontology expansion from a seed concept |

A chunk discovered through multiple channels includes multiple reason entries, ordered by the channel order above. These reason codes describe discovery provenance; authorization/applicability/selection decisions belong in typed diagnostics rather than additional ad hoc reason strings.

### Agent Assembly reasons (`AssemblyReason.code`)

| Code | Meaning |
|---|---|
| `TEMPLATE_FRAGMENT` | fragment included directly by the selected template |
| `APPLICABLE_FRAGMENT` | context-applicable fragment included by rule selection |
| `TASK_RELEVANT_FRAGMENT` | fragment selected from task relevance |
| `SELECTED_SKILL` | entity included because a skill was selected |
| `SKILL_REQUIRED_TOOL` | tool required directly by a selected skill |
| `DIRECT_TASK_TOOL` | tool selected directly from task relevance |
| `REQUIRED_TOOL_DEPENDENCY` | tool included as required dependency closure |
| `OPTIONAL_TOOL_DEPENDENCY` | usable optional dependency included in closure |


## Stability

JSON validator output, GraphQL `errors[].extensions.code`, Explorer diagnostics, and eval-runner diagnostics MUST use these codes where applicable. Do not make clients parse human-readable messages.

---

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

---

# 16 — Valkey Caching and Ephemeral Coordination

Valkey is a required v1 runtime dependency. PostgreSQL remains the durable compiled/runtime database; Valkey owns ephemeral/shared caching and limited cache-adjacent coordination.

## Correctness boundary

Valkey is never canonical state.

A missing, evicted, expired, flushed, restarted, or temporarily unavailable cache entry MUST be equivalent to a cache miss. The system must be able to recompute the value from canonical/runtime state and external embedding services where applicable.

Valkey MUST NOT become the authoritative store for:
- concepts, relations, knowledge/chunks, dimensions, selection groups, profiles;
- compiled authorization/applicability rules;
- deployment/runtime revision state;
- semantic vectors required for serving the active compiled revision;
- authored or compiled Agent Assembly entities.

Materialized runtime embeddings remain in PostgreSQL `semantic_entities`. Valkey may cache the result of embedding computations to avoid repeated provider calls.

## What v1 caches

Shared cache categories:

| Cache kind | Example key material | Default TTL posture |
|---|---|---|
| `embedding-content` | embedding-config-hash + semantic-hash | long (days) |
| `query-embedding` | embedding-config-hash + normalized-query-hash | medium (tens of minutes) |
| `concept-resolution` | runtime-revision + normalized-query + profile | medium |
| `retrieval-result` | runtime-revision + query/context/profile/filter/limit hashes | short (minutes) |
| `assembly-result` | runtime-revision + template/task/context/binding/budget hashes | short |
| `ontology-neighborhood` | runtime-revision + seed/direction/depth/relation-filter hash | medium |
| `singleflight-lease` | operation-kind + deterministic work hash | seconds |

These TTLs are defaults, not source-format semantics. Deployment configuration may tune them within hard bounds.

Do not cache arbitrary GraphQL response envelopes. Cache domain-service results below GraphQL so SSR, browser GraphQL, and other GraphQL callers share the same behavior.

Diagnostics-bearing requests require special care. Either bypass shared result caching or include diagnostics mode plus the caller's diagnostic authorization scope in the cache key. A privileged diagnostic result must never be served to an unprivileged caller.

## Key format

All keys MUST be namespaced and versioned:

```text
grounding:v1:<kind>:<namespace-id>:<runtime-revision>:<sha256>
```

Content-addressed caches that are intentionally revision-independent use their content/config hashes instead:

```text
grounding:v1:embedding-content:<embedding-config-hash>:<semantic-hash>
```

Never place raw user query text, permissions, access tokens, email addresses, or other sensitive context values in key names. Hash canonical serialized inputs.

Canonical serialization MUST:
- sort object keys;
- preserve array ordering where semantically ordered;
- sort set-like arrays before hashing;
- distinguish missing from empty;
- include every option that can affect the returned value.

Use SHA-256 for cache input hashes.

## Runtime revision invalidation

The primary invalidation mechanism is revisioned keys.

After a successful compiler/materializer deployment increments the namespace runtime revision:
- new requests use the new revision in cache keys;
- old cache entries immediately become unreachable by normal lookups;
- old keys expire naturally by TTL;
- no mass `DEL`, prefix scan, or global flush is required.

Do not use `KEYS` in production. Administrative cleanup, if ever needed, uses bounded `SCAN` and is not on the request path.

## Cache API

Business/domain services should depend on a small typed package API, not issue arbitrary Valkey commands throughout the codebase.

Minimum package responsibilities:

```ts
interface RuntimeCache {
  get<T>(key: CacheKey): Promise<T | null>
  set<T>(key: CacheKey, value: T, options: { ttlMs: number }): Promise<void>
  delete(key: CacheKey): Promise<void>
  getOrCompute<T>(
    key: CacheKey,
    options: { ttlMs: number; leaseMs: number },
    compute: () => Promise<T>
  ): Promise<T>
}
```

The concrete implementation is Valkey-only in v1. The interface exists for layering/testability and to centralize key construction, serialization, metrics, timeout behavior, and stampede protection—not to support a PostgreSQL cache implementation.

## Stampede protection

Use two levels.

### Process-local single flight

Concurrent identical work inside one Bun process shares one in-flight promise. Remove the entry on both resolve and reject.

### Cross-process lease

For expensive work that can be triggered simultaneously on multiple replicas:
1. check cache;
2. attempt `SET lease-key token NX PX <leaseMs>`;
3. winner computes;
4. winner writes cache result;
5. winner releases only if the lease token still matches;
6. losers wait with bounded jitter and re-check cache;
7. if the lease expires, a waiter may attempt acquisition.

Lease release MUST be compare-and-delete atomically (Lua/script or equivalent supported atomic mechanism). Never blindly `DEL` a lease that may have expired and been reacquired by another worker.

The lease duration must be finite and longer than the expected p99 work duration with reasonable margin. Long-running operations should not use indefinite locks.

## Failure behavior

Valkey errors are cache failures, not authorization/retrieval semantic failures.

For ordinary cache reads/writes:
- use short operation timeouts;
- on read error, record a metric and continue as a cache miss;
- on write error, return the computed canonical result without cache persistence;
- never return stale privileged data because a cache operation failed.

For single-flight/lease failure:
- retain process-local single flight;
- allow canonical recomputation;
- apply concurrency/load safeguards so a cache outage does not create an unbounded embedding/retrieval stampede.

`/healthz` should report Valkey dependency state. Temporary Valkey failure does not make canonical data incorrect; production operators may choose whether `/readyz` treats cache failure as degraded-ready or not-ready according to expected load. The default application behavior is fail-open for correctness.

## Client and topology

Use `@valkey/valkey-glide`.

Support:
- standalone/replication endpoint through `GlideClient`;
- Valkey Cluster through `GlideClusterClient`;
- TLS in production;
- authentication/ACL credentials from secret/environment configuration;
- reconnect/backoff behavior supplied/configured through the client;
- topology-aware production deployment.

Do not use Bun's native Redis client for the v1 production cache client because the locked client must support the production topology requirements consistently. It may be used only in isolated developer experiments, never in committed runtime code.

## Local development

Use the normal Docker Compose-compatible file in `ops/compose.yaml`.

The documented local runtime is OrbStack:

```bash
docker compose -f ops/compose.yaml up -d
docker compose -f ops/compose.yaml ps
```

No OrbStack-specific API is required by application code; compatibility with standard Docker/Compose commands is intentional.

## Production topology

The application must work with:
- a managed or self-operated replicated Valkey service with automatic failover;
- Valkey Cluster when horizontal sharding is required.

Production expectations:
- TLS enabled where supported;
- authentication enabled;
- network access restricted to the application;
- persistence settings are an operations choice because cache correctness cannot depend on persistence;
- memory limit and eviction policy are explicitly configured/monitored;
- alerts exist for memory pressure, evictions, connection errors, command latency, and hit rate.

Recommended cache eviction posture is an all-keys LRU/LFU-style policy suitable for ephemeral cache data. Do not mix canonical durable data into the same logical cache and then rely on no-eviction behavior.

## Serialization/value discipline

- Cache values are versioned envelopes.
- Include a small `schemaVersion` in complex cached payloads.
- Reject/ignore unknown future cache envelope versions as misses.
- Avoid very large values. If a payload is unexpectedly large, skip caching and emit a metric rather than turning Valkey into blob storage.
- Do not store secrets or raw authentication tokens.
- Never rely on cache encryption as a substitute for network/auth controls.

## Security and tenant/context isolation

Every result cache key includes namespace + runtime revision and a cryptographic hash of the full semantically relevant normalized context.

The hash input for retrieval/assembly must include all authorization-sensitive context values that can affect eligibility. Omitting one is a data-leak bug.

Tests MUST prove:
- different permission/role contexts do not collide;
- privileged diagnostics do not collide with ordinary result caches;
- namespace/revision changes do not collide;
- omitted vs empty dimensions produce different keys where semantics differ.

## Metrics

Emit at least:
- cache hit/miss/error count by cache kind;
- command latency histogram;
- value-size histogram;
- lease acquired/contention/timeout counts;
- compute-after-miss duration;
- avoided embedding-call count;
- cache bypass/oversize count.

Do not include raw cache keys containing input hashes in high-cardinality metric labels.

## Performance acceptance

Before production release, run concurrent load tests with real Valkey and PostgreSQL.

At minimum verify:
- cache hit path is materially faster than recomputation;
- cache failures degrade safely without correctness changes;
- repeated concurrent misses produce one bounded expensive computation per key under normal lease operation;
- cluster/replication failover does not create permanent client failure;
- Valkey memory/eviction behavior remains predictable under representative corpus/query churn;
- cache use does not change deterministic retrieval/assembly results.

No Redis-compatible feature should be introduced directly into a domain service. Add it to the cache package with tests and document why the semantic is needed.

---

# Scope Matrix

## V1

Core ontology/knowledge/dimensions, authorization/applicability, selection groups, Postgres hybrid retrieval, simple retrieval profiles, deterministic validator/compiler, Valkey-backed embedding/query/result caches, Git authoring, Agent Assembly templates/skills/fragments/tools/tool dependencies/bootstrap knowledge, GraphQL read/query API, read-only Explorer, simple Git-revision deployment/runtime logs.

## V1.5 candidates

First-class capabilities and policies, concept-type registry, richer provenance, multi-source context merge/trust, granular runtime revisions, richer retrieval profile management, runtime binding versions, deployment eval gates/diffs, richer review workflows, more semantic entity types, precomputed ontology neighborhoods if profiling warrants.

## Future only when justified

Build artifact promotion/control plane, preview environments, blue/green runtime generations, live multi-embedding migration, automatic rollback, signing, policy engine, cross-namespace imports/releases, graph database, workflow engine, subagent execution/memory, distributed compiler infrastructure beyond the required Valkey cache topology.

---

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

---

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

---

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

---

# Runtime Configuration

Deployment-specific secrets/settings are not authored in `grounding/`.

Minimum runtime configuration:

```text
DATABASE_URL
VALKEY_MODE=standalone|cluster
VALKEY_ADDRESSES=host:port[,host:port...]
VALKEY_TLS=true|false
VALKEY_USERNAME=<secret/optional>
VALKEY_PASSWORD=<secret/optional>
GROUNDING_ENV=local|dev|staging|production
```

For local OrbStack development:

```text
DATABASE_URL=postgresql://grounding:grounding@localhost:5432/grounding
VALKEY_MODE=standalone
VALKEY_ADDRESSES=localhost:6379
VALKEY_TLS=false
GROUNDING_ENV=local
```

Production credentials MUST come from the host's secret-management mechanism, not Git-authored grounding files.

Other deployment-specific settings may include GraphQL cost/depth ceilings, connection pool sizes, cache TTL ceilings, embedding provider endpoint/model/credentials, GitHub source-link metadata, log level, and OpenTelemetry exporter configuration.

The cache package interprets Valkey deployment mode and constructs the correct locked GLIDE client. Domain packages do not parse Valkey environment variables directly.

---

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

---

# Operational Local Services

# Local Services with OrbStack

Grounding v1 documents OrbStack as the local container runtime. The application intentionally uses only Docker/Compose-compatible commands and APIs so CI and other development environments can run the same service definition.

Start:

```bash
docker compose -f ops/compose.yaml up -d
```

Status:

```bash
docker compose -f ops/compose.yaml ps
```

Stop:

```bash
docker compose -f ops/compose.yaml down
```

Remove local PostgreSQL data too:

```bash
docker compose -f ops/compose.yaml down -v
```

Local endpoints:

- PostgreSQL: `postgresql://grounding:grounding@localhost:5432/grounding`
- Valkey: `redis://localhost:6379` (Valkey speaks the Redis protocol; production runtime uses Valkey GLIDE)

The compose file pins PostgreSQL 17 + pgvector and Valkey 9.1.2. Local Valkey persistence is deliberately disabled because cache contents are disposable.

After Postgres starts, apply `sql/schema.sql` or the implementation's Drizzle migrations. Required extensions are `vector`, `pg_trgm`, and `unaccent`.

---

# Implementation Skill: Valkey Production

# Valkey Production Skill

Use this guide whenever implementing or reviewing caching, request coalescing, TTLs, distributed leases, cache invalidation, or Valkey deployment behavior for Grounding v1.

## Non-negotiable rules

1. Valkey is cache/ephemeral coordination only; PostgreSQL is canonical runtime state.
2. Use `@valkey/valkey-glide`; do not introduce a second Valkey/Redis client.
3. Every shared cache key is produced by the central cache package.
4. Revision-dependent cache keys include namespace + runtime revision.
5. Never put raw query/context/auth values in key names; hash canonical serialized inputs.
6. Cache failure is a miss; never alter authorization semantics because cache is unavailable.
7. Never use `KEYS` on production request paths.
8. Never use an unbounded lock. Distributed lease acquisition is `SET NX PX`; release is token-checked atomically.
9. Never cache a privileged diagnostic result under a key that an ordinary caller can hit.
10. Do not add a PostgreSQL-cache fallback/backend.

## Implementation checklist

Before adding a cache:
- identify the canonical source from which the value can be recomputed;
- define all semantic inputs to the key;
- choose TTL and maximum value size;
- decide whether cache failure can cause expensive stampede;
- use `getOrCompute` when cross-replica duplication is materially expensive;
- add hit/miss/error/latency metrics;
- add tests for authorization/context key separation;
- verify the cached and uncached result are identical.

## Preferred patterns

### Runtime-revision cache

`grounding:v1:<kind>:<namespace>:<revision>:<hash>`

Do not actively invalidate old revisions. They age out.

### Content-addressed embedding cache

`grounding:v1:embedding-content:<embedding-config-hash>:<semantic-hash>`

This avoids provider work. If evicted, regenerate and continue.

### Stampede protection

Local promise single-flight first, then a short Valkey lease for cross-replica work. Waiters use bounded jitter and recheck the value. Compare token before release.

### Failure policy

GET error -> miss + metric.
SET error -> return computed result + metric.
Lease error -> compute with bounded local concurrency.
Serialization/version mismatch -> miss.

## Production review

Confirm:
- TLS/auth/network restriction;
- memory/maxmemory/eviction configured;
- command and connection timeouts;
- failover/cluster path load-tested;
- GLIDE + Bun smoke-tested on target architecture;
- hit rate, evictions, latency, errors, and lease contention observable;
- no canonical state exists only in Valkey.

Normative details live in `spec/16-valkey-caching.md`.
