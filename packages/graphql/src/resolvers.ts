import { type AssemblyServices, assembleAgent } from "@grounding/assembly";
import { RuntimeErrorCode } from "@grounding/core";
import { type Database, schema } from "@grounding/db";
import {
  type RetrievalServices,
  resolveConceptsForNamespace,
  resolveNamespace,
  retrieve,
} from "@grounding/retrieval";
import { and, asc, count, eq, gt, inArray, type SQL, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { GraphQLContext } from "./context.ts";
import { DEFAULT_LIMITS } from "./context.ts";
import type * as Gql from "./generated/resolvers-types.ts";
import { scopedKey } from "./loaders.ts";
import { type Connection, gqlError, invalidInput, pageArgs, toConnection } from "./pagination.ts";

type Row = Record<string, unknown>;
type Resolver<P, A, R> = (parent: P, args: A, ctx: GraphQLContext) => R | Promise<R>;

function requireDb(ctx: GraphQLContext): Database {
  if (!ctx.services.db) {
    throw gqlError(RuntimeErrorCode.INTERNAL_ERROR, "database not configured");
  }
  return ctx.services.db;
}

function maxPage(ctx: GraphQLContext): number {
  return ctx.services.limits?.maxPageSize ?? DEFAULT_LIMITS.maxPageSize;
}

function maxBudget(ctx: GraphQLContext): number {
  return ctx.services.limits?.maxBudget ?? DEFAULT_LIMITS.maxBudget;
}

/** spec/09 server ceilings: numeric budgets fail INVALID_INPUT, never clamp. */
function capInt(value: unknown, max: number, field: string, min = 0): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw invalidInput(`${field} must be an integer between ${min} and ${max}`);
  }
  return n;
}

/** Cap fields on a stripped input object, naming each in the error. */
function capped(ctx: GraphQLContext, input: Row, fields: readonly string[], prefix: string) {
  const max = maxBudget(ctx);
  const out = stripNulls(input) as Row;
  for (const f of fields) {
    if (f in out) out[f] = capInt(out[f], max, `${prefix}.${f}`);
  }
  return out;
}

/** RetrievalServices and AssemblyServices are the same host-deps shape. */
function serviceDeps(ctx: GraphQLContext): RetrievalServices & AssemblyServices {
  return {
    db: requireDb(ctx),
    cache: ctx.services.cache ?? null,
    embedding: ctx.services.embedding ?? null,
    environment: ctx.services.environment,
  };
}

/**
 * Host hook (spec/09/11): server-trusted context is injected here, never
 * taken from client input — callers cannot self-assert `trust: server`
 * dimensions.
 */
function trustedOf(ctx: GraphQLContext): Record<string, unknown> | undefined {
  return ctx.services.trustedContext?.(ctx.request);
}

function jsonContext(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw invalidInput("context must be a JSON object keyed by dimension");
  }
  return value as Record<string, unknown>;
}

/** Drop null/undefined-valued keys — SDL nullable inputs → absent fields. */
function stripNulls<T extends object>(o: T): { [K in keyof T]?: NonNullable<T[K]> } {
  const out: { [K in keyof T]?: NonNullable<T[K]> } = {};
  for (const [k, v] of Object.entries(o) as [keyof T, T[keyof T]][]) {
    if (v !== null && v !== undefined) out[k] = v as NonNullable<T[keyof T]>;
  }
  return out;
}

// Input arg types come from the generated SDL types (codegen.ts) — keeps
// resolver signatures drift-checked against graphql/schema.graphql.
type RetrievalArgs = { input: Gql.RetrievalInput };
type ConceptResolutionArgs = { input: Gql.ConceptResolutionInput };
type AssemblyArgs = { input: Gql.AgentAssemblyInput };

const upper = (v: unknown): string | null =>
  v == null || v === "" ? null : String(v).toUpperCase();

const sourceLoc = (row: { sourcePath?: unknown }) => ({
  path: String(row.sourcePath ?? ""),
  line: null,
  repositoryUrl: null,
  repositoryRef: null,
  viewUrl: null,
});

const metadataOf = (row: { metadata?: unknown }) => row.metadata ?? {};

type RefInput = { id?: string | null; key?: string | null };

/** spec/09: EntityRefInput requires exactly one of id/key. */
function validateRef(ref: RefInput | null | undefined): asserts ref is RefInput {
  const hasId = typeof ref?.id === "string" && ref.id !== "";
  const hasKey = typeof ref?.key === "string" && ref.key !== "";
  if (hasId === hasKey) {
    throw invalidInput("entity ref requires exactly one of id or key");
  }
}

/** Default-namespace resolution shared by all browse queries (no ns arg). */
const nsMemo = new WeakMap<GraphQLContext, Promise<{ id: string; key: string }>>();
function defaultNamespace(ctx: GraphQLContext) {
  let p = nsMemo.get(ctx);
  if (!p) {
    p = resolveNamespace(requireDb(ctx), undefined);
    nsMemo.set(ctx, p);
  }
  return p;
}

/**
 * Shared browse-query shape: namespace scope + optional filters + keyset
 * pagination. `totalCount` counts the filtered set (cursor predicate is on
 * the row query only, so page N doesn't report a shrinking total).
 */
async function paginate<T extends PgTable & { id: PgColumn; namespaceId: PgColumn }>(
  ctx: GraphQLContext,
  table: T,
  input: { first?: number | null; after?: string | null } | null | undefined,
  ...filters: (SQL | undefined)[]
): Promise<Connection<T["$inferSelect"]>> {
  const db = requireDb(ctx);
  const ns = await defaultNamespace(ctx);
  const { limit, afterId } = pageArgs(input, maxPage(ctx));
  const filterWhere = and(eq(table.namespaceId, ns.id), ...filters);
  const [rows, total] = await Promise.all([
    db
      .select()
      .from(table as never)
      .where(and(filterWhere, afterId ? gt(table.id, afterId) : undefined))
      .orderBy(asc(table.id))
      .limit(limit + 1) as unknown as Promise<T["$inferSelect"][]>,
    db
      .select({ n: count() })
      .from(table as never)
      .where(filterWhere) as unknown as Promise<{ n: number }[]>,
  ]);
  return toConnection(rows as (T["$inferSelect"] & { id: string })[], limit, total[0]?.n ?? null);
}

async function refEntity<R extends { id: string }>(
  ctx: GraphQLContext,
  ref: RefInput,
  byId: (id: string) => Promise<R | null>,
  byKey: (scoped: string) => Promise<R | null>,
): Promise<R | null> {
  validateRef(ref);
  if (ref.id) return byId(ref.id);
  const ns = await defaultNamespace(ctx);
  return byKey(scopedKey(ns.id, ref.key as string));
}

function searchClause(search: string, ...cols: PgColumn[]): SQL {
  const term = search.toLowerCase();
  const parts = cols.map((c) => sql`position(${term} in lower(${c}::text)) > 0`);
  return sql`(${sql.join(parts, sql` or `)})`;
}

const lc = (v: unknown) => String(v).toLowerCase();

async function groupId(ctx: GraphQLContext, key: string): Promise<string> {
  const ns = await defaultNamespace(ctx);
  const g = await ctx.loaders.selectionGroupByKey.load(scopedKey(ns.id, key));
  if (!g) {
    throw gqlError(RuntimeErrorCode.ENTITY_NOT_FOUND, `selection group "${key}" does not exist`);
  }
  return g.id;
}

// ---------------------------------------------------------------------------
// Query resolvers
// ---------------------------------------------------------------------------

export function buildResolvers() {
  return {
    Query: {
      runtimeInfo: (async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const ns = await resolveNamespace(db, undefined);
        const env = ctx.services.environment;
        const states = await db
          .select()
          .from(schema.namespaceRuntimeState)
          .where(
            and(
              eq(schema.namespaceRuntimeState.namespaceId, ns.id),
              eq(schema.namespaceRuntimeState.environment, env),
            ),
          )
          .limit(1);
        const state = states[0];
        let gitCommit: string | null = null;
        let compilerVersion: string | null = null;
        if (state?.activeDeploymentId) {
          const deps = await db
            .select()
            .from(schema.deployments)
            .where(eq(schema.deployments.id, state.activeDeploymentId))
            .limit(1);
          gitCommit = deps[0]?.gitCommit ?? null;
          compilerVersion = deps[0]?.compilerVersion ?? null;
        }
        return {
          namespace: { id: ns.id, key: ns.key },
          environment: env,
          runtimeRevision: state?.runtimeRevision ?? 0,
          gitCommit,
          sourceHash: state?.sourceHash ?? "",
          compilerVersion,
        };
      }) as Resolver<unknown, unknown, unknown>,

      retrieve: (_p: unknown, a: RetrievalArgs, ctx: GraphQLContext) => {
        const input = a.input;
        const trusted = trustedOf(ctx);
        return retrieve(serviceDeps(ctx), {
          ...(input.namespace ? { namespace: input.namespace } : {}),
          query: input.query,
          ...(input.context != null ? { context: jsonContext(input.context) } : {}),
          ...(trusted ? { trusted } : {}),
          ...(input.profile ? { profile: input.profile } : {}),
          ...(input.filters
            ? {
                filters: {
                  ...stripNulls(input.filters),
                  includeDraft: input.filters.includeDraft === true,
                  includeDeprecated: input.filters.includeDeprecated === true,
                },
              }
            : {}),
          ...(input.limits
            ? { limits: capped(ctx, input.limits, ["maxChunks", "maxTokens"], "limits") }
            : {}),
          diagnostics: input.diagnostics === true,
        });
      },

      resolveConcepts: (_p: unknown, a: ConceptResolutionArgs, ctx: GraphQLContext) =>
        resolveConceptsForNamespace(serviceDeps(ctx), {
          ...(a.input.namespace ? { namespace: a.input.namespace } : {}),
          text: a.input.text,
          ...(typeof a.input.limit === "number"
            ? { limit: capInt(a.input.limit, maxPage(ctx), "limit", 1) }
            : {}),
        }),

      assembleAgent: (_p: unknown, a: AssemblyArgs, ctx: GraphQLContext) => {
        const input = a.input;
        const trusted = trustedOf(ctx);
        return assembleAgent(serviceDeps(ctx), {
          ...(input.namespace ? { namespace: input.namespace } : {}),
          template: input.template,
          ...(input.context != null ? { context: jsonContext(input.context) } : {}),
          ...(trusted ? { trusted } : {}),
          ...(input.task ? { task: input.task } : {}),
          ...(input.retrievalProfile ? { retrievalProfile: input.retrievalProfile } : {}),
          ...(input.budgets
            ? {
                budgets: capped(
                  ctx,
                  input.budgets,
                  ["maxSkills", "maxTools", "promptTokens", "bootstrapKnowledgeTokens"],
                  "budgets",
                ),
              }
            : {}),
          // spec/09: absent or null availableBindings = all; [] = none.
          ...(input.runtime
            ? {
                runtime: {
                  ...(input.runtime.availableBindings !== undefined
                    ? { availableBindings: input.runtime.availableBindings }
                    : {}),
                },
              }
            : {}),
          diagnostics: input.diagnostics === true,
        });
      },

      namespace: (async (_p: unknown, a: { key?: string }, ctx: GraphQLContext) => {
        const ns = await resolveNamespace(requireDb(ctx), a.key ?? undefined);
        return ctx.loaders.namespacesById.load(ns.id);
      }) as Resolver<unknown, { key?: string }, unknown>,

      concepts: async (_p: unknown, a: { input?: Row }, ctx: GraphQLContext) => {
        const input = a.input ?? {};
        const ns = await defaultNamespace(ctx);
        return paginate(
          ctx,
          schema.concepts,
          a.input,
          typeof input.status === "string"
            ? eq(schema.concepts.status, lc(input.status))
            : undefined,
          typeof input.type === "string" ? eq(schema.concepts.conceptType, input.type) : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.concepts.name, schema.concepts.key)
            : undefined,
          typeof input.domain === "string"
            ? sql`${schema.concepts.id} in (select cd.concept_id from concept_domains cd join domains d on d.id = cd.domain_id and d.namespace_id = cd.namespace_id where d.key = ${input.domain} and cd.namespace_id = ${ns.id})`
            : undefined,
        );
      },

      concept: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.conceptById.load(id),
          (k) => ctx.loaders.conceptByKey.load(k),
        ),

      domains: (_p: unknown, a: { input?: Row }, ctx: GraphQLContext) =>
        paginate(
          ctx,
          schema.domains,
          a.input,
          typeof a.input?.search === "string" && a.input.search !== ""
            ? searchClause(a.input.search, schema.domains.name, schema.domains.key)
            : undefined,
        ),

      knowledgeItems: async (_p: unknown, a: { input?: Row }, ctx: GraphQLContext) => {
        const input = a.input ?? {};
        const ns = await defaultNamespace(ctx);
        return paginate(
          ctx,
          schema.knowledgeItems,
          a.input,
          typeof input.status === "string"
            ? eq(schema.knowledgeItems.status, lc(input.status))
            : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.knowledgeItems.title, schema.knowledgeItems.key)
            : undefined,
          typeof input.domain === "string"
            ? sql`${schema.knowledgeItems.id} in (select kc.knowledge_item_id from knowledge_chunks kc join chunk_concepts cc on cc.chunk_id = kc.id join concept_domains cd on cd.concept_id = cc.concept_id join domains d on d.id = cd.domain_id and d.namespace_id = cd.namespace_id where d.key = ${input.domain} and kc.namespace_id = ${ns.id})`
            : undefined,
          typeof input.concept === "string"
            ? sql`${schema.knowledgeItems.id} in (select kc.knowledge_item_id from knowledge_chunks kc join chunk_concepts cc on cc.chunk_id = kc.id join concepts c on c.id = cc.concept_id where c.key = ${input.concept} and kc.namespace_id = ${ns.id})`
            : undefined,
        );
      },

      knowledgeItem: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.knowledgeItemById.load(id),
          (k) => ctx.loaders.knowledgeItemByKey.load(k),
        ),

      knowledgeChunk: (async (_p: unknown, a: { ref: Row }, ctx: GraphQLContext) => {
        const ref = a.ref;
        const hasId = typeof ref.id === "string" && ref.id !== "";
        const hasKey = typeof ref.key === "string" && ref.key !== "";
        const hasItem = typeof ref.knowledgeItem === "string" && ref.knowledgeItem !== "";
        if (hasId && (hasKey || hasItem)) {
          throw invalidInput("chunk ref: id cannot be combined with key/knowledgeItem");
        }
        if (hasId) return ctx.loaders.chunkById.load(ref.id as string);
        if (!hasKey || !hasItem) {
          throw invalidInput("chunk ref requires id, or knowledgeItem + key");
        }
        const db = requireDb(ctx);
        const ns = await defaultNamespace(ctx);
        const item = await ctx.loaders.knowledgeItemByKey.load(
          scopedKey(ns.id, ref.knowledgeItem as string),
        );
        if (!item) return null;
        const rows = await db
          .select()
          .from(schema.knowledgeChunks)
          .where(
            and(
              eq(schema.knowledgeChunks.knowledgeItemId, item.id),
              eq(schema.knowledgeChunks.chunkKey, ref.key as string),
            ),
          )
          .limit(1);
        return rows[0] ?? null;
      }) as Resolver<unknown, { ref: Row }, unknown>,

      ontologyNeighborhood: async (_p: unknown, a: { input: Row }, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const input = a.input;
        const depth = input.depth === undefined || input.depth === null ? 1 : Number(input.depth);
        if (depth !== 1 && depth !== 2) {
          throw invalidInput("ontologyNeighborhood depth accepts only 1 or 2 in v1");
        }
        const direction = String(input.direction ?? "BOTH").toLowerCase();
        const center = await refEntity(
          ctx,
          input.concept as RefInput,
          (id) => ctx.loaders.conceptById.load(id),
          (k) => ctx.loaders.conceptByKey.load(k),
        );
        if (!center) {
          throw gqlError(RuntimeErrorCode.ENTITY_NOT_FOUND, "ontology center concept not found");
        }
        const nsId = (center as { namespaceId: string }).namespaceId;

        let relTypeIds: string[] | null = null;
        if (Array.isArray(input.relationTypes) && input.relationTypes.length > 0) {
          const types = await db
            .select({ id: schema.relationTypes.id })
            .from(schema.relationTypes)
            .where(
              and(
                eq(schema.relationTypes.namespaceId, nsId),
                inArray(schema.relationTypes.key, input.relationTypes as string[]),
              ),
            );
          relTypeIds = types.map((t) => t.id);
          if (relTypeIds.length === 0) {
            return { center, concepts: [], relations: [] };
          }
        }

        let domainId: string | null = null;
        if (typeof input.domain === "string" && input.domain !== "") {
          const dom = await ctx.loaders.domainByKey.load(scopedKey(nsId, input.domain));
          if (!dom) {
            throw gqlError(
              RuntimeErrorCode.ENTITY_NOT_FOUND,
              `domain "${input.domain}" does not exist`,
            );
          }
          domainId = dom.id;
        }

        const neighbors = new Map<string, Row>();
        const edges = new Map<string, Row>();
        let frontier = [center.id];
        for (let d = 0; d < depth && frontier.length > 0; d++) {
          const outEdges =
            direction !== "incoming"
              ? await db
                  .select()
                  .from(schema.conceptRelations)
                  .where(
                    and(
                      inArray(schema.conceptRelations.sourceConceptId, frontier),
                      relTypeIds
                        ? inArray(schema.conceptRelations.relationTypeId, relTypeIds)
                        : undefined,
                    ),
                  )
              : [];
          const inEdges =
            direction !== "outgoing"
              ? await db
                  .select()
                  .from(schema.conceptRelations)
                  .where(
                    and(
                      inArray(schema.conceptRelations.targetConceptId, frontier),
                      relTypeIds
                        ? inArray(schema.conceptRelations.relationTypeId, relTypeIds)
                        : undefined,
                    ),
                  )
              : [];
          const next: string[] = [];
          const candidateIds = new Set<string>();
          for (const e of outEdges) {
            edges.set(e.id, e as Row);
            candidateIds.add(e.targetConceptId);
          }
          for (const e of inEdges) {
            edges.set(e.id, e as Row);
            candidateIds.add(e.sourceConceptId);
          }
          candidateIds.delete(center.id);
          for (const id of candidateIds) {
            if (!neighbors.has(id)) next.push(id);
          }
          if (next.length > 0) {
            const rows = await db
              .select()
              .from(schema.concepts)
              .where(inArray(schema.concepts.id, next));
            for (const r of rows) neighbors.set(r.id, r as unknown as Row);
          }
          frontier = next;
        }

        let concepts = [...neighbors.values()];
        if (domainId) {
          const memberRows = await db
            .select({ conceptId: schema.conceptDomains.conceptId })
            .from(schema.conceptDomains)
            .where(
              and(
                eq(schema.conceptDomains.domainId, domainId),
                inArray(
                  schema.conceptDomains.conceptId,
                  concepts.length > 0 ? (concepts.map((c) => c.id) as string[]) : ["__none__"],
                ),
              ),
            );
          const keep = new Set(memberRows.map((r) => r.conceptId));
          concepts = concepts.filter((c) => keep.has(c.id as string));
        }
        const conceptIds = new Set(concepts.map((c) => c.id as string));
        const relations = [...edges.values()].filter(
          (e) =>
            conceptIds.has(e.sourceConceptId as string) ||
            conceptIds.has(e.targetConceptId as string) ||
            e.sourceConceptId === center.id ||
            e.targetConceptId === center.id,
        );
        return { center, concepts, relations };
      },

      dimensions: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const ns = await defaultNamespace(ctx);
        return db
          .select()
          .from(schema.dimensionDefinitions)
          .where(eq(schema.dimensionDefinitions.namespaceId, ns.id))
          .orderBy(asc(schema.dimensionDefinitions.key));
      },

      dimension: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.dimensionById.load(id),
          (k) => ctx.loaders.dimensionByKey.load(k),
        ),

      selectionGroups: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const ns = await defaultNamespace(ctx);
        return db
          .select()
          .from(schema.selectionGroups)
          .where(eq(schema.selectionGroups.namespaceId, ns.id))
          .orderBy(asc(schema.selectionGroups.key));
      },

      retrievalProfiles: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const ns = await defaultNamespace(ctx);
        return db
          .select()
          .from(schema.retrievalProfiles)
          .where(eq(schema.retrievalProfiles.namespaceId, ns.id))
          .orderBy(asc(schema.retrievalProfiles.key));
      },

      agentTemplates: async (_p: unknown, _a: unknown, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const ns = await defaultNamespace(ctx);
        return db
          .select()
          .from(schema.agentTemplates)
          .where(eq(schema.agentTemplates.namespaceId, ns.id))
          .orderBy(asc(schema.agentTemplates.key));
      },

      agentTemplate: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.agentTemplateById.load(id),
          (k) => ctx.loaders.agentTemplateByKey.load(k),
        ),

      skills: async (_p: unknown, a: { input?: Row }, ctx: GraphQLContext) => {
        const input = a.input ?? {};
        return paginate(
          ctx,
          schema.skills,
          a.input,
          typeof input.status === "string" ? eq(schema.skills.status, lc(input.status)) : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.skills.name, schema.skills.key)
            : undefined,
          typeof input.selectionGroup === "string"
            ? eq(schema.skills.selectionGroupId, await groupId(ctx, input.selectionGroup))
            : undefined,
        );
      },

      skill: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.skillById.load(id),
          (k) => ctx.loaders.skillByKey.load(k),
        ),

      tools: async (_p: unknown, a: { input?: Row }, ctx: GraphQLContext) => {
        const input = a.input ?? {};
        return paginate(
          ctx,
          schema.tools,
          a.input,
          typeof input.status === "string" ? eq(schema.tools.status, lc(input.status)) : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.tools.name, schema.tools.key)
            : undefined,
          typeof input.selectionGroup === "string"
            ? eq(schema.tools.selectionGroupId, await groupId(ctx, input.selectionGroup))
            : undefined,
        );
      },

      tool: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.toolById.load(id),
          (k) => ctx.loaders.toolByKey.load(k),
        ),

      promptFragments: async (_p: unknown, a: { input?: Row }, ctx: GraphQLContext) => {
        const input = a.input ?? {};
        return paginate(
          ctx,
          schema.promptFragments,
          a.input,
          typeof input.status === "string"
            ? eq(schema.promptFragments.status, lc(input.status))
            : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.promptFragments.name, schema.promptFragments.key)
            : undefined,
          typeof input.selectionGroup === "string"
            ? eq(schema.promptFragments.selectionGroupId, await groupId(ctx, input.selectionGroup))
            : undefined,
        );
      },

      promptFragment: (_p: unknown, a: { ref: RefInput }, ctx: GraphQLContext) =>
        refEntity(
          ctx,
          a.ref,
          (id) => ctx.loaders.promptFragmentById.load(id),
          (k) => ctx.loaders.promptFragmentByKey.load(k),
        ),
    },

    // ---------------------------------------------------------------------
    // Field resolvers
    // ---------------------------------------------------------------------

    Namespace: {
      defaultRetrievalProfile: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.defaultRetrievalProfileId
          ? ctx.loaders.retrievalProfileById.load(p.defaultRetrievalProfileId as string)
          : null,
      metadata: (p: Row) => p.metadata ?? {},
    },

    Concept: {
      type: (p: Row) => p.conceptType ?? null,
      status: (p: Row) => upper(p.status),
      aliases: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.aliasesByConceptId.load(p.id as string),
      domains: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.domainsByConceptId.load(p.id as string),
      outgoingRelations: async (p: Row, a: Row, ctx: GraphQLContext) => {
        const { limit, afterId } = pageArgs(a, maxPage(ctx));
        const all = await ctx.loaders.relationsBySourceId.load(p.id as string);
        return filterRelations(all, a, limit, afterId, ctx);
      },
      incomingRelations: async (p: Row, a: Row, ctx: GraphQLContext) => {
        const { limit, afterId } = pageArgs(a, maxPage(ctx));
        const all = await ctx.loaders.relationsByTargetId.load(p.id as string);
        return filterRelations(all, a, limit, afterId, ctx);
      },
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    Domain: {
      concepts: async (p: Row, a: Row, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const { limit, afterId } = pageArgs(a, maxPage(ctx));
        const links = await db
          .select({ conceptId: schema.conceptDomains.conceptId })
          .from(schema.conceptDomains)
          .where(eq(schema.conceptDomains.domainId, p.id as string));
        const ids = links.map((l) => l.conceptId);
        if (ids.length === 0) return toConnection([], limit, 0);
        const filterWhere = inArray(schema.concepts.id, ids);
        const where = and(filterWhere, afterId ? gt(schema.concepts.id, afterId) : undefined);
        const [rows, total] = await Promise.all([
          db
            .select()
            .from(schema.concepts)
            .where(where)
            .orderBy(asc(schema.concepts.id))
            .limit(limit + 1),
          db.select({ n: count() }).from(schema.concepts).where(filterWhere),
        ]);
        return toConnection(rows, limit, total[0]?.n ?? null);
      },
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    ConceptRelation: {
      type: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.relationTypeById.load(p.relationTypeId as string),
      sourceConcept: async (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load(p.sourceConceptId as string),
      targetConcept: async (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load(p.targetConceptId as string),
      source: (p: Row) => sourceLoc(p),
    },

    KnowledgeItem: {
      status: (p: Row) => upper(p.status),
      sourceReference: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.sourceId ? ctx.loaders.knowledgeSourceById.load(p.sourceId as string) : null,
      chunks: async (p: Row, a: Row, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const { limit, afterId } = pageArgs(a, maxPage(ctx));
        const filterWhere = eq(schema.knowledgeChunks.knowledgeItemId, p.id as string);
        const where = and(
          filterWhere,
          afterId ? gt(schema.knowledgeChunks.id, afterId) : undefined,
        );
        const [rows, total] = await Promise.all([
          db
            .select()
            .from(schema.knowledgeChunks)
            .where(where)
            .orderBy(asc(schema.knowledgeChunks.id))
            .limit(limit + 1),
          db.select({ n: count() }).from(schema.knowledgeChunks).where(filterWhere),
        ]);
        return toConnection(rows, limit, total[0]?.n ?? null);
      },
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    KnowledgeSource: {
      type: (p: Row) => p.sourceType ?? null,
      metadata: metadataOf,
    },

    KnowledgeChunk: {
      key: (p: Row) => p.chunkKey ?? p.key,
      status: (p: Row) => upper(p.status),
      concepts: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptsByChunkId.load(p.id as string),
      knowledgeItem: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.knowledgeItemById.load(p.knowledgeItemId as string),
      selectionGroup: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.selectionGroupId
          ? ctx.loaders.selectionGroupById.load(p.selectionGroupId as string)
          : null,
      // Service ChunkRows omit sourcePath/metadata — fetch the full row lazily.
      source: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        if (p.sourcePath !== undefined) return sourceLoc(p);
        const row = await ctx.loaders.chunkById.load(p.id as string);
        return sourceLoc(row ?? {});
      },
      metadata: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        if (p.metadata !== undefined) return p.metadata ?? {};
        const row = await ctx.loaders.chunkById.load(p.id as string);
        return row?.metadata ?? {};
      },
    },

    DimensionDefinition: {
      values: async (p: Row, a: Row, ctx: GraphQLContext) => {
        const db = requireDb(ctx);
        const { limit, afterId } = pageArgs(a, maxPage(ctx));
        const filterWhere = eq(schema.dimensionValues.dimensionId, p.id as string);
        const where = and(
          filterWhere,
          afterId ? gt(schema.dimensionValues.id, afterId) : undefined,
        );
        const [rows, total] = await Promise.all([
          db
            .select()
            .from(schema.dimensionValues)
            .where(where)
            .orderBy(asc(schema.dimensionValues.id))
            .limit(limit + 1),
          db.select({ n: count() }).from(schema.dimensionValues).where(filterWhere),
        ]);
        return toConnection(rows, limit, total[0]?.n ?? null);
      },
      source: (p: Row) => sourceLoc(p),
    },

    DimensionValue: {
      parent: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.parentValueId ? ctx.loaders.dimensionValueById.load(p.parentValueId as string) : null,
      children: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.childrenByValueId.load(p.id as string),
      metadata: metadataOf,
    },

    SelectionGroup: {
      mode: (p: Row) => upper(p.mode),
      members: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        const id = p.id as string;
        switch (p.entityType) {
          case "knowledge_chunk":
            return (await ctx.loaders.chunksByGroupId.load(id)).map((r) => ({
              ...r,
              __typename: "KnowledgeChunk",
            }));
          case "skill":
            return (await ctx.loaders.skillsByGroupId.load(id)).map((r) => ({
              ...r,
              __typename: "Skill",
            }));
          case "tool":
            return (await ctx.loaders.toolsByGroupId.load(id)).map((r) => ({
              ...r,
              __typename: "Tool",
            }));
          case "prompt_fragment":
            return (await ctx.loaders.fragmentsByGroupId.load(id)).map((r) => ({
              ...r,
              __typename: "PromptFragment",
            }));
          default:
            return [];
        }
      },
      source: (p: Row) => sourceLoc(p),
    },

    SelectionGroupMember: {
      __resolveType: (v: { __typename?: string }) => v.__typename ?? null,
    },

    RetrievalProfile: {
      config: (p: Row) => p.config ?? {},
      source: (p: Row) => sourceLoc(p),
    },

    AgentTemplate: {
      status: (p: Row) => upper(p.status),
      retrievalProfile: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.retrievalProfileId
          ? ctx.loaders.retrievalProfileById.load(p.retrievalProfileId as string)
          : null,
      budgets: (p: Row) => ({
        maxSkills: p.maxSkills ?? null,
        maxTools: p.maxTools ?? null,
        promptTokens: p.promptTokenBudget ?? null,
        bootstrapKnowledgeTokens: p.bootstrapKnowledgeTokenBudget ?? null,
      }),
      promptFragments: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.fragmentsByTemplateId.load(p.id as string),
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    Skill: {
      status: (p: Row) => upper(p.status),
      selectionGroup: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.selectionGroupId
          ? ctx.loaders.selectionGroupById.load(p.selectionGroupId as string)
          : null,
      concepts: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptsBySkillId.load(p.id as string),
      promptFragments: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.fragmentsBySkillId.load(p.id as string),
      tools: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.toolsBySkillId.load(p.id as string),
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    Tool: {
      status: (p: Row) => upper(p.status),
      risk: (p: Row) => upper(p.risk),
      latency: (p: Row) => upper(p.latency),
      selectionGroup: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.selectionGroupId
          ? ctx.loaders.selectionGroupById.load(p.selectionGroupId as string)
          : null,
      concepts: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptsByToolId.load(p.id as string),
      dependencies: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.depsBySourceToolId.load(p.id as string),
      dependents: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.depsByTargetToolId.load(p.id as string),
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    ToolDependency: {
      requirement: (p: Row) => upper(p.requirement),
      sourceTool: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.toolById.load(p.sourceToolId as string),
      targetTool: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.toolById.load(p.targetToolId as string),
    },

    PromptFragment: {
      status: (p: Row) => upper(p.status),
      inclusionMode: (p: Row) => upper(p.inclusionMode),
      order: (p: Row) => p.orderHint ?? 0,
      concepts: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptsByFragmentId.load(p.id as string),
      selectionGroup: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.selectionGroupId
          ? ctx.loaders.selectionGroupById.load(p.selectionGroupId as string)
          : null,
      source: (p: Row) => sourceLoc(p),
      metadata: metadataOf,
    },

    // Service-result mappings: partial service rows resolve nested entities
    // through the per-request loaders.

    ResolvedConcept: {
      concept: (p: { concept: { id: string } }, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load(p.concept.id),
    },

    RetrievalResultItem: {
      chunk: (p: { chunk: { id: string } }, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.chunkById.load(p.chunk.id),
    },

    PackedContext: {
      chunks: (p: { chunks: { id: string }[] }, _a: unknown, ctx: GraphQLContext) =>
        Promise.all(p.chunks.map((c) => ctx.loaders.chunkById.load(c.id))),
    },

    OntologyPath: {
      seedConcept: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load((p.seedConcept as { id: string }).id),
      targetConcept: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load((p.targetConcept as { id: string }).id),
      steps: (p: Row) =>
        (p.steps as Row[]).map((s) => ({
          ...s,
          __ns: (p.seedConcept as { namespaceId: string }).namespaceId,
        })),
    },

    OntologyPathStep: {
      relation: (s: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.relationTypeByKey.load(
          scopedKey(s.__ns as string, (s.relation as { key: string }).key),
        ),
      direction: (s: Row) => upper(s.direction),
      from: (s: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load((s.from as { id: string }).id),
      to: (s: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load((s.to as { id: string }).id),
    },

    RetrievalExclusion: {
      // Service already redacts denied identity; blank refs carry "".
      chunk: (p: Row) => {
        const c = p.chunk as { id?: string; key?: string } | null;
        if (!c) return null;
        return { id: c.id ?? "", key: c.key ?? "", type: "knowledge_chunk" };
      },
    },

    AgentAssemblyResult: {
      template: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.agentTemplateById.load((p.template as { id: string }).id),
    },

    AssembledSkill: {
      skill: (p: { skill: { id: string } }, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.skillById.load(p.skill.id),
    },

    AssembledTool: {
      tool: (p: { tool: { id: string } }, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.toolById.load(p.tool.id),
    },

    AssembledPromptFragment: {
      fragment: (p: { fragment: { id: string } }, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.promptFragmentById.load(p.fragment.id),
    },

    AgentAssemblyDiagnostics: {
      dependencyResolutions: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        const res = p.dependencyResolutions as {
          sourceTool: { id: string; key: string };
          targetTool: { id: string; key: string };
          requirement: string;
          status: string;
          reason: string | null;
        }[];
        const out: Row[] = [];
        for (const r of res) {
          // Redacted endpoints (blank id) are omitted — a non-null Tool field
          // cannot represent them without leaking identity.
          if (!r.sourceTool.id || !r.targetTool.id) continue;
          const [source, target] = await Promise.all([
            ctx.loaders.toolById.load(r.sourceTool.id),
            ctx.loaders.toolById.load(r.targetTool.id),
          ]);
          if (source && target) out.push({ ...r, __source: source, __target: target });
        }
        return out;
      },
    },

    ToolDependencyResolution: {
      sourceTool: (p: Row) => p.__source,
      targetTool: (p: Row) => p.__target,
      requirement: (p: Row) => upper(p.requirement),
      status: (p: Row) => upper(p.status),
    },
  };
}

/** In-memory relation filtering for Concept.{outgoing,incoming}Relations. */
async function filterRelations(
  all: { id: string; relationTypeId: string }[],
  a: Row,
  limit: number,
  afterId: string | null,
  ctx: GraphQLContext,
) {
  let rows = all;
  if (typeof a.type === "string" && a.type !== "") {
    const first = rows[0] as { namespaceId?: string } | undefined;
    const nsId = first?.namespaceId;
    const rt = nsId ? await ctx.loaders.relationTypeByKey.load(scopedKey(nsId, a.type)) : null;
    rows = rt ? rows.filter((r) => r.relationTypeId === rt.id) : [];
  }
  rows = rows
    .slice()
    .sort((x, y) => (x.id < y.id ? -1 : 1))
    .filter((r) => (afterId ? r.id > afterId : true));
  return toConnection(rows as { id: string }[], limit, null);
}
