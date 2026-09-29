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
