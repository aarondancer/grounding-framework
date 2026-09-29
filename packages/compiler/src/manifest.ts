import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { CompiledEntity, DepKind } from "./ir.ts";

/**
 * `.grounding/manifest.json` (spec/07): compiler/source/schema versions,
 * per-file source hashes, per-entity compiled/semantic/lexical hashes, and
 * forward + reverse dependency edges for incremental invalidation. The
 * manifest is an optimization only — deleting it must permit a correct
 * clean rebuild.
 */
export type ManifestEntity = {
  kind: string;
  table: string;
  key?: string;
  sourcePath: string;
  sourceHash: string;
  compiledHash: string;
  semanticHash?: string;
  lexicalHash?: string;
  deps: { target: string; kind: DepKind }[];
  dependedBy: { source: string; kind: DepKind }[];
};

export type Manifest = {
  version: 1;
  compilerVersion: string;
  schemaVersion: string;
  embeddingDimensions: number | null;
  namespaceId: string;
  /** Overall namespace source hash (deployment/runtime provenance). */
  sourceHash: string;
  /** Root-relative path → normalized source hash + emitted entity ids. */
  files: Record<string, { sourceHash: string; entities: string[] }>;
  entities: Record<string, ManifestEntity>;
};

export const COMPILER_VERSION = "1";
export const SCHEMA_VERSION = "1";

export function manifestPath(root: string): string {
  return join(root, ".grounding", "manifest.json");
}

export function readManifest(root: string): Manifest | null {
  const path = manifestPath(root);
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as Manifest;
    return parsed.version === 1 ? parsed : null;
  } catch {
    return null;
  }
}

export function writeManifest(
  _root: string,
  compiled: {
    entities: CompiledEntity[];
    fileHashes: Map<string, string>;
    namespaceId: string;
    sourceHash: string;
    embeddingDimensions: number | null;
  },
): Manifest {
  const dependedBy = new Map<string, { source: string; kind: DepKind }[]>();
  for (const e of compiled.entities) {
    for (const dep of e.deps) {
      const list = dependedBy.get(dep.target) ?? [];
      list.push({ source: e.id, kind: dep.kind });
      dependedBy.set(dep.target, list);
    }
  }

  const entities: Record<string, ManifestEntity> = {};
  for (const e of compiled.entities) {
    const entry: ManifestEntity = {
      kind: e.kind,
      table: e.table,
      sourcePath: e.sourcePath,
      sourceHash: e.sourceHash,
      compiledHash: e.compiledHash,
      deps: e.deps,
      dependedBy: (dependedBy.get(e.id) ?? []).sort((a, b) => a.source.localeCompare(b.source)),
    };
    if (typeof e.row.key === "string") entry.key = e.row.key;
    if (e.semanticHash !== undefined) entry.semanticHash = e.semanticHash;
    if (e.lexicalHash !== undefined) entry.lexicalHash = e.lexicalHash;
    entities[e.id] = entry;
  }

  const files: Manifest["files"] = {};
  for (const e of compiled.entities) {
    const f = files[e.sourcePath] ?? { sourceHash: e.sourceHash, entities: [] };
    files[e.sourcePath] = f;
    f.entities.push(e.id);
  }

  return {
    version: 1,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    embeddingDimensions: compiled.embeddingDimensions,
    namespaceId: compiled.namespaceId,
    sourceHash: compiled.sourceHash,
    files,
    entities,
  };
}

export function saveManifest(root: string, manifest: Manifest): void {
  const path = manifestPath(root);
  mkdirSync(dirname(path), { recursive: true });
  // Atomic update (spec/07): tmp + rename so a crash never leaves a torn file.
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  renameSync(tmp, path);
}
