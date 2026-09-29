#!/usr/bin/env bun
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { isAbsolute, join, relative } from "node:path";
import { cacheConfigFromEnv, createRuntimeCache } from "@grounding/cache";
import { build, readManifest } from "@grounding/compiler";
import { type Diagnostic, RuntimeErrorCode } from "@grounding/core";
import { connect } from "@grounding/db";
import { type EmbeddingConfig, resolveEmbeddingRuntime } from "@grounding/embeddings";
import {
  BACKEND_NAMES,
  type BackendName,
  createBackend,
  type Effort,
  loadEvalConfig,
  loadEvalFiles,
  runAgentEval,
  runEvalFiles,
} from "@grounding/evals";
import {
  findGroundingRoot,
  GROUNDING_CONFIG_NAME,
  loadSourceTree,
  parseJsonc,
  validateTree,
} from "@grounding/source";
import { watch } from "chokidar";
import { Command } from "commander";

/**
 * grounding CLI — v1 commands: validate, build, dev (spec/07).
 * Machine output (`--format json`) goes to stdout only; human/progress
 * logging goes to stderr.
 */

type ValidateOpts = {
  changed?: boolean;
  strict?: boolean;
  format: string;
};

/**
 * Git-changed files relative to the grounding root (spec/07 --changed).
 * Porcelain format: `XY <path>` or `XY <orig> -> <new>` for renames; quoted
 * paths are unescaped. Returns null when git is unavailable.
 */
function gitChangedPaths(root: string): string[] | null {
  try {
    const repoRoot = execSync("git rev-parse --show-toplevel", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    const out = execSync("git status --porcelain --untracked-files=all", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .split("\n")
      .map((l) => {
        if (l.length < 4) return null;
        let p = l.slice(3);
        const rename = p.indexOf(" -> ");
        if (rename >= 0) p = p.slice(rename + 4);
        if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
        return p;
      })
      .filter((p): p is string => p !== null && p.length > 0)
      .map((p) => relative(root, `${repoRoot}/${p}`).split("\\").join("/"))
      .filter((p) => !p.startsWith(".."));
  } catch {
    return null;
  }
}

function diagnosticToJson(d: Diagnostic) {
  return {
    severity: d.severity,
    code: d.code,
    message: d.message,
    path: d.location?.path,
    line: d.location?.line,
    column: d.location?.column,
    pointer: d.location?.pointer,
    suggestion: d.suggestion,
    details: d.details,
  };
}

function printDiagnostics(diagnostics: Diagnostic[]): void {
  for (const d of diagnostics) {
    const loc = d.location
      ? `${d.location.path}${d.location.line ? `:${d.location.line}:${d.location.column ?? 1}` : ""}`
      : "(unknown)";
    console.error(`${d.severity} ${d.code} ${loc} ${d.message}`);
  }
}

function emit(
  root: string | null,
  diagnostics: Diagnostic[],
  errors: number,
  warnings: number,
  format: string,
): void {
  if (format === "json") {
    process.stdout.write(
      `${JSON.stringify({ root, errors, warnings, diagnostics: diagnostics.map(diagnosticToJson) })}\n`,
    );
    return;
  }
  printDiagnostics(diagnostics);
  console.error(`validate: ${errors} error(s), ${warnings} warning(s)`);
}

/**
 * spec/07 --changed: report diagnostics for changed files *plus* files
 * whose entities transitively depend on them, via the compiler manifest's
 * reverse edges. No manifest (or an empty change set) → changed files only.
 */
function expandWithDependents(root: string, changed: string[]): string[] {
  const manifest = readManifest(root);
  if (!manifest || changed.length === 0) return changed;

  const queue = changed.flatMap((p) => manifest.files[p]?.entities ?? []);
  const seen = new Set(queue);
  for (let id = queue.pop(); id !== undefined; id = queue.pop()) {
    for (const dep of manifest.entities[id]?.dependedBy ?? []) {
      if (!seen.has(dep.source)) {
        seen.add(dep.source);
        queue.push(dep.source);
      }
    }
  }

  const files = new Set(changed);
  for (const id of seen) {
    const path = manifest.entities[id]?.sourcePath;
    if (path) files.add(path);
  }
  return [...files].sort();
}

function runValidate(paths: string[], opts: ValidateOpts): number {
  const root = findGroundingRoot(process.cwd());
  if (!root) {
    const msg = `no grounding.config.jsonc found walking up from ${process.cwd()}`;
    emit(
      null,
      [{ severity: "error", code: RuntimeErrorCode.INVALID_INPUT, message: msg }],
      1,
      0,
      opts.format,
    );
    return 1;
  }

  // File selection: explicit paths or --changed (git) scope *reported*
  // diagnostics; the whole tree is always loaded so references resolve.
  let selectedPaths: string[] | undefined;
  if (opts.changed) {
    const changed = gitChangedPaths(root);
    if (changed === null) {
      emit(
        root,
        [
          {
            severity: "error",
            code: RuntimeErrorCode.INVALID_INPUT,
            message: "--changed requires a git repository",
          },
        ],
        1,
        0,
        opts.format,
      );
      return 1;
    }
    selectedPaths = expandWithDependents(root, changed);
  } else if (paths.length > 0) {
    // Args are cwd-relative (or absolute); normalize to root-relative.
    selectedPaths = paths
      .map((p) =>
        relative(root, isAbsolute(p) ? p : `${process.cwd()}/${p}`)
          .split("\\")
          .join("/"),
      )
      .filter((p) => !p.startsWith(".."));
  }

  const loaded = loadSourceTree(root);
  const result = validateTree(
    {
      root,
      entities: loaded.entities,
      diagnostics: loaded.diagnostics,
      knowledge: loaded.knowledge,
    },
    { strict: opts.strict ?? false },
  );

  if (selectedPaths) {
    const selected = new Set(selectedPaths);
    result.diagnostics = result.diagnostics.filter(
      (d) => d.location?.path === undefined || selected.has(d.location.path),
    );
    result.errors = result.diagnostics.filter((d) => d.severity === "error").length;
    result.warnings = result.diagnostics.length - result.errors;
  }

  emit(root, result.diagnostics, result.errors, result.warnings, opts.format);
  return result.errors > 0 ? 1 : 0;
}

async function runBuild(opts: {
  clean?: boolean;
  dryRun?: boolean;
  format: string;
}): Promise<number> {
  const root = findGroundingRoot(process.cwd());
  if (!root) {
    const msg = `no grounding.config.jsonc found walking up from ${process.cwd()}`;
    emit(
      null,
      [{ severity: "error", code: RuntimeErrorCode.INVALID_INPUT, message: msg }],
      1,
      0,
      opts.format === "json" ? "json" : "human",
    );
    return 1;
  }

  const { pool, db } = connect();
  // Cache failure/degradation is a miss (spec/16) — never fatal to a build.
  const cache = await createRuntimeCache(cacheConfigFromEnv()).catch(() => null);
  try {
    const result = await build(root, db, {
      clean: opts.clean,
      dryRun: opts.dryRun,
      cache,
    });
    if (opts.format === "json") {
      process.stdout.write(
        `${JSON.stringify({
          ok: result.ok,
          sourceHash: result.sourceHash || null,
          upserts: result.plan?.upserts.length ?? 0,
          deletes: result.plan?.deletes.length ?? 0,
          full: result.plan?.full ?? null,
          deploymentId: result.deploymentId,
          diagnostics: result.diagnostics.map(diagnosticToJson),
        })}\n`,
      );
    } else {
      printDiagnostics(result.diagnostics);
      if (result.ok) {
        const verb = opts.dryRun ? "planned" : "applied";
        console.error(
          `build: ${verb} ${result.plan?.upserts.length ?? 0} upsert(s), ${result.plan?.deletes.length ?? 0} delete(s)`,
        );
      } else {
        console.error("build: failed");
      }
    }
    return result.ok ? 0 : 1;
  } finally {
    await cache?.close();
    await pool.end();
  }
}

/** `grounding dev`: debounced watch + rebuild (spec/07). */
async function runDev(): Promise<void> {
  const root = findGroundingRoot(process.cwd());
  if (!root) {
    console.error(`error: no grounding.config.jsonc found walking up from ${process.cwd()}`);
    process.exitCode = 1;
    return;
  }
  const { pool, db } = connect();
  const cache = await createRuntimeCache(cacheConfigFromEnv()).catch(() => null);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let running = false;
  let dirty = false;

  const rebuild = async () => {
    if (running) {
      dirty = true; // coalesce edits arriving mid-build (spec/07)
      return;
    }
    running = true;
    do {
      dirty = false;
      const result = await build(root, db, { cache });
      const errors = result.diagnostics.filter((d) => d.severity === "error").length;
      console.error(
        result.ok
          ? `dev: build ok — ${result.plan?.upserts.length ?? 0} upsert(s), ${result.plan?.deletes.length ?? 0} delete(s)`
          : `dev: build failed (${errors} error(s))`,
      );
      for (const d of result.diagnostics) {
        if (d.severity === "error") {
          console.error(`  error ${d.code} ${d.location?.path ?? ""} ${d.message}`);
        }
      }
    } while (dirty);
    running = false;
  };

  const watcher = watch(root, {
    ignoreInitial: true,
    ignored: [/(^|[/\\])\.grounding([/\\]|$)/, /(^|[/\\])\.git([/\\]|$)/],
  });
  watcher.on("all", () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => void rebuild(), 200); // spec/07 debounce 100–300ms
  });
  watcher.on("ready", () => {
    console.error(`dev: watching ${root}`);
    void rebuild();
  });

  await new Promise<void>((resolve) => {
    process.on("SIGINT", () => {
      void watcher.close().then(async () => {
        await cache?.close();
        await pool.end();
        resolve();
      });
    });
  });
}

type EvalOpts = {
  kind: string;
  build: boolean;
  namespace?: string;
  backend?: string;
  judge?: string;
  model?: string;
  effort?: string;
  format: string;
};

/** Shared embedding resolution (packages/embeddings) keeps the query-time
 * configHash identical to `grounding build` (spec/16). */
function resolveEvalEmbedding(root: string) {
  try {
    const parsed = parseJsonc(readFileSync(join(root, GROUNDING_CONFIG_NAME), "utf8"), "config");
    const config = ((parsed.value as { embedding?: EmbeddingConfig })?.embedding ??
      {}) as EmbeddingConfig;
    return resolveEmbeddingRuntime(config);
  } catch {
    return null;
  }
}

/**
 * `grounding eval` — local-only (docs/testing; not run in CI). Deterministic
 * evals execute the real retrieval/assembly services; --kind agent hands the
 * assembled prompt to a CLI agent backend, optionally graded by --judge.
 */
async function runEval(opts: EvalOpts): Promise<number> {
  const root = findGroundingRoot(process.cwd());
  if (!root) {
    console.error(`error: no grounding.config.jsonc found walking up from ${process.cwd()}`);
    return 1;
  }
  const { pool, db } = connect();
  const cache = await createRuntimeCache(cacheConfigFromEnv()).catch(() => null);
  try {
    if (opts.build) {
      const b = await build(root, db, { cache });
      if (!b.ok) {
        printDiagnostics(b.diagnostics);
        console.error("eval: build failed");
        return 1;
      }
    }
    const { files, diagnostics } = loadEvalFiles(root);
    printDiagnostics(diagnostics);
    const services = {
      db,
      cache,
      embedding: resolveEvalEmbedding(root),
      environment: process.env.GROUNDING_ENV ?? "local",
    };
    const json = opts.format === "json";
    const output: Record<string, unknown> = { loadDiagnostics: diagnostics };
    let failed = 0;

    if (opts.kind !== "agent") {
      const subset =
        opts.kind === "all" ? files : files.filter((f) => f.kind === `${opts.kind}-eval`);
      const report = await runEvalFiles(services, subset, {
        ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
      });
      output.deterministic = report;
      failed += report.failed;
      if (!json) {
        for (const r of report.results) {
          console.error(`  ${r.ok ? "PASS" : "FAIL"} ${r.kind} ${r.name} (${r.path})`);
          for (const f of r.failures) {
            console.error(`       ${f.assertion}: expected ${JSON.stringify(f.expected)}`);
          }
          if (r.error) console.error(`       error: ${r.error}`);
        }
        console.error(`eval: ${report.passed} passed, ${report.failed} failed`);
      }
    }

    if (opts.kind === "agent") {
      const cfg = loadEvalConfig(root);
      const backendName = (opts.backend ?? cfg.agent ?? "codex") as BackendName;
      if (!BACKEND_NAMES.includes(backendName)) {
        console.error(`error: --backend must be one of ${BACKEND_NAMES.join("|")}`);
        return 2;
      }
      const agent = createBackend(backendName, cfg);
      const doctor = await agent.doctor();
      if (!doctor.ok) {
        console.error(`eval: ${backendName} backend unavailable (${doctor.detail})`);
        return 2;
      }
      const judge = opts.judge ? createBackend(opts.judge as BackendName, cfg) : undefined;
      const results = [];
      for (const f of files) {
        if (f.kind !== "assembly-eval") continue;
        const r = await runAgentEval(services, agent, f.def, {
          ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
          ...(opts.model !== undefined ? { model: opts.model } : {}),
          ...(opts.effort !== undefined ? { effort: opts.effort as Effort } : {}),
          ...(judge !== undefined ? { judge } : {}),
        });
        results.push(r);
        if (!r.ok) failed++;
        if (!json) {
          console.error(
            `  ${r.ok ? "PASS" : "FAIL"} agent(${r.backend}) ${r.name}${r.verdict ? ` verdict:${r.verdict.pass ? "pass" : "fail"}` : ""}`,
          );
          if (r.error) console.error(`       error: ${r.error}`);
          for (const reason of r.verdict?.reasons ?? []) {
            console.error(`       judge: ${reason}`);
          }
        }
      }
      output.agent = results;
      if (!json) console.error(`eval: ${results.filter((r) => r.ok).length} agent run(s) passed`);
    }

    if (json) process.stdout.write(`${JSON.stringify(output)}\n`);
    return failed > 0 ? 1 : 0;
  } finally {
    await cache?.close();
    await pool.end();
  }
}

export function createCli(): Command {
  const program = new Command();
  program.name("grounding").description("Grounding platform source tooling").version("0.0.0");

  program
    .command("validate")
    .description("Validate grounding source files")
    .argument("[paths...]", "specific files to validate")
    .option("--changed", "validate git-changed files plus affected dependents")
    .option("--strict", "promote configured warnings to errors")
    .option("--format <format>", "output format: human|json", "human")
    .action((paths: string[], opts: ValidateOpts) => {
      if (opts.format !== "human" && opts.format !== "json") {
        console.error("error: --format must be human|json");
        process.exitCode = 2;
        return;
      }
      if (paths.length > 0 && opts.changed) {
        console.error("error: explicit paths and --changed are mutually exclusive");
        process.exitCode = 2;
        return;
      }
      process.exitCode = runValidate(paths, opts);
    });

  program
    .command("build")
    .description("Compile source and materialize to PostgreSQL")
    .option("--clean", "ignore cached state and rebuild")
    .option("--dry-run", "produce the materialization plan without applying")
    .option("--format <format>", "output format: human|json", "human")
    .action(async (opts: { clean?: boolean; dryRun?: boolean; format: string }) => {
      if (opts.format !== "human" && opts.format !== "json") {
        console.error("error: --format must be human|json");
        process.exitCode = 2;
        return;
      }
      process.exitCode = await runBuild(opts);
    });

  program
    .command("dev")
    .description("Watch source and rebuild incrementally")
    .action(async () => {
      await runDev();
    });

  program
    .command("eval")
    .description("Run evals (local only — deterministic + optional agent backends)")
    .option(
      "--kind <kind>",
      "all|retrieval|assembly|agent (agent runs assembled prompts via a CLI backend)",
      "all",
    )
    .option("--no-build", "skip the materialization step")
    .option("--namespace <key>", "namespace key when ambiguous")
    .option("--backend <name>", `agent backend: ${BACKEND_NAMES.join("|")}`)
    .option("--judge <name>", `judge backend: ${BACKEND_NAMES.join("|")}`)
    .option("--model <model>", "backend model override")
    .option("--effort <effort>", "reasoning effort: low|medium|high")
    .option("--format <format>", "output format: human|json", "human")
    .action(async (opts: EvalOpts) => {
      const kinds = ["all", "retrieval", "assembly", "agent"];
      if (!kinds.includes(opts.kind)) {
        console.error(`error: --kind must be ${kinds.join("|")}`);
        process.exitCode = 2;
        return;
      }
      if (opts.effort && !["low", "medium", "high"].includes(opts.effort)) {
        console.error("error: --effort must be low|medium|high");
        process.exitCode = 2;
        return;
      }
      if (opts.format !== "human" && opts.format !== "json") {
        console.error("error: --format must be human|json");
        process.exitCode = 2;
        return;
      }
      process.exitCode = await runEval(opts);
    });

  return program;
}

if (import.meta.main) {
  await createCli().parseAsync(process.argv);
}
