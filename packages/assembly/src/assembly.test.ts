import { describe, expect } from "bun:test";
import { deterministicProvider, type EmbeddingProvider } from "@grounding/embeddings";
import {
  ensureBuilt,
  dbTest as it,
  dbCacheTest as itCache,
  makeTestServices as makeServices,
  writeCorpus,
} from "@grounding/test-support";

const NS = "019f2000-0000-7000-8000-000000000001";
const U = (n: number) => `019f2000-0000-7000-8000-${String(n).padStart(12, "0")}`;

/**
 * Assembly fixture (namespace `m6`):
 *  - templates: `main` (published, budgets), `drafted` (draft),
 *    `strict` (published; lists an always+authz fragment)
 *  - fragments: always / applicable / task_relevant / restricted / draft /
 *    selection-group pair / a non-template task_relevant fragment / a
 *    skill-owned fragment / a skill-owned group member
 *  - skills: deployer (tools+fragments), selection-group pair, authz-gated,
 *    fragile (required tool fails transitively)
 *  - tools: deploy->audit(req)->{opt,secret}(opt); fragile->mid->gated
 *  - knowledge items for bootstrap retrieval
 */
const FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
  "namespace.jsonc": `{"id":"${NS}","key":"m6","name":"M6","defaultRetrievalProfile":"default"}`,
  "concepts/domains.jsonc": `{"domains":[{"id":"${U(10)}","key":"ops","name":"Ops"}]}`,
  "concepts/deploy.jsonc": `{"id":"${U(11)}","key":"deploy","name":"Deployment","status":"published","domains":["ops"]}`,
  "dimensions/roles.jsonc": `{"id":"${U(20)}","key":"roles","name":"Roles","valueType":"enum","cardinality":"multi","category":"authorization","allowedOperators":["includes","exists"],"values":[{"id":"${U(21)}","key":"manager"}]}`,
  "dimensions/region.jsonc": `{"id":"${U(22)}","key":"region","name":"Region","valueType":"enum","cardinality":"single","category":"applicability","allowedOperators":["equals"],"values":[{"id":"${U(23)}","key":"emea"}]}`,
  "selection-groups/sg.jsonc": `{"id":"${U(30)}","key":"sg-skill","entityType":"skill","mode":"highest_priority"}`,
  "selection-groups/sgf.jsonc": `{"id":"${U(31)}","key":"sg-frag","entityType":"prompt_fragment","mode":"highest_priority"}`,
  "retrieval-profiles/default.jsonc": `{"id":"${U(40)}","key":"default","concepts":{"maxSeeds":2}}`,
  "retrieval-profiles/tight.jsonc": `{"id":"${U(41)}","key":"tight","candidates":{"vector":2}}`,
  "agent-assembly/templates/main.jsonc": `{"id":"${U(50)}","key":"main","name":"Main","status":"published","promptFragments":["intro","rules","taskhint","restricted","var-a","var-b"],"retrievalProfile":"default","budgets":{"maxSkills":5,"maxTools":10,"promptTokens":8000,"bootstrapKnowledgeTokens":2000}}`,
  "agent-assembly/templates/drafted.jsonc": `{"id":"${U(51)}","key":"drafted","name":"Drafted","status":"draft","promptFragments":["intro","draftfrag"]}`,
  "agent-assembly/templates/strict.jsonc": `{"id":"${U(52)}","key":"strict","name":"Strict","status":"published","promptFragments":["intro","restricted-always"]}`,
  "agent-assembly/prompt-fragments/intro.md": `---\n{"id":"${U(60)}","key":"intro","name":"Intro","status":"published","inclusion":"always","section":"system","order":0}\n---\n\nYou are an agent.\n`,
  "agent-assembly/prompt-fragments/rules.md": `---\n{"id":"${U(61)}","key":"rules","name":"Rules","status":"published","inclusion":"applicable","section":"system","order":1,"applicability":{"dimension":"region","operator":"equals","value":"emea"}}\n---\n\nEMEA rules apply.\n`,
  "agent-assembly/prompt-fragments/taskhint.md": `---\n{"id":"${U(62)}","key":"taskhint","name":"Hints","status":"published","inclusion":"task_relevant","section":"task","order":0,"semanticText":"deployment task hints"}\n---\n\nDeployment hints.\n`,
  "agent-assembly/prompt-fragments/restricted.md": `---\n{"id":"${U(63)}","key":"restricted","name":"Restricted","status":"published","inclusion":"applicable","section":"system","order":2,"authorization":{"dimension":"roles","operator":"includes","value":"manager"}}\n---\n\nManager-only guidance.\n`,
  "agent-assembly/prompt-fragments/restricted-always.md": `---\n{"id":"${U(69)}","key":"restricted-always","name":"Restricted Always","status":"published","inclusion":"always","section":"system","order":3,"authorization":{"dimension":"roles","operator":"includes","value":"manager"}}\n---\n\nRequired manager content.\n`,
  "agent-assembly/prompt-fragments/skillvar.md": `---\n{"id":"${U(76)}","key":"skillvar","name":"Skill Variant","status":"published","inclusion":"applicable","section":"extras","order":0,"selectionGroup":"sg-frag","priority":10}\n---\n\nSkill variant wins.\n`,
  "agent-assembly/prompt-fragments/draftfrag.md": `---\n{"id":"${U(64)}","key":"draftfrag","name":"DraftFrag","status":"draft","inclusion":"task_relevant","section":"task","order":9,"semanticText":"draft hints"}\n---\n\nDraft fragment.\n`,
  "agent-assembly/prompt-fragments/var-a.md": `---\n{"id":"${U(65)}","key":"var-a","name":"Variant A","status":"published","inclusion":"applicable","section":"extras","order":0,"selectionGroup":"sg-frag","priority":9}\n---\n\nVariant A wins.\n`,
  "agent-assembly/prompt-fragments/var-b.md": `---\n{"id":"${U(66)}","key":"var-b","name":"Variant B","status":"published","inclusion":"applicable","section":"extras","order":0,"selectionGroup":"sg-frag","priority":1}\n---\n\nVariant B loses.\n`,
  "agent-assembly/prompt-fragments/extra.md": `---\n{"id":"${U(67)}","key":"extra-task","name":"Extra","status":"published","inclusion":"task_relevant","section":"task","order":1,"semanticText":"extra deployment hints"}\n---\n\nExtra deployment detail.\n`,
  "agent-assembly/prompt-fragments/skillfrag.md": `---\n{"id":"${U(68)}","key":"skillfrag","name":"Skill Frag","status":"published","inclusion":"always","section":"skills","order":0}\n---\n\nDeploy skill instructions.\n`,
  "agent-assembly/skills/deployer.jsonc": `{"id":"${U(70)}","key":"deployer","name":"Deployer","status":"published","concepts":["deploy"],"tools":["deploy-tool"],"promptFragments":["skillfrag","skillvar"],"priority":10,"semanticText":"deploy services"}`,

  "agent-assembly/skills/variant-high.jsonc": `{"id":"${U(71)}","key":"variant-high","name":"Variant High","status":"published","concepts":["deploy"],"selectionGroup":"sg-skill","priority":5,"semanticText":"deployment variant high"}`,

  "agent-assembly/skills/variant-low.jsonc": `{"id":"${U(72)}","key":"variant-low","name":"Variant Low","status":"published","concepts":["deploy"],"selectionGroup":"sg-skill","priority":1,"semanticText":"deployment variant low"}`,

  "agent-assembly/skills/restricted-skill.jsonc": `{"id":"${U(73)}","key":"restricted-skill","name":"Restricted Skill","status":"published","concepts":["deploy"],"authorization":{"dimension":"roles","operator":"includes","value":"manager"},"semanticText":"restricted deploy"}`,

  "agent-assembly/skills/fragile-skill.jsonc": `{"id":"${U(74)}","key":"fragile-skill","name":"Fragile Skill","status":"published","concepts":["deploy"],"tools":["fragile-tool"],"priority":20,"semanticText":"fragile deploy"}`,

  "agent-assembly/skills/draft-skill.jsonc": `{"id":"${U(75)}","key":"draft-skill","name":"Draft Skill","status":"draft","concepts":["deploy"],"semanticText":"draft deploy"}`,

  "agent-assembly/tools/deploy-tool.jsonc": `{"id":"${U(80)}","key":"deploy-tool","name":"Deploy Tool","status":"published","description":"deploys","runtimeBinding":"exec","concepts":["deploy"],"semanticText":"deploy execution","dependencies":[{"tool":"audit-tool","requirement":"required"}]}`,

  "agent-assembly/tools/audit-tool.jsonc": `{"id":"${U(81)}","key":"audit-tool","name":"Audit Tool","status":"published","description":"audits","runtimeBinding":"audit","semanticText":"audit execution","dependencies":[{"tool":"opt-tool","requirement":"optional"},{"tool":"secret-tool","requirement":"optional"}]}`,

  "agent-assembly/tools/opt-tool.jsonc": `{"id":"${U(82)}","key":"opt-tool","name":"Optional Tool","status":"published","description":"optional","runtimeBinding":"special","semanticText":"optional tooling"}`,

  "agent-assembly/tools/fragile-tool.jsonc": `{"id":"${U(83)}","key":"fragile-tool","name":"Fragile Tool","status":"published","description":"fragile","runtimeBinding":"exec","semanticText":"fragile tooling","dependencies":[{"tool":"chain-mid","requirement":"required"}]}`,

  "agent-assembly/tools/chain-mid.jsonc": `{"id":"${U(84)}","key":"chain-mid","name":"Chain Mid","status":"published","description":"mid","runtimeBinding":"exec","semanticText":"chain middle","dependencies":[{"tool":"binding-gated-tool","requirement":"required"}]}`,

  "agent-assembly/tools/binding-gated-tool.jsonc": `{"id":"${U(85)}","key":"binding-gated-tool","name":"Gated Tool","status":"published","description":"gated","runtimeBinding":"special","semanticText":"gated tooling","dependencies":[{"tool":"chain-leaf","requirement":"required"}]}`,

  "agent-assembly/tools/chain-leaf.jsonc": `{"id":"${U(89)}","key":"chain-leaf","name":"Chain Leaf","status":"published","description":"leaf","runtimeBinding":"exec","semanticText":"chain leaf tooling"}`,

  "agent-assembly/tools/direct-tool.jsonc": `{"id":"${U(86)}","key":"direct-tool","name":"Direct Tool","status":"published","description":"direct","runtimeBinding":"exec","concepts":["deploy"],"semanticText":"direct deploy helper"}`,

  "agent-assembly/tools/secret-tool.jsonc": `{"id":"${U(88)}","key":"secret-tool","name":"Secret Tool","status":"published","description":"secret","runtimeBinding":"exec","authorization":{"dimension":"roles","operator":"includes","value":"manager"},"semanticText":"secret tooling"}`,

  "agent-assembly/tools/draft-tool.jsonc": `{"id":"${U(87)}","key":"draft-tool","name":"Draft Tool","status":"draft","description":"draft","runtimeBinding":"exec","concepts":["deploy"],"semanticText":"draft tooling"}`,

  "knowledge/deploy.md": `---\n{"id":"${U(90)}","key":"deploy-doc","title":"Deployment Guide","status":"published","concepts":["deploy"]}\n---\n\n# Deployment Guide\n\ndeployment runbook and checklist\n`,
};

const corpus = () => writeCorpus("grounding-assemble-", FIXTURE);

async function teardown(
  conn: Awaited<ReturnType<typeof makeServices>>["conn"],
  cache?: { close(): Promise<void> } | null,
) {
  const { sql } = await import("drizzle-orm");
  await conn.db.execute(sql`delete from namespaces where id = ${NS}`);
  await cache?.close();
  await conn.pool.end();
}

describe("assembleAgent (real postgres)", () => {
  it("no-task assembly: template + context rules only, no embedding needed", async () => {
    const { conn, services } = await makeServices({ provider: null, cache: false });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      const r = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        diagnostics: true,
      });
      expect(r.template.key).toBe("main");
      expect(r.skills.length).toBe(0);
      expect(r.tools.length).toBe(0);
      expect(r.bootstrapKnowledge.length).toBe(0);
      expect(r.task).toBeNull();

      const fragKeys = r.promptFragments.map((f) => f.fragment.key);
      // always included; task_relevant skipped (no task); draft gated.
      expect(fragKeys).toContain("intro");
      expect(fragKeys).toContain("var-a"); // selection-group winner
      expect(fragKeys).not.toContain("taskhint");
      expect(fragKeys).not.toContain("rules"); // no region context
      expect(fragKeys).not.toContain("restricted"); // authz
      expect(fragKeys).not.toContain("draftfrag");
      expect(fragKeys).not.toContain("var-b"); // group loser
      expect(fragKeys).not.toContain("skillfrag"); // skill not selected

      // Render order: section asc, then order.
      expect(fragKeys).toEqual(["var-a", "intro"]); // extras < system
      expect(r.renderedPrompt).toContain("Variant A wins.");
      expect(r.renderedPrompt).toContain("You are an agent.");

      const fd = r.diagnostics?.fragmentCandidates ?? [];
      expect(fd.some((d) => d.code === "TASK_REQUIRED_FOR_FRAGMENT")).toBe(true);
      expect(fd.some((d) => d.code === "SELECTION_GROUP_NOT_SELECTED")).toBe(true);
      // Authorization failure is redacted — no identity leak.
      const denied = fd.filter((d) => d.code === "AUTHORIZATION_NO_MATCH");
      expect(denied.length).toBeGreaterThan(0);
      for (const d of denied) {
        expect(d.entity.id).toBe("");
        expect(d.entity.key).toBe("");
      }

      // Applicable fragment enters with matching context.
      const r2 = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        context: { region: "emea" },
      });
      expect(r2.promptFragments.map((f) => f.fragment.key)).toContain("rules");
      // Authorized context admits the restricted fragment.
      const r3 = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        context: { roles: ["manager"] },
      });
      expect(r3.promptFragments.map((f) => f.fragment.key)).toContain("restricted");
    } finally {
      await teardown(conn);
    }
  });

  it("template resolution failures use registered codes", async () => {
    const { conn, services } = await makeServices({ provider: null, cache: false });
    const { assembleAgent, AssemblyRequestError } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      await expect(
        assembleAgent(services, { namespace: "m6", template: "nope" }),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "TEMPLATE_NOT_FOUND" }],
      });
      await expect(
        assembleAgent(services, { namespace: "m6", template: "drafted" }),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "TEMPLATE_NOT_PUBLISHED" }],
      });
      await expect(
        assembleAgent(services, {
          namespace: "m6",
          template: "main",
          context: { bogus: 1 },
        }),
      ).rejects.toBeInstanceOf(AssemblyRequestError);
    } finally {
      await teardown(conn);
    }
  });

  itCache("task assembly: shared embedding, skill/tool discovery, dep closure", async () => {
    const calls: string[] = [];
    const counting: EmbeddingProvider = {
      provider: "deterministic",
      model: "counting",
      dimensions: 1536,
      embed: async (texts) => {
        calls.push(...texts);
        return deterministicProvider(1536).embed(texts);
      },
    };
    // Unique environment → cold cache keys, so the provider call count is
    // deterministic (teardown deletes the runtime-state row, restarting the
    // revision at 1 and letting stale same-key entries linger otherwise).
    const environment = `m6-${Math.random().toString(36).slice(2)}`;
    const { conn, services } = await makeServices({ provider: counting, cache: true, environment });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      const r = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        runtime: { availableBindings: ["exec", "audit"] },
        diagnostics: true,
      });

      // Task concepts resolved.
      expect(r.task?.resolvedConcepts[0]?.concept.key).toBe("deploy");

      // Skills selected; fragile-skill dropped (transitive required dep on
      // binding-gated-tool whose runtime binding is unavailable).
      const skillKeys = r.skills.map((s) => s.skill.key);
      expect(skillKeys).toContain("deployer");
      expect(skillKeys).toContain("variant-high"); // group winner
      expect(skillKeys).not.toContain("variant-low");
      expect(skillKeys).not.toContain("restricted-skill"); // authz
      expect(skillKeys).not.toContain("draft-skill"); // lifecycle
      expect(skillKeys).not.toContain("fragile-skill"); // required tool chain broken
      expect(
        r.diagnostics?.skillCandidates.some(
          (d) => d.code === "SKILL_REQUIRED_TOOL_UNAVAILABLE" && d.entity.key === "fragile-skill",
        ),
      ).toBe(true);

      // Tools: skill-required closure + direct task tool; binding "special" gone.
      const toolKeys = r.tools.map((t) => t.tool.key);
      expect(toolKeys).toContain("deploy-tool");
      expect(toolKeys).toContain("audit-tool"); // required dep
      expect(toolKeys).toContain("direct-tool"); // direct task tool
      expect(toolKeys).not.toContain("opt-tool"); // optional dep unavailable
      expect(toolKeys).not.toContain("fragile-tool");
      expect(toolKeys).not.toContain("chain-mid");
      expect(toolKeys).not.toContain("binding-gated-tool");
      expect(toolKeys).not.toContain("draft-tool");

      const deploy = r.tools.find((t) => t.tool.key === "deploy-tool");
      expect(deploy?.inclusionReasons.map((x) => x.code)).toContain("SKILL_REQUIRED_TOOL");
      const direct = r.tools.find((t) => t.tool.key === "direct-tool");
      expect(direct?.inclusionReasons.map((x) => x.code)).toContain("DIRECT_TASK_TOOL");
      const audit = r.tools.find((t) => t.tool.key === "audit-tool");
      expect(audit?.inclusionReasons.map((x) => x.code)).toContain("REQUIRED_TOOL_DEPENDENCY");
      expect(audit?.requiredBy.map((x) => x.key)).toContain("deploy-tool");

      // Dependency resolutions carry the causal chain.
      const res = r.diagnostics?.dependencyResolutions ?? [];
      const reqOk = res.find(
        (d) => d.sourceTool.key === "deploy-tool" && d.targetTool.key === "audit-tool",
      );
      expect(reqOk?.status).toBe("INCLUDED");
      const opt = res.find(
        (d) => d.sourceTool.key === "audit-tool" && d.targetTool.key === "opt-tool",
      );
      expect(opt?.status).toBe("OPTIONAL_OMITTED");
      // The authz-denied dep target is redacted — no identity leak.
      const secretRes = res.find(
        (d) => d.sourceTool.key === "audit-tool" && d.targetTool.id === "",
      );
      expect(secretRes?.status).toBe("OPTIONAL_OMITTED");
      expect(secretRes?.targetTool.key).toBe("");
      for (const d of res) {
        expect(d.targetTool.key).not.toBe("secret-tool");
        expect(d.targetTool.id).not.toBe(U(88));
      }
      const gated = res.find(
        (d) => d.sourceTool.key === "chain-mid" && d.targetTool.key === "binding-gated-tool",
      );
      expect(gated?.status).toBe("UNAVAILABLE");
      const blocked = res.find(
        (d) => d.sourceTool.key === "fragile-tool" && d.targetTool.key === "chain-mid",
      );
      expect(blocked?.status).toBe("UNAVAILABLE");

      // Skill-owned fragment pulled in; task_relevant fragments included.
      const fragKeys = r.promptFragments.map((f) => f.fragment.key);
      expect(fragKeys).toContain("skillfrag");
      expect(fragKeys).toContain("taskhint");
      expect(fragKeys).toContain("extra-task");
      expect(fragKeys).not.toContain("draftfrag"); // lifecycle-gated
      // Skill-attached fragments compete in selection groups: skillvar
      // (priority 10) joins sg-frag via the deployer skill and beats the
      // template-listed var-a (9) / var-b (1).
      expect(fragKeys).toContain("skillvar");
      expect(fragKeys).not.toContain("var-a");
      expect(fragKeys).not.toContain("var-b");
      expect(
        r.diagnostics?.fragmentCandidates.filter((d) => d.code === "SELECTION_GROUP_NOT_SELECTED")
          .length,
      ).toBe(2);
      expect(
        r.diagnostics?.fragmentCandidates.some(
          (d) => d.code === "LIFECYCLE_NOT_PUBLISHED" && d.entity.key === "draftfrag",
        ),
      ).toBe(true);

      // Bootstrap retrieval ran with resolved concepts.
      expect(r.bootstrapKnowledge.length).toBeGreaterThan(0);
      expect(r.bootstrapKnowledge[0]?.chunk.knowledgeItemId).toBe(U(90));

      // Budget usage reported.
      expect(r.budgetUsage.maxSkills).toBe(5);
      expect(r.budgetUsage.maxTools).toBe(10);
      expect(r.budgetUsage.promptTokens).toBeGreaterThan(0);

      // One task embedding shared across discovery + bootstrap retrieval.
      expect(calls.length).toBe(1);
    } finally {
      await teardown(conn, services.cache);
    }
  });

  it("task without a provider fails with EMBEDDING_UNAVAILABLE", async () => {
    const { conn, services } = await makeServices({ provider: null, cache: false });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      await expect(
        assembleAgent(services, { namespace: "m6", template: "main", task: "deploy" }),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "EMBEDDING_UNAVAILABLE" }],
      });
      const failing: EmbeddingProvider = {
        provider: "deterministic",
        model: "m",
        dimensions: 1536,
        embed: () => Promise.reject(new Error("provider down")),
      };
      await expect(
        assembleAgent(
          { ...services, embedding: { provider: failing, configHash: "x" } },
          { namespace: "m6", template: "main", task: "deploy" },
        ),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "EMBEDDING_UNAVAILABLE" }],
      });
    } finally {
      await teardown(conn);
    }
  });

  it("runtime bindings: absent = all available, [] = none", async () => {
    const { conn, services } = await makeServices({ cache: false });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // Absent: all bindings available — full closure survives.
      const all = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        diagnostics: true,
      });
      const keys = all.tools.map((t) => t.tool.key);
      expect(keys).toContain("opt-tool");
      expect(keys).toContain("fragile-tool");
      expect(keys).toContain("binding-gated-tool");
      expect(all.skills.map((s) => s.skill.key)).toContain("fragile-skill");

      // Explicit empty: nothing available — all tools drop; tool-bearing
      // skills drop, tool-less skills remain legitimately usable.
      const none = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        runtime: { availableBindings: [] },
        diagnostics: true,
      });
      expect(none.tools.length).toBe(0);
      expect(none.skills.map((s) => s.skill.key)).toEqual(["variant-high"]);
      expect(
        none.diagnostics?.toolCandidates.some((d) => d.code === "RUNTIME_BINDING_UNAVAILABLE"),
      ).toBe(true);
      expect(
        none.diagnostics?.skillCandidates.some((d) => d.code === "SKILL_REQUIRED_TOOL_UNAVAILABLE"),
      ).toBe(true);

      // Explicit null ≡ absent — all bindings available, no cache-key split.
      const nullBindings = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        runtime: { availableBindings: null },
      });
      expect(nullBindings.tools.map((t) => t.tool.key)).toContain("opt-tool");
    } finally {
      await teardown(conn);
    }
  });

  it("deep dependency chains expand past the discovery frontier", async () => {
    const { conn, services } = await makeServices({ cache: false });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // candidates.vector=2 keeps most tools out of the seed set, so the
      // fragile→mid→gated→leaf chain is fetched across multiple expansion
      // rounds. All bindings available → the whole chain is included.
      const r = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        retrievalProfile: "tight",
        diagnostics: true,
      });
      const keys = r.tools.map((t) => t.tool.key);
      expect(keys).toContain("fragile-tool");
      expect(keys).toContain("chain-mid");
      expect(keys).toContain("binding-gated-tool");
      expect(keys).toContain("chain-leaf");
      expect(r.skills.map((s) => s.skill.key)).toContain("fragile-skill");
      const res = r.diagnostics?.dependencyResolutions ?? [];
      for (const [src, tgt] of [
        ["fragile-tool", "chain-mid"],
        ["chain-mid", "binding-gated-tool"],
        ["binding-gated-tool", "chain-leaf"],
      ]) {
        const edge = res.find((d) => d.sourceTool.key === src && d.targetTool.key === tgt);
        expect(edge?.status).toBe("INCLUDED");
      }
    } finally {
      await teardown(conn);
    }
  });

  it("required always-fragment failing gating fails assembly", async () => {
    const { conn, services } = await makeServices({ provider: null, cache: false });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // `strict` lists an always+authz fragment; without the role the
      // required content cannot be satisfied.
      await expect(
        assembleAgent(services, { namespace: "m6", template: "strict" }),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "ASSEMBLY_REQUIREMENT_UNSATISFIED" }],
      });
      // Authorized callers satisfy it.
      const ok = await assembleAgent(services, {
        namespace: "m6",
        template: "strict",
        context: { roles: ["manager"] },
      });
      expect(ok.promptFragments.map((f) => f.fragment.key)).toContain("restricted-always");
    } finally {
      await teardown(conn);
    }
  });

  it("request budgets tighten template budgets; required content is indivisible", async () => {
    const { conn, services } = await makeServices({ cache: false });
    const { assembleAgent, AssemblyRequestError } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);

      // maxSkills=1 tightens template's 5: at most one skill selected, with
      // the rest reported as budget-omitted.
      const tight = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        budgets: { maxSkills: 1 },
        diagnostics: true,
      });
      expect(tight.budgetUsage.maxSkills).toBe(1);
      expect(tight.skills.length).toBeLessThanOrEqual(1);
      expect(
        tight.diagnostics?.skillCandidates.some(
          (d) => d.message === "omitted by effective maxSkills budget",
        ),
      ).toBe(true);

      // And with bindings constrained so the top-ranked skill's tool chain
      // fails, the selected skill is dropped with a causal diagnostic.
      const tightFail = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
        budgets: { maxSkills: 5 },
        runtime: { availableBindings: ["exec", "audit"] },
        diagnostics: true,
      });
      expect(
        tightFail.diagnostics?.skillCandidates.some(
          (d) => d.code === "SKILL_REQUIRED_TOOL_UNAVAILABLE" && d.entity.key === "fragile-skill",
        ),
      ).toBe(true);
      expect(
        tightFail.diagnostics?.skillCandidates.find((d) => d.entity.key === "fragile-skill")?.causes
          .length ?? 0,
      ).toBeGreaterThan(0);

      // Required always-fragments exceed a tiny prompt budget → hard failure.
      await expect(
        assembleAgent(services, {
          namespace: "m6",
          template: "main",
          budgets: { promptTokens: 1 },
        }),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "ASSEMBLY_BUDGET_EXCEEDED" }],
      });
      await expect(
        assembleAgent(services, {
          namespace: "m6",
          template: "main",
          budgets: { promptTokens: 1 },
        }),
      ).rejects.toBeInstanceOf(AssemblyRequestError);

      // maxTools below required closure size → hard failure.
      await expect(
        assembleAgent(services, {
          namespace: "m6",
          template: "main",
          task: "deploy",
          budgets: { maxTools: 1 },
        }),
      ).rejects.toMatchObject({
        diagnostics: [{ severity: "error", code: "ASSEMBLY_BUDGET_EXCEEDED" }],
      });

      // Invalid request budgets are rejected, not silently sliced.
      for (const bad of [-1, 1.5, Number.NaN]) {
        await expect(
          assembleAgent(services, {
            namespace: "m6",
            template: "main",
            budgets: { maxSkills: bad },
          }),
        ).rejects.toMatchObject({
          diagnostics: [{ severity: "error", code: "INVALID_INPUT" }],
        });
      }
    } finally {
      await teardown(conn);
    }
  });
});

describe("assembly caching (real postgres + valkey)", () => {
  itCache("warm cache returns identical results; inputs isolate keys", async () => {
    const { conn, services } = await makeServices({ cache: true });
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const req = {
        namespace: "m6",
        template: "main",
        task: "deploy",
        runtime: { availableBindings: ["exec", "audit"] },
        diagnostics: true,
      };
      const r1 = await assembleAgent(services, req);
      const r2 = await assembleAgent(services, req);
      expect(r2.tools.map((t) => t.tool.id)).toEqual(r1.tools.map((t) => t.tool.id));
      expect(r2.promptFragments.map((f) => f.fragment.id)).toEqual(
        r1.promptFragments.map((f) => f.fragment.id),
      );

      // Context change → different key → different (correct) result.
      const r3 = await assembleAgent(services, { ...req, context: { region: "emea" } });
      expect(r3.promptFragments.map((f) => f.fragment.key)).toContain("rules");
      expect(r1.promptFragments.map((f) => f.fragment.key)).not.toContain("rules");

      // Binding list change → different key → different result.
      const r4 = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
      });
      expect(r4.tools.map((t) => t.tool.key)).toContain("opt-tool");
      expect(r1.tools.map((t) => t.tool.key)).not.toContain("opt-tool");
    } finally {
      await teardown(conn, services.cache);
    }
  });

  itCache("cache outage degrades to a bounded miss without changing semantics", async () => {
    const { connect } = await import("@grounding/db");
    const conn = connect();
    const dead: import("@grounding/cache").RuntimeCache = {
      get: async () => null,
      set: async () => {},
      delete: async () => {},
      getOrCompute: async <T>(_k: never, _o: never, compute: () => Promise<T>) => compute(),
      ping: async () => false,
      close: async () => {},
    };
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      const services = {
        db: conn.db,
        cache: dead,
        embedding: { provider: deterministicProvider(1536), configHash: "test-deterministic" },
        environment: "local",
      };
      const warm = await assembleAgent(services, {
        namespace: "m6",
        template: "main",
        task: "deploy",
      });
      const conn2 = connect();
      try {
        const cold = await assembleAgent(
          {
            db: conn2.db,
            cache: null,
            embedding: { provider: deterministicProvider(1536), configHash: "test-deterministic" },
            environment: "local",
          },
          { namespace: "m6", template: "main", task: "deploy" },
        );
        expect(warm.tools.map((t) => t.tool.id)).toEqual(cold.tools.map((t) => t.tool.id));
      } finally {
        await conn2.pool.end();
      }
    } finally {
      await teardown(conn);
    }
  });

  it("malformed cached payloads degrade to a recompute, not a failure", async () => {
    const { connect } = await import("@grounding/db");
    const conn = connect();
    // Store returns corrupt payloads at the assembly-result slot.
    const corruptPayloads: unknown[] = [
      { bogus: true },
      { template: { key: "main" }, contextHash: "x", bootstrapKnowledge: "nope" },
      {
        template: { key: "main" },
        contextHash: "x",
        bootstrapKnowledge: [{ chunk: null }],
      },
    ];
    const { assembleAgent } = await import("./assemble.ts");
    const dir = corpus();
    try {
      await ensureBuilt(conn.db, dir);
      for (const payload of corruptPayloads) {
        const corrupt: import("@grounding/cache").RuntimeCache = {
          get: async () => null,
          set: async () => {},
          delete: async () => {},
          // Corrupt only the assembly-result slot; other kinds pass through.
          getOrCompute: async <T>(k: string, _o: never, compute: () => Promise<T>) =>
            (k.includes(":assembly-result:") ? payload : await compute()) as T,
          ping: async () => true,
          close: async () => {},
        };
        const services = {
          db: conn.db,
          cache: corrupt,
          embedding: {
            provider: deterministicProvider(1536),
            configHash: "test-deterministic",
          },
          environment: "local",
        };
        const r = await assembleAgent(services, {
          namespace: "m6",
          template: "main",
          task: "deploy",
        });
        expect(r.template.key).toBe("main");
        expect(r.tools.length).toBeGreaterThan(0);
      }
    } finally {
      await teardown(conn);
    }
  });
});
