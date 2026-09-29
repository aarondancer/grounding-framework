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
