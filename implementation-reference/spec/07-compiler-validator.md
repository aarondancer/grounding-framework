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
