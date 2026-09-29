import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { loadSourceTree } from "./load.ts";
import { validateTree } from "./validate.ts";

/** Minimal valid corpus; each test mutates one file to trigger one code. */
const FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"x","model":"m","dimensions":4}}`,
  "namespace.jsonc": `{"id":"019d0000-0000-7000-8000-000000000001","key":"ns","name":"NS","defaultRetrievalProfile":"default"}`,
  "concepts/domains.jsonc": `{"domains":[{"id":"019d0000-0000-7000-8000-000000000010","key":"sales","name":"Sales"}]}`,
  "concepts/pipeline.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","key":"pipeline","name":"Pipeline","status":"published","domains":["sales"],"aliases":["Pipe"]}`,
  "relations/relation-types.jsonc": `{"relationTypes":[{"id":"019d0000-0000-7000-8000-000000000030","key":"affects","name":"Affects"}]}`,
  "relations/main.jsonc": `{"relations":[{"id":"019d0000-0000-7000-8000-000000000031","source":"pipeline","type":"affects","target":"019d0000-0000-7000-8000-000000000020"}]}`,
  "dimensions/roles.jsonc": `{"id":"019d0000-0000-7000-8000-000000000040","key":"roles","name":"Roles","valueType":"enum","cardinality":"multi","category":"authorization","allowedOperators":["includes","exists"],"values":[{"id":"019d0000-0000-7000-8000-000000000041","key":"manager"},{"id":"019d0000-0000-7000-8000-000000000042","key":"lead","parent":"manager"}]}`,
  "dimensions/rank.jsonc": `{"id":"019d0000-0000-7000-8000-000000000043","key":"rank","name":"Rank","valueType":"number","cardinality":"single","category":"descriptive","allowedOperators":["gt","between"]}`,
  "knowledge/item.md": `---\n{"id":"019d0000-0000-7000-8000-000000000050","key":"item","title":"Item","status":"published","concepts":["pipeline"],"selectionGroup":"sg","applicability":{"dimension":"roles","operator":"includes","value":"manager"}}\n---\n\n# Item\n\nintro\n\n## Section {#sec}\n\nbody\n`,
  "selection-groups/sg.jsonc": `{"id":"019d0000-0000-7000-8000-000000000060","key":"sg","entityType":"knowledge_chunk","mode":"highest_priority"}`,
  "retrieval-profiles/default.jsonc": `{"id":"019d0000-0000-7000-8000-000000000070","key":"default","graph":{"relationTypes":["affects"]}}`,
  "agent-assembly/templates/t.jsonc": `{"id":"019d0000-0000-7000-8000-000000000080","key":"t","name":"T","status":"published","promptFragments":["pf"]}`,
  "agent-assembly/skills/s.jsonc": `{"id":"019d0000-0000-7000-8000-000000000081","key":"s","name":"S","status":"published","semanticText":"x","tools":["tool-a"],"promptFragments":["pf"]}`,
  "agent-assembly/tools/tool-a.jsonc": `{"id":"019d0000-0000-7000-8000-000000000082","key":"tool-a","name":"A","status":"published","description":"a","runtimeBinding":"x","semanticText":"x","dependencies":[{"tool":"tool-b","requirement":"optional"}]}`,
  "agent-assembly/tools/tool-b.jsonc": `{"id":"019d0000-0000-7000-8000-000000000083","key":"tool-b","name":"B","status":"published","description":"b","runtimeBinding":"x","semanticText":"x"}`,
  "agent-assembly/prompt-fragments/pf.md": `---\n{"id":"019d0000-0000-7000-8000-000000000084","key":"pf","name":"PF","status":"published","inclusion":"always","section":"s","semanticText":"x"}\n---\n\nbody\n`,
  "evals/retrieval/r.jsonc": `{"name":"r","query":"q","expect":{"resolvedConcepts":["pipeline"],"includeChunks":["item#sec"],"topK":[{"chunk":"item#intro","within":3}],"outranks":[["item#sec","item#intro"]]}}`,
  "evals/agent-assembly/a.jsonc": `{"name":"a","template":"t","expect":{"skills":["s"],"tools":["tool-a"],"promptFragments":["pf"]}}`,
};

function buildTree(overrides: Record<string, string | null> = {}) {
  const dir = mkdtempSync(join(tmpdir(), "grounding-test-"));
  for (const [rel, content] of Object.entries({ ...FIXTURE, ...overrides })) {
    if (content === null) continue;
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content, "utf8");
  }
  const loaded = loadSourceTree(dir);
  const result = validateTree(
    {
      root: dir,
      entities: loaded.entities,
      diagnostics: loaded.diagnostics,
      knowledge: loaded.knowledge,
    },
    {},
  );
  return { dir, result };
}

const tmpDirs: string[] = [];
function codes(overrides: Record<string, string | null> = {}): string[] {
  const { dir, result } = buildTree(overrides);
  tmpDirs.push(dir);
  return result.diagnostics.map((d) => `${d.severity}:${d.code}`);
}

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

describe("baseline", () => {
  test("canonical fixture validates clean", () => {
    expect(codes()).toEqual([]);
  });
  test("repo canonical corpus validates clean", () => {
    // The seed corpus at <repo>/grounding/ is the M1 acceptance corpus.
    const corpus = join(import.meta.dir, "../../../grounding");
    const loaded = loadSourceTree(corpus);
    const result = validateTree(
      {
        root: corpus,
        entities: loaded.entities,
        diagnostics: loaded.diagnostics,
        knowledge: loaded.knowledge,
      },
      {},
    );
    expect(result.diagnostics).toEqual([]);
    expect(loaded.entities.length).toBeGreaterThan(0);
  });
});

describe("parse + schema", () => {
  test("malformed jsonc → SOURCE_PARSE_ERROR", () => {
    expect(codes({ "concepts/pipeline.jsonc": `{"key": "x"` })).toContain(
      "error:SOURCE_PARSE_ERROR",
    );
  });
  test("unknown field → UNKNOWN_FIELD", () => {
    expect(
      codes({
        "concepts/pipeline.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","key":"pipeline","name":"P","bogus":1}`,
      }),
    ).toContain("error:UNKNOWN_FIELD");
  });
  test("missing required → MISSING_REQUIRED_FIELD", () => {
    expect(
      codes({
        "concepts/pipeline.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","name":"P"}`,
      }),
    ).toContain("error:MISSING_REQUIRED_FIELD");
  });
  test("wrong field type → INVALID_FIELD_TYPE", () => {
    expect(
      codes({
        "concepts/pipeline.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","key":5,"name":"P"}`,
      }),
    ).toContain("error:INVALID_FIELD_TYPE");
  });
});

describe("registry integrity", () => {
  test("duplicate UUID → DUPLICATE_ID", () => {
    expect(
      codes({
        "concepts/other.jsonc": `{"id":"019d0000-0000-7000-8000-000000000020","key":"other","name":"O"}`,
      }),
    ).toContain("error:DUPLICATE_ID");
  });
  test("duplicate key in kind → DUPLICATE_KEY", () => {
    expect(
      codes({
        "concepts/other.jsonc": `{"id":"019d0000-0000-7000-8000-000000000099","key":"pipeline","name":"O"}`,
      }),
    ).toContain("error:DUPLICATE_KEY");
  });
  test("unresolvable ref → REFERENCE_NOT_FOUND", () => {
    expect(
      codes({
        "relations/main.jsonc": `{"relations":[{"id":"019d0000-0000-7000-8000-000000000031","source":"nope","type":"affects","target":"pipeline"}]}`,
      }),
    ).toContain("error:REFERENCE_NOT_FOUND");
  });
  test("UUID resolving to wrong type → REFERENCE_TYPE_MISMATCH", () => {
    expect(
      codes({
        "relations/main.jsonc": `{"relations":[{"id":"019d0000-0000-7000-8000-000000000031","source":"019d0000-0000-7000-8000-000000000010","type":"affects","target":"pipeline"}]}`,
      }),
    ).toContain("error:REFERENCE_TYPE_MISMATCH");
  });
});

describe("expressions", () => {
  const bad = (expr: string) =>
    codes({
      "knowledge/item.md": `---\n{"id":"019d0000-0000-7000-8000-000000000050","key":"item","title":"Item","status":"published","applicability":${expr}}\n---\n\n# I\n\nx\n`,
    });

  test("unknown dimension → UNKNOWN_DIMENSION", () => {
    expect(bad(`{"dimension":"nope","operator":"exists"}`)).toContain("error:UNKNOWN_DIMENSION");
  });
  test("operator not allowed → INVALID_OPERATOR_FOR_DIMENSION", () => {
    expect(bad(`{"dimension":"roles","operator":"equals","value":"manager"}`)).toContain(
      "error:INVALID_OPERATOR_FOR_DIMENSION",
    );
  });
  test("single-cardinality op on multi dim → INVALID_OPERATOR_FOR_DIMENSION", () => {
    expect(bad(`{"dimension":"roles","operator":"in","value":["manager"]}`)).toContain(
      "error:INVALID_OPERATOR_FOR_DIMENSION",
    );
  });
  // Structural shape errors (exists+value, missing value) are caught by the
  // expression JSON Schema before semantic validation runs. These are
  // schema-valid expressions that only fail semantically.
  test("between wrong arity → INVALID_EXPRESSION", () => {
    expect(bad(`{"dimension":"rank","operator":"between","value":[1]}`)).toContain(
      "error:INVALID_EXPRESSION",
    );
  });
  test("between inverted bounds → INVALID_EXPRESSION", () => {
    expect(bad(`{"dimension":"rank","operator":"between","value":[5,2]}`)).toContain(
      "error:INVALID_EXPRESSION",
    );
  });
  test("unknown enum value → DIMENSION_VALUE_NOT_FOUND", () => {
    expect(bad(`{"dimension":"roles","operator":"includes","value":"nope"}`)).toContain(
      "error:DIMENSION_VALUE_NOT_FOUND",
    );
  });
});

describe("graph + safety", () => {
  test("hierarchy cycle → HIERARCHY_CYCLE", () => {
    expect(
      codes({
        "dimensions/roles.jsonc": `{"id":"019d0000-0000-7000-8000-000000000040","key":"roles","name":"R","valueType":"enum","cardinality":"multi","category":"authorization","allowedOperators":["includes"],"values":[{"id":"019d0000-0000-7000-8000-000000000041","key":"a","parent":"b"},{"id":"019d0000-0000-7000-8000-000000000042","key":"b","parent":"a"}]}`,
      }),
    ).toContain("error:HIERARCHY_CYCLE");
  });
  test("authz on ignore dim → UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR", () => {
    const dim = `{"id":"019d0000-0000-7000-8000-000000000045","key":"weak","name":"W","valueType":"string","cardinality":"single","category":"authorization","allowedOperators":["equals"],"missingValueBehavior":"ignore"}`;
    const item = `---\n{"id":"019d0000-0000-7000-8000-000000000050","key":"item","title":"I","status":"published","authorization":{"dimension":"weak","operator":"equals","value":"x"}}\n---\n\n# I\n\nx\n`;
    expect(codes({ "dimensions/weak.jsonc": dim, "knowledge/item.md": item })).toContain(
      "error:UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR",
    );
  });
  test("tool cycle incl optional → TOOL_DEPENDENCY_CYCLE", () => {
    expect(
      codes({
        "agent-assembly/tools/tool-b.jsonc": `{"id":"019d0000-0000-7000-8000-000000000083","key":"tool-b","name":"B","status":"published","description":"b","runtimeBinding":"x","semanticText":"x","dependencies":[{"tool":"tool-a","requirement":"optional"}]}`,
      }),
    ).toContain("error:TOOL_DEPENDENCY_CYCLE");
  });
  test("self dependency → TOOL_SELF_DEPENDENCY", () => {
    expect(
      codes({
        "agent-assembly/tools/tool-b.jsonc": `{"id":"019d0000-0000-7000-8000-000000000083","key":"tool-b","name":"B","status":"published","description":"b","runtimeBinding":"x","semanticText":"x","dependencies":[{"tool":"tool-b","requirement":"required"}]}`,
      }),
    ).toContain("error:TOOL_SELF_DEPENDENCY");
  });
  test("wrong member type → SELECTION_GROUP_TYPE_MISMATCH", () => {
    expect(
      codes({
        "selection-groups/sg.jsonc": `{"id":"019d0000-0000-7000-8000-000000000060","key":"sg","entityType":"skill","mode":"all"}`,
      }),
    ).toContain("error:SELECTION_GROUP_TYPE_MISMATCH");
  });
  test("published requires draft → INVALID_LIFECYCLE_DEPENDENCY", () => {
    expect(
      codes({
        "agent-assembly/prompt-fragments/pf.md": `---\n{"id":"019d0000-0000-7000-8000-000000000084","key":"pf","name":"PF","status":"draft","inclusion":"always","section":"s","semanticText":"x"}\n---\n\nbody\n`,
      }),
    ).toContain("error:INVALID_LIFECYCLE_DEPENDENCY");
  });
  test("bad eval chunk ref → REFERENCE_NOT_FOUND", () => {
    expect(
      codes({
        "evals/retrieval/r.jsonc": `{"name":"r","query":"q","expect":{"includeChunks":["item#nope"]}}`,
      }),
    ).toContain("error:REFERENCE_NOT_FOUND");
  });
  test("schema-invalid eval → EVAL_SCHEMA_INVALID", () => {
    expect(codes({ "evals/retrieval/r.jsonc": `{"name":"r"}` })).toContain(
      "error:EVAL_SCHEMA_INVALID",
    );
  });
  test("concept alias collision → AMBIGUOUS_EXACT_LEXICAL_MATCH warning", () => {
    expect(
      codes({
        "concepts/other.jsonc": `{"id":"019d0000-0000-7000-8000-000000000099","key":"other","name":"Pipeline"}`,
      }),
    ).toContain("warning:AMBIGUOUS_EXACT_LEXICAL_MATCH");
  });
});
