import type { Diagnostic } from "@grounding/core";
import { newId, RuntimeErrorCode, SourceErrorCode } from "@grounding/core";
import type { Database } from "@grounding/db";
import * as t from "@grounding/db/schema";
import { and, count, eq, inArray, ne, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { ChildTable, CompiledEntity, EntityTable } from "./ir.ts";
import { TABLE_ORDER } from "./ir.ts";
import { COMPILER_VERSION, SCHEMA_VERSION } from "./manifest.ts";
import type { MaterializationPlan } from "./plan.ts";

/**
 * Transactional materializer (spec/07): applies a typed plan in one
 * transaction; runtime revision and manifest only update after success.
 */
const ENTITY_TABLE: Record<EntityTable, PgTable> = {
  namespaces: t.namespaces,
  domains: t.domains,
  concepts: t.concepts,
  relation_types: t.relationTypes,
  concept_relations: t.conceptRelations,
  knowledge_sources: t.knowledgeSources,
  knowledge_items: t.knowledgeItems,
  knowledge_chunks: t.knowledgeChunks,
  selection_groups: t.selectionGroups,
  dimension_definitions: t.dimensionDefinitions,
  retrieval_profiles: t.retrievalProfiles,
  agent_templates: t.agentTemplates,
  prompt_fragments: t.promptFragments,
  skills: t.skills,
  tools: t.tools,
  tool_dependencies: t.toolDependencies,
};

const CHILD_TABLE: Record<ChildTable, PgTable> = {
  concept_aliases: t.conceptAliases,
  concept_domains: t.conceptDomains,
  dimension_values: t.dimensionValues,
  dimension_value_closure: t.dimensionValueClosure,
  chunk_concepts: t.chunkConcepts,
  template_prompt_fragments: t.templatePromptFragments,
  skill_concepts: t.skillConcepts,
  skill_tools: t.skillTools,
  skill_prompt_fragments: t.skillPromptFragments,
  prompt_fragment_concepts: t.promptFragmentConcepts,
  tool_concepts: t.toolConcepts,
};

const ID_COL: Record<EntityTable, PgColumn> = {
  namespaces: t.namespaces.id,
  domains: t.domains.id,
  concepts: t.concepts.id,
  relation_types: t.relationTypes.id,
  concept_relations: t.conceptRelations.id,
  knowledge_sources: t.knowledgeSources.id,
  knowledge_items: t.knowledgeItems.id,
  knowledge_chunks: t.knowledgeChunks.id,
  selection_groups: t.selectionGroups.id,
  dimension_definitions: t.dimensionDefinitions.id,
  retrieval_profiles: t.retrievalProfiles.id,
  agent_templates: t.agentTemplates.id,
  prompt_fragments: t.promptFragments.id,
  skills: t.skills.id,
  tools: t.tools.id,
  tool_dependencies: t.toolDependencies.id,
};

/** namespace_id column per table (`namespaces` itself has none). */
const NS_COL: Partial<Record<EntityTable, PgColumn>> = {
  domains: t.domains.namespaceId,
  concepts: t.concepts.namespaceId,
  relation_types: t.relationTypes.namespaceId,
  concept_relations: t.conceptRelations.namespaceId,
  knowledge_sources: t.knowledgeSources.namespaceId,
  knowledge_items: t.knowledgeItems.namespaceId,
  knowledge_chunks: t.knowledgeChunks.namespaceId,
  selection_groups: t.selectionGroups.namespaceId,
  dimension_definitions: t.dimensionDefinitions.namespaceId,
  retrieval_profiles: t.retrievalProfiles.namespaceId,
  agent_templates: t.agentTemplates.namespaceId,
  prompt_fragments: t.promptFragments.namespaceId,
  skills: t.skills.namespaceId,
  tools: t.tools.namespaceId,
  tool_dependencies: t.toolDependencies.namespaceId,
};

const CHILD_NS_COL: Record<ChildTable, PgColumn> = {
  concept_aliases: t.conceptAliases.namespaceId,
  concept_domains: t.conceptDomains.namespaceId,
  dimension_values: t.dimensionValues.namespaceId,
  dimension_value_closure: t.dimensionValueClosure.namespaceId,
  chunk_concepts: t.chunkConcepts.namespaceId,
  template_prompt_fragments: t.templatePromptFragments.namespaceId,
  skill_concepts: t.skillConcepts.namespaceId,
  skill_tools: t.skillTools.namespaceId,
  skill_prompt_fragments: t.skillPromptFragments.namespaceId,
  prompt_fragment_concepts: t.promptFragmentConcepts.namespaceId,
  tool_concepts: t.toolConcepts.namespaceId,
};

const CHILD_PARENT_COL: Record<ChildTable, PgColumn> = {
  concept_aliases: t.conceptAliases.conceptId,
  concept_domains: t.conceptDomains.conceptId,
  dimension_values: t.dimensionValues.dimensionId,
  dimension_value_closure: t.dimensionValueClosure.dimensionId,
  chunk_concepts: t.chunkConcepts.chunkId,
  template_prompt_fragments: t.templatePromptFragments.templateId,
  skill_concepts: t.skillConcepts.skillId,
  skill_tools: t.skillTools.skillId,
  skill_prompt_fragments: t.skillPromptFragments.skillId,
  prompt_fragment_concepts: t.promptFragmentConcepts.promptFragmentId,
  tool_concepts: t.toolConcepts.toolId,
};

export type BuildProvenance = {
  environment: string;
  gitCommit: string | null;
  /** Working tree had uncommitted edits — gitCommit is HEAD, not the built content's commit. */
  dirtyTree?: boolean | undefined;
  sourceHash: string;
  embeddingConfigHash: string;
  /**
   * `repository` block from grounding.config.jsonc (spec/02) — persisted on
   * the deployment so the API can build exact Git source links (spec/10).
   */
  repository?: { provider?: unknown; url?: unknown } | null | undefined;
  /** Repo-relative prefix of the grounding root (`git rev-parse --show-prefix`). */
  repositoryPathPrefix?: string | undefined;
};

/** semantic_entities row (spec/08) — embedding computed outside the tx. */
export type SemanticUpsert = {
  entityType: string;
  entityId: string;
  semanticText: string;
  semanticHash: string;
  embedding: number[];
};

/**
 * The configured embedding dimension must equal the database vector
 * dimension before semantic materialization (spec/08). Returns the
 * database dimension, or a diagnostic.
 */
export async function checkEmbeddingDimension(
  db: Database,
  configured: number,
): Promise<number | Diagnostic> {
  const rows = await db.execute<{ atttypmod: number }>(
    sql`SELECT a.atttypmod FROM pg_attribute a
        WHERE a.attrelid = 'semantic_entities'::regclass
          AND a.attname = 'embedding'`,
  );
  const dim = rows.rows[0]?.atttypmod;
  if (dim === undefined) {
    return {
      severity: "error",
      code: RuntimeErrorCode.INTERNAL_ERROR,
      message: "semantic_entities.embedding column not found — is the baseline migration applied?",
    };
  }
  if (dim !== configured) {
    return {
      severity: "error",
      code: SourceErrorCode.EMBEDDING_DIMENSION_MISMATCH,
      message: `configured embedding dimension ${configured} != database vector dimension ${dim}`,
    };
  }
  return dim;
}

/** Apply the plan in a single transaction. Throws on failure (rollback). */
export async function applyPlan(
  db: Database,
  plan: MaterializationPlan,
  provenance: BuildProvenance,
  opts: {
    clean?: boolean;
    semantic?: { upserts: SemanticUpsert[]; deleteIds: string[] };
    /** Pre-inserted 'deploying' row to flip to 'active' on success. */
    deploymentId?: string | undefined;
  } = {},
): Promise<{ deploymentId: string; runtimeRevision: number }> {
  const deploymentId = opts.deploymentId ?? newId();
  const ns = plan.namespaceId;
  let runtimeRevision = 0;

  await db.transaction(async (tx) => {
    // spec/07: serialize builds per namespace — a concurrent writer waits.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${ns}, 0))`);

    if (opts.clean) {
      // Wipe runtime rows for this namespace without deleting the
      // namespaces / namespace_runtime_state rows — runtimeRevision must
      // stay monotonic because cache keys embed it (spec/16).
      // `deployments` rows are audit history, not runtime state: they are
      // preserved and superseded below so `grounding deployments` can list
      // prior revisions for rollback (M9).
      await tx
        .update(t.namespaceRuntimeState)
        .set({ activeDeploymentId: null })
        .where(
          and(
            eq(t.namespaceRuntimeState.namespaceId, ns),
            eq(t.namespaceRuntimeState.environment, provenance.environment),
          ),
        );
      // Deepest entity tables first; child rows cascade via FK.
      const deepestFirst = (Object.keys(NS_COL) as EntityTable[]).sort(
        (a, b) => TABLE_ORDER[b] - TABLE_ORDER[a],
      );
      for (const table of deepestFirst) {
        const nsCol = NS_COL[table];
        if (nsCol) await tx.delete(ENTITY_TABLE[table]).where(eq(nsCol, ns));
      }
      await tx.delete(t.semanticEntities).where(eq(t.semanticEntities.namespaceId, ns));
    }

    // Deletes first — deepest tables first per plan ordering; child rows
    // ride on FK cascades or their parent's upsert.
    for (const del of plan.deletes) {
      const nsCol = NS_COL[del.table];
      await tx
        .delete(ENTITY_TABLE[del.table])
        .where(
          nsCol ? and(eq(ID_COL[del.table], del.id), eq(nsCol, ns)) : eq(ID_COL[del.table], del.id),
        );
    }

    for (const entity of plan.upserts) {
      await tx
        .insert(ENTITY_TABLE[entity.table])
        .values(entity.row as never)
        .onConflictDoUpdate({
          target: ID_COL[entity.table],
          set: entity.row as never,
        });
      for (const child of entity.children) {
        await tx
          .delete(CHILD_TABLE[child.table])
          .where(
            and(eq(CHILD_NS_COL[child.table], ns), eq(CHILD_PARENT_COL[child.table], entity.id)),
          );
        if (child.rows.length > 0) {
          await tx.insert(CHILD_TABLE[child.table]).values(child.rows as never);
        }
      }
    }

    // Semantic entities (embeddings computed before the tx; the row write
    // itself stays transactional with the entity rows it belongs to).
    if (opts.semantic) {
      if (opts.semantic.deleteIds.length > 0) {
        await tx
          .delete(t.semanticEntities)
          .where(
            and(
              eq(t.semanticEntities.namespaceId, ns),
              inArray(t.semanticEntities.entityId, opts.semantic.deleteIds),
            ),
          );
      }
      for (const s of opts.semantic.upserts) {
        await tx
          .insert(t.semanticEntities)
          .values({
            namespaceId: ns,
            entityType: s.entityType,
            entityId: s.entityId,
            semanticText: s.semanticText,
            semanticHash: s.semanticHash,
            embedding: s.embedding,
          })
          .onConflictDoUpdate({
            target: [
              t.semanticEntities.namespaceId,
              t.semanticEntities.entityType,
              t.semanticEntities.entityId,
            ],
            set: {
              semanticText: s.semanticText,
              semanticHash: s.semanticHash,
              embedding: s.embedding,
            },
          });
      }
    }

    // Deployment row + runtime state land inside the same transaction.
    await tx
      .update(t.deployments)
      .set({ status: "superseded", completedAt: new Date() })
      .where(
        and(
          eq(t.deployments.namespaceId, ns),
          eq(t.deployments.environment, provenance.environment),
          eq(t.deployments.status, "active"),
        ),
      );
    if (opts.deploymentId) {
      // A pre-inserted 'deploying' row (beginDeployment) flips to active —
      // materialization failure outside this tx leaves it marked 'failed'.
      await tx
        .update(t.deployments)
        .set({ status: "active", completedAt: new Date() })
        .where(eq(t.deployments.id, deploymentId));
    } else {
      await tx.insert(t.deployments).values({
        id: deploymentId,
        namespaceId: ns,
        environment: provenance.environment,
        gitCommit: provenance.gitCommit,
        sourceHash: provenance.sourceHash,
        compilerVersion: COMPILER_VERSION,
        schemaVersion: SCHEMA_VERSION,
        status: "active",
        completedAt: new Date(),
        metadata: {
          repository: provenance.repository ?? null,
          repositoryPathPrefix: provenance.repositoryPathPrefix ?? "",
          dirtyTree: provenance.dirtyTree ?? false,
        },
      });
    }
    await tx
      .insert(t.namespaceRuntimeState)
      .values({
        namespaceId: ns,
        environment: provenance.environment,
        runtimeRevision: 1,
        gitCommit: provenance.gitCommit,
        sourceHash: provenance.sourceHash,
        embeddingConfigHash: provenance.embeddingConfigHash,
        activeDeploymentId: deploymentId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [t.namespaceRuntimeState.namespaceId, t.namespaceRuntimeState.environment],
        set: {
          runtimeRevision: sql`${t.namespaceRuntimeState.runtimeRevision} + 1`,
          gitCommit: provenance.gitCommit,
          sourceHash: provenance.sourceHash,
          embeddingConfigHash: provenance.embeddingConfigHash,
          activeDeploymentId: deploymentId,
          updatedAt: new Date(),
        },
      })
      .returning({ runtimeRevision: t.namespaceRuntimeState.runtimeRevision })
      .then((rows) => {
        runtimeRevision = Number(rows[0]?.runtimeRevision ?? 0);
      });

    // Entity tables are namespace-global (no env column, spec/08), so a
    // deploy changes what EVERY environment serves. Cache keys embed the
    // per-env runtime revision (spec/16) — bump this namespace's other
    // environment rows too or they would keep serving stale-revision hits
    // against changed canonical content. Their activeDeploymentId/gitCommit
    // keep pointing at their own last deployment.
    await tx
      .update(t.namespaceRuntimeState)
      .set({
        runtimeRevision: sql`${t.namespaceRuntimeState.runtimeRevision} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(t.namespaceRuntimeState.namespaceId, ns),
          ne(t.namespaceRuntimeState.environment, provenance.environment),
        ),
      );

    // spec/07 verify stage: confirm the plan landed before committing —
    // any discrepancy throws and rolls the transaction back.
    const byTable = new Map<EntityTable, string[]>();
    for (const e of plan.upserts) {
      const ids = byTable.get(e.table) ?? [];
      ids.push(e.id);
      byTable.set(e.table, ids);
    }
    for (const [table, ids] of byTable) {
      const rows = await tx
        .select({ c: count() })
        .from(ENTITY_TABLE[table])
        .where(inArray(ID_COL[table], ids));
      if (Number(rows[0]?.c ?? 0) !== ids.length) {
        throw new Error(
          `verify failed: ${ids.length} ${table} upserts applied, ${rows[0]?.c ?? 0} present`,
        );
      }
    }
    for (const del of plan.deletes) {
      const rows = await tx
        .select({ c: count() })
        .from(ENTITY_TABLE[del.table])
        .where(eq(ID_COL[del.table], del.id));
      if (Number(rows[0]?.c ?? 0) !== 0) {
        throw new Error(`verify failed: ${del.table} row ${del.id} still present after delete`);
      }
    }
  });

  return { deploymentId, runtimeRevision };
}

/**
 * Insert a 'deploying' deployment row before materialization begins so a
 * failure is visible in deployment history (status vocabulary, spec/08).
 * `applyPlan` flips it to 'active' inside the entity transaction; callers
 * mark it 'failed' via `failDeployment` on error.
 */
export async function beginDeployment(
  db: Database,
  input: {
    namespaceId: string;
    provenance: BuildProvenance;
    initiatedBy?: string | undefined;
    /** Compiled namespace row — inserted minimally when missing so the
     * deployments FK is satisfied on a first deploy into a fresh namespace. */
    namespaceRow?: { key?: unknown; name?: unknown } | undefined;
  },
): Promise<string | null> {
  const p = input.provenance;
  const existing = await db
    .select({ id: t.namespaces.id })
    .from(t.namespaces)
    .where(eq(t.namespaces.id, input.namespaceId));
  if (existing.length === 0) {
    if (!input.namespaceRow) return null;
    await db
      .insert(t.namespaces)
      .values({
        id: input.namespaceId,
        key: String(input.namespaceRow.key),
        name: String(input.namespaceRow.name),
      })
      .onConflictDoNothing();
  }
  const id = newId();
  await db.insert(t.deployments).values({
    id,
    namespaceId: input.namespaceId,
    environment: p.environment,
    gitCommit: p.gitCommit,
    sourceHash: p.sourceHash,
    compilerVersion: COMPILER_VERSION,
    schemaVersion: SCHEMA_VERSION,
    status: "deploying",
    initiatedBy: input.initiatedBy ?? null,
    metadata: {
      repository: p.repository ?? null,
      repositoryPathPrefix: p.repositoryPathPrefix ?? "",
      dirtyTree: p.dirtyTree ?? false,
    },
  });
  return id;
}

/** Mark an in-flight deployment row 'failed' with its error message. */
export async function failDeployment(
  db: Database,
  deploymentId: string,
  error: unknown,
): Promise<void> {
  await db
    .update(t.deployments)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorMessage: error instanceof Error ? error.message : String(error),
    })
    .where(eq(t.deployments.id, deploymentId));
}

/**
 * Current entity ids per table for a namespace — the delete baseline for
 * reconcile-style plans (spec/07: manifest is an optimization only; DB state
 * is the truth). Includes the namespace row itself.
 */
export async function namespaceEntityIds(
  db: Database,
  namespaceId: string,
): Promise<Map<EntityTable, Set<string>>> {
  const baseline = new Map<EntityTable, Set<string>>();
  for (const table of Object.keys(ENTITY_TABLE) as EntityTable[]) {
    const nsCol = NS_COL[table];
    const rows = await db
      .select({ id: ID_COL[table] })
      .from(ENTITY_TABLE[table])
      .where(nsCol ? eq(nsCol, namespaceId) : eq(ID_COL[table], namespaceId));
    baseline.set(table, new Set(rows.map((r) => r.id as string)));
  }
  return baseline;
}

/**
 * Current semantic_entities entity ids for a namespace — the reconcile
 * baseline for embedding rows. Like `namespaceEntityIds`, DB state is the
 * truth (ADR-0007): a manifest-less build must still drop embeddings for
 * entities that lost their semanticText.
 */
export async function semanticEntityIds(db: Database, namespaceId: string): Promise<Set<string>> {
  const rows = await db
    .select({ id: t.semanticEntities.entityId })
    .from(t.semanticEntities)
    .where(eq(t.semanticEntities.namespaceId, namespaceId));
  return new Set(rows.map((r) => r.id));
}

export type { CompiledEntity };
