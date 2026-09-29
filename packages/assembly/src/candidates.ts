/**
 * Agent Assembly candidate queries — thin adapters over materialized rows.
 * Discovery channels: semantic (semantic_entities) and concept-linked
 * (concept join tables). Policy lives in the orchestrator.
 */

import type { Database } from "@grounding/db";
import { sql } from "drizzle-orm";
import type { FragmentRow, SkillRow, ToolRow } from "./types.ts";

export type DiscoveredCandidate = {
  entityId: string;
  /** cosine similarity for semantic hits; null for concept-linked. */
  score: number | null;
  /** 1-based rank within the semantic channel; null for concept-linked. */
  rank: number | null;
  conceptLinked: boolean;
};

export type SemanticEntityType = "skill" | "tool" | "prompt_fragment";

const CONCEPT_TABLE: Record<SemanticEntityType, { table: string; column: string }> = {
  skill: { table: "skill_concepts", column: "skill_id" },
  tool: { table: "tool_concepts", column: "tool_id" },
  prompt_fragment: { table: "prompt_fragment_concepts", column: "prompt_fragment_id" },
};

/** Semantic candidates over `semantic_entities`, ordered by vector distance. */
export async function semanticCandidates(
  db: Database,
  namespaceId: string,
  entityType: SemanticEntityType,
  vector: number[],
  limit: number,
): Promise<{ entityId: string; score: number }[]> {
  const rows = await db.execute(sql`
    select entity_id, 1 - (embedding <=> ${JSON.stringify(vector)}::vector) as score
    from semantic_entities
    where namespace_id = ${namespaceId} and entity_type = ${entityType}
    order by embedding <=> ${JSON.stringify(vector)}::vector asc, entity_id asc
    limit ${limit}
  `);
  return (rows.rows as { entity_id: string; score: string | number }[]).map((r) => ({
    entityId: r.entity_id,
    score: Number(r.score),
  }));
}

/** All entities concept-linked to any resolved task concept. */
export async function conceptLinkedIds(
  db: Database,
  namespaceId: string,
  entityType: SemanticEntityType,
  conceptIds: string[],
): Promise<string[]> {
  if (conceptIds.length === 0) return [];
  const t = CONCEPT_TABLE[entityType];
  const rows = await db.execute(sql`
    select ${sql.raw(t.column)} as entity_id from ${sql.raw(t.table)}
    where namespace_id = ${namespaceId} and concept_id in ${conceptIds}
    order by ${sql.raw(t.column)}
  `);
  return (rows.rows as { entity_id: string }[]).map((r) => r.entity_id);
}

export async function fetchSkills(
  db: Database,
  namespaceId: string,
  ids: string[],
): Promise<SkillRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.execute(sql`
    select id, namespace_id, key, name, description, status, selection_group_id,
           priority, authorization_expression, applicability_expression,
           semantic_text, semantic_hash, source_path, metadata
    from skills where namespace_id = ${namespaceId} and id in ${ids}
    order by id
  `);
  return (rows.rows as Record<string, unknown>[]).map(mapSkill);
}

export async function fetchTools(
  db: Database,
  namespaceId: string,
  ids: string[],
): Promise<ToolRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.execute(sql`
    select id, namespace_id, key, name, status, description, runtime_binding,
           risk, latency, selection_group_id, priority, authorization_expression,
           applicability_expression, semantic_text, semantic_hash, input_schema,
           output_schema, source_path, metadata
    from tools where namespace_id = ${namespaceId} and id in ${ids}
    order by id
  `);
  return (rows.rows as Record<string, unknown>[]).map(mapTool);
}

export async function fetchFragments(
  db: Database,
  namespaceId: string,
  ids: string[],
): Promise<FragmentRow[]> {
  if (ids.length === 0) return [];
  const rows = await db.execute(sql`
    select id, namespace_id, key, name, status, inclusion_mode, section,
           order_hint, content, selection_group_id, priority,
           authorization_expression, applicability_expression, source_path,
           semantic_hash, metadata
    from prompt_fragments where namespace_id = ${namespaceId} and id in ${ids}
    order by id
  `);
  return (rows.rows as Record<string, unknown>[]).map(mapFragment);
}

/** Template-listed fragments, in authored ordinal order. */
export async function templateFragments(
  db: Database,
  namespaceId: string,
  templateId: string,
): Promise<FragmentRow[]> {
  const rows = await db.execute(sql`
    select f.id, f.namespace_id, f.key, f.name, f.status, f.inclusion_mode,
           f.section, f.order_hint, f.content, f.selection_group_id, f.priority,
           f.authorization_expression, f.applicability_expression, f.source_path,
           f.semantic_hash, f.metadata
    from template_prompt_fragments t
    join prompt_fragments f on f.id = t.prompt_fragment_id and f.namespace_id = t.namespace_id
    where t.namespace_id = ${namespaceId} and t.template_id = ${templateId}
    order by t.ordinal
  `);
  return (rows.rows as Record<string, unknown>[]).map(mapFragment);
}

/** Fragments attached to selected skills: skillId -> fragments (ordinal order). */
export async function skillFragments(
  db: Database,
  namespaceId: string,
  skillIds: string[],
): Promise<Map<string, FragmentRow[]>> {
  const out = new Map<string, FragmentRow[]>();
  if (skillIds.length === 0) return out;
  const rows = await db.execute(sql`
    select t.skill_id, f.id, f.namespace_id, f.key, f.name, f.status,
           f.inclusion_mode, f.section, f.order_hint, f.content,
           f.selection_group_id, f.priority, f.authorization_expression,
           f.applicability_expression, f.source_path, f.semantic_hash, f.metadata
    from skill_prompt_fragments t
    join prompt_fragments f on f.id = t.prompt_fragment_id and f.namespace_id = t.namespace_id
    where t.namespace_id = ${namespaceId} and t.skill_id in ${skillIds}
    order by t.skill_id, t.ordinal
  `);
  for (const r of rows.rows as Record<string, unknown>[]) {
    const list = out.get(r.skill_id as string) ?? [];
    list.push(mapFragment(r));
    out.set(r.skill_id as string, list);
  }
  return out;
}

/** Concept ids attached to each skill: skillId -> conceptIds (spec/06). */
export async function skillConceptIds(
  db: Database,
  namespaceId: string,
  skillIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (skillIds.length === 0) return out;
  const rows = await db.execute(sql`
    select skill_id, concept_id from skill_concepts
    where namespace_id = ${namespaceId} and skill_id in ${skillIds}
    order by skill_id, concept_id
  `);
  for (const r of rows.rows as { skill_id: string; concept_id: string }[]) {
    const list = out.get(r.skill_id) ?? [];
    list.push(r.concept_id);
    out.set(r.skill_id, list);
  }
  return out;
}

/** Direct tool ids required by each skill (required in v1 per spec/06). */
export async function skillToolIds(
  db: Database,
  namespaceId: string,
  skillIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (skillIds.length === 0) return out;
  const rows = await db.execute(sql`
    select skill_id, tool_id from skill_tools
    where namespace_id = ${namespaceId} and skill_id in ${skillIds}
    order by skill_id, tool_id
  `);
  for (const r of rows.rows as { skill_id: string; tool_id: string }[]) {
    const list = out.get(r.skill_id) ?? [];
    list.push(r.tool_id);
    out.set(r.skill_id, list);
  }
  return out;
}

export type ToolEdge = {
  sourceToolId: string;
  targetToolId: string;
  requirement: "required" | "optional";
};

/** Dependency edges whose source is any of the given tools. */
export async function toolEdges(
  db: Database,
  namespaceId: string,
  sourceToolIds: string[],
): Promise<ToolEdge[]> {
  if (sourceToolIds.length === 0) return [];
  const rows = await db.execute(sql`
    select source_tool_id, target_tool_id, requirement from tool_dependencies
    where namespace_id = ${namespaceId} and source_tool_id in ${sourceToolIds}
    order by source_tool_id, target_tool_id
  `);
  return (
    rows.rows as { source_tool_id: string; target_tool_id: string; requirement: string }[]
  ).map((r) => ({
    sourceToolId: r.source_tool_id,
    targetToolId: r.target_tool_id,
    requirement: r.requirement === "optional" ? "optional" : "required",
  }));
}

/** Selection-group modes for the given group ids. */
export async function groupModes(
  db: Database,
  namespaceId: string,
  groupIds: string[],
): Promise<Map<string, "highest_priority" | "most_specific" | "all">> {
  const out = new Map<string, "highest_priority" | "most_specific" | "all">();
  if (groupIds.length === 0) return out;
  const rows = await db.execute(sql`
    select id, mode from selection_groups
    where namespace_id = ${namespaceId} and id in ${groupIds}
  `);
  for (const r of rows.rows as { id: string; mode: string }[]) {
    if (r.mode === "highest_priority" || r.mode === "most_specific" || r.mode === "all") {
      out.set(r.id, r.mode);
    }
  }
  return out;
}

function mapSkill(r: Record<string, unknown>): SkillRow {
  return {
    id: r.id as string,
    namespaceId: r.namespace_id as string,
    key: r.key as string,
    name: r.name as string,
    description: (r.description as string | null) ?? null,
    status: r.status as string,
    selectionGroupId: (r.selection_group_id as string | null) ?? null,
    priority: r.priority as number,
    authorizationExpression: r.authorization_expression ?? null,
    applicabilityExpression: r.applicability_expression ?? null,
    semanticText: r.semantic_text as string,
    semanticHash: r.semantic_hash as string,
    sourcePath: r.source_path as string,
    metadata: r.metadata ?? {},
  };
}

function mapTool(r: Record<string, unknown>): ToolRow {
  return {
    id: r.id as string,
    namespaceId: r.namespace_id as string,
    key: r.key as string,
    name: r.name as string,
    status: r.status as string,
    description: r.description as string,
    runtimeBinding: r.runtime_binding as string,
    risk: (r.risk as string | null) ?? null,
    latency: (r.latency as string | null) ?? null,
    selectionGroupId: (r.selection_group_id as string | null) ?? null,
    priority: r.priority as number,
    authorizationExpression: r.authorization_expression ?? null,
    applicabilityExpression: r.applicability_expression ?? null,
    semanticText: r.semantic_text as string,
    semanticHash: r.semantic_hash as string,
    inputSchema: r.input_schema ?? null,
    outputSchema: r.output_schema ?? null,
    sourcePath: r.source_path as string,
    metadata: r.metadata ?? {},
  };
}

function mapFragment(r: Record<string, unknown>): FragmentRow {
  return {
    id: r.id as string,
    namespaceId: r.namespace_id as string,
    key: r.key as string,
    name: r.name as string,
    status: r.status as string,
    inclusionMode: r.inclusion_mode as FragmentRow["inclusionMode"],
    section: r.section as string,
    orderHint: r.order_hint as number,
    content: r.content as string,
    selectionGroupId: (r.selection_group_id as string | null) ?? null,
    priority: r.priority as number,
    authorizationExpression: r.authorization_expression ?? null,
    applicabilityExpression: r.applicability_expression ?? null,
    sourcePath: r.source_path as string,
    semanticHash: (r.semantic_hash as string | null) ?? null,
    metadata: r.metadata ?? {},
  };
}
