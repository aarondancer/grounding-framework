import { describe, expect, test } from "bun:test";
import type { AgentAssemblyResult } from "@grounding/assembly";
import { ensureBuilt, dbTest as it, makeTestServices, writeCorpus } from "@grounding/test-support";
import { buildAgentPrompt, buildJudgePrompt, parseVerdict, runAgentEval } from "./agent.ts";
import { checkAssemblyExpect, checkRetrievalExpect } from "./assertions.ts";
import { buildArgs as buildCodexArgs, parseCodexJsonl } from "./backends/codex.ts";
import { buildArgs as buildDevinArgs } from "./backends/devin.ts";
import { buildChatBody } from "./backends/openai.ts";
import { createBackend, loadEvalConfig } from "./backends/registry.ts";
import type { AgentBackend } from "./backends/types.ts";
import { loadEvalFiles } from "./loader.ts";
import { runEvalFiles } from "./runner.ts";

const req = { prompt: "do the thing", cwd: "/tmp/ws" };

describe("retrieval assertions", () => {
  const actual = {
    ordered: ["a#1", "b#2", "c#3"],
    present: new Set(["a#1", "b#2", "c#3"]),
    resolvedConceptKeys: ["pipeline"],
  };

  test("passes when expectations hold", () => {
    const failures = checkRetrievalExpect(
      {
        resolvedConcepts: ["pipeline"],
        includeChunks: ["a#1"],
        excludeChunks: ["z#9"],
        topK: [{ chunk: "b#2", within: 3 }],
        outranks: [["a#1", "c#3"]],
      },
      actual,
    );
    expect(failures).toEqual([]);
  });

  test("reports each violated assertion", () => {
    const failures = checkRetrievalExpect(
      {
        resolvedConcepts: ["missing"],
        includeChunks: ["z#9"],
        excludeChunks: ["b#2"],
        topK: [{ chunk: "c#3", within: 1 }],
        outranks: [
          ["c#3", "a#1"],
          ["a#1", "z#9"],
        ],
      },
      actual,
    );
    expect(failures.map((f) => f.assertion)).toEqual([
      "resolvedConcepts",
      "includeChunks",
      "excludeChunks",
      "topK",
      "outranks",
      "outranks",
    ]);
  });

  test("present set differs from ranked order (packing)", () => {
    const failures = checkRetrievalExpect(
      { includeChunks: ["c#3"], topK: [{ chunk: "c#3", within: 3 }] },
      { ...actual, present: new Set(["a#1", "b#2"]) },
    );
    // Packed out of delivery but still ranked: include fails, topK holds.
    expect(failures.map((f) => f.assertion)).toEqual(["includeChunks"]);
  });
});

describe("assembly assertions", () => {
  const actual = {
    skills: new Set(["deployer"]),
    tools: new Set(["deploy-tool", "audit-tool"]),
    promptFragments: new Set(["intro"]),
  };

  test("include/exclude on every entity kind", () => {
    expect(
      checkAssemblyExpect(
        {
          skills: ["deployer"],
          excludeSkills: ["draft"],
          tools: ["deploy-tool"],
          promptFragments: ["intro"],
        },
        actual,
      ),
    ).toEqual([]);
    const failures = checkAssemblyExpect(
      { skills: ["ghost"], excludeTools: ["audit-tool"], promptFragments: ["missing"] },
      actual,
    );
    expect(failures.map((f) => f.assertion)).toEqual(["skills", "promptFragments", "excludeTools"]);
  });
});

describe("codex backend", () => {
  const files = { lastMessage: "/tmp/x/last.txt" };

  test("defaults to gpt-6-luna + medium effort", () => {
    const args = buildCodexArgs({}, req, files);
    expect(args).toContain("gpt-6-luna");
    expect(args).toContain('model_reasoning_effort="medium"');
    expect(args).toContain("workspace-write");
    expect(args[args.length - 1]).toBe("do the thing");
  });

  test("flag overrides + output schema", () => {
    const args = buildCodexArgs(
      { model: "gpt-6-sol", sandbox: "read-only" },
      { ...req, model: "gpt-6-astra", effort: "low", outputSchema: { type: "object" } },
      { ...files, outputSchema: "/tmp/x/schema.json" },
    );
    expect(args).toContain("gpt-6-astra");
    expect(args).toContain('model_reasoning_effort="low"');
    expect(args).toContain("read-only");
    expect(args).toContain("--output-schema");
  });

  test("parseCodexJsonl picks last agent message + usage", () => {
    const stdout = [
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "first" } }),
      JSON.stringify({ type: "turn.completed", usage: { input_tokens: 10, output_tokens: 4 } }),
      JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "final" } }),
      "not json",
    ].join("\n");
    const parsed = parseCodexJsonl(stdout);
    expect(parsed.response).toBe("final");
    expect(parsed.usage).toEqual({ inputTokens: 10, outputTokens: 4 });
  });
});

describe("devin backend", () => {
  const files = { transcript: "/tmp/x/t.txt" };

  test("defaults to swe-2-medium, sandboxed, trust skipped", () => {
    const args = buildDevinArgs({}, req, files);
    expect(args).toContain("swe-2-medium");
    expect(args).toContain("--sandbox");
    expect(args).toContain("--respect-workspace-trust");
    expect(args[args.length - 1]).toBe("do the thing");
    expect(args[args.length - 2]).toBe("--");
  });

  test("no effort flag exists (capability absent)", () => {
    const backend = createBackend("devin", {});
    expect(backend.capabilities.effort).toBe(false);
    expect(backend.capabilities.structuredOutput).toBe(false);
    const args = buildDevinArgs(
      { permissionMode: "dangerous", sandbox: false },
      { ...req, model: "swe-2-high" },
      files,
    );
    expect(args).toContain("swe-2-high");
    expect(args).toContain("dangerous");
    expect(args).not.toContain("--sandbox");
  });
});

describe("openai-compatible backend", () => {
  const cfg = { baseUrl: "http://localhost:4000", model: "local-model" };

  test("chat body maps effort + schema", () => {
    const body = buildChatBody(cfg, {
      ...req,
      effort: "high",
      outputSchema: { type: "object", properties: { a: { type: "string" } } },
    });
    expect(body.model).toBe("local-model");
    expect(body.reasoning_effort).toBe("high");
    expect((body.messages as { role: string }[])[0]?.role).toBe("user");
    const rf = body.response_format as { type: string; json_schema: { name: string } };
    expect(rf.type).toBe("json_schema");
    expect(rf.json_schema.name).toBe("eval_result");
  });

  test("requires baseUrl + model at construction", () => {
    expect(() => createBackend("openai-compatible", {})).toThrow(/baseUrl/);
    expect(
      createBackend("openai-compatible", {
        openaiCompatible: { baseUrl: "http://x", model: "m" },
      }).capabilities.workspace,
    ).toBe(false);
  });
});

describe("judge verdict parsing", () => {
  test("clean + wrapped JSON", () => {
    expect(parseVerdict('{"verdict":"pass","reasons":["ok"]}')).toEqual({
      pass: true,
      reasons: ["ok"],
    });
    expect(
      parseVerdict('Here is my grade: {"verdict":"fail","reasons":["wrong domain"]} done'),
    ).toEqual({
      pass: false,
      reasons: ["wrong domain"],
    });
    expect(parseVerdict("no json")).toBeNull();
    expect(parseVerdict('{"verdict":"maybe"}')).toBeNull();
  });
});

describe("loadEvalFiles", () => {
  test("discovers + schema-validates eval defs; invalid files are skipped with diagnostics", () => {
    const dir = writeCorpus("grounding-evalload-", {
      "grounding.config.jsonc": `{"version":1}`,
      "namespace.jsonc": `{"id":"019f4000-0000-7000-8000-000000000001","key":"ev","name":"EV"}`,
      "evals/retrieval/ok.jsonc": `{"name":"r","query":"pipeline","expect":{"resolvedConcepts":["pipeline"]}}`,
      "evals/retrieval/bad.jsonc": `{"name":"missing expect","query":"x"}`,
      "evals/agent-assembly/a.jsonc": `{"name":"a","template":"t","expect":{"skills":["s"]}}`,
      "evals/notes.md": `# not an eval`,
    });
    const { files, diagnostics } = loadEvalFiles(dir);
    expect(files.map((f) => f.kind).sort()).toEqual(["assembly-eval", "retrieval-eval"]);
    expect(files.find((f) => f.path === "evals/retrieval/ok.jsonc")?.def.name).toBe("r");
    // The malformed file reports diagnostics and is excluded from the run set.
    expect(diagnostics.some((d) => d.location?.path === "evals/retrieval/bad.jsonc")).toBe(true);
    expect(files.some((f) => f.path === "evals/retrieval/bad.jsonc")).toBe(false);
    // Non-eval files under evals/ are ignored entirely.
    expect(files.length).toBe(2);
  });
});

describe("agent prompt builders", () => {
  const assembled = (renderedPrompt: string | null) =>
    ({
      renderedPrompt,
      promptFragments: [
        { renderedOrder: 1, fragment: { content: "second" } },
        { renderedOrder: 0, fragment: { content: "first" } },
      ],
    }) as unknown as AgentAssemblyResult;

  test("buildAgentPrompt prefers renderedPrompt; falls back to ordered fragments", () => {
    expect(buildAgentPrompt(assembled("RENDERED"))).toBe("RENDERED");
    expect(buildAgentPrompt(assembled(null))).toBe("first\n\nsecond");
    expect(buildAgentPrompt(assembled("P"), "do x")).toBe("P\n\n## Task\n\ndo x");
  });

  test("buildJudgePrompt carries task, expected entities, response, transcript", () => {
    const p = buildJudgePrompt(
      {
        name: "e",
        template: "t",
        task: "deploy it",
        expect: { skills: ["deployer"], tools: ["deploy-tool"] },
      },
      "the response",
      "the transcript",
    );
    expect(p).toContain("deploy it");
    expect(p).toContain("skill:deployer");
    expect(p).toContain("tool:deploy-tool");
    expect(p).toContain("the response");
    expect(p).toContain("the transcript");
  });
});

const NS = "019f4000-0000-7000-8000-000000000010";

/**
 * Runner fixture: one published knowledge item with a concept + explicit
 * heading chunk, one template with an always-included fragment. Both eval
 * kinds exercise the full loader → service → assertion path on real PG.
 */
const RUNNER_FIXTURE: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
  "namespace.jsonc": `{"id":"${NS}","key":"ev","name":"EV","defaultRetrievalProfile":"default"}`,
  "concepts/pipeline.jsonc": `{"id":"019f4000-0000-7000-8000-000000000020","key":"pipeline","name":"Pipeline","status":"published"}`,
  "retrieval-profiles/default.jsonc": `{"id":"019f4000-0000-7000-8000-000000000030","key":"default"}`,
  "knowledge/base.md": `---\n{"id":"019f4000-0000-7000-8000-000000000040","key":"base","title":"Pipeline Guide","status":"published","concepts":["pipeline"]}\n---\n\n# Pipeline Guide\n\npipeline orchestration handbook\n\n## Details {#details}\n\nrollout specifics\n`,
  "agent-assembly/templates/main.jsonc": `{"id":"019f4000-0000-7000-8000-000000000050","key":"main","name":"Main","status":"published","promptFragments":["intro"]}`,
  "agent-assembly/prompt-fragments/intro.md": `---\n{"id":"019f4000-0000-7000-8000-000000000060","key":"intro","name":"Intro","status":"published","inclusion":"always","section":"system","order":0}\n---\n\nYou are an ops agent.\n`,
};

describe("runEvalFiles (real postgres)", () => {
  it("runs retrieval + assembly evals; failures report, errors degrade to result rows", async () => {
    const { conn, services } = await makeTestServices();
    const dir = writeCorpus("grounding-evalrun-", {
      ...RUNNER_FIXTURE,
      "evals/retrieval/hit.jsonc": `{"name":"hit","query":"pipeline","expect":{"resolvedConcepts":["pipeline"],"includeChunks":["base#details"]}}`,
      // excludeChunks refs are compile-validated, so a deterministic failure
      // excludes a chunk that is actually returned.
      "evals/retrieval/miss.jsonc": `{"name":"miss","query":"pipeline","expect":{"excludeChunks":["base#details"]}}`,
      "evals/agent-assembly/ok.jsonc": `{"name":"asm","template":"main","expect":{"promptFragments":["intro"]}}`,
    });
    try {
      await ensureBuilt(conn.db, dir);
      const { files, diagnostics } = loadEvalFiles(dir);
      expect(diagnostics.filter((d) => d.severity === "error")).toEqual([]);

      const report = await runEvalFiles(services, files, { namespace: "ev" });
      expect(report.passed).toBe(2);
      expect(report.failed).toBe(1);
      const miss = report.results.find((r) => r.name === "miss");
      expect(miss?.ok).toBe(false);
      expect(miss?.failures[0]?.assertion).toBe("excludeChunks");
      // Chunk refs resolve as knowledgeItemKey#chunkKey, never raw UUIDs.
      const hit = report.results.find((r) => r.name === "hit");
      expect(hit?.ok).toBe(true);
    } finally {
      await conn.pool.end();
    }
  });
});

describe("runAgentEval (real postgres, stub backend)", () => {
  const stubBackend = (response: string): AgentBackend & { prompts: string[] } => {
    const prompts: string[] = [];
    return {
      id: "stub",
      capabilities: { structuredOutput: false, effort: false, workspace: true },
      prompts,
      doctor: async () => ({ ok: true, detail: "stub" }),
      run: async (req) => {
        prompts.push(req.prompt);
        return { ok: true, exitCode: 0, response };
      },
    };
  };

  it("assembles, renders, runs, and judges — verdict drives ok", async () => {
    const { conn, services } = await makeTestServices();
    const dir = writeCorpus("grounding-agenteval-", RUNNER_FIXTURE);
    try {
      await ensureBuilt(conn.db, dir);
      const def = {
        name: "agent",
        template: "main",
        task: "describe the pipeline",
        expect: { promptFragments: ["intro"] },
      };

      const agent = stubBackend("the answer");
      const judge: AgentBackend = {
        id: "judge",
        capabilities: { structuredOutput: false, effort: false, workspace: true },
        doctor: async () => ({ ok: true, detail: "stub" }),
        run: async () => ({
          ok: true,
          exitCode: 0,
          response: '{"verdict":"pass","reasons":["correct domain"]}',
        }),
      };
      const res = await runAgentEval(services, agent, def, { namespace: "ev", judge });
      expect(res.ok).toBe(true);
      expect(res.verdict).toEqual({ pass: true, reasons: ["correct domain"] });
      // The assembled prompt (fragments + task section) reached the backend.
      expect(agent.prompts[0]).toContain("You are an ops agent.");
      expect(agent.prompts[0]).toContain("## Task\n\ndescribe the pipeline");

      const failingJudge: AgentBackend = {
        ...judge,
        run: async () => ({ ok: true, exitCode: 0, response: '{"verdict":"fail"}' }),
      };
      const res2 = await runAgentEval(services, stubBackend("x"), def, {
        namespace: "ev",
        judge: failingJudge,
      });
      expect(res2.ok).toBe(false);
    } finally {
      await conn.pool.end();
    }
  });
});

describe("eval config resolution", () => {
  test("env vars populate backend configs", () => {
    const saved = { ...process.env };
    try {
      process.env.CODEX_MODEL = "gpt-6-sol";
      process.env.CODEX_EFFORT = "low";
      process.env.LITELLM_BASE_URL = "http://litellm:4000";
      process.env.LITELLM_MODEL = "team-model";
      const cfg = loadEvalConfig();
      expect(cfg.codex?.model).toBe("gpt-6-sol");
      expect(cfg.codex?.effort).toBe("low");
      expect(cfg.openaiCompatible?.baseUrl).toBe("http://litellm:4000");
      expect(cfg.openaiCompatible?.model).toBe("team-model");
    } finally {
      for (const k of ["CODEX_MODEL", "CODEX_EFFORT", "LITELLM_BASE_URL", "LITELLM_MODEL"]) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    }
  });
});
