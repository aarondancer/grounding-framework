#!/usr/bin/env bun
import { execSync } from "node:child_process";
import { isAbsolute, relative } from "node:path";
import { type Diagnostic, RuntimeErrorCode } from "@grounding/core";
import { findGroundingRoot, loadSourceTree, validateTree } from "@grounding/source";
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
  for (const d of diagnostics) {
    const loc = d.location
      ? `${d.location.path}${d.location.line ? `:${d.location.line}:${d.location.column ?? 1}` : ""}`
      : "(unknown)";
    console.error(`${d.severity} ${d.code} ${loc} ${d.message}`);
  }
  console.error(`validate: ${errors} error(s), ${warnings} warning(s)`);
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
  // TODO(M2): --changed should add affected dependents via the compiler's
  // reverse-dependency manifest once it exists.
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
    selectedPaths = changed;
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
    .action(() => {
      console.error("build is not implemented yet (M2)");
      process.exitCode = 1;
    });

  program
    .command("dev")
    .description("Watch source and rebuild incrementally")
    .action(() => {
      console.error("dev is not implemented yet (M2)");
      process.exitCode = 1;
    });

  return program;
}

if (import.meta.main) {
  await createCli().parseAsync(process.argv);
}
