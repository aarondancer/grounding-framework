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
