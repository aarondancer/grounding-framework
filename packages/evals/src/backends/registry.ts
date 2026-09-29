import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "jsonc-parser";
import { type CodexBackendConfig, codexBackend } from "./codex.ts";
import { type DevinBackendConfig, devinBackend } from "./devin.ts";
import { type OpenAiCompatibleConfig, openAiCompatibleBackend } from "./openai.ts";
import type { AgentBackend, Effort } from "./types.ts";

export type BackendName = "codex" | "devin" | "openai-compatible";

export const BACKEND_NAMES: BackendName[] = ["codex", "devin", "openai-compatible"];

/**
 * Backend configuration. Resolution order (highest wins):
 * CLI flags → env vars → `<root>/evals.config.jsonc` → built-in defaults.
 * The file is runner config, not authored grounding content — it is not a
 * source file and is never validated or compiled.
 */
export type EvalBackendsConfig = {
  /** Backend that executes the assembled agent (default "codex"). */
  agent?: BackendName;
  /** Backend that grades transcripts when judging is enabled. */
  judge?: BackendName;
  codex?: CodexBackendConfig;
  devin?: DevinBackendConfig;
  openaiCompatible?: OpenAiCompatibleConfig;
};

export function createBackend(name: BackendName, cfg: EvalBackendsConfig = {}): AgentBackend {
  switch (name) {
    case "codex":
      return codexBackend(cfg.codex);
    case "devin":
      return devinBackend(cfg.devin);
    case "openai-compatible": {
      const c = cfg.openaiCompatible;
      if (!c?.baseUrl || !c.model) {
        throw new Error(
          "openai-compatible backend requires openaiCompatible.baseUrl + model (evals.config.jsonc or OPENAI_BASE_URL/OPENAI_MODEL)",
        );
      }
      return openAiCompatibleBackend(c);
    }
  }
}

function isEffort(v: unknown): v is Effort {
  return v === "low" || v === "medium" || v === "high";
}

function isBackendName(v: unknown): v is BackendName {
  return (BACKEND_NAMES as string[]).includes(String(v));
}

/** File + env config. Flag-level overrides are applied by the caller. */
export function loadEvalConfig(root?: string): EvalBackendsConfig {
  const cfg: EvalBackendsConfig = {};

  if (root) {
    const file = join(root, "evals.config.jsonc");
    if (existsSync(file)) {
      const parsed = parse(readFileSync(file, "utf8")) as EvalBackendsConfig | undefined;
      if (parsed && typeof parsed === "object") Object.assign(cfg, parsed);
    }
  }

  const env = process.env;
  if (isBackendName(env.GROUNDING_EVAL_AGENT_BACKEND)) cfg.agent = env.GROUNDING_EVAL_AGENT_BACKEND;
  if (isBackendName(env.GROUNDING_EVAL_JUDGE_BACKEND)) cfg.judge = env.GROUNDING_EVAL_JUDGE_BACKEND;

  cfg.codex = {
    ...(env.CODEX_BIN ? { bin: env.CODEX_BIN } : {}),
    ...(env.CODEX_MODEL ? { model: env.CODEX_MODEL } : {}),
    ...(isEffort(env.CODEX_EFFORT) ? { effort: env.CODEX_EFFORT } : {}),
    ...(env.CODEX_SANDBOX
      ? { sandbox: env.CODEX_SANDBOX as NonNullable<CodexBackendConfig["sandbox"]> }
      : {}),
    ...cfg.codex,
  };
  cfg.devin = {
    ...(env.DEVIN_BIN ? { bin: env.DEVIN_BIN } : {}),
    ...(env.DEVIN_MODEL ? { model: env.DEVIN_MODEL } : {}),
    ...cfg.devin,
  };
  const baseUrl = env.OPENAI_BASE_URL ?? env.LITELLM_BASE_URL;
  const model = env.OPENAI_MODEL ?? env.LITELLM_MODEL;
  if (baseUrl || model || cfg.openaiCompatible) {
    const apiKeyEnv = env.OPENAI_API_KEY_ENV ?? cfg.openaiCompatible?.apiKeyEnv;
    cfg.openaiCompatible = {
      baseUrl: baseUrl ?? cfg.openaiCompatible?.baseUrl ?? "http://localhost:4000",
      model: model ?? cfg.openaiCompatible?.model ?? "",
      ...(apiKeyEnv !== undefined ? { apiKeyEnv } : {}),
    };
  }
  return cfg;
}

/** Per-run flag overrides (grounding eval --model/--effort). */
export type BackendRunOverrides = { model?: string; effort?: Effort };
