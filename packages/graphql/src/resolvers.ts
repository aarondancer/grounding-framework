import { type AssemblyServices, assembleAgent } from "@grounding/assembly";
import {
  type Diagnostic,
  type Expression,
  evaluateAuthorization,
  evaluateExpression,
  isEligible,
  leafDimensions,
  normalizeContext,
  RuntimeErrorCode,
} from "@grounding/core";
import { type Database, loadDimensionRegistry, schema } from "@grounding/db";
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
import {
  type Connection,
  gqlError,
  invalidInput,
  pageArgs,
  toConnection,
  UUID_RE,
} from "./pagination.ts";

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

const upperEnum = (v: unknown): string | null =>
  v == null || v === "" ? null : String(v).toUpperCase();

/**
 * Repository link metadata for `SourceLocation` (spec/10: exact GitHub
 * source links when repository metadata permits). The build persists
 * grounding.config.jsonc `repository` + the repo-relative prefix of the
 * grounding root on the active deployment row.
 */
type RepoInfo = { provider: string; url: string; ref: string | null; prefix: string };
const repoMemo = new WeakMap<GraphQLContext, Promise<RepoInfo | null>>();
function repoInfo(ctx: GraphQLContext): Promise<RepoInfo | null> {
  let p = repoMemo.get(ctx);
  if (!p) {
    p = (async () => {
      const db = ctx.services.db;
      if (!db) return null;
      const ns = await defaultNamespace(ctx);
      const states = await db
        .select({
          gitCommit: schema.namespaceRuntimeState.gitCommit,
          metadata: schema.deployments.metadata,
        })
        .from(schema.namespaceRuntimeState)
        .leftJoin(
          schema.deployments,
          eq(schema.deployments.id, schema.namespaceRuntimeState.activeDeploymentId),
        )
        .where(
          and(
            eq(schema.namespaceRuntimeState.namespaceId, ns.id),
            eq(schema.namespaceRuntimeState.environment, ctx.services.environment),
          ),
        )
        .limit(1);
      const meta = states[0]?.metadata as
        | {
            repository?: { provider?: unknown; url?: unknown } | null;
            repositoryPathPrefix?: unknown;
          }
        | null
        | undefined;
      const repo = meta?.repository;
      if (!repo || typeof repo.url !== "string" || repo.url === "") return null;
      return {
        provider: String(repo.provider ?? ""),
        url: repo.url,
        ref: states[0]?.gitCommit ?? null,
        prefix: typeof meta?.repositoryPathPrefix === "string" ? meta.repositoryPathPrefix : "",
      };
    })();
    repoMemo.set(ctx, p);
  }
  return p;
}

const sourceLoc = async (
  row: { sourcePath?: unknown; sourceLine?: unknown },
  ctx: GraphQLContext,
) => {
  const path = String(row.sourcePath ?? "");
  // Entity rows don't carry per-entity line positions (collection files hold
  // many entities); line stays null until the compiler records them, and
  // viewUrl only anchors a line when one exists (spec/10 file-level links).
  const line =
    typeof row.sourceLine === "number" && Number.isInteger(row.sourceLine) && row.sourceLine > 0
      ? row.sourceLine
      : null;
  const info = await repoInfo(ctx);
  let viewUrl: string | null = null;
  if (info?.provider === "github" && path !== "") {
    const base = info.url.replace(/\.git$/, "").replace(/\/+$/, "");
    viewUrl = `${base}/blob/${info.ref ?? "HEAD"}/${info.prefix}${path}${line ? `#L${line}` : ""}`;
  }
  return {
    path,
    line,
    repositoryUrl: info?.url ?? null,
    repositoryRef: info?.ref ?? null,
    viewUrl,
  };
};

const metadataOf = (row: { metadata?: unknown }) => row.metadata ?? {};

type RefInput = { id?: string | null; key?: string | null };

/** spec/09: EntityRefInput requires exactly one of id/key. */

function validateRef(ref: RefInput | null | undefined): asserts ref is RefInput {
  const hasId = typeof ref?.id === "string" && ref.id !== "";
  const hasKey = typeof ref?.key === "string" && ref.key !== "";
  if (hasId === hasKey) {
    throw invalidInput("entity ref requires exactly one of id or key");
  }
  // Malformed ids must fail as INVALID_INPUT, not a pg cast → INTERNAL_ERROR.
  if (hasId && !UUID_RE.test(ref.id as string)) {
    throw invalidInput("entity ref id must be a UUID");
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

const lowerCase = (v: unknown) => String(v).toLowerCase();

async function groupId(ctx: GraphQLContext, key: string): Promise<string> {
  const ns = await defaultNamespace(ctx);
  const g = await ctx.loaders.selectionGroupByKey.load(scopedKey(ns.id, key));
  if (!g) {
    throw gqlError(RuntimeErrorCode.ENTITY_NOT_FOUND, `selection group "${key}" does not exist`);
  }
  return g.id;
}

/** `concept:` browse filter — resolve a concept key to its id. */
async function conceptIdFor(ctx: GraphQLContext, key: string): Promise<string> {
  const ns = await defaultNamespace(ctx);
  const c = await ctx.loaders.conceptByKey.load(scopedKey(ns.id, key));
  if (!c) {
    throw gqlError(RuntimeErrorCode.ENTITY_NOT_FOUND, `concept "${key}" does not exist`);
  }
  return c.id as string;
}

/** Gate tables that carry authorization/applicability expressions. */
const GATED_TABLES = [
  {
    table: schema.knowledgeChunks,
    keyCol: schema.knowledgeChunks.chunkKey,
    type: "knowledge_chunk",
  },
  { table: schema.skills, keyCol: schema.skills.key, type: "skill" },
  { table: schema.tools, keyCol: schema.tools.key, type: "tool" },
  { table: schema.promptFragments, keyCol: schema.promptFragments.key, type: "prompt_fragment" },
] as const;

type GateUsage = { entity: { id: string; key: string; type: string }; kind: string };

/**
 * dimension key → gated entities referencing it (spec/10 "used by"). The
 * whole map is built once per request — four scans cover every dimension,
 * so per-dimension lookups stay flat regardless of list size.
 */
const usageMemo = new WeakMap<GraphQLContext, Promise<Map<string, GateUsage[]>>>();
function dimensionUsageMap(ctx: GraphQLContext) {
  let p = usageMemo.get(ctx);
  if (!p) {
    p = (async () => {
      const db = requireDb(ctx);
      const ns = await defaultNamespace(ctx);
      const map = new Map<string, GateUsage[]>();
      for (const g of GATED_TABLES) {
        const rows = await db
          .select({
            id: g.table.id,
            key: g.keyCol,
            authorization: g.table.authorizationExpression,
            applicability: g.table.applicabilityExpression,
          })
          .from(g.table)
          .where(eq(g.table.namespaceId, ns.id));
        for (const row of rows) {
          const entity = { id: row.id, key: row.key, type: g.type };
          for (const [col, kind] of [
            ["authorization", "AUTHORIZATION"],
            ["applicability", "APPLICABILITY"],
          ] as const) {
            const expr = row[col];
            if (expr === null || typeof expr !== "object") continue;
            for (const dim of new Set(leafDimensions(expr as Expression))) {
              const list = map.get(dim) ?? [];
              list.push({ entity, kind });
              map.set(dim, list);
            }
          }
        }
      }
      return map;
    })();
    usageMemo.set(ctx, p);
  }
  return p;
}

/**
 * Gate-expression field resolver: service-produced parents (e.g. retrieval
 * result chunks) omit the columns — fetch the full row lazily via loader.
 */
function gateField(
  col: "authorizationExpression" | "applicabilityExpression",
  load: (ctx: GraphQLContext, id: string) => Promise<Row | null | undefined>,
): Resolver<Row, unknown, unknown> {
  return async (p: Row, _a: unknown, ctx: GraphQLContext) => {
    if (p[col] !== undefined) return p[col] ?? null;
    const row = await load(ctx, p.id as string);
    return row?.[col] ?? null;
  };
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
        // Filter id arrays flow into uuid-typed SQL predicates — validate
        // here so malformed ids fail INVALID_INPUT, not a pg cast error.
        for (const field of ["conceptIds", "domainIds", "knowledgeItemIds"] as const) {
          const list = input.filters?.[field];
          if (Array.isArray(list)) {
            for (const v of list) {
              if (typeof v !== "string" || !UUID_RE.test(v)) {
                throw invalidInput(`filters.${field} must contain UUIDs`);
              }
            }
          }
        }
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
            ? eq(schema.concepts.status, lowerCase(input.status))
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
            ? eq(schema.knowledgeItems.status, lowerCase(input.status))
            : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.knowledgeItems.title, schema.knowledgeItems.key)
            : undefined,
          typeof input.domain === "string"
            ? sql`${schema.knowledgeItems.id} in (select kc.knowledge_item_id from knowledge_chunks kc join chunk_concepts cc on cc.chunk_id = kc.id join concept_domains cd on cd.concept_id = cc.concept_id join domains d on d.id = cd.domain_id and d.namespace_id = cd.namespace_id where d.key = ${input.domain} and kc.namespace_id = ${ns.id})`
            : undefined,
          typeof input.concept === "string"
            ? sql`${schema.knowledgeItems.id} in (select kc.knowledge_item_id from knowledge_chunks kc where kc.namespace_id = ${ns.id} and kc.id in (select chunk_id from chunk_concepts where concept_id = ${await conceptIdFor(ctx, input.concept)}))`
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
        if (hasId) {
          if (!UUID_RE.test(ref.id as string)) {
            throw invalidInput("chunk ref id must be a UUID");
          }
          return ctx.loaders.chunkById.load(ref.id as string);
        }
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
            return { center, concepts: [], relations: [], chunks: [] };
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
        const visible = new Set([center.id as string, ...conceptIds]);
        // Both endpoints must survive filtering — an edge to a dropped
        // concept is a dangling reference the client can't render.
        const relations = [...edges.values()].filter(
          (e) =>
            visible.has(e.sourceConceptId as string) && visible.has(e.targetConceptId as string),
        );
        // Chunks linked to any concept in the neighborhood (spec/10 "linked
        // chunks" toggle) — one batched link-table query, not per-concept.
        const allIds = [center.id as string, ...conceptIds];
        const links = await db
          .select({
            chunkId: schema.chunkConcepts.chunkId,
            conceptId: schema.chunkConcepts.conceptId,
          })
          .from(schema.chunkConcepts)
          .where(inArray(schema.chunkConcepts.conceptId, allIds));
        const chunkIds = [...new Set(links.map((l) => l.chunkId as string))];
        const chunks =
          chunkIds.length === 0
            ? []
            : await db
                .select()
                .from(schema.knowledgeChunks)
                .where(inArray(schema.knowledgeChunks.id, chunkIds));
        return { center, concepts, relations, chunks };
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
        const db = requireDb(ctx);
        return paginate(
          ctx,
          schema.skills,
          a.input,
          typeof input.status === "string"
            ? eq(schema.skills.status, lowerCase(input.status))
            : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.skills.name, schema.skills.key)
            : undefined,
          typeof input.selectionGroup === "string"
            ? eq(schema.skills.selectionGroupId, await groupId(ctx, input.selectionGroup))
            : undefined,
          typeof input.concept === "string" && input.concept !== ""
            ? inArray(
                schema.skills.id,
                db
                  .select({ id: schema.skillConcepts.skillId })
                  .from(schema.skillConcepts)
                  .where(
                    eq(schema.skillConcepts.conceptId, await conceptIdFor(ctx, input.concept)),
                  ),
              )
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
        const db = requireDb(ctx);
        return paginate(
          ctx,
          schema.tools,
          a.input,
          typeof input.status === "string"
            ? eq(schema.tools.status, lowerCase(input.status))
            : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.tools.name, schema.tools.key)
            : undefined,
          typeof input.selectionGroup === "string"
            ? eq(schema.tools.selectionGroupId, await groupId(ctx, input.selectionGroup))
            : undefined,
          typeof input.concept === "string" && input.concept !== ""
            ? inArray(
                schema.tools.id,
                db
                  .select({ id: schema.toolConcepts.toolId })
                  .from(schema.toolConcepts)
                  .where(eq(schema.toolConcepts.conceptId, await conceptIdFor(ctx, input.concept))),
              )
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
        const db = requireDb(ctx);
        return paginate(
          ctx,
          schema.promptFragments,
          a.input,
          typeof input.status === "string"
            ? eq(schema.promptFragments.status, lowerCase(input.status))
            : undefined,
          typeof input.search === "string" && input.search !== ""
            ? searchClause(input.search, schema.promptFragments.name, schema.promptFragments.key)
            : undefined,
          typeof input.selectionGroup === "string"
            ? eq(schema.promptFragments.selectionGroupId, await groupId(ctx, input.selectionGroup))
            : undefined,
          typeof input.concept === "string" && input.concept !== ""
            ? inArray(
                schema.promptFragments.id,
                db
                  .select({ id: schema.promptFragmentConcepts.promptFragmentId })
                  .from(schema.promptFragmentConcepts)
                  .where(
                    eq(
                      schema.promptFragmentConcepts.conceptId,
                      await conceptIdFor(ctx, input.concept),
                    ),
                  ),
              )
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

      simulateGates: async (
        _p: unknown,
        a: { input: Gql.GateSimulationInput },
        ctx: GraphQLContext,
      ) => {
        const input = a.input;
        validateRef(input.entity);
        const db = requireDb(ctx);
        const ns = await defaultNamespace(ctx);
        // Keys aren't globally unique (chunk keys are per knowledge item; keys
        // can collide across entity types) — gather all matches and fail on
        // ambiguity rather than simulate an arbitrary one.
        const matches: { type: string; row: Row }[] = [];
        for (const g of GATED_TABLES) {
          const pred = input.entity.id
            ? and(eq(g.table.namespaceId, ns.id), eq(g.table.id, input.entity.id))
            : and(eq(g.table.namespaceId, ns.id), eq(g.keyCol, input.entity.key as string));
          const rows = await db.select().from(g.table).where(pred).limit(2);
          for (const row of rows) matches.push({ type: g.type, row: row as unknown as Row });
        }
        if (matches.length > 1) {
          throw invalidInput(
            `entity ref matches ${matches.length} gated entities — disambiguate with id`,
          );
        }
        const found = matches[0] ?? null;
        if (!found) {
          throw gqlError(
            RuntimeErrorCode.ENTITY_NOT_FOUND,
            "no gated entity (chunk, skill, tool, prompt fragment) matches that ref",
          );
        }
        const registry = await loadDimensionRegistry(db, ns.id);
        const trusted = trustedOf(ctx);
        const normalized = normalizeContext(registry, {
          caller: jsonContext(input.context),
          ...(trusted !== undefined ? { trusted } : {}),
        });
        if (!normalized.context) {
          // Attach the diagnostic list so toGraphQLError maps the primary
          // registry code (UNKNOWN_CONTEXT_DIMENSION, CONTEXT_TYPE_MISMATCH…)
          // instead of collapsing to INVALID_INPUT (spec/09, spec/14).
          const err = new Error("request context failed validation") as Error & {
            diagnostics?: Diagnostic[];
          };
          err.diagnostics = normalized.diagnostics;
          throw err;
        }
        const warnings = (ds: Diagnostic[]) =>
          ds.map((d) => ({ code: d.code, message: d.message, details: d.details ?? null }));
        const authExpr = found.row.authorizationExpression;
        const appExpr = found.row.applicabilityExpression;
        return {
          entity: {
            id: found.row.id,
            key: found.row.key ?? found.row.chunkKey,
            type: found.type,
          },
          authorization:
            authExpr === null || authExpr === undefined
              ? null
              : (() => {
                  // evaluateAuthorization owns the fail-closed verdict;
                  // evaluateExpression reports the normative quad state
                  // (true/false/unknown/skip) the SDL documents.
                  const verdict = evaluateAuthorization(
                    registry,
                    normalized.context,
                    authExpr as Expression,
                  );
                  const quad = evaluateExpression(
                    registry,
                    normalized.context,
                    authExpr as Expression,
                  );
                  return {
                    state: quad.state.toUpperCase(),
                    eligible: verdict.allowed,
                    specificity: null,
                    diagnostics: warnings(verdict.diagnostics),
                  };
                })(),
          applicability:
            appExpr === null || appExpr === undefined
              ? null
              : (() => {
                  const r = evaluateExpression(registry, normalized.context, appExpr as Expression);
                  return {
                    state: r.state.toUpperCase(),
                    eligible: isEligible(r),
                    specificity: [r.specificity[0], r.specificity[1]],
                    diagnostics: warnings(r.diagnostics),
                  };
                })(),
        };
      },
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
      status: (p: Row) => upperEnum(p.status),
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
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
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
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
      metadata: metadataOf,
    },

    ConceptRelation: {
      type: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.relationTypeById.load(p.relationTypeId as string),
      sourceConcept: async (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load(p.sourceConceptId as string),
      targetConcept: async (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load(p.targetConceptId as string),
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
    },

    KnowledgeItem: {
      status: (p: Row) => upperEnum(p.status),
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
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
      metadata: metadataOf,
    },

    KnowledgeSource: {
      type: (p: Row) => p.sourceType ?? null,
      metadata: metadataOf,
    },

    KnowledgeChunk: {
      key: (p: Row) => p.chunkKey ?? p.key,
      status: (p: Row) => upperEnum(p.status),
      concepts: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptsByChunkId.load(p.id as string),
      knowledgeItem: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.knowledgeItemById.load(p.knowledgeItemId as string),
      selectionGroup: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.selectionGroupId
          ? ctx.loaders.selectionGroupById.load(p.selectionGroupId as string)
          : null,
      authorization: gateField("authorizationExpression", (ctx, id) =>
        ctx.loaders.chunkById.load(id),
      ),
      applicability: gateField("applicabilityExpression", (ctx, id) =>
        ctx.loaders.chunkById.load(id),
      ),
      // Service ChunkRows omit sourcePath/metadata — fetch the full row lazily.
      source: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        if (p.sourcePath !== undefined) return sourceLoc(p, ctx);
        const row = await ctx.loaders.chunkById.load(p.id as string);
        return sourceLoc(row ?? {}, ctx);
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
      usedBy: async (p: Row, _a: unknown, ctx: GraphQLContext) =>
        (await dimensionUsageMap(ctx)).get(p.key as string) ?? [],
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
    },

    DimensionValue: {
      parent: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.parentValueId ? ctx.loaders.dimensionValueById.load(p.parentValueId as string) : null,
      children: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.childrenByValueId.load(p.id as string),
      metadata: metadataOf,
    },

    SelectionGroup: {
      mode: (p: Row) => upperEnum(p.mode),
      members: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        const table = {
          knowledge_chunk: ["chunksByGroupId", "KnowledgeChunk"],
          skill: ["skillsByGroupId", "Skill"],
          tool: ["toolsByGroupId", "Tool"],
          prompt_fragment: ["fragmentsByGroupId", "PromptFragment"],
        } as const;
        const entry = table[p.entityType as keyof typeof table];
        if (!entry) return [];
        const [loader, typename] = entry;
        const rows = (await (ctx.loaders[loader] as { load: (id: string) => Promise<Row[]> }).load(
          p.id as string,
        )) as Row[];
        return rows.map((r) => ({ ...r, __typename: typename }));
      },
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
    },

    SelectionGroupMember: {
      __resolveType: (v: { __typename?: string }) => v.__typename ?? null,
    },

    RetrievalProfile: {
      config: (p: Row) => p.config ?? {},
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
    },

    AgentTemplate: {
      status: (p: Row) => upperEnum(p.status),
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
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
      metadata: metadataOf,
    },

    Skill: {
      status: (p: Row) => upperEnum(p.status),
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
      authorization: gateField("authorizationExpression", (ctx, id) =>
        ctx.loaders.skillById.load(id),
      ),
      applicability: gateField("applicabilityExpression", (ctx, id) =>
        ctx.loaders.skillById.load(id),
      ),
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
      metadata: metadataOf,
    },

    Tool: {
      status: (p: Row) => upperEnum(p.status),
      risk: (p: Row) => upperEnum(p.risk),
      latency: (p: Row) => upperEnum(p.latency),
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
      usedBy: async (p: Row, _a: unknown, ctx: GraphQLContext) =>
        (await ctx.loaders.skillsByToolId.load(p.id as string)).map((s) => ({
          id: s.id,
          key: s.key,
          type: "skill",
        })),
      authorization: gateField("authorizationExpression", (ctx, id) =>
        ctx.loaders.toolById.load(id),
      ),
      applicability: gateField("applicabilityExpression", (ctx, id) =>
        ctx.loaders.toolById.load(id),
      ),
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
      metadata: metadataOf,
    },

    ToolDependency: {
      requirement: (p: Row) => upperEnum(p.requirement),
      sourceTool: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.toolById.load(p.sourceToolId as string),
      targetTool: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.toolById.load(p.targetToolId as string),
    },

    PromptFragment: {
      status: (p: Row) => upperEnum(p.status),
      inclusionMode: (p: Row) => upperEnum(p.inclusionMode),
      order: (p: Row) => p.orderHint ?? 0,
      concepts: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptsByFragmentId.load(p.id as string),
      selectionGroup: (p: Row, _a: unknown, ctx: GraphQLContext) =>
        p.selectionGroupId
          ? ctx.loaders.selectionGroupById.load(p.selectionGroupId as string)
          : null,
      authorization: gateField("authorizationExpression", (ctx, id) =>
        ctx.loaders.promptFragmentById.load(id),
      ),
      applicability: gateField("applicabilityExpression", (ctx, id) =>
        ctx.loaders.promptFragmentById.load(id),
      ),
      usedBy: async (p: Row, _a: unknown, ctx: GraphQLContext) => {
        const [templates, skills] = await Promise.all([
          ctx.loaders.templatesByFragmentId.load(p.id as string),
          ctx.loaders.skillsByFragmentId.load(p.id as string),
        ]);
        return [
          ...templates.map((t) => ({ id: t.id, key: t.key, type: "agent_template" })),
          ...skills.map((s) => ({ id: s.id, key: s.key, type: "skill" })),
        ];
      },
      source: (p: Row, _a: unknown, ctx: GraphQLContext) => sourceLoc(p, ctx),
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
      direction: (s: Row) => upperEnum(s.direction),
      from: (s: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load((s.from as { id: string }).id),
      to: (s: Row, _a: unknown, ctx: GraphQLContext) =>
        ctx.loaders.conceptById.load((s.to as { id: string }).id),
    },

    RetrievalExclusion: {
      // Service already redacts denied identity; blank refs ("") mean the
      // caller can't see this chunk — surface null so clients render the
      // exclusion as redacted rather than linking a dead ref (spec/09).
      chunk: (p: Row) => {
        const c = p.chunk as { id?: string; key?: string } | null;
        if (!c || (!c.id && !c.key)) return null;
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

    RetrievalDiagnostics: {
      // Error-severity gate-evaluation diagnostics (SDL `errors`) are
      // collected internally under `diagnosticsErrors`.
      errors: (p: Row) =>
        ((p.diagnosticsErrors as Diagnostic[] | undefined) ?? []).map((d) => ({
          code: d.code,
          message: d.message,
          details: d.details ?? null,
        })),
    },

    AgentAssemblyDiagnostics: {
      errors: (p: Row) =>
        ((p.diagnosticsErrors as Diagnostic[] | undefined) ?? []).map((d) => ({
          code: d.code,
          message: d.message,
          details: d.details ?? null,
        })),
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
      requirement: (p: Row) => upperEnum(p.requirement),
      status: (p: Row) => upperEnum(p.status),
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
