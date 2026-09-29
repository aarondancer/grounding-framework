import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resolveBin, runCli, tempFile } from "./cli.ts";
import type { AgentBackend, BackendCapabilities, BackendRequest } from "./types.ts";

/**
 * Devin CLI backend (`devin -p`, non-interactive print mode).
 * Defaults to the SWE-2 medium tier; Devin has no effort flag, so the
 * `effort` hint is ignored (capabilities.effort = false). Runs with the
 * OS sandbox + Autonomous permission mode so evals are unattended but
 * workspace-scoped.
 */
export type DevinBackendConfig = {
  bin?: string;
  /** Default "swe-2-medium". */
  model?: string;
  /** Override the default `--sandbox` autonomous mode. */
  permissionMode?: "auto" | "accept-edits" | "smart" | "dangerous";
  /** Set false to run without the OS sandbox. */
  sandbox?: boolean;
};

const DEVIN_APP_BIN =
  "/Applications/Devin.app/Contents/Resources/app/extensions/windsurf/devin/bin/devin";

export type DevinRunFiles = { transcript: string };

export function buildArgs(
  cfg: DevinBackendConfig,
  req: BackendRequest,
  files: DevinRunFiles,
): string[] {
  const args: string[] = ["-p"];
  if (cfg.sandbox !== false) args.push("--sandbox");
  if (cfg.permissionMode) args.push("--permission-mode", cfg.permissionMode);
  args.push(
    "--model",
    req.model ?? cfg.model ?? "swe-2-medium",
    "--respect-workspace-trust",
    "false",
    "--export",
    files.transcript,
    "--",
    req.prompt,
  );
  return args;
}

export function devinBackend(cfg: DevinBackendConfig = {}): AgentBackend {
  const bin = () => resolveBin(cfg.bin ?? process.env.DEVIN_BIN, "devin", [DEVIN_APP_BIN]);
  const capabilities: BackendCapabilities = {
    structuredOutput: false,
    effort: false,
    workspace: true,
  };
  return {
    id: "devin",
    capabilities,
    async doctor() {
      const res = await runCli([bin(), "version"], { cwd: "/tmp", timeoutMs: 10_000 });
      return res.code === 0
        ? { ok: true, detail: res.stdout.trim() }
        : { ok: false, detail: res.stderr.trim() || "devin binary not found" };
    },
    async run(req) {
      const scratch = tempFile("grounding-eval-devin-", "transcript.txt", "");
      const files: DevinRunFiles = { transcript: join(scratch.dir, "transcript.txt") };
      try {
        const res = await runCli([bin(), ...buildArgs(cfg, req, files)], {
          cwd: req.cwd,
          ...(req.timeoutMs !== undefined ? { timeoutMs: req.timeoutMs } : {}),
        });
        let transcript: string | undefined;
        try {
          transcript = readFileSync(files.transcript, "utf8");
        } catch {
          // --export only writes when a session ran
        }
        const error = res.timedOut ? "timeout" : res.code === 0 ? undefined : res.stderr.trim();
        return {
          ok: res.code === 0 && !res.timedOut,
          exitCode: res.code,
          response: res.stdout.trim(),
          transcript: transcript ?? res.stdout,
          ...(error !== undefined ? { error } : {}),
        };
      } finally {
        scratch.cleanup();
      }
    },
  };
}
