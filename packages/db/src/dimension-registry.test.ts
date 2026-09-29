import { beforeAll, describe, expect } from "bun:test";
import { dbTest as it, rebuildCanonicalCorpus, servicesConfigured } from "@grounding/test-support";

/**
 * Real-PostgreSQL registry load over the canonical example corpus. The suite
 * provisions its own fixture (docs/testing rule 3) — nothing may depend on
 * another file having built the canonical corpus first.
 * The canonical corpus authors hierarchical `regions` (US → US-TX), server-trusted
 * `permissions`, and flat enum `products`.
 */
const CANONICAL_NS = "019d0000-0000-7000-8000-000000000001";

describe("dimension registry (real postgres)", () => {
  beforeAll(async () => {
    if (!servicesConfigured()) return;
    const { connect } = await import("./client.ts");
    const conn = connect();
    try {
      await rebuildCanonicalCorpus(conn.db);
    } finally {
      await conn.pool.end();
    }
  });

  it("loads materialized dimensions + closure and evaluates hierarchically", async () => {
    const { connect } = await import("./client.ts");
    const { loadDimensionRegistry } = await import("./dimension-registry.ts");
    const core = await import("@grounding/core");
    const { pool, db } = connect();
    try {
      const reg = await loadDimensionRegistry(db, CANONICAL_NS);
      expect(reg.size).toBeGreaterThan(0);
      const regions = reg.get("regions");
      expect(regions?.hierarchical).toBe(true);
      expect(
        regions?.values?.get("US-TX")?.ancestorIds.has(regions?.values?.get("US")?.id ?? ""),
      ).toBe(true);

      const { context, diagnostics } = core.normalizeContext(reg, {
        caller: { regions: ["US-TX"], products: ["crm"] },
        trusted: { permissions: ["analytics.read"] },
      });
      expect(diagnostics).toEqual([]);
      const out = core.evaluateExpression(reg, context ?? new Map(), {
        dimension: "regions",
        operator: "includes",
        value: "US",
      });
      expect(out.state).toBe("true");
      expect(out.specificity[0]).toBe(1);
    } finally {
      await pool.end();
    }
  });

  it("caller cannot self-assert server-trusted dimensions", async () => {
    const { connect } = await import("./client.ts");
    const { loadDimensionRegistry } = await import("./dimension-registry.ts");
    const core = await import("@grounding/core");
    const { pool, db } = connect();
    try {
      const reg = await loadDimensionRegistry(db, CANONICAL_NS);
      const { diagnostics } = core.normalizeContext(reg, {
        caller: { permissions: ["x"] },
      });
      expect(diagnostics.map((d) => d.code)).toContain("CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE");
    } finally {
      await pool.end();
    }
  });
});
