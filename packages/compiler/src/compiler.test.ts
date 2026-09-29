import { describe, expect, test } from "bun:test";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deterministicProvider } from "@grounding/embeddings";
import { loadSourceTree } from "@grounding/source";
import { dbTest, dbCacheTest as itCache, writeCorpus } from "@grounding/test-support";
import { build } from "./build.ts";
import { compileTree } from "./ir.ts";
import { readManifest, saveManifest, writeManifest } from "./manifest.ts";
import { planMaterialization } from "./plan.ts";

/** Minimal valid corpus (mirrors the packages/source fixture). */
const FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
  "namespace.jsonc": `{"id":"019d0000-0000-7000-8000-000000000001","key":"ns","name":"NS","defaultRetrievalProfile":"default"}`,
  "concepts/domains.jsonc": `{"domains":[{"id":"019d0000-0000-7000-8000-000000000010","key":"sales","name":"Sales"}]}`,
  "concepts/pipeline.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","key":"pipeline","name":"Pipeline","status":"published","domains":["sales"],"aliases":["Pipe"]}`,
  "concepts/other.jsonc": `{"id":"019d0000-0000-7000-8000-000000000021","key":"other","name":"Other","status":"published"}`,
  "relations/relation-types.jsonc": `{"relationTypes":[{"id":"019d0000-0000-7000-8000-000000000030","key":"affects","name":"Affects"}]}`,
  "relations/main.jsonc": `{"relations":[{"id":"019d0000-0000-7000-8000-000000000031","source":"pipeline","type":"affects","target":"other"}]}`,
  "dimensions/roles.jsonc": `{"id":"019d0000-0000-7000-8000-000000000040","key":"roles","name":"Roles","valueType":"enum","cardinality":"multi","category":"authorization","allowedOperators":["includes","exists"],"values":[{"id":"019d0000-0000-7000-8000-000000000041","key":"manager"},{"id":"019d0000-0000-7000-8000-000000000042","key":"lead","parent":"manager"}]}`,
  "knowledge/item.md": `---\n{"id":"019d0000-0000-7000-8000-000000000050","key":"item","title":"Item","status":"published","concepts":["pipeline"],"selectionGroup":"sg","applicability":{"dimension":"roles","operator":"includes","value":"manager"}}\n---\n\n# Item\n\nintro\n\n## Section {#sec}\n\nbody\n`,
  "selection-groups/sg.jsonc": `{"id":"019d0000-0000-7000-8000-000000000060","key":"sg","entityType":"knowledge_chunk","mode":"highest_priority"}`,
  "retrieval-profiles/default.jsonc": `{"id":"019d0000-0000-7000-8000-000000000070","key":"default","graph":{"relationTypes":["affects"]}}`,
  "agent-assembly/templates/t.jsonc": `{"id":"019d0000-0000-7000-8000-000000000080","key":"t","name":"T","status":"published","promptFragments":["pf"]}`,
  "agent-assembly/skills/s.jsonc": `{"id":"019d0000-0000-7000-8000-000000000081","key":"s","name":"S","status":"published","semanticText":"x","tools":["tool-a"],"promptFragments":["pf"]}`,
  "agent-assembly/tools/tool-a.jsonc": `{"id":"019d0000-0000-7000-8000-000000000082","key":"tool-a","name":"A","status":"published","description":"a","runtimeBinding":"x","semanticText":"x","dependencies":[{"tool":"tool-b","requirement":"optional"}]}`,
  "agent-assembly/tools/tool-b.jsonc": `{"id":"019d0000-0000-7000-8000-000000000083","key":"tool-b","name":"B","status":"published","description":"b","runtimeBinding":"x","semanticText":"x"}`,
  "agent-assembly/prompt-fragments/pf.md": `---\n{"id":"019d0000-0000-7000-8000-000000000084","key":"pf","name":"PF","status":"published","inclusion":"always","section":"s","semanticText":"x"}\n---\n\nbody\n`,
  "evals/retrieval/r.jsonc": `{"name":"r","query":"q","expect":{"resolvedConcepts":["pipeline"],"includeChunks":["item#sec"]}}`,
  "evals/agent-assembly/a.jsonc": `{"name":"a","template":"t","expect":{"skills":["s"],"tools":["tool-a"],"promptFragments":["pf"]}}`,
};

function corpus(overrides: Record<string, string | null> = {}, uuidPrefix = "") {
  const files: Record<string, string> = {};
  for (const [rel, raw] of Object.entries({ ...FIXTURE, ...overrides })) {
    if (raw === null) continue;
    files[rel] = uuidPrefix ? raw.replaceAll("019d0000", uuidPrefix) : raw;
  }
  const dir = writeCorpus("grounding-compile-", files);
  return { dir, loaded: loadSourceTree(dir) };
}

/** compileTree + the fields writeManifest requires beyond CompileResult. */
function manifestInput(dir: string) {
  const compiled = compileTree(loadSourceTree(dir));
  const { entities, fileHashes, sourceHash } = compiled;
  return {
    entities,
    fileHashes,
    sourceHash,
    namespaceId: compiled.namespaceId ?? "",
    embeddingDimensions: null,
  };
}

describe("compiler IR", () => {
  test("compiled entities cover every runtime kind", () => {
    const { loaded } = corpus();
    const result = compileTree(loaded);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    const tables = new Set<string>(result.entities.map((e) => e.table));
    for (const t of [
      "namespaces",
      "domains",
      "concepts",
      "relation_types",
      "concept_relations",
      "knowledge_items",
      "knowledge_chunks",
      "selection_groups",
      "dimension_definitions",
      "retrieval_profiles",
      "agent_templates",
      "prompt_fragments",
      "skills",
      "tools",
      "tool_dependencies",
    ]) {
      expect(tables.has(t)).toBe(true);
    }
  });

  test("compilation is deterministic across runs", () => {
    const a = compileTree(corpus().loaded);
    const b = compileTree(corpus().loaded);
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.entities.map((e) => [e.id, e.compiledHash])).toEqual(
      b.entities.map((e) => [e.id, e.compiledHash]),
    );
  });

  test("a chunk carries a stable derived id and the section key", () => {
    const { loaded } = corpus();
    const chunks = compileTree(loaded).entities.filter((e) => e.table === "knowledge_chunks");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((c) => c.row.chunkKey === "sec")).toBe(true);
  });

  test("content edit changes compiledHash; priority edit leaves semanticHash", () => {
    const base = compileTree(corpus().loaded);
    const edited = compileTree(
      corpus({
        "concepts/pipeline.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","key":"pipeline","name":"Pipeline","status":"published","domains":["sales"],"aliases":["Pipe"],"description":"new"}`,
      }).loaded,
    );
    const before = base.entities.find((e) => e.id === "019d0000-0000-7000-8000-000000000020");
    const after = edited.entities.find((e) => e.id === "019d0000-0000-7000-8000-000000000020");
    expect(after?.compiledHash).not.toBe(before?.compiledHash);

    const mk = (priority: number) =>
      compileTree(
        corpus({
          "agent-assembly/skills/s.jsonc": `{"id":"019d0000-0000-7000-8000-000000000081","key":"s","name":"S","status":"published","semanticText":"x","priority":${priority},"tools":["tool-a"],"promptFragments":["pf"]}`,
        }).loaded,
      ).entities.find((e) => e.id === "019d0000-0000-7000-8000-000000000081");
    const a = mk(0);
    const b = mk(9);
    expect(a?.semanticHash).toBe(b?.semanticHash);
    expect(a?.compiledHash).not.toBe(b?.compiledHash);
  });

  test("dimension closure covers self + ancestors", () => {
    const { loaded } = corpus();
    const dim = compileTree(loaded).entities.find((e) => e.table === "dimension_definitions");
    const closure = dim?.children.find((c) => c.table === "dimension_value_closure");
    // lead→manager: (lead,lead,0),(manager,manager,0),(lead,manager,1)
    expect(closure?.rows.length).toBe(3);
  });

  test("dependency edges point at resolved IDs", () => {
    const { loaded } = corpus();
    const rel = compileTree(loaded).entities.find((e) => e.table === "concept_relations");
    const depTargets = new Set(rel?.deps.map((d) => d.target));
    expect(depTargets.has("019d0000-0000-7000-8000-000000000020")).toBe(true);
    expect(depTargets.has("019d0000-0000-7000-8000-000000000030")).toBe(true);
  });
});

describe("manifest + plan", () => {
  test("missing manifest → full plan; unchanged manifest → empty plan", () => {
    const { loaded } = corpus();
    const compiled = compileTree(loaded);
    const ns = compiled.namespaceId ?? "";
    const full = planMaterialization(ns, compiled.entities, null);
    expect(full.full).toBe(true);
    expect(full.upserts.length).toBe(compiled.entities.length);

    const manifest = writeManifest("", manifestInput(corpus().dir));
    const empty = planMaterialization(ns, compiled.entities, manifest);
    expect(empty.full).toBe(false);
    expect(empty.upserts).toEqual([]);
    expect(empty.deletes).toEqual([]);
  });

  test("one-entity edit → exactly one upsert; entity removal → delete", () => {
    const { dir } = corpus();
    const manifest = writeManifest(dir, manifestInput(dir));

    const changed = compileTree(
      corpus({
        "agent-assembly/skills/s.jsonc": `{"id":"019d0000-0000-7000-8000-000000000081","key":"s","name":"S2","status":"published","semanticText":"x","tools":["tool-a"],"promptFragments":["pf"]}`,
      }).loaded,
    );
    const plan = planMaterialization(changed.namespaceId ?? "", changed.entities, manifest);
    expect(plan.upserts.map((e) => e.id)).toEqual(["019d0000-0000-7000-8000-000000000081"]);

    const removed = compileTree(corpus({ "agent-assembly/skills/s.jsonc": null }).loaded);
    const del = planMaterialization(removed.namespaceId ?? "", removed.entities, manifest);
    expect(del.deletes.map((d) => d.id)).toContain("019d0000-0000-7000-8000-000000000081");
  });

  test("manifest round-trips and carries reverse dependencies", () => {
    const { dir } = corpus();
    saveManifest(dir, writeManifest(dir, manifestInput(dir)));
    const manifest = readManifest(dir);
    const concept = manifest?.entities["019d0000-0000-7000-8000-000000000020"];
    expect(concept?.dependedBy.length).toBeGreaterThan(0);
    expect(Object.keys(manifest?.files ?? {}).length).toBeGreaterThan(0);
  });
});

/**
 * M3 semantic/lexical materialization (spec/08, spec/13). Real PostgreSQL
 * for vector/FTS/trigram/unaccent; deterministic + counting providers for
 * the embedding lifecycle exit criteria.
 */
describe("embeddings + lexical indexing (real postgres)", () => {
  const NS = "019e1000-0000-7000-8000-000000000001";
  const it = dbTest;

  function countingProvider() {
    const calls: string[][] = [];
    const base = deterministicProvider(1536);
    return {
      calls,
      provider: {
        provider: "deterministic",
        model: "sha256-fixture",
        dimensions: 1536,
        async embed(texts: string[]) {
          calls.push(texts);
          return base.embed(texts);
        },
      },
    };
  }

  it("materializes semantic_entities + lexical columns; skips unchanged embeddings", async () => {
    const { connect } = await import("@grounding/db");
    const { sql } = await import("drizzle-orm");
    const { pool, db } = connect();
    const { calls, provider } = countingProvider();
    try {
      const { dir } = corpus(
        {
          "namespace.jsonc": `{"id":"${NS}","key":"m3","name":"M3","defaultRetrievalProfile":"default"}`,
          // Accent + mixed-token coverage (spec/13 required cases).
          "concepts/other.jsonc": `{"id":"019e1000-0000-7000-8000-000000000021","key":"other","name":"Café Metrics","status":"published"}`,
          "knowledge/item.md": `---\n{"id":"019e1000-0000-7000-8000-000000000050","key":"item","title":"Item","status":"published","concepts":["pipeline"],"selectionGroup":"sg"}\n---\n\n# Item\n\nÆther straße café2\n\n## Section {#sec}\n\nbody\n`,
        },
        "019e1000",
      );

      const { semanticEntities } = await import("@grounding/db/schema");
      const { count } = await import("drizzle-orm");

      const b1 = await build(dir, db, { clean: true, provider });
      expect(b1.diagnostics).toEqual([]);
      expect(b1.ok).toBe(true);
      const semanticCount = compileTree(loadSourceTree(dir)).entities.filter(
        (e) => e.semanticHash !== undefined,
      ).length;
      const rows = await db
        .select({ c: count() })
        .from(semanticEntities)
        .where(sql`${semanticEntities.namespaceId} = ${NS}`);
      expect(Number(rows[0]?.c)).toBe(semanticCount);
      expect(calls.length).toBeGreaterThan(0);

      // Accent-insensitive normalized columns (PostgreSQL-authoritative).
      const cafe = await db.execute(
        sql`select normalized_name from concepts where id = '019e1000-0000-7000-8000-000000000021'`,
      );
      expect(cafe.rows[0]?.normalized_name).toBe("cafe metrics");
      // Query-side equivalence: same pre-normalization (lowercase) + unaccent.
      const eq1 = await db.execute(
        sql`select count(*) c from concepts where namespace_id = ${NS} and normalized_name = unaccent('café metrics')`,
      );
      expect(Number(eq1.rows[0]?.c)).toBe(1);
      // Trigram fuzzy discovery on normalized name.
      const trgm = await db.execute(
        sql`select count(*) c from concepts where namespace_id = ${NS} and normalized_name % 'cafe metrics'`,
      );
      expect(Number(trgm.rows[0]?.c)).toBe(1);
      // FTS weighting: title at A, content tokens at B (café2 → cafe2).
      const fts = await db.execute(
        sql`select count(*) c from knowledge_chunks where namespace_id = ${NS} and search_vector @@ plainto_tsquery('grounding_english', 'cafe2')`,
      );
      expect(Number(fts.rows[0]?.c)).toBe(1);
      const ftsA = await db.execute(
        sql`select count(*) c from knowledge_chunks where namespace_id = ${NS} and search_vector @@ to_tsquery('grounding_english', 'item:A')`,
      );
      expect(Number(ftsA.rows[0]?.c)).toBeGreaterThan(0);
      // spec/13 required accent-fold cases: Æther ↔ aether, straße ↔ strasse.
      for (const q of ["aether", "strasse"]) {
        const folded = await db.execute(
          sql`select count(*) c from knowledge_chunks where namespace_id = ${NS} and search_vector @@ plainto_tsquery('grounding_english', ${q})`,
        );
        expect(Number(folded.rows[0]?.c)).toBe(1);
      }

      // Rebuild unchanged → no provider calls, no writes.
      const callsAfterFirst = calls.length;
      const b2 = await build(dir, db, { provider });
      expect(b2.plan?.upserts).toEqual([]);
      expect(calls.length).toBe(callsAfterFirst);

      // Priority-only edit → entity upserts but embeddings do NOT regenerate.
      const skillPath = join(dir, "agent-assembly/skills/s.jsonc");
      const skillSrc = readFileSync(skillPath, "utf8").replace(
        '"promptFragments":["pf"]',
        '"promptFragments":["pf"],"priority":7',
      );
      writeFileSync(skillPath, skillSrc, "utf8");
      const b3 = await build(dir, db, { provider });
      expect(b3.ok).toBe(true);
      expect(calls.length).toBe(callsAfterFirst);

      // Semantic-text edit → that entity re-embeds.
      writeFileSync(
        skillPath,
        skillSrc.replace('"semanticText":"x"', '"semanticText":"changed text"'),
        "utf8",
      );
      const b4 = await build(dir, db, { provider });
      expect(b4.ok).toBe(true);
      expect(calls.length).toBeGreaterThan(callsAfterFirst);
      const newHash = await db
        .select({ h: semanticEntities.semanticHash })
        .from(semanticEntities)
        .where(sql`${semanticEntities.entityId} = '019e1000-0000-7000-8000-000000000081'`);
      expect(newHash[0]?.h).not.toBe("");
    } finally {
      await db.execute(sql`delete from namespaces where id = ${NS}`);
      await pool.end();
    }
  });

  // spec/16: a different namespace with identical semantic texts is a pure
  // cache hit — Valkey embedding-content keys carry config+semantic hashes.

  itCache("embedding-content cache serves repeated semantic text across namespaces", async () => {
    const { connect } = await import("@grounding/db");
    const { sql } = await import("drizzle-orm");
    const { cacheConfigFromEnv, createRuntimeCache } = await import("@grounding/cache");
    const { pool, db } = connect();
    const cache = await createRuntimeCache(cacheConfigFromEnv());
    const { calls, provider } = countingProvider();
    const nsA = "019e2000-0000-7000-8000-000000000001";
    const nsB = "019e3000-0000-7000-8000-000000000001";
    // Per-run nonce: the embedding-content cache persists across test runs, so
    // semantic text must be unique for corpus A's first build to be a miss.
    const nonce = crypto.randomUUID().slice(0, 8);
    const skillSource = FIXTURE["agent-assembly/skills/s.jsonc"];
    if (skillSource === undefined) throw new Error("fixture missing skill file");
    const skillFile = skillSource.replaceAll('"semanticText":"x"', `"semanticText":"x-${nonce}"`);
    try {
      const a = corpus(
        {
          "namespace.jsonc": `{"id":"${nsA}","key":"cache-a","name":"A","defaultRetrievalProfile":"default"}`,
          "agent-assembly/skills/s.jsonc": skillFile,
        },
        "019e2000",
      );
      const b = corpus(
        {
          "namespace.jsonc": `{"id":"${nsB}","key":"cache-b","name":"B","defaultRetrievalProfile":"default"}`,
          "agent-assembly/skills/s.jsonc": skillFile,
        },
        "019e3000",
      );
      const r1 = await build(a.dir, db, { clean: true, provider, cache });
      expect(r1.ok).toBe(true);
      const textsFirst = calls.flat().length;
      expect(textsFirst).toBeGreaterThan(0);

      const r2 = await build(b.dir, db, { clean: true, provider, cache });
      expect(r2.ok).toBe(true);
      expect(calls.flat().length).toBe(textsFirst); // zero provider calls
    } finally {
      await cache.close();
      await db.execute(sql`delete from namespaces where id in (${nsA}, ${nsB})`);
      await pool.end();
    }
  });
});

/**
 * Real-PostgreSQL build (spec exit criteria: source→empty PG, incremental
 * equivalence, deployment records). Skipped without DATABASE_URL; CI sets it.
 * Uses a distinct UUID prefix so it never collides with the canonical corpus.
 */
describe("materialization (real postgres)", () => {
  const it = dbTest;
  const NS = "019e0000-0000-7000-8000-000000000001";

  it("clean build materializes, then a rebuild converges to zero work", async () => {
    const { connect } = await import("@grounding/db");
    const { sql } = await import("drizzle-orm");
    const { pool, db } = connect();
    try {
      const { dir } = corpus(
        {
          "namespace.jsonc": `{"id":"${NS}","key":"it-test","name":"IT","defaultRetrievalProfile":"default"}`,
        },
        "019e0000",
      );
      const first = await build(dir, db, { clean: true, provider: deterministicProvider(1536) });
      expect(first.diagnostics).toEqual([]);
      expect(first.ok).toBe(true);
      expect(first.plan?.full).toBe(true);
      expect(first.deploymentId).not.toBeNull();

      const second = await build(dir, db, { provider: deterministicProvider(1536) });
      expect(second.ok).toBe(true);
      expect(second.plan?.full).toBe(false);
      expect(second.plan?.upserts).toEqual([]);
      expect(second.plan?.deletes).toEqual([]);
    } finally {
      await db.execute(sql`delete from namespaces where id = ${NS}`);
      await pool.end();
    }
  });
});
