import type { CompiledEntity, EntityTable } from "./ir.ts";
import { TABLE_ORDER } from "./ir.ts";
import { COMPILER_VERSION, type Manifest, SCHEMA_VERSION } from "./manifest.ts";

/**
 * Materialization plan (spec/07): typed row ops, not SQL strings.
 * Diffing compiled entities against the manifest produces the minimal
 * upsert/delete set; a missing or version-stale manifest yields a full plan.
 */
export type MaterializationPlan = {
  namespaceId: string;
  /** Upserts in FK-safe order. */
  upserts: CompiledEntity[];
  /** Entity ids to delete, deepest-first. */
  deletes: { id: string; table: EntityTable }[];
  /** True when the prior manifest is absent or version-mismatched. */
  full: boolean;
};

export function planMaterialization(
  namespaceId: string,
  entities: CompiledEntity[],
  manifest: Manifest | null,
  current: { embeddingDimensions: number | null } = { embeddingDimensions: null },
): MaterializationPlan {
  const stale =
    manifest === null ||
    manifest.version !== 1 ||
    manifest.namespaceId !== namespaceId ||
    manifest.compilerVersion !== COMPILER_VERSION ||
    manifest.schemaVersion !== SCHEMA_VERSION ||
    manifest.embeddingDimensions !== current.embeddingDimensions;

  const previous = stale ? {} : manifest.entities;
  const nextIds = new Set(entities.map((e) => e.id));

  // compiledHash covers resolved content; lexicalHash covers the lexical
  // surface (FTS config + search composition) which sanitizeForHash erases
  // from the row — a lexical-only change must still upsert (spec/13:158).
  const upserts = stale
    ? [...entities]
    : entities.filter(
        (e) =>
          previous[e.id]?.compiledHash !== e.compiledHash ||
          previous[e.id]?.lexicalHash !== e.lexicalHash,
      );

  const deletes = Object.entries(previous)
    .filter(([id]) => !nextIds.has(id))
    .map(([id, e]) => ({ id, table: e.table as EntityTable }));

  const byOrder = (t: EntityTable) => TABLE_ORDER[t] ?? 99;
  upserts.sort((a, b) => byOrder(a.table) - byOrder(b.table) || a.id.localeCompare(b.id));
  deletes.sort((a, b) => byOrder(b.table) - byOrder(a.table) || b.id.localeCompare(a.id));

  return { namespaceId, upserts, deletes, full: stale };
}
