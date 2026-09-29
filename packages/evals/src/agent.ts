import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AgentAssemblyResult, assembleAgent } from "@grounding/assembly";
import type { AgentBackend, BackendUsage } from "./backends/types.ts";
import type { EvalServices } from "./runner.ts";
import type { AssemblyEvalDef } from "./types.ts";

/**
 * Agent-execution evals (local only — docs/testing): hand a real agent
 * backend the assembled prompt + task and optionally grade the transcript
 * with a judge backend. Assembly-side expectations are covered separately
 * by the deterministic runner; here the question is whether the assembled
 * context produces competent agent behaviour.
 */

export type AgentRunResult = {
  name: string;
  backend: string;
  ok: boolean;
  response: string;
  transcript?: string;
  usage?: BackendUsage;
  verdict?: { pass: boolean; reasons: string[] };
  error?: string;
};

export const JUDGE_SCHEMA: Record<string, unknown> = {
  type: "object",
  required: ["verdict", "reasons"],
  properties: {
    verdict: { type: "string", enum: ["pass", "fail"] },
    reasons: { type: "array", items: { type: "string" } },
  },
  additionalProperties: false,
};

/** renderedPrompt when present; otherwise a deterministic composition. */
export function buildAgentPrompt(assembled: AgentAssemblyResult, task?: string): string {
  const body =
    assembled.renderedPrompt ??
    assembled.promptFragments
      .toSorted((a, b) => a.renderedOrder - b.renderedOrder)
      .map((f) => f.fragment.content)
      .join("\n\n");
  return task ? `${body}\n\n## Task\n\n${task}` : body;
}

/** Judge rubric: task + expected entities + the candidate response. */
export function buildJudgePrompt(def: AssemblyEvalDef, response: string, transcript?: string) {
  const expected = [
    ...(def.expect.skills ?? []).map((s) => `skill:${s}`),
    ...(def.expect.tools ?? []).map((t) => `tool:${t}`),
    ...(def.expect.promptFragments ?? []).map((f) => `fragment:${f}`),
  ];
  return [
    "You are grading an AI agent run for a grounding-platform eval.",
    `Task given to the agent: ${def.task ?? "(none)"}`,
    expected.length
      ? `The assembled context was expected to emphasize: ${expected.join(", ")}.`
      : "No expected entities were declared.",
    "Judge whether the agent's final response demonstrates the task was completed correctly and consistent with the expected grounding (right domain, right facts, no unauthorized content).",
    'Respond with JSON only: {"verdict":"pass"|"fail","reasons":["..."]}',
    "",
    "## Agent response",
    response,
    ...(transcript ? ["", "## Transcript", transcript] : []),
  ].join("\n");
}

/** Extract a judge verdict from a (possibly prose-wrapped) JSON response. */
export function parseVerdict(text: string): { pass: boolean; reasons: string[] } | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1)) as {
      verdict?: unknown;
      reasons?: unknown;
    };
    if (v.verdict !== "pass" && v.verdict !== "fail") return null;
    return {
      pass: v.verdict === "pass",
      reasons: Array.isArray(v.reasons) ? v.reasons.map(String) : [],
    };
  } catch {
    return null;
  }
}

export type AgentEvalOptions = {
  namespace?: string;
  model?: string;
  effort?: "low" | "medium" | "high";
  timeoutMs?: number;
  /** Judge backend; absent → report run success only. */
  judge?: AgentBackend;
};

export async function runAgentEval(
  services: EvalServices,
  agent: AgentBackend,
  def: AssemblyEvalDef,
  opts: AgentEvalOptions = {},
): Promise<AgentRunResult> {
  const base = { name: def.name, backend: agent.id };
  const assembled = await assembleAgent(services, {
    ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
    template: def.template,
    ...(def.task !== undefined ? { task: def.task } : {}),
    ...(def.context !== undefined ? { context: def.context } : {}),
    ...(def.retrievalProfile !== undefined ? { retrievalProfile: def.retrievalProfile } : {}),
    ...(def.runtime !== undefined ? { runtime: def.runtime } : {}),
  });
  const prompt = buildAgentPrompt(assembled, def.task);

  const workspace = mkdtempSync(join(tmpdir(), "grounding-agent-eval-"));
  try {
    const run = await agent.run({
      prompt,
      cwd: workspace,
      ...(opts.model !== undefined ? { model: opts.model } : {}),
      ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
      ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
    });
    const result: AgentRunResult = {
      ...base,
      ok: run.ok,
      response: run.response,
      ...(run.error !== undefined ? { error: run.error } : {}),
      ...(run.transcript !== undefined ? { transcript: run.transcript } : {}),
      ...(run.usage !== undefined ? { usage: run.usage } : {}),
    };
    if (!run.ok) return result;

    if (opts.judge) {
      const judged = await opts.judge.run({
        prompt: buildJudgePrompt(def, run.response, run.transcript),
        cwd: workspace,
        ...(opts.judge.capabilities.structuredOutput ? { outputSchema: JUDGE_SCHEMA } : {}),
        ...(opts.effort !== undefined ? { effort: opts.effort } : {}),
      });
      const verdict = judged.ok ? parseVerdict(judged.response) : null;
      if (verdict) result.verdict = verdict;
      result.ok = verdict?.pass ?? false;
      if (!judged.ok) result.error = `judge failed: ${judged.error ?? "unknown"}`;
      else if (!verdict) result.error = "judge response unparseable";
    }
    return result;
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}
