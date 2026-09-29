import {
  buildDimensionRegistry,
  type DimensionCardinality,
  type DimensionCategory,
  type DimensionRegistry,
  type DimensionTrust,
  type DimensionValueType,
  type MissingValueBehavior,
  type Operator,
} from "@grounding/core";
import { eq } from "drizzle-orm";
import type { Database } from "./client.ts";
import { dimensionDefinitions, dimensionValueClosure, dimensionValues } from "./schema.ts";

/**
 * Load a namespace's materialized dimension registry (spec/12 input).
 * Definitions + enum values + the transitive closure rows compiled at build
 * time — the rule engine never recomputes hierarchy.
 */
export async function loadDimensionRegistry(
  db: Database,
  namespaceId: string,
): Promise<DimensionRegistry> {
  const [dims, vals, closure] = await Promise.all([
    db.select().from(dimensionDefinitions).where(eq(dimensionDefinitions.namespaceId, namespaceId)),
    db.select().from(dimensionValues).where(eq(dimensionValues.namespaceId, namespaceId)),
    db
      .select()
      .from(dimensionValueClosure)
      .where(eq(dimensionValueClosure.namespaceId, namespaceId)),
  ]);
  return buildDimensionRegistry({
    dimensions: dims.map((d) => ({
      id: d.id,
      key: d.key,
      name: d.name,
      ...(d.description !== null ? { description: d.description } : {}),
      valueType: d.valueType as DimensionValueType,
      cardinality: d.cardinality as DimensionCardinality,
      category: d.category as DimensionCategory,
      allowedOperators: d.allowedOperators as Operator[],
      hierarchical: d.hierarchical,
      required: d.required,
      missingValueBehavior: d.missingValueBehavior as MissingValueBehavior,
      trust: d.trust as DimensionTrust,
    })),
    values: vals.map((v) => ({ dimensionId: v.dimensionId, id: v.id, key: v.key })),
    closure: closure.map((c) => ({
      dimensionId: c.dimensionId,
      ancestorValueId: c.ancestorValueId,
      descendantValueId: c.descendantValueId,
      depth: c.depth,
    })),
  });
}
