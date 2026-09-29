import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBin, runCli, tempFile } from "./cli.ts";
import type {
  AgentBackend,
  BackendCapabilities,
  BackendRequest,
  BackendUsage,
  Effort,
} from "./types.ts";

/**
 * OpenAI Codex CLI backend (`codex exec`, non-interactive JSONL mode).
 * Defaults to the GPT-6 Luna family; effort maps to
 * `model_reasoning_effort` (config.toml key).
 */
export type CodexBackendConfig = {
  bin?: string;
  /** Default "gpt-6-luna". */
  model?: string;
  effort?: Effort;
  /** Codex sandbox policy; default "workspace-write". */
  sandbox?: "read-only" | "workspace-write" | "danger-full-access";
};

const CODEX_APP_BIN = "/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex";

export type CodexRunFiles = { lastMessage: string; outputSchema?: string };

export function buildArgs(
  cfg: CodexBackendConfig,
  req: BackendRequest,
  files: CodexRunFiles,
): string[] {
  const args = [
    "exec",
    "--json",
    "--ephemeral",
    "--skip-git-repo-check",
    "-s",
    cfg.sandbox ?? "workspace-write",
    "-C",
    req.cwd,
    "-m",
    req.model ?? cfg.model ?? "gpt-6-luna",
    "-c",
    `model_reasoning_effort="${req.effort ?? cfg.effort ?? "medium"}"`,
    "-o",
    files.lastMessage,
  ];
  if (files.outputSchema) args.push("--output-schema", files.outputSchema);
  args.push(req.prompt);
  return args;
}

/** Pull the last agent message + usage out of `codex exec --json` output. */
export function parseCodexJsonl(stdout: string): {
  response: string | undefined;
  usage: BackendUsage | undefined;
} {
  let response: string | undefined;
  let usage: BackendUsage | undefined;
  for (const line of stdout.split("\n")) {
    if (!line.trim()) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const item = event.item as Record<string, unknown> | undefined;
    if (item?.type === "agent_message" && typeof item.text === "string") {
      response = item.text;
    }
    const u = event.usage as Record<string, unknown> | undefined;
    if (u && typeof u === "object") {
      usage = {
        inputTokens: (u.input_tokens as number) ?? (u.inputTokens as number),
        outputTokens: (u.output_tokens as number) ?? (u.outputTokens as number),
      };
    }
  }
  return { response, usage };
}

export function codexBackend(cfg: CodexBackendConfig = {}): AgentBackend {
  const bin = () => resolveBin(cfg.bin ?? process.env.CODEX_BIN, "codex", [CODEX_APP_BIN]);
  const capabilities: BackendCapabilities = {
    structuredOutput: true,
    effort: true,
    workspace: true,
  };
  return {
    id: "codex",
    capabilities,
    async doctor() {
      const res = await runCli([bin(), "--version"], { cwd: "/tmp", timeoutMs: 10_000 });
      return res.code === 0
        ? { ok: true, detail: res.stdout.trim() }
        : { ok: false, detail: res.stderr.trim() || "codex binary not found" };
    },
    async run(req) {
      const scratch = tempFile("grounding-eval-codex-", "last-message.txt", "");
      const files: CodexRunFiles = { lastMessage: join(scratch.dir, "last-message.txt") };
      try {
        if (req.outputSchema) {
          files.outputSchema = join(scratch.dir, "output-schema.json");
          const { writeFileSync } = await import("node:fs");
          writeFileSync(files.outputSchema, JSON.stringify(req.outputSchema));
        }
        const argv = [bin(), ...buildArgs(cfg, req, files)];
        const res = await runCli(argv, {
          cwd: req.cwd,
          ...(req.timeoutMs !== undefined ? { timeoutMs: req.timeoutMs } : {}),
        });
        const parsed = parseCodexJsonl(res.stdout);
        let response = parsed.response ?? "";
        try {
          const last = readFileSync(files.lastMessage, "utf8").trim();
          if (last) response = last;
        } catch {
          // codex only writes -o on success; transcript response is the fallback
        }
        const error = res.timedOut ? "timeout" : res.code === 0 ? undefined : res.stderr.trim();
        return {
          ok: res.code === 0 && !res.timedOut,
          exitCode: res.code,
          response,
          transcript: res.stdout,
          ...(parsed.usage !== undefined ? { usage: parsed.usage } : {}),
          ...(error !== undefined ? { error } : {}),
        };
      } finally {
        scratch.cleanup();
      }
    },
  };
}
