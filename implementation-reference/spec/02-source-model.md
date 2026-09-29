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
