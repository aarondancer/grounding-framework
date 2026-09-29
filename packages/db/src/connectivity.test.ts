import { describe, expect } from "bun:test";
import { dbTest as it } from "@grounding/test-support";
import { connect } from "./client.ts";

/**
 * Real-PostgreSQL check (spec M0 exit criterion + AGENTS.md real-semantics
 * rule). Skipped when DATABASE_URL is unset; CI always sets it.
 */
describe("postgres connectivity", () => {
  it("connects and has the required extensions", async () => {
    const { db, pool } = connect();
    try {
      const result = await db.execute("SELECT extname FROM pg_extension ORDER BY extname");
      const names = result.rows.map((r) => r.extname);
      for (const ext of ["vector", "pg_trgm", "unaccent"]) {
        expect(names).toContain(ext);
      }
    } finally {
      await pool.end();
    }
  });
});
