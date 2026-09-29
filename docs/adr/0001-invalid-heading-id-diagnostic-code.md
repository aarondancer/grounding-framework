# INVALID_HEADING_ID diagnostic code

spec/13 defines heading-path-derived chunk keys and spec/14 defines a closed diagnostic registry that lists `DUPLICATE_HEADING_ID` but has no code for a *malformed* `{#id}` suffix or a heading whose derived key is empty (e.g. a heading containing only characters the slugger strips).

We added `INVALID_HEADING_ID` to `SourceErrorCode` for those two cases: a `{#...}` suffix that does not match the heading-ID pattern, and a heading that produces an empty derived key. spec/14 permits adding codes (never reusing them); this is the first addition and is recorded here.

Alternative considered: reuse `SCHEMA_VALIDATION_FAILED` — rejected because a malformed heading ID is a semantic authoring error about identifier syntax, not a JSON Schema violation, and the message needs its own stable code for tooling filters.
