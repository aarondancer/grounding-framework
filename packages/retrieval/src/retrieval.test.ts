import { describe, expect } from "bun:test";
import { deterministicProvider, type EmbeddingProvider } from "@grounding/embeddings";
import {
  ensureBuilt,
  dbTest as it,
  dbCacheTest as itCache,
  makeTestServices as makeServices,
  writeCorpus,
} from "@grounding/test-support";

const NS = "019f1000-0000-7000-8000-000000000001";

/**
 * Retrieval fixture. Covers every channel + gate:
 *  - concept `pipeline` (alias "Pipe", domain sales) — FTS/vector/concept-linked seeds
 *  - concept `other` reachable only via `pipeline -affects-> other`
 *  - items: published base, draft, expired-window, authorization-gated,
 *    applicability-gated, two selection-group variants, ontology-only item
 */
const FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
  "namespace.jsonc": `{"id":"${NS}","key":"m5","name":"M5","defaultRetrievalProfile":"default"}`,
  "concepts/domains.jsonc": `{"domains":[{"id":"019f1000-0000-7000-8000-000000000010","key":"sales","name":"Sales"}]}`,
  "concepts/pipeline.jsonc": `{"id":"019f1000-0000-7000-8000-000000000020","key":"pipeline","name":"Pipeline","status":"published","domains":["sales"],"aliases":["Pipe"]}`,
  "concepts/other.jsonc": `{"id":"019f1000-0000-7000-8000-000000000021","key":"other","name":"Other","status":"published"}`,
  "relations/relation-types.jsonc": `{"relationTypes":[{"id":"019f1000-0000-7000-8000-000000000030","key":"affects","name":"Affects"}]}`,
  "relations/main.jsonc": `{"relations":[{"id":"019f1000-0000-7000-8000-000000000031","source":"pipeline","type":"affects","target":"other"}]}`,
  "dimensions/roles.jsonc": `{"id":"019f1000-0000-7000-8000-000000000040","key":"roles","name":"Roles","valueType":"enum","cardinality":"multi","category":"authorization","allowedOperators":["includes","exists"],"values":[{"id":"019f1000-0000-7000-8000-000000000041","key":"manager"},{"id":"019f1000-0000-7000-8000-000000000042","key":"lead","parent":"manager"}]}`,
  "dimensions/region.jsonc": `{"id":"019f1000-0000-7000-8000-000000000043","key":"region","name":"Region","valueType":"enum","cardinality":"single","category":"applicability","allowedOperators":["equals","in"],"values":[{"id":"019f1000-0000-7000-8000-000000000044","key":"emea"}]}`,
  "selection-groups/sg.jsonc": `{"id":"019f1000-0000-7000-8000-000000000060","key":"sg","entityType":"knowledge_chunk","mode":"highest_priority"}`,
  "retrieval-profiles/default.jsonc": `{"id":"019f1000-0000-7000-8000-000000000070","key":"default","concepts":{"maxSeeds":1},"graph":{"maxDepth":2,"relationTypes":["affects"]}}`,
  "knowledge/base.md": `---\n{"id":"019f1000-0000-7000-8000-000000000050","key":"base","title":"Pipeline Guide","status":"published","concepts":["pipeline"],"authorityScore":0.9}\n---\n\n# Pipeline Guide\n\npipeline orchestration handbook\n\n## Details {#details}\n\npipeline rollout details\n`,
  "knowledge/draft.md": `---\n{"id":"019f1000-0000-7000-8000-000000000051","key":"draft-item","title":"Pipeline Draft","status":"draft","concepts":["pipeline"]}\n---\n\n# Pipeline Draft\n\npipeline draft notes\n`,
  "knowledge/secret.md": `---\n{"id":"019f1000-0000-7000-8000-000000000052","key":"secret","title":"Restricted Pipeline","status":"published","concepts":["pipeline"],"authorization":{"dimension":"roles","operator":"includes","value":"manager"}}\n---\n\n# Restricted Pipeline\n\nrestricted pipeline protocol\n`,
  "knowledge/expired.md": `---\n{"id":"019f1000-0000-7000-8000-000000000053","key":"expired","title":"Pipeline Legacy","status":"published","concepts":["pipeline"],"effectiveTo":"2020-01-01T00:00:00Z"}\n---\n\n# Pipeline Legacy\n\npipeline legacy runbook\n`,
  "knowledge/regional.md": `---\n{"id":"019f1000-0000-7000-8000-000000000054","key":"regional","title":"Pipeline Regional","status":"published","concepts":["pipeline"],"applicability":{"dimension":"region","operator":"equals","value":"emea"}}\n---\n\n# Pipeline Regional\n\npipeline regional guidance\n`,
  "knowledge/variant-a.md": `---\n{"id":"019f1000-0000-7000-8000-000000000055","key":"variant-a","title":"Pipeline Variant","status":"published","concepts":["pipeline"],"selectionGroup":"sg","priority":5}\n---\n\n# Pipeline Variant\n\npipeline variant alpha\n`,
  "knowledge/variant-b.md": `---\n{"id":"019f1000-0000-7000-8000-000000000056","key":"variant-b","title":"Pipeline Variant","status":"published","concepts":["pipeline"],"selectionGroup":"sg","priority":1}\n---\n\n# Pipeline Variant\n\npipeline variant beta\n`,
  "knowledge/other-item.md": `---\n{"id":"019f1000-0000-7000-8000-000000000057","key":"other-item","title":"Adjacent","status":"published","concepts":["other"]}\n---\n\n# Adjacent\n\nadjacent concept notes zzq\n`,
};

const corpus = () => writeCorpus("grounding-retrieve-", FIXTURE);

describe("retrieve (real postgres)", () => {
  it("full pipeline: channels, gates, selection, ordering, packing", async () => {
    const { conn, services } = await makeServices({ cache: false });
    const { retrieve, RetrievalRequestError } = await import("./retrieve.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // Basic retrieval — lexical query over "pipeline".
      const r = await retrieve(services, {
        namespace: "m5",
        query: "pipeline",
        diagnostics: true,
      });
      expect(r.namespace.key).toBe("m5");
      expect(r.results.length).toBeGreaterThan(0);
      expect(r.resolvedConcepts[0]?.concept.key).toBe("pipeline");
      expect(r.resolvedConcepts[0]?.matchType).toBe("EXACT_KEY");
      const reasons = new Set(r.results.flatMap((i) => i.reasons.map((x) => x.code)));
      expect(reasons.has("FULL_TEXT_MATCH")).toBe(true);
      expect(reasons.has("DIRECT_CONCEPT_LINK")).toBe(true);

      // Draft is gated.
      const itemIds = r.results.map((i) => i.chunk.knowledgeItemId);
      expect(itemIds).not.toContain("019f1000-0000-7000-8000-000000000051");
      expect(itemIds).not.toContain("019f1000-0000-7000-8000-000000000053"); // expired

      const exclusions = r.diagnostics?.exclusions ?? [];
      expect(exclusions.some((e) => e.code === "LIFECYCLE_NOT_PUBLISHED")).toBe(true);
      expect(exclusions.some((e) => e.code === "OUTSIDE_EFFECTIVE_WINDOW")).toBe(true);

      // Authorization: no context → redacted exclusion without identity leak.
      expect(itemIds).not.toContain("019f1000-0000-7000-8000-000000000052");
      const authz = exclusions.filter((e) => e.code === "AUTHORIZATION_NO_MATCH");
      expect(authz.length).toBeGreaterThan(0);
      for (const e of authz) {
        expect(e.redacted).toBe(true);
        expect(e.chunk.id).toBeUndefined();
      }

      // Applicability: regional item excluded without region context.
      expect(itemIds).not.toContain("019f1000-0000-7000-8000-000000000054");

      // Selection group: only the priority-5 variant survives.
      const variantIds = r.results.map((i) => i.chunk.knowledgeItemId);
      expect(variantIds).toContain("019f1000-0000-7000-8000-000000000055");
      expect(variantIds).not.toContain("019f1000-0000-7000-8000-000000000056");
      expect(exclusions.some((e) => e.code === "SELECTION_GROUP_NOT_SELECTED")).toBe(true);

      // Ontology channel: `other` reached via pipeline -affects-> other.
      const graphItem = r.results.find(
        (i) => i.chunk.knowledgeItemId === "019f1000-0000-7000-8000-000000000057",
      );
      expect(graphItem).toBeDefined();
      expect(graphItem?.reasons.map((x) => x.code)).toContain("ONTOLOGY_CONCEPT_LINK");
      expect(r.diagnostics?.graphPaths.length).toBeGreaterThan(0);

      // Diagnostics shape: all stage names from the v1 registry present.
      const stages = r.diagnostics?.timings.map((t) => t.stage) ?? [];
      for (const s of [
        "context_validation",
        "query_normalization",
        "query_embedding",
        "concept_resolution",
        "vector_candidates",
        "fts_candidates",
        "trigram_candidates",
        "concept_linked_candidates",
        "ontology_candidates",
        "candidate_merge",
        "lifecycle_filter",
        "authorization",
        "applicability",
        "selection_groups",
        "rrf_fusion",
        "final_ordering",
        "packing",
      ]) {
        expect(stages).toContain(s);
      }

      // Deterministic: same request twice → identical result ids/order.
      const r2 = await retrieve(services, { namespace: "m5", query: "pipeline" });
      expect(r2.results.map((i) => i.chunk.id)).toEqual(r.results.map((i) => i.chunk.id));

      // includeDraft widens lifecycle.
      const r3 = await retrieve(services, {
        namespace: "m5",
        query: "pipeline",
        filters: { includeDraft: true },
      });
      expect(r3.results.map((i) => i.chunk.knowledgeItemId)).toContain(
        "019f1000-0000-7000-8000-000000000051",
      );

      // Authorization: correct context admits the restricted chunk.
      const r4 = await retrieve(services, {
        namespace: "m5",
        query: "pipeline",
        context: { roles: ["manager"] },
      });
      expect(r4.results.map((i) => i.chunk.knowledgeItemId)).toContain(
        "019f1000-0000-7000-8000-000000000052",
      );

      // Applicability: matching context admits the regional chunk.
      const r5 = await retrieve(services, {
        namespace: "m5",
        query: "pipeline",
        context: { region: "emea" },
      });
      expect(r5.results.map((i) => i.chunk.knowledgeItemId)).toContain(
        "019f1000-0000-7000-8000-000000000054",
      );

      // Unknown dimension fails the request.
      await expect(
        retrieve(services, { namespace: "m5", query: "x", context: { bogus: 1 } }),
      ).rejects.toBeInstanceOf(RetrievalRequestError);

      // Packing: maxChunks caps results.
      const r6 = await retrieve(services, {
        namespace: "m5",
        query: "pipeline",
        limits: { maxChunks: 2 },
        diagnostics: true,
      });
      expect(r6.results.length).toBeLessThanOrEqual(2);
      expect(r6.packedContext?.chunks.length).toBeLessThanOrEqual(2);
      expect(
        r6.diagnostics?.exclusions.some(
          (e) => e.code === "PACKING_TOKEN_BUDGET" || e.code === "PACKING_ITEM_CAP",
        ),
      ).toBe(true);
    } finally {
      const { sql } = await import("drizzle-orm");
      await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
      await conn.pool.end();
    }
  });

  it("vector outage degrades with VECTOR_CHANNEL_UNAVAILABLE; authz never opens", async () => {
    const failing: EmbeddingProvider = {
      provider: "deterministic",
      model: "sha256-fixture",
      dimensions: 1536,
      embed: () => Promise.reject(new Error("provider down")),
    };
    const { conn, services } = await makeServices({ provider: failing, cache: false });
    const { retrieve } = await import("./retrieve.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const r = await retrieve(services, { namespace: "m5", query: "pipeline", diagnostics: true });
      expect(r.results.length).toBeGreaterThan(0); // lexical/concept/ontology still work
      const w = r.diagnostics?.warnings ?? [];
      expect(w.some((x) => x.code === "VECTOR_CHANNEL_UNAVAILABLE")).toBe(true);
      const excluded = r.diagnostics?.exclusions ?? [];
      expect(excluded.some((e) => e.code === "AUTHORIZATION_NO_MATCH" && e.redacted)).toBe(true);
    } finally {
      const { sql } = await import("drizzle-orm");
      await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
      await conn.pool.end();
    }
  });
});

describe("resolveConcepts (real postgres)", () => {
  it("match-class precedence + ambiguity + fuzzy", async () => {
    const { conn, services } = await makeServices({ cache: false });
    const { resolveConceptsForNamespace } = await import("./retrieve.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // Exact raw key wins over name/alias classes.
      const key = await resolveConceptsForNamespace(services, {
        namespace: "m5",
        text: "pipeline",
      });
      expect(key.matches[0]?.matchType).toBe("EXACT_KEY");
      expect(key.matches[0]?.concept.key).toBe("pipeline");

      // Exact normalized name.
      const name = await resolveConceptsForNamespace(services, {
        namespace: "m5",
        text: "Pipeline",
      });
      expect(name.matches[0]?.matchType).toBe("EXACT_NAME");

      // Exact normalized alias.
      const alias = await resolveConceptsForNamespace(services, { namespace: "m5", text: "pipe" });
      expect(alias.matches[0]?.matchType).toBe("EXACT_ALIAS");

      // Fuzzy lexical/trigram path.
      const fuzzy = await resolveConceptsForNamespace(services, {
        namespace: "m5",
        text: "pipelin",
      });
      expect(["LEXICAL", "TRIGRAM"]).toContain(fuzzy.matches[0]?.matchType ?? "");
      expect(fuzzy.matches[0]?.concept.key).toBe("pipeline");
    } finally {
      const { sql } = await import("drizzle-orm");
      await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
      await conn.pool.end();
    }
  });
});

describe("retrieval caching (real postgres + valkey)", () => {
  itCache("warm cache returns identical results; context changes isolate keys", async () => {
    const { conn, services } = await makeServices({ cache: true });
    const { retrieve } = await import("./retrieve.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      const r1 = await retrieve(services, { namespace: "m5", query: "pipeline" });
      const r2 = await retrieve(services, { namespace: "m5", query: "pipeline" });
      expect(r2.results.map((i) => i.chunk.id)).toEqual(r1.results.map((i) => i.chunk.id));
      expect(r2.results.map((i) => i.score)).toEqual(r1.results.map((i) => i.score));

      // Different context → different key → different (correct) results.
      const r3 = await retrieve(services, {
        namespace: "m5",
        query: "pipeline",
        context: { roles: ["manager"] },
      });
      expect(r3.results.length).toBeGreaterThan(r1.results.length);
      expect(r3.results.map((i) => i.chunk.knowledgeItemId)).toContain(
        "019f1000-0000-7000-8000-000000000052",
      );
      // The anonymous request must NOT have inherited the authorized result.
      expect(r1.results.map((i) => i.chunk.knowledgeItemId)).not.toContain(
        "019f1000-0000-7000-8000-000000000052",
      );
    } finally {
      const { sql } = await import("drizzle-orm");
      await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
      await services.cache?.close();
      await conn.pool.end();
    }
  });

  itCache("valkey outage degrades to a bounded miss without changing semantics", async () => {
    const { conn } = await (async () => {
      const { connect } = await import("@grounding/db");
      return { conn: connect() };
    })();
    // A dead cache: every op fails — must behave like cache-miss/no-cache.
    const dead: import("@grounding/cache").RuntimeCache = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      getOrCompute: async <T>(_k: never, _o: never, compute: () => Promise<T>) => compute(),
      ping: async () => false,
      close: async () => {},
    };
    const { retrieve } = await import("./retrieve.ts");
    const services = {
      db: conn.db,
      cache: dead,
      embedding: { provider: deterministicProvider(1536), configHash: "test-deterministic" },
      environment: "local",
    };
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const warm = await retrieve(services, { namespace: "m5", query: "pipeline" });
      const { connect } = await import("@grounding/db");
      const conn2 = connect();
      const cold = await retrieve(
        {
          db: conn2.db,
          cache: null,
          embedding: { provider: deterministicProvider(1536), configHash: "test-deterministic" },
          environment: "local",
        },
        { namespace: "m5", query: "pipeline" },
      );
      expect(warm.results.map((i) => i.chunk.id)).toEqual(cold.results.map((i) => i.chunk.id));
      await conn2.pool.end();
    } finally {
      const { sql } = await import("drizzle-orm");
      await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
      await conn.pool.end();
    }
  });
});
