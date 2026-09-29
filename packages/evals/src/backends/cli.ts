import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Resolve a binary: explicit path wins, then PATH, then well-known app bundles. */
export function resolveBin(bin: string | undefined, fallback: string, appPaths: string[] = []) {
  if (bin) return bin;
  for (const p of appPaths) {
    if (existsSync(p)) return p;
  }
  return fallback;
}

export type CliResult = {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
};

/** Spawn argv without a shell; collects stdout/stderr; never throws. */
export async function runCli(
  argv: string[],
  opts: { cwd: string; timeoutMs?: number; env?: NodeJS.ProcessEnv },
): Promise<CliResult> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60 * 1000;
  const [cmd, ...rest] = argv;
  if (!cmd) return { code: null, stdout: "", stderr: "empty argv", timedOut: false };
  return new Promise((resolve) => {
    const child = spawn(cmd, rest, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: stderr + String(err), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

/** Write a schema/prompt file into a fresh tmpdir; caller deletes via returned fn. */
export function tempFile(prefix: string, name: string, contents: string) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  const path = join(dir, name);
  writeFileSync(path, contents, "utf8");
  return { dir, path, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
