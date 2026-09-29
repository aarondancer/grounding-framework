import { afterAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { build } from "@grounding/compiler";
import { deterministicProvider } from "@grounding/embeddings";
import { graphql, parse, validate } from "graphql";
import type { GraphQLContext, ServiceContext } from "./context.ts";
import { createLoaders } from "./loaders.ts";
import { depthCostRule } from "./plugins.ts";
import { buildSchema, toGraphQLError } from "./schema.ts";

const NS = "019f3000-0000-7000-8000-000000000001";
const U = (n: number) => `019f3000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/**
 * GraphQL fixture (namespace `gql`): covers browse queries, ontology,
 * retrieval, and Agent Assembly — including a `trust: server` dimension
 * (`clearance`) that only the host trusted-context hook may set.
 */
const FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
  "namespace.jsonc": `{"id":"${NS}","key":"gql","name":"GQL","defaultRetrievalProfile":"default"}`,
  "concepts/domains.jsonc": `{"domains":[{"id":"${U(10)}","key":"ops","name":"Ops"}]}`,
  "concepts/deploy.jsonc": `{"id":"${U(11)}","key":"deploy","name":"Deployment","status":"published","domains":["ops"],"aliases":["shipping"]}`,
  "concepts/pipeline.jsonc": `{"id":"${U(12)}","key":"pipeline","name":"Pipeline","status":"published","domains":["ops"]}`,
  "concepts/draftc.jsonc": `{"id":"${U(13)}","key":"draftc","name":"Drafty","status":"draft"}`,
  "relations/relation-types.jsonc": `{"relationTypes":[{"id":"${U(20)}","key":"related_to","name":"Related To"}]}`,
  "relations/rel.jsonc": `{"relations":[{"id":"${U(21)}","source":"deploy","type":"related_to","target":"pipeline"}]}`,
  "dimensions/roles.jsonc": `{"id":"${U(30)}","key":"roles","name":"Roles","valueType":"enum","cardinality":"multi","category":"authorization","allowedOperators":["includes","exists"],"values":[{"id":"${U(31)}","key":"manager"}]}`,
  "dimensions/clearance.jsonc": `{"id":"${U(32)}","key":"clearance","name":"Clearance","valueType":"enum","cardinality":"multi","category":"authorization","trust":"server","allowedOperators":["includes"],"values":[{"id":"${U(33)}","key":"ops"}]}`,
  "selection-groups/sgf.jsonc": `{"id":"${U(40)}","key":"sg-frag","entityType":"prompt_fragment","mode":"highest_priority"}`,
  "retrieval-profiles/default.jsonc": `{"id":"${U(41)}","key":"default","concepts":{"maxSeeds":2}}`,
  "agent-assembly/templates/main.jsonc": `{"id":"${U(50)}","key":"main","name":"Main","status":"published","promptFragments":["intro","restricted","var-a","var-b","vaultfrag"],"retrievalProfile":"default","budgets":{"maxSkills":5,"maxTools":10,"promptTokens":8000,"bootstrapKnowledgeTokens":2000}}`,
  "agent-assembly/prompt-fragments/intro.md": `---\n{"id":"${U(60)}","key":"intro","name":"Intro","status":"published","inclusion":"always","section":"system","order":0}\n---\n\nYou are an agent.\n`,
  "agent-assembly/prompt-fragments/restricted.md": `---\n{"id":"${U(61)}","key":"restricted","name":"Restricted","status":"published","inclusion":"applicable","section":"system","order":1,"authorization":{"dimension":"roles","operator":"includes","value":"manager"}}\n---\n\nManager guidance.\n`,
  "agent-assembly/prompt-fragments/vaultfrag.md": `---\n{"id":"${U(62)}","key":"vaultfrag","name":"Vault","status":"published","inclusion":"applicable","section":"system","order":2,"authorization":{"dimension":"clearance","operator":"includes","value":"ops"}}\n---\n\nCleared content.\n`,
  "agent-assembly/prompt-fragments/var-a.md": `---\n{"id":"${U(63)}","key":"var-a","name":"Variant A","status":"published","inclusion":"applicable","section":"extras","order":0,"selectionGroup":"sg-frag","priority":9}\n---\n\nVariant A.\n`,
  "agent-assembly/prompt-fragments/var-b.md": `---\n{"id":"${U(64)}","key":"var-b","name":"Variant B","status":"published","inclusion":"applicable","section":"extras","order":0,"selectionGroup":"sg-frag","priority":1}\n---\n\nVariant B.\n`,
  "agent-assembly/skills/deployer.jsonc": `{"id":"${U(70)}","key":"deployer","name":"Deployer","status":"published","concepts":["deploy"],"tools":["deploy-tool"],"priority":10,"semanticText":"deploy services"}`,
  "agent-assembly/tools/deploy-tool.jsonc": `{"id":"${U(80)}","key":"deploy-tool","name":"Deploy Tool","status":"published","description":"deploys","runtimeBinding":"exec","concepts":["deploy"],"semanticText":"deploy execution","dependencies":[{"tool":"audit-tool","requirement":"required"}]}`,
  "agent-assembly/tools/audit-tool.jsonc": `{"id":"${U(81)}","key":"audit-tool","name":"Audit Tool","status":"published","description":"audits","runtimeBinding":"audit","semanticText":"audit execution"}`,
  "knowledge/deploy.md": `---\n{"id":"${U(90)}","key":"deploy-doc","title":"Deployment Guide","status":"published","concepts":["deploy"]}\n---\n\n# Deployment Guide\n\ndeployment runbook and checklist\n`,
  "knowledge/vault.md": `---\n{"id":"${U(91)}","key":"vault-doc","title":"Vault Guide","status":"published","concepts":["deploy"],"authorization":{"dimension":"clearance","operator":"includes","value":"ops"}}\n---\n\n# Vault Guide\n\ncleared vault runbook\n`,
};

const tmpDirs: string[] = [];
function corpus() {
  const dir = mkdtempSync(join(tmpdir(), "grounding-gql-"));
  tmpDirs.push(dir);
  for (const [rel, raw] of Object.entries(FIXTURE)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, raw, "utf8");
  }
  return dir;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

const hasDb = Boolean(process.env.DATABASE_URL);
const it = hasDb ? test : test.skip;

type GqlResult = {
  data?: Record<string, unknown> | null;
  errors?: { message: string; extensions?: Record<string, unknown> }[];
};

async function execGql(
  services: ServiceContext,
  source: string,
  variables?: Record<string, unknown>,
): Promise<GqlResult> {
  const ctx: GraphQLContext = {
    services,
    request: new Request("http://test/graphql", { method: "POST" }),
    loaders: createLoaders(services.db!),
  };
  const res = await graphql({
    schema: buildSchema(),
    source,
    variableValues: variables,
    contextValue: ctx,
  });
  // graphql() bypasses Yoga's error masking — apply the same conversion the
  // server layer performs (maskError: toGraphQLError) so assertions see the
  // wire-level extensions.code.
  const errors = res.errors?.map((e) => toGraphQLError(e));
  return { ...res, errors } as unknown as GqlResult;
}

async function makeServices(extra?: Partial<ServiceContext>) {
  const { connect } = await import("@grounding/db");
  const conn = connect();
  const services: ServiceContext = {
    db: conn.db,
    cache: null,
    environment: "local",
    embedding: { provider: deterministicProvider(1536), configHash: "test-deterministic" },
    ...extra,
  };
  return { conn, services };
}

async function ensureBuilt(db: import("@grounding/db").Database, dir: string) {
  const { sql } = await import("drizzle-orm");
  // Tests own this DB: browse queries resolve the *default* namespace, which
  // is ambiguous if other namespaces are materialized — wipe them first.
  await db.execute(sql`delete from namespaces`);
  const res = await build(dir, db, { clean: true, provider: deterministicProvider(1536) });
  if (!res.ok) throw new Error(`fixture build failed: ${JSON.stringify(res.diagnostics)}`);
}

async function teardown(conn: Awaited<ReturnType<typeof makeServices>>["conn"]) {
  const { sql } = await import("drizzle-orm");
  await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
  await conn.pool.end();
}

afterAll(async () => {
  // ensureBuilt wipes all namespaces (default-ns queries require exactly
  // one); restore the canonical corpus afterwards — other test files
  // (e.g. db dimension registry) assume it stays materialized.
  if (!process.env.DATABASE_URL) return;
  const { connect } = await import("@grounding/db");
  const { findGroundingRoot } = await import("@grounding/source");
  const root = findGroundingRoot(process.cwd());
  if (!root) return;
  const conn = connect();
  try {
    const res = await build(root, conn.db, {
      clean: true,
      provider: deterministicProvider(1536),
    });
    if (!res.ok) throw new Error(`canonical rebuild failed: ${JSON.stringify(res.diagnostics)}`);
  } finally {
    await conn.pool.end();
  }
});

describe("graphql api (real postgres)", () => {
  it("runtimeInfo + browse queries resolve materialized entities", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      const info = await execGql(
        services,
        `{ runtimeInfo { namespace { id key } environment runtimeRevision sourceHash } }`,
      );
      expect(info.errors).toBeUndefined();
      const ri = info.data!.runtimeInfo as Record<string, unknown>;
      expect((ri.namespace as { key: string }).key).toBe("gql");
      expect(ri.environment).toBe("local");
      expect(["number", "string"]).toContain(typeof ri.runtimeRevision); // Long scalar

      const concepts = await execGql(
        services,
        `{ concepts(input: {status: PUBLISHED}) { totalCount nodes { key status domains { key } } } }`,
      );
      const cc = concepts.data!.concepts as { totalCount: number; nodes: { key: string }[] };
      expect(cc.totalCount).toBe(2);
      expect(cc.nodes.map((n) => n.key).sort()).toEqual(["deploy", "pipeline"]);

      const draft = await execGql(
        services,
        `{ concepts(input: {status: DRAFT}) { nodes { key } } }`,
      );
      expect((draft.data!.concepts as { nodes: { key: string }[] }).nodes[0]?.key).toBe("draftc");

      const items = await execGql(
        services,
        `{ knowledgeItems(input: {search: "vault"}) { nodes { key title status chunks { nodes { key content } } } } }`,
      );
      const ki = items.data!.knowledgeItems as { nodes: Record<string, unknown>[] };
      expect(ki.nodes[0]?.key).toBe("vault-doc");
      expect(ki.nodes[0]?.status).toBe("PUBLISHED");

      const lists = await execGql(
        services,
        `{ dimensions { key trust } selectionGroups { key entityType mode members { ... on PromptFragment { key } } } retrievalProfiles { key } agentTemplates { key budgets { maxSkills promptTokens } promptFragments { key } } skills { nodes { key tools { key dependencies { targetTool { key } requirement } } concepts { key } } } tools { nodes { key runtimeBinding risk } } promptFragments { nodes { key inclusionMode order } } }`,
      );
      expect(lists.errors).toBeUndefined();
      const d = lists.data!;
      const dims = d.dimensions as { key: string; trust: string }[];
      expect(dims.map((x) => x.key).sort()).toEqual(["clearance", "roles"]);
      expect(dims.find((x) => x.key === "clearance")?.trust).toBe("server");
      const sg = (d.selectionGroups as Record<string, unknown>[])[0]!;
      expect(sg.mode).toBe("HIGHEST_PRIORITY");
      expect((sg.members as { key: string }[]).map((m) => m.key).sort()).toEqual([
        "var-a",
        "var-b",
      ]);
      const tpl = (d.agentTemplates as Record<string, unknown>[])[0]!;
      expect((tpl.budgets as { promptTokens: number }).promptTokens).toBe(8000);
      expect((tpl.promptFragments as { key: string }[]).length).toBe(5);
      const skill = (d.skills as { nodes: Record<string, unknown>[] }).nodes[0]!;
      expect((skill.tools as Record<string, unknown>[])[0]).toBeDefined();
      const dep = (skill.tools as Record<string, unknown>[])[0]!;
      expect(
        ((dep.dependencies as Record<string, unknown>[])[0]!.targetTool as { key: string }).key,
      ).toBe("audit-tool");
      const frag = (d.promptFragments as { nodes: Record<string, unknown>[] }).nodes.find(
        (f) => f.key === "var-a",
      )!;
      expect(frag.inclusionMode).toBe("APPLICABLE");
    } finally {
      await teardown(conn);
    }
  });

  it("entity refs: exactly one of id/key; not-found → null", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const byKey = await execGql(
        services,
        `{ concept(ref: {key: "deploy"}) { key name aliases { alias } outgoingRelations { nodes { type { key } targetConcept { key } } } incomingRelations { nodes { type { key } sourceConcept { key } } } source { path } } }`,
      );
      expect(byKey.errors).toBeUndefined();
      const c = byKey.data!.concept as Record<string, unknown>;
      expect(c.key).toBe("deploy");
      expect((c.aliases as { alias: string }[])[0]?.alias).toBe("shipping");
      const out = c.outgoingRelations as { nodes: Record<string, unknown>[] };
      expect((out.nodes[0]!.type as { key: string }).key).toBe("related_to");
      expect((out.nodes[0]!.targetConcept as { key: string }).key).toBe("pipeline");
      expect(String((c.source as { path: string }).path)).toContain("deploy.jsonc");

      const idRes = await execGql(services, `query($id: ID!) { concept(ref: {id: $id}) { key } }`, {
        id: U(11),
      });
      expect((idRes.data!.concept as { key: string }).key).toBe("deploy");

      const both = await execGql(
        services,
        `{ concept(ref: {id: "${U(11)}", key: "deploy"}) { key } }`,
      );
      expect(both.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");

      const neither = await execGql(services, `{ concept(ref: {}) { key } }`);
      expect(neither.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");

      const missing = await execGql(services, `{ concept(ref: {key: "nope"}) { key } }`);
      expect(missing.errors).toBeUndefined();
      expect(missing.data!.concept).toBeNull();

      const ns = await execGql(services, `{ namespace(key: "gql") { key name } }`);
      expect((ns.data!.namespace as { key: string }).key).toBe("gql");
    } finally {
      await teardown(conn);
    }
  });

  it("chunk refs and keyset pagination", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const byParts = await execGql(
        services,
        `{ knowledgeChunk(ref: {knowledgeItem: "deploy-doc", key: "deploy-doc-0"}) { key knowledgeItem { key } } }`,
      );
      if (byParts.data?.knowledgeChunk === null) {
        // chunk key may differ — discover via item
        const items = await execGql(
          services,
          `{ knowledgeItems { nodes { key chunks { nodes { id key } } } } }`,
        );
        const firstChunk = (
          (items.data!.knowledgeItems as { nodes: Record<string, unknown>[] }).nodes[0]!.chunks as {
            nodes: { id: string; key: string }[];
          }
        ).nodes[0]!;
        const byId = await execGql(
          services,
          `query($id: ID!) { knowledgeChunk(ref: {id: $id}) { key } }`,
          { id: firstChunk.id },
        );
        expect((byId.data!.knowledgeChunk as { key: string }).key).toBe(firstChunk.key);
      } else {
        expect(
          (byParts.data!.knowledgeChunk as { knowledgeItem: { key: string } }).knowledgeItem.key,
        ).toBe("deploy-doc");
      }

      const badShape = await execGql(services, `{ knowledgeChunk(ref: {key: "x"}) { key } }`);
      expect(badShape.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");

      const p1 = await execGql(
        services,
        `{ concepts(input: {first: 1}) { totalCount nodes { id key } pageInfo { hasNextPage endCursor } } }`,
      );
      const conn1 = p1.data!.concepts as {
        totalCount: number;
        nodes: { id: string; key: string }[];
        pageInfo: { hasNextPage: boolean; endCursor: string };
      };
      expect(conn1.totalCount).toBe(3);
      expect(conn1.nodes.length).toBe(1);
      expect(conn1.pageInfo.hasNextPage).toBe(true);

      const p2 = await execGql(
        services,
        `query($after: String!) { concepts(input: {first: 2, after: $after}) { nodes { key } pageInfo { hasNextPage } } }`,
        { after: conn1.pageInfo.endCursor },
      );
      const conn2 = p2.data!.concepts as {
        nodes: { key: string }[];
        pageInfo: { hasNextPage: boolean };
      };
      expect(conn2.nodes.length).toBe(2);
      expect(conn2.pageInfo.hasNextPage).toBe(false);

      const badCursor = await execGql(
        services,
        `{ concepts(input: {after: "!!!"}) { nodes { key } } }`,
      );
      expect(badCursor.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");

      const tooBig = await execGql(services, `{ concepts(input: {first: 201}) { nodes { key } } }`);
      expect(tooBig.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");

      const zero = await execGql(services, `{ concepts(input: {first: 0}) { nodes { key } } }`);
      expect(zero.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");
    } finally {
      await teardown(conn);
    }
  });

  it("ontology neighborhood: direction, filters, depth validation", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const both = await execGql(
        services,
        `{ ontologyNeighborhood(input: {concept: {key: "deploy"}}) { center { key } concepts { key } relations { type { key } targetConcept { key } } } }`,
      );
      expect(both.errors).toBeUndefined();
      const hood = both.data!.ontologyNeighborhood as Record<string, unknown>;
      expect((hood.center as { key: string }).key).toBe("deploy");
      expect((hood.concepts as { key: string }[])[0]?.key).toBe("pipeline");
      expect((hood.relations as unknown[]).length).toBe(1);

      const incoming = await execGql(
        services,
        `{ ontologyNeighborhood(input: {concept: {key: "deploy"}, direction: INCOMING}) { concepts { key } } }`,
      );
      expect((incoming.data!.ontologyNeighborhood as { concepts: unknown[] }).concepts.length).toBe(
        0,
      );

      const badDepth = await execGql(
        services,
        `{ ontologyNeighborhood(input: {concept: {key: "deploy"}, depth: 3}) { concepts { key } } }`,
      );
      expect(badDepth.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");

      const noNs = await execGql(
        services,
        `{ ontologyNeighborhood(input: {concept: {key: "ghost"}}) { concepts { key } } }`,
      );
      expect(noNs.errors?.[0]?.extensions?.code).toBe("ENTITY_NOT_FOUND");
    } finally {
      await teardown(conn);
    }
  });

  it("retrieve + resolveConcepts through the GraphQL seam", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const res = await execGql(
        services,
        `query($input: RetrievalInput!) { retrieve(input: $input) { namespace { key } runtimeRevision query resolvedConcepts { concept { key } matchType } results { rank score chunk { key knowledgeItem { key } concepts { key } } reasons { code } } packedContext { estimatedTokens chunks { key } } diagnostics { candidateCounts { fullText unique } exclusions { code redacted } } } }`,
        { input: { query: "deployment runbook", diagnostics: true } },
      );
      expect(res.errors).toBeUndefined();
      const r = res.data!.retrieve as Record<string, unknown>;
      expect((r.namespace as { key: string }).key).toBe("gql");
      expect(r.query).toBe("deployment runbook");
      const resolved = r.resolvedConcepts as { concept: { key: string }; matchType: string }[];
      expect(resolved.length).toBeGreaterThan(0);
      const results = r.results as Record<string, unknown>[];
      expect(results.length).toBeGreaterThan(0);
      const firstChunk = results[0]!.chunk as Record<string, unknown>;
      expect((firstChunk.knowledgeItem as { key: string }).key).toBeTruthy();

      const concepts = await execGql(
        services,
        `{ resolveConcepts(input: {text: "deploy"}) { matches { concept { key } matchType rank } warnings { code } } }`,
      );
      expect(concepts.errors).toBeUndefined();
      const matches = (
        concepts.data!.resolveConcepts as {
          matches: { concept: { key: string }; matchType: string }[];
        }
      ).matches;
      expect(matches[0]?.concept.key).toBe("deploy");
      expect(matches[0]?.matchType).toBe("EXACT_KEY");
    } finally {
      await teardown(conn);
    }
  });

  it("assembleAgent: full result mapping + availableBindings semantics", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const query = `query($input: AgentAssemblyInput!) { assembleAgent(input: $input) { runtimeRevision contextHash template { key budgets { maxSkills } promptFragments { key } } renderedPrompt promptFragments { fragment { key inclusionMode } sources renderedOrder estimatedTokens } skills { skill { key } rank } tools { tool { key runtimeBinding } sources } bootstrapKnowledge { chunk { key } } budgetUsage { skills promptTokens } diagnostics { toolCandidates { entity { key } selected code } dependencyResolutions { sourceTool { key } targetTool { key } requirement status } warnings { code } } } }`;

      const res = await execGql(services, query, {
        input: {
          template: "main",
          task: "deploy the service",
          context: { roles: ["manager"] },
          diagnostics: true,
        },
      });
      expect(res.errors).toBeUndefined();
      const a = res.data!.assembleAgent as Record<string, unknown>;
      expect((a.template as { key: string }).key).toBe("main");
      const fragKeys = (a.promptFragments as Record<string, unknown>[]).map(
        (f) => (f.fragment as { key: string }).key,
      );
      expect(fragKeys).toContain("intro");
      expect(fragKeys).toContain("restricted"); // roles=[manager] passed
      expect(fragKeys).toContain("var-a");
      expect(fragKeys).not.toContain("var-b"); // selection-group loser
      expect(fragKeys).not.toContain("vaultfrag"); // server-trust dim unset
      expect(String(a.renderedPrompt)).toContain("You are an agent.");
      const tools = a.tools as { tool: { key: string } }[];
      expect(tools.map((t) => t.tool.key).sort()).toEqual(["audit-tool", "deploy-tool"]);

      // availableBindings: [] → no bindings → required dep on audit fails
      // → deployer skill drops softly (spec/06).
      const none = await execGql(services, query, {
        input: {
          template: "main",
          task: "deploy the service",
          diagnostics: true,
          runtime: { availableBindings: [] },
        },
      });
      const an = none.data!.assembleAgent as Record<string, unknown>;
      expect((an.skills as unknown[]).length).toBe(0);

      // Omitted runtime → all bindings available.
      const all = await execGql(services, query, {
        input: { template: "main", task: "deploy the service", diagnostics: true },
      });
      const al = all.data!.assembleAgent as Record<string, unknown>;
      expect((al.skills as { skill: { key: string } }[])[0]?.skill.key).toBe("deployer");
    } finally {
      await teardown(conn);
    }
  });

  it("trust boundary: server dims only via host hook; stable error codes", async () => {
    const trustedContext = () => ({ clearance: ["ops"] });
    const { conn, services } = await makeServices({ trustedContext });
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // Client self-assertion of a trust:server dimension fails closed.
      const denied = await execGql(
        services,
        `query($input: AgentAssemblyInput!) { assembleAgent(input: $input) { promptFragments { fragment { key } } } }`,
        { input: { template: "main", context: { clearance: ["ops"] } } },
      );
      expect(denied.errors?.[0]?.extensions?.code).toBe("CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE");

      // Host hook injects trusted context → gated fragment + doc resolve.
      const allowed = await execGql(
        services,
        `query($input: AgentAssemblyInput!) { assembleAgent(input: $input) { promptFragments { fragment { key } } } }`,
        { input: { template: "main", task: "deploy the service" } },
      );
      const keys = (
        (allowed.data!.assembleAgent as Record<string, unknown>).promptFragments as Record<
          string,
          unknown
        >[]
      ).map((f) => (f.fragment as { key: string }).key);
      expect(keys).toContain("vaultfrag");

      const ret = await execGql(
        services,
        `query($input: RetrievalInput!) { retrieve(input: $input) { results { chunk { knowledgeItem { key } } } } }`,
        { input: { query: "vault" } },
      );
      const itemKeys = (
        (ret.data!.retrieve as Record<string, unknown>).results as Record<string, unknown>[]
      ).map((r) => ((r.chunk as Record<string, unknown>).knowledgeItem as { key: string }).key);
      expect(itemKeys).toContain("vault-doc");

      // Without the hook the vault doc stays gated out.
      const { conn: conn2, services: noTrust } = await makeServices();
      try {
        const ret2 = await execGql(
          noTrust,
          `query($input: RetrievalInput!) { retrieve(input: $input) { results { chunk { knowledgeItem { key } } } } }`,
          { input: { query: "vault" } },
        );
        const keys2 = (
          (ret2.data!.retrieve as Record<string, unknown>).results as Record<string, unknown>[]
        ).map((r) => ((r.chunk as Record<string, unknown>).knowledgeItem as { key: string }).key);
        expect(keys2).not.toContain("vault-doc");
      } finally {
        await conn2.pool.end();
      }

      // Invalid JSON context shape → INVALID_INPUT.
      const badCtx = await execGql(
        services,
        `query($input: RetrievalInput!) { retrieve(input: $input) { query } }`,
        { input: { query: "x", context: ["not-an-object"] } },
      );
      expect(badCtx.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");
    } finally {
      await teardown(conn);
    }
  });

  it("service diagnostics map to stable extensions.code + diagnostics list", async () => {
    const { conn, services } = await makeServices();
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const res = await execGql(
        services,
        `query($input: AgentAssemblyInput!) { assembleAgent(input: $input) { template { key } } }`,
        { input: { template: "nonexistent" } },
      );
      expect(res.errors?.[0]?.extensions?.code).toBe("TEMPLATE_NOT_FOUND");
      const diags = res.errors?.[0]?.extensions?.diagnostics as { code: string }[];
      expect(diags[0]?.code).toBe("TEMPLATE_NOT_FOUND");

      const badNs = await execGql(
        services,
        `query($input: RetrievalInput!) { retrieve(input: $input) { query } }`,
        { input: { namespace: "ghost", query: "x" } },
      );
      expect(badNs.errors?.[0]?.extensions?.code).toBe("NAMESPACE_NOT_FOUND");
    } finally {
      await teardown(conn);
    }
  });
});

describe("query limits + error masking (no db)", () => {
  test("depth/cost rule rejects over-limit queries with INVALID_INPUT", () => {
    const schema = buildSchema();
    const deep = `query { concepts { nodes { domains { concepts { nodes { domains { key } } } } } } }`;
    const errors = validate(schema, parse(deep), [depthCostRule(3, 2000)]);
    expect(errors.length).toBe(1);
    expect(errors[0]?.extensions?.code).toBe("INVALID_INPUT");

    const ok = `query { concepts { nodes { key } } }`;
    expect(validate(schema, parse(ok), [depthCostRule(12, 2000)]).length).toBe(0);

    const costly = `query { a: concepts(input: {first: 200}) { nodes { key } } b: concepts(input: {first: 200}) { nodes { key } } }`;
    const costErrors = validate(schema, parse(costly), [depthCostRule(12, 5)]);
    expect(costErrors.length).toBe(1);
  });

  test("toGraphQLError masks unexpected errors as INTERNAL_ERROR", () => {
    const masked = toGraphQLError(new Error("pg connection leak detail"));
    expect(masked.extensions.code).toBe("INTERNAL_ERROR");
    expect(masked.message).toBe("internal error");
    expect(masked.message).not.toContain("pg");
  });
});
