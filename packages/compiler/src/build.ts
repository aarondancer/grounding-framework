import { execSync } from "node:child_process";
import type { RuntimeCache } from "@grounding/cache";
import type { Diagnostic } from "@grounding/core";
import { hashObject, RuntimeErrorCode } from "@grounding/core";
import type { Database } from "@grounding/db";
import {
  CachedEmbedder,
  type EmbeddingConfig,
  type EmbeddingProvider,
  resolveProvider,
} from "@grounding/embeddings";
import { loadSourceTree, validateTree } from "@grounding/source";
import { compileTree, type EntityTable } from "./ir.ts";
import { COMPILER_VERSION, readManifest, saveManifest, writeManifest } from "./manifest.ts";
import {
  applyPlan,
  type BuildProvenance,
  beginDeployment,
  checkEmbeddingDimension,
  failDeployment,
  namespaceEntityIds,
  type SemanticUpsert,
  semanticEntityIds,
} from "./materialize.ts";
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
  /** Resolved embedding provider; absent → resolved from config + env lazily. */
  provider?: EmbeddingProvider | undefined;
  /** Valkey embedding-content cache; absent → provider called directly. */
  cache?: RuntimeCache | null | undefined;
  /** Recorded on the deployment row (`deployments.initiated_by`). */
  initiatedBy?: string | undefined;
};

/** semantic_entities.entity_type per entity table (spec/08). */
const SEMANTIC_ENTITY_TYPE: Partial<Record<EntityTable, string>> = {
  concepts: "concept",
  knowledge_chunks: "knowledge_chunk",
  prompt_fragments: "prompt_fragment",
  skills: "skill",
  tools: "tool",
};

export type BuildResult = {
  ok: boolean;
  diagnostics: Diagnostic[];
  plan: MaterializationPlan | null;
  deploymentId: string | null;
  /** New namespace runtime revision after a successful apply (spec/16). */
  runtimeRevision: number | null;
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

/** True when the grounding root has uncommitted changes (HEAD ≠ built content). */
function gitDirty(root: string): boolean {
  try {
    return (
      execSync("git status --porcelain", {
        cwd: root,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      }).trim().length > 0
    );
  } catch {
    return false;
  }
}

/**
 * Repo-relative path of the grounding root ("" when the root is the repo
 * root, e.g. "grounding/" when nested). Source paths are grounding-root
 * relative; GitHub links need this prefix to reach the file in the repo.
 */
function gitRepoPrefix(root: string): string {
  try {
    return execSync("git rev-parse --show-prefix", {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
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
  if (invalid)
    return {
      ok: false,
      diagnostics,
      plan: null,
      deploymentId: null,
      runtimeRevision: null,
      sourceHash: "",
    };

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
    return {
      ok: false,
      diagnostics,
      plan: null,
      deploymentId: null,
      runtimeRevision: null,
      sourceHash: "",
    };
  }

  const compiled = compileTree(loaded);
  diagnostics.push(...compiled.diagnostics);
  if (!compiled.namespaceId || compiled.diagnostics.some((d) => d.severity === "error")) {
    return {
      ok: false,
      diagnostics,
      plan: null,
      deploymentId: null,
      runtimeRevision: null,
      sourceHash: "",
    };
  }

  const environment = opts.environment ?? process.env.GROUNDING_ENV ?? "local";
  const embeddingConfig = (loaded.config?.embedding ?? {}) as EmbeddingConfig;
  const embeddingDimensions =
    typeof embeddingConfig.dimensions === "number" ? embeddingConfig.dimensions : undefined;
  // Resolve the effective provider eagerly: the config hash that keys the
  // embedding-content cache and deployment provenance must reflect the
  // resolved provider (env overrides change vector semantics — spec/16:61).
  const resolvedProvider = opts.provider ?? resolveProvider(embeddingConfig, process.env);
  const embeddingConfigHash =
    "embed" in resolvedProvider
      ? hashObject({
          provider: resolvedProvider.provider,
          model: resolvedProvider.model,
          dimensions: resolvedProvider.dimensions,
        })
      : hashObject(embeddingConfig);

  // spec/08: configured dimensions must equal the migrated vector dimension.
  if (typeof embeddingDimensions === "number") {
    const check = await checkEmbeddingDimension(db, embeddingDimensions);
    if (typeof check !== "number") {
      diagnostics.push(check);
      return {
        ok: false,
        diagnostics,
        plan: null,
        deploymentId: null,
        runtimeRevision: null,
        sourceHash: "",
      };
    }
  }

  const manifest = opts.clean ? null : readManifest(root);
  // Deletes reconcile against actual DB state, not the manifest — the
  // manifest only tracks this checkout's last build, so deploys of a
  // different Git revision (or a deleted manifest) must still prune rows
  // the compiled revision no longer contains (spec/07 invariant).
  const dbBaseline = opts.clean ? null : await namespaceEntityIds(db, compiled.namespaceId);
  const plan = planMaterialization(
    compiled.namespaceId,
    compiled.entities,
    manifest,
    {
      embeddingDimensions: embeddingDimensions ?? null,
    },
    dbBaseline ?? undefined,
  );

  if (opts.dryRun) {
    return {
      ok: true,
      diagnostics,
      plan,
      deploymentId: null,
      runtimeRevision: null,
      sourceHash: compiled.sourceHash,
    };
  }

  const repository = loaded.config?.repository;
  const provenance: BuildProvenance = {
    environment,
    gitCommit: gitCommit(root),
    dirtyTree: gitCommit(root) !== null ? gitDirty(root) : undefined,
    sourceHash: compiled.sourceHash,
    embeddingConfigHash,
    repository:
      repository !== null && typeof repository === "object" && !Array.isArray(repository)
        ? (repository as BuildProvenance["repository"])
        : null,
    repositoryPathPrefix: gitRepoPrefix(root),
  };

  // Semantic work: only entities whose semanticHash changed need fresh
  // embeddings (spec: priority-only edits must not recompute). The Valkey
  // embedding-content cache absorbs cross-build repeats.
  const semanticDeleteIds = new Set(plan.deletes.map((d) => d.id));
  if (!opts.clean) {
    // DB state is the truth for embedding rows too (ADR-0007): a
    // manifest-less build cannot see an entity that lost its semanticText,
    // so reconcile semantic_entities against the compiled target set.
    const target = new Set(
      compiled.entities
        .filter((e) => SEMANTIC_ENTITY_TYPE[e.table] !== undefined && e.semanticHash !== undefined)
        .map((e) => e.id),
    );
    for (const id of await semanticEntityIds(db, compiled.namespaceId)) {
      if (!target.has(id)) semanticDeleteIds.add(id);
    }
  }
  const embedWork = plan.upserts.filter(
    (e) =>
      // entity-level semanticHash is only set when semantic text exists.
      SEMANTIC_ENTITY_TYPE[e.table] !== undefined &&
      e.semanticHash !== undefined &&
      manifest?.entities[e.id]?.semanticHash !== e.semanticHash,
  );

  const semanticUpserts: SemanticUpsert[] = [];
  if (!("embed" in resolvedProvider)) {
    // Unresolvable provider is fatal only when semantic work exists; a
    // corpus with nothing to embed just carries the diagnostic forward.
    diagnostics.push({ ...resolvedProvider, severity: embedWork.length > 0 ? "error" : "warning" });
    if (embedWork.length > 0) {
      return {
        ok: false,
        diagnostics,
        plan,
        deploymentId: null,
        runtimeRevision: null,
        sourceHash: compiled.sourceHash,
      };
    }
  }
  if (embedWork.length > 0 && "embed" in resolvedProvider) {
    const provider = resolvedProvider;
    try {
      const embedder = new CachedEmbedder(opts.cache ?? null, embeddingConfigHash);
      const vectors = await embedder.embed(
        provider,
        embedWork.flatMap((e) =>
          e.semanticHash !== undefined && e.semanticText !== undefined
            ? [{ semanticHash: e.semanticHash, semanticText: e.semanticText }]
            : [],
        ),
      );
      for (const e of embedWork) {
        const entityType = SEMANTIC_ENTITY_TYPE[e.table];
        const vec = e.semanticHash !== undefined ? vectors.get(e.semanticHash) : undefined;
        if (!vec || !entityType || e.semanticText === undefined || e.semanticHash === undefined) {
          diagnostics.push({
            severity: "error",
            code: RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
            message: `no embedding produced for ${e.kind} ${e.id}`,
            location: { path: e.sourcePath },
          });
          return {
            ok: false,
            diagnostics,
            plan,
            deploymentId: null,
            runtimeRevision: null,
            sourceHash: compiled.sourceHash,
          };
        }
        semanticUpserts.push({
          entityType,
          entityId: e.id,
          semanticText: e.semanticText,
          semanticHash: e.semanticHash,
          embedding: vec,
        });
      }
    } catch (err) {
      diagnostics.push({
        severity: "error",
        code: RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
        message: err instanceof Error ? err.message : String(err),
      });
      return {
        ok: false,
        diagnostics,
        plan,
        deploymentId: null,
        runtimeRevision: null,
        sourceHash: compiled.sourceHash,
      };
    }
  }

  // Record the deployment before the entity transaction so failures are
  // auditable (`deployments` status vocabulary, spec/08). The 'deploying'
  // row flips to 'active' inside applyPlan's transaction.
  const pendingDeploymentId = await beginDeployment(db, {
    namespaceId: compiled.namespaceId,
    provenance,
    initiatedBy: opts.initiatedBy,
    namespaceRow: compiled.entities.find((e) => e.table === "namespaces")?.row as
      | { key?: unknown; name?: unknown }
      | undefined,
  });
  let deploymentId: string;
  let runtimeRevision: number;
  try {
    ({ deploymentId, runtimeRevision } = await applyPlan(db, plan, provenance, {
      clean: opts.clean ?? false,
      semantic: {
        upserts: semanticUpserts,
        deleteIds: [...semanticDeleteIds],
      },
      deploymentId: pendingDeploymentId ?? undefined,
    }));
  } catch (err) {
    if (pendingDeploymentId) await failDeployment(db, pendingDeploymentId, err).catch(() => {});
    diagnostics.push({
      severity: "error",
      code: RuntimeErrorCode.INTERNAL_ERROR,
      message: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      diagnostics,
      plan,
      deploymentId: pendingDeploymentId,
      runtimeRevision: null,
      sourceHash: compiled.sourceHash,
    };
  }

  const nextManifest = writeManifest(root, {
    entities: compiled.entities,
    fileHashes: compiled.fileHashes,
    namespaceId: compiled.namespaceId,
    sourceHash: compiled.sourceHash,
    embeddingDimensions: embeddingDimensions ?? null,
  });
  saveManifest(root, nextManifest);

  return {
    ok: true,
    diagnostics,
    plan,
    deploymentId,
    runtimeRevision,
    sourceHash: compiled.sourceHash,
  };
}

export type { MaterializationPlan };
export { COMPILER_VERSION };
