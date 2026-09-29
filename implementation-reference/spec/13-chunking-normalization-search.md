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
