import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSourceTree } from "@grounding/source";
import { build } from "./build.ts";
import { compileTree } from "./ir.ts";
import { readManifest, saveManifest, writeManifest } from "./manifest.ts";
import { planMaterialization } from "./plan.ts";

/** Minimal valid corpus (mirrors the packages/source fixture). */
const FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"x","model":"m","dimensions":1536}}`,
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

const tmpDirs: string[] = [];
function corpus(overrides: Record<string, string | null> = {}, uuidPrefix = "") {
  const dir = mkdtempSync(join(tmpdir(), "grounding-compile-"));
  tmpDirs.push(dir);
  for (const [rel, raw] of Object.entries({ ...FIXTURE, ...overrides })) {
    if (raw === null) continue;
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, uuidPrefix ? raw.replaceAll("019d0000", uuidPrefix) : raw, "utf8");
  }
  return { dir, loaded: loadSourceTree(dir) };
}

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

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
 * Real-PostgreSQL build (spec exit criteria: source→empty PG, incremental
 * equivalence, deployment records). Skipped without DATABASE_URL; CI sets it.
 * Uses a distinct UUID prefix so it never collides with the canonical corpus.
 */
describe("materialization (real postgres)", () => {
  const it = process.env.DATABASE_URL ? test : test.skip;
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
      const first = await build(dir, db, { clean: true });
      expect(first.diagnostics).toEqual([]);
      expect(first.ok).toBe(true);
      expect(first.plan?.full).toBe(true);
      expect(first.deploymentId).not.toBeNull();

      const second = await build(dir, db, {});
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
