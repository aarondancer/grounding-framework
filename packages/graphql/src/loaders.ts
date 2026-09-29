import type { Database } from "@grounding/db";
import { schema } from "@grounding/db";
import { and, eq, getTableColumns, inArray, or } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";

/**
 * Per-request batching (spec/09 "DataLoader/batching"). Each Loader collects
 * keys requested within one microtask flush and satisfies them with a single
 * `IN (...)` query; results memoize for the request's lifetime.
 *
 * Created per request — never shared across requests (no cross-tenant cache).
 */
class Loader<K, V> {
  private cache = new Map<K, Promise<V | null>>();
  private batch = new Map<K, { resolve: (v: V | null) => void; reject: (e: unknown) => void }[]>();
  private scheduled = false;

  constructor(
    private readonly loadMany: (keys: K[]) => Promise<V[]>,
    private readonly keyOf: (v: V) => K,
  ) {}

  load(key: K): Promise<V | null> {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const promise = new Promise<V | null>((resolve, reject) => {
      const pending = this.batch.get(key);
      if (pending) pending.push({ resolve, reject });
      else this.batch.set(key, [{ resolve, reject }]);
      if (!this.scheduled) {
        this.scheduled = true;
        queueMicrotask(() => void this.flush());
      }
    });
    this.cache.set(key, promise);
    return promise;
  }

  private async flush(): Promise<void> {
    this.scheduled = false;
    const batch = this.batch;
    this.batch = new Map();
    try {
      const rows = await this.loadMany([...batch.keys()]);
      const byKey = new Map<K, V>();
      for (const row of rows) byKey.set(this.keyOf(row), row);
      for (const [key, waiters] of batch) {
        for (const w of waiters) w.resolve(byKey.get(key) ?? null);
      }
    } catch (e) {
      for (const waiters of batch.values()) for (const w of waiters) w.reject(e);
    }
  }
}

/** Same batching contract for one-to-many relations (parent → children). */
class ListLoader<K, V> {
  private inner: Loader<K, { key: K; rows: V[] }>;

  constructor(loadMany: (keys: K[]) => Promise<V[]>, keyOf: (v: V) => K) {
    this.inner = new Loader(
      async (keys) => {
        const grouped = new Map<K, V[]>();
        for (const row of await loadMany(keys)) {
          const k = keyOf(row);
          const list = grouped.get(k);
          if (list) list.push(row);
          else grouped.set(k, [row]);
        }
        return [...grouped.entries()].map(([key, rows]) => ({ key, rows }));
      },
      (v) => v.key,
    );
  }

  load(key: K): Promise<V[]> {
    return this.inner.load(key).then((v) => v?.rows ?? []);
  }
}

/** Scoped entity keys are `${namespaceId}\0${key}` — null byte can't collide. */
export function scopedKey(namespaceId: string, key: string): string {
  return `${namespaceId}\0${key}`;
}

function splitScoped(scoped: string): [string, string] {
  const i = scoped.indexOf("\0");
  return [scoped.slice(0, i), scoped.slice(i + 1)];
}

/** Rows returned through a join loader carry their parent key. */
type ParentTagged<T> = T & { __parent: string };
const parentOf = <T>(r: ParentTagged<T>) => r.__parent;

type Select<T extends PgTable> = T["$inferSelect"];

export function createLoaders(db: Database) {
  function byId<T extends PgTable & { id: PgColumn }>(table: T) {
    return new Loader<string, Select<T>>(
      async (ids) => {
        const q = db.select().from(table as never);
        return (await q.where(inArray(table.id, ids))) as Select<T>[];
      },
      (r) => r.id as string,
    );
  }

  /** `key` column loader scoped to a namespace id. */
  function byKey<T extends PgTable & { namespaceId: PgColumn; key: PgColumn }>(table: T) {
    return new Loader<string, Select<T>>(
      async (keys) => {
        if (keys.length === 0) return [];
        const clauses = keys.map((k) => {
          const [ns, key] = splitScoped(k);
          return and(eq(table.namespaceId, ns), eq(table.key, key));
        });
        const q = db.select().from(table as never);
        return (await q.where(or(...clauses))) as Select<T>[];
      },
      (r) => scopedKey(r.namespaceId as string, r.key as string),
    );
  }

  function children<T extends PgTable>(
    table: T,
    parentCol: PgColumn,
  ): ListLoader<string, Select<T>> {
    // Selected rows carry JS property names; recover it from the column map.
    const prop = Object.entries(getTableColumns(table)).find(([, c]) => c === parentCol)?.[0];
    if (!prop) throw new Error(`column ${parentCol.name} not found on table`);
    return new ListLoader(
      async (ids) => {
        const q = db.select().from(table as never);
        return (await q.where(inArray(parentCol, ids))) as Select<T>[];
      },
      (r) => (r as Record<string, unknown>)[prop] as string,
    );
  }

  /**
   * Two-hop join loader: link table (parentCol, entityCol) → entity rows
   * tagged `__parent` for grouping. One batched query pair per flush.
   * `orderCol` (e.g. join-table ordinal) sorts each parent's children.
   */
  function joined<E extends PgTable & { id: PgColumn }>(
    link: PgTable,
    parentCol: PgColumn,
    entityCol: PgColumn,
    entity: E,
    orderCol?: PgColumn,
  ) {
    return new ListLoader<string, ParentTagged<Select<E>>>(async (parentIds) => {
      const lq = db
        .select({
          parent: parentCol,
          entity: entityCol,
          ...(orderCol ? { ord: orderCol } : {}),
        })
        .from(link as never);
      const links = (await lq.where(inArray(parentCol, parentIds))) as {
        parent: string;
        entity: string;
        ord?: number | null;
      }[];
      const entityIds = [...new Set(links.map((l) => l.entity))];
      if (entityIds.length === 0) return [];
      const eq2 = db.select().from(entity as never);
      const entities = (await eq2.where(inArray(entity.id, entityIds))) as Select<E>[];
      const byIdMap = new Map(entities.map((e) => [e.id as string, e]));
      return links
        .flatMap((l) => {
          const e = byIdMap.get(l.entity);
          return e ? [{ ...e, __parent: l.parent, __ord: l.ord ?? 0 }] : [];
        })
        .sort(
          (a, b) =>
            (a.__parent as string).localeCompare(b.__parent as string) ||
            (a.__ord as number) - (b.__ord as number),
        );
    }, parentOf);
  }

  return {
    namespacesById: byId(schema.namespaces),

    domainById: byId(schema.domains),
    domainByKey: byKey(schema.domains),

    conceptById: byId(schema.concepts),
    conceptByKey: byKey(schema.concepts),
    aliasesByConceptId: children(schema.conceptAliases, schema.conceptAliases.conceptId),
    domainsByConceptId: joined(
      schema.conceptDomains,
      schema.conceptDomains.conceptId,
      schema.conceptDomains.domainId,
      schema.domains,
    ),

    relationTypeById: byId(schema.relationTypes),
    relationTypeByKey: byKey(schema.relationTypes),
    relationsBySourceId: children(schema.conceptRelations, schema.conceptRelations.sourceConceptId),
    relationsByTargetId: children(schema.conceptRelations, schema.conceptRelations.targetConceptId),

    knowledgeItemById: byId(schema.knowledgeItems),
    knowledgeItemByKey: byKey(schema.knowledgeItems),
    knowledgeSourceById: byId(schema.knowledgeSources),
    chunkById: byId(schema.knowledgeChunks),
    conceptsByChunkId: joined(
      schema.chunkConcepts,
      schema.chunkConcepts.chunkId,
      schema.chunkConcepts.conceptId,
      schema.concepts,
    ),

    dimensionById: byId(schema.dimensionDefinitions),
    dimensionByKey: byKey(schema.dimensionDefinitions),
    dimensionValueById: byId(schema.dimensionValues),
    childrenByValueId: children(schema.dimensionValues, schema.dimensionValues.parentValueId),

    selectionGroupById: byId(schema.selectionGroups),
    selectionGroupByKey: byKey(schema.selectionGroups),
    chunksByGroupId: children(schema.knowledgeChunks, schema.knowledgeChunks.selectionGroupId),
    skillsByGroupId: children(schema.skills, schema.skills.selectionGroupId),
    toolsByGroupId: children(schema.tools, schema.tools.selectionGroupId),
    fragmentsByGroupId: children(schema.promptFragments, schema.promptFragments.selectionGroupId),

    retrievalProfileById: byId(schema.retrievalProfiles),
    retrievalProfileByKey: byKey(schema.retrievalProfiles),

    agentTemplateById: byId(schema.agentTemplates),
    agentTemplateByKey: byKey(schema.agentTemplates),
    fragmentsByTemplateId: joined(
      schema.templatePromptFragments,
      schema.templatePromptFragments.templateId,
      schema.templatePromptFragments.promptFragmentId,
      schema.promptFragments,
      schema.templatePromptFragments.ordinal,
    ),

    skillById: byId(schema.skills),
    skillByKey: byKey(schema.skills),
    fragmentsBySkillId: joined(
      schema.skillPromptFragments,
      schema.skillPromptFragments.skillId,
      schema.skillPromptFragments.promptFragmentId,
      schema.promptFragments,
      schema.skillPromptFragments.ordinal,
    ),
    conceptsBySkillId: joined(
      schema.skillConcepts,
      schema.skillConcepts.skillId,
      schema.skillConcepts.conceptId,
      schema.concepts,
    ),
    toolsBySkillId: joined(
      schema.skillTools,
      schema.skillTools.skillId,
      schema.skillTools.toolId,
      schema.tools,
    ),

    toolById: byId(schema.tools),
    toolByKey: byKey(schema.tools),
    conceptsByToolId: joined(
      schema.toolConcepts,
      schema.toolConcepts.toolId,
      schema.toolConcepts.conceptId,
      schema.concepts,
    ),
    depsBySourceToolId: children(schema.toolDependencies, schema.toolDependencies.sourceToolId),
    depsByTargetToolId: children(schema.toolDependencies, schema.toolDependencies.targetToolId),

    promptFragmentById: byId(schema.promptFragments),
    promptFragmentByKey: byKey(schema.promptFragments),
    conceptsByFragmentId: joined(
      schema.promptFragmentConcepts,
      schema.promptFragmentConcepts.promptFragmentId,
      schema.promptFragmentConcepts.conceptId,
      schema.concepts,
    ),
    // Backlink directions (spec/10 "used by"): link table keyed by the
    // *referenced* entity, resolving the referencing entity.
    templatesByFragmentId: joined(
      schema.templatePromptFragments,
      schema.templatePromptFragments.promptFragmentId,
      schema.templatePromptFragments.templateId,
      schema.agentTemplates,
    ),
    skillsByFragmentId: joined(
      schema.skillPromptFragments,
      schema.skillPromptFragments.promptFragmentId,
      schema.skillPromptFragments.skillId,
      schema.skills,
    ),
    skillsByToolId: joined(
      schema.skillTools,
      schema.skillTools.toolId,
      schema.skillTools.skillId,
      schema.skills,
    ),
  };
}

export type Loaders = ReturnType<typeof createLoaders>;
