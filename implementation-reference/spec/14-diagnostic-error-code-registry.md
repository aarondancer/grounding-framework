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
