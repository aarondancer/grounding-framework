import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import fastGlob from "fast-glob";

/**
 * Canonical source layout (spec/02): a `grounding/` root containing
 * grounding.config.jsonc plus typed subdirectories. File classification is
 * by directory + filename; nested folders carry no semantics.
 */
export type SourceKind =
  | "config"
  | "namespace"
  | "domains-file"
  | "concept"
  | "relation-types"
  | "relations"
  | "knowledge"
  | "dimension"
  | "selection-group"
  | "retrieval-profile"
  | "agent-template"
  | "skill"
  | "tool"
  | "prompt-fragment"
  | "retrieval-eval"
  | "assembly-eval";

export type SourceFile = {
  /** Repo-relative path from the grounding root (POSIX separators). */
  path: string;
  absolutePath: string;
  kind: SourceKind;
};

export const GROUNDING_CONFIG_NAME = "grounding.config.jsonc";

/**
 * Find the grounding root: walk up from startDir for the config marker;
 * also try `<dir>/grounding/` at each level so running from a repo root
 * (which contains grounding/) works.
 */
export function findGroundingRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, GROUNDING_CONFIG_NAME))) return dir;
    const nested = join(dir, "grounding", GROUNDING_CONFIG_NAME);
    if (existsSync(nested)) return join(dir, "grounding");
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/** `.jsonc` canonical; strict `.json` accepted as a subset (spec/02). */
const isJson = (p: string): boolean => p.endsWith(".jsonc") || p.endsWith(".json");

/** Classify a root-relative source path (POSIX separators). */
export function classifySourcePath(path: string): SourceKind | null {
  const p = path.replaceAll("\\", "/");
  if (p === GROUNDING_CONFIG_NAME) return "config";
  if (p === "namespace.jsonc" || p === "namespace.json") return "namespace";
  if (p.startsWith("concepts/") && isJson(p)) {
    const name = p.split("/").pop();
    return name === "domains.jsonc" || name === "domains.json" ? "domains-file" : "concept";
  }
  if (p.startsWith("relations/") && isJson(p)) {
    const name = p.split("/").pop();
    return name === "relation-types.jsonc" || name === "relation-types.json"
      ? "relation-types"
      : "relations";
  }
  if (p.startsWith("knowledge/") && p.endsWith(".md")) return "knowledge";
  if (p.startsWith("dimensions/") && isJson(p)) return "dimension";
  if (p.startsWith("selection-groups/") && isJson(p)) return "selection-group";
  if (p.startsWith("retrieval-profiles/") && isJson(p)) return "retrieval-profile";
  if (p.startsWith("agent-assembly/templates/") && isJson(p)) return "agent-template";
  if (p.startsWith("agent-assembly/skills/") && isJson(p)) return "skill";
  if (p.startsWith("agent-assembly/tools/") && isJson(p)) return "tool";
  if (p.startsWith("agent-assembly/prompt-fragments/") && p.endsWith(".md"))
    return "prompt-fragment";
  if (p.startsWith("evals/retrieval/") && isJson(p)) return "retrieval-eval";
  if (p.startsWith("evals/agent-assembly/") && isJson(p)) return "assembly-eval";
  return null;
}

/**
 * Deterministic source discovery (fast-glob, sorted output). Relative paths
 * are provenance, not identity.
 */
export function discoverSourceFiles(root: string): SourceFile[] {
  const relPaths = fastGlob
    .sync(["**/*.jsonc", "**/*.json", "**/*.md"], { cwd: root, onlyFiles: true })
    .sort();
  const out: SourceFile[] = [];
  for (const rel of relPaths) {
    const kind = classifySourcePath(rel);
    if (kind) out.push({ path: rel, absolutePath: join(root, rel), kind });
  }
  return out;
}
