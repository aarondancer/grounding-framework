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
- Valkey: `redis://localhost:6379` (Valkey speaks the Redis protocol; the runtime client is Valkey GLIDE)

The compose file pins PostgreSQL 17 + pgvector and Valkey 9.1.2. Local Valkey persistence is deliberately disabled because cache contents are disposable.

After Postgres starts, apply the implementation's Drizzle migrations (`bun run migrate` with `DATABASE_URL` set). Required extensions are `vector`, `pg_trgm`, and `unaccent`; the baseline migration also installs the `grounding_english` text-search configuration.

## Build-time environment

`grounding build` and `grounding dev` read the runtime configuration (`implementation/runtime-configuration.md`) plus the embedding-provider settings below. Embedding provider settings are deployment configuration; the corpus's `grounding.config.jsonc` `embedding` block declares the provider/model/dimension contract.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection for materialization |
| `VALKEY_ADDRESSES` | Comma-separated `host:port` list for the `embedding-content` cache; absent or unreachable degrades to direct provider calls (a cache failure is a miss) |
| `GROUNDING_EMBEDDING_PROVIDER` | Overrides `embedding.provider`. Use `deterministic` locally and in tests — no network calls, stable vectors |
| `GROUNDING_EMBEDDING_BASE_URL` | `openai-compatible` provider endpoint (`POST {baseUrl}/embeddings`) |
| `GROUNDING_EMBEDDING_API_KEY` | Bearer credential for the embedding endpoint |
| `GROUNDING_EMBEDDING_DIMENSIONS` | Read at migration-generation time (`drizzle-kit generate`) to substitute the `semantic_entities.embedding` vector dimension (spec/08). Set before generating migrations for a non-1536 installation; `grounding build` verifies the migrated `atttypmod` against `embedding.dimensions` and refuses mismatches |
| `GROUNDING_ENV` | Deployment environment label for `deployments` / `namespace_runtime_state` (default `local`) |

Example local build:

```bash
DATABASE_URL=postgresql://grounding:grounding@localhost:5432/grounding \
VALKEY_ADDRESSES=localhost:6379 \
GROUNDING_EMBEDDING_PROVIDER=deterministic \
bun run --cwd apps/cli grounding build
```
