import { readFileSync } from "node:fs";
import type { Diagnostic } from "@grounding/core";
import { discoverSourceFiles, parseJsonc, schemaValidate } from "@grounding/source";
import type { AssemblyEvalDef, EvalFile, RetrievalEvalDef } from "./types.ts";

/**
 * Load eval definitions under `<root>/evals/**`, schema-validated against
 * the locked eval schemas (same path the validator uses). Files that fail
 * validation surface as diagnostics — the runner skips them.
 */
export function loadEvalFiles(root: string): { files: EvalFile[]; diagnostics: Diagnostic[] } {
  const files: EvalFile[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const src of discoverSourceFiles(root)) {
    if (src.kind !== "retrieval-eval" && src.kind !== "assembly-eval") continue;
    const parsed = parseJsonc(readFileSync(src.absolutePath, "utf8"), src.path);
    diagnostics.push(...parsed.diagnostics);
    const value = parsed.value;
    diagnostics.push(...schemaValidate(src.kind, value, src.path));
    if (diagnostics.some((d) => d.severity === "error" && d.location?.path === src.path)) continue;
    files.push(
      src.kind === "retrieval-eval"
        ? { path: src.path, kind: "retrieval-eval", def: value as RetrievalEvalDef }
        : { path: src.path, kind: "assembly-eval", def: value as AssemblyEvalDef },
    );
  }
  return { files, diagnostics };
}
