import { describe, expect, test } from "bun:test";
import { parseVerdict } from "./agent.ts";
import { checkAssemblyExpect, checkRetrievalExpect } from "./assertions.ts";
import { buildArgs as buildCodexArgs, parseCodexJsonl } from "./backends/codex.ts";
import { buildArgs as buildDevinArgs } from "./backends/devin.ts";
import { buildChatBody } from "./backends/openai.ts";
import { createBackend, loadEvalConfig } from "./backends/registry.ts";

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
