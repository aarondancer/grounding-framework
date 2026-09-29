import { execSync } from "node:child_process";
import type { Diagnostic } from "@grounding/core";
import { hashObject } from "@grounding/core";
import type { Database } from "@grounding/db";
import { loadSourceTree, validateTree } from "@grounding/source";
import { compileTree } from "./ir.ts";
import { COMPILER_VERSION, readManifest, saveManifest, writeManifest } from "./manifest.ts";
import { applyPlan, type BuildProvenance, checkEmbeddingDimension } from "./materialize.ts";
import { type MaterializationPlan, planMaterialization } from "./plan.ts";

/**
 * Build pipeline (spec/07): discovery → parse → schema → semantic validate →
 * IR → hashes → dependency graph → manifest diff → plan → transactional
 * apply → manifest update. `--clean` discards the manifest and wipes the
 * namespace's runtime rows; `--dry-run` plans without applying.
 */

export type BuildOptions = {
  clean?: boolean | undefined;
  dryRun?: boolean | undefined;
  environment?: string | undefined;
};

export type BuildResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  plan: MaterializationPlan | null;
  deploymentId: string | null;
  sourceHash: string;
};

function gitCommit(root: string): string | null {
  try {
    return execSync("git rev-parse HEAD", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}

export async function build(
  root: string,
  db: Database,
  opts: BuildOptions = {},
): Promise<BuildResult> {
  const loaded = loadSourceTree(root);
  const diagnostics: Diagnostic[] = [...loaded.diagnostics];

  const invalid = diagnostics.some((d) => d.severity === "error");
  if (invalid) return { ok: false, diagnostics, plan: null, deploymentId: null, sourceHash: "" };

  const validated = validateTree(
    {
      root: loaded.root ?? root,
      entities: loaded.entities,
      diagnostics: [],
      knowledge: loaded.knowledge,
    },
    {},
  );
  diagnostics.push(...validated.diagnostics);
  if (validated.diagnostics.some((d) => d.severity === "error")) {
    return { ok: false, diagnostics, plan: null, deploymentId: null, sourceHash: "" };
  }

  const compiled = compileTree(loaded);
  diagnostics.push(...compiled.diagnostics);
  if (!compiled.namespaceId || compiled.diagnostics.some((d) => d.severity === "error")) {
    return { ok: false, diagnostics, plan: null, deploymentId: null, sourceHash: "" };
  }

  const environment = opts.environment ?? process.env.GROUNDING_ENV ?? "local";
  const embeddingDimensions =
    typeof loaded.config?.embedding === "object" && loaded.config.embedding !== null
      ? ((loaded.config.embedding as Record<string, unknown>).dimensions as number | undefined)
      : undefined;
  const embeddingConfigHash = hashObject(loaded.config?.embedding ?? null);

  // spec/08: configured dimensions must equal the migrated vector dimension.
  if (typeof embeddingDimensions === "number") {
    const check = await checkEmbeddingDimension(db, embeddingDimensions);
    if (typeof check !== "number") {
      diagnostics.push(check);
      return { ok: false, diagnostics, plan: null, deploymentId: null, sourceHash: "" };
    }
  }

  const manifest = opts.clean ? null : readManifest(root);
  const plan = planMaterialization(compiled.namespaceId, compiled.entities, manifest, {
    embeddingDimensions: embeddingDimensions ?? null,
  });

  if (opts.dryRun) {
    return { ok: true, diagnostics, plan, deploymentId: null, sourceHash: compiled.sourceHash };
  }

  const provenance: BuildProvenance = {
    environment,
    gitCommit: gitCommit(root),
    sourceHash: compiled.sourceHash,
    embeddingConfigHash,
  };

  const { deploymentId } = await applyPlan(db, plan, provenance, {
    clean: opts.clean ?? false,
  });

  const nextManifest = writeManifest(root, {
    entities: compiled.entities,
    fileHashes: compiled.fileHashes,
    namespaceId: compiled.namespaceId,
    sourceHash: compiled.sourceHash,
    embeddingDimensions: embeddingDimensions ?? null,
  });
  saveManifest(root, nextManifest);

  return { ok: true, diagnostics, plan, deploymentId, sourceHash: compiled.sourceHash };
}

export type { MaterializationPlan };
export { COMPILER_VERSION };
