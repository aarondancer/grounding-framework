import { it as bunIt, describe, expect } from "bun:test";
import { dbTest as it } from "@grounding/test-support";
import { connect } from "./client.ts";

/**
 * Schema migration coverage (spec/11 layer 2 / M10). Runs against the
 * migrated test database and asserts the migration produced the contract:
 * required extensions, the grounding_english FTS configuration, every
 * entity/runtime table, and the index classes retrieval depends on.
 * Re-running the migrator is a no-op (idempotence).
 */
describe("schema migrations (real postgres)", () => {
  it("required extensions and FTS configuration exist", async () => {
    const { pool } = connect();
    try {
      const ext = await pool.query("select extname from pg_extension");
      const names = new Set(ext.rows.map((r: { extname: string }) => r.extname));
      for (const required of ["vector", "pg_trgm", "unaccent"]) {
        expect(names.has(required)).toBe(true);
      }
      const ts = await pool.query(
        "select cfgname from pg_ts_config where cfgname = 'grounding_english'",
      );
      expect(ts.rows.length).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("all entity and runtime tables exist", async () => {
    const { pool } = connect();
    try {
      const t = await pool.query(
        "select table_name from information_schema.tables where table_schema = 'public'",
      );
      const names = new Set(t.rows.map((r: { table_name: string }) => r.table_name));
      const expected = [
        "namespaces",
        "namespace_runtime_state",
        "deployments",
        "domains",
        "concepts",
        "concept_aliases",
        "concept_domains",
        "relation_types",
        "concept_relations",
        "knowledge_sources",
        "knowledge_items",
        "knowledge_chunks",
        "chunk_concepts",
        "selection_groups",
        "dimension_definitions",
        "dimension_values",
        "dimension_value_closure",
        "retrieval_profiles",
        "agent_templates",
        "prompt_fragments",
        "prompt_fragment_concepts",
        "template_prompt_fragments",
        "skills",
        "skill_concepts",
        "skill_tools",
        "skill_prompt_fragments",
        "tools",
        "tool_concepts",
        "tool_dependencies",
        "semantic_entities",
      ];
      for (const table of expected) expect(names.has(table)).toBe(true);
    } finally {
      await pool.end();
    }
  });

  it("retrieval-critical indexes exist (vector, FTS, trigram)", async () => {
    const { pool } = connect();
    try {
      const idx = await pool.query("select indexname from pg_indexes where schemaname = 'public'");
      const names = new Set(idx.rows.map((r: { indexname: string }) => r.indexname));
      for (const index of [
        "knowledge_chunks_search_vector_idx",
        "knowledge_chunks_heading_trgm_idx",
        "concepts_name_trgm_idx",
        "concept_aliases_trgm_idx",
        "deployments_namespace_environment_idx",
      ]) {
        expect(names.has(index)).toBe(true);
      }
      // pgvector index on semantic_entities.
      const vec = await pool.query(
        "select indexname from pg_indexes where schemaname='public' and tablename='semantic_entities'",
      );
      expect(vec.rows.length).toBeGreaterThan(0);
    } finally {
      await pool.end();
    }
  });

  it("re-running the migrator on a migrated database is a no-op", async () => {
    const { runMigrations } = await import("./migrate.ts");
    await runMigrations();
  });

  // M9: Aurora compatibility "where available" — set
  // GROUNDING_AURORA_DATABASE_URL to an Aurora PG 17 cluster to enable.
  const auroraUrl = process.env.GROUNDING_AURORA_DATABASE_URL;
  bunIt.skipIf(!auroraUrl)(
    "aurora: migrations + required extensions/advisory locks work on Aurora PG",
    async () => {
      const { runMigrations } = await import("./migrate.ts");
      await runMigrations(auroraUrl);
      const { pool } = connect({ connectionString: auroraUrl });
      try {
        const ext = await pool.query("select extname from pg_extension");
        const names = new Set(ext.rows.map((r: { extname: string }) => r.extname));
        for (const required of ["vector", "pg_trgm", "unaccent"]) {
          expect(names.has(required)).toBe(true);
        }
        // Build serialization depends on transaction-scoped advisory locks.
        const client = await pool.connect();
        try {
          await client.query("begin");
          await client.query("select pg_advisory_xact_lock(hashtext($1))", ["probe"]);
          await client.query("commit");
        } finally {
          client.release();
        }
      } finally {
        await pool.end();
      }
    },
  );
});
