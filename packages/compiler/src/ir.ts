import type { Diagnostic } from "@grounding/core";
import { deriveId, hashObject, normalizeForLexical, SourceErrorCode } from "@grounding/core";
import type { EntityKind, KnowledgeDocument, LoadResult, SourceEntity } from "@grounding/source";
import { EntityIndex } from "@grounding/source";
import { SQL, sql } from "drizzle-orm";

/**
 * Compiler IR (spec/07): validated entities resolved to IDs, with
 * deterministic derived IDs, per-entity hashes, dependency edges, and
 * materializable row groups. Rows may embed drizzle `sql` fragments
 * (PostgreSQL-authoritative `unaccent()` for lexical columns, spec/13).
 */

export type DepKind = "reference" | "semantic" | "search" | "structural" | "validation";

/** Child rows owned by a parent entity: wiped+re-inserted on parent upsert. */
export type ChildRows = {
  table: ChildTable;
  /** FK column on the child table referencing the parent's id. */
  parentColumn: string;
  rows: Record<string, unknown>[];
};

export type ChildTable =
  | "concept_aliases"
  | "concept_domains"
  | "dimension_values"
  | "dimension_value_closure"
  | "chunk_concepts"
  | "template_prompt_fragments"
  | "skill_concepts"
  | "skill_tools"
  | "skill_prompt_fragments"
  | "prompt_fragment_concepts"
  | "tool_concepts";

export type EntityTable =
  | "namespaces"
  | "domains"
  | "concepts"
  | "relation_types"
  | "concept_relations"
  | "knowledge_sources"
  | "knowledge_items"
  | "knowledge_chunks"
  | "selection_groups"
  | "dimension_definitions"
  | "retrieval_profiles"
  | "agent_templates"
  | "prompt_fragments"
  | "skills"
  | "tools"
  | "tool_dependencies";

/** Insert order honoring foreign keys (deletes run in reverse). */
export const TABLE_ORDER: Record<EntityTable, number> = {
  namespaces: 0,
  retrieval_profiles: 1,
  knowledge_sources: 1,
  domains: 2,
  relation_types: 2,
  selection_groups: 2,
  concepts: 3,
  concept_relations: 4,
  dimension_definitions: 5,
  knowledge_items: 6,
  knowledge_chunks: 7,
  prompt_fragments: 8,
  tools: 9,
  skills: 10,
  agent_templates: 11,
  tool_dependencies: 12,
};

export type CompiledEntity = {
  /** Stable entity UUID (authored or derived). */
  id: string;
  kind: EntityKind | "knowledge-chunk" | "knowledge-source" | "dimension-value" | "tool-dependency";
  table: EntityTable;
  /** Primary row for `table` (drizzle insert/update values). */
  row: Record<string, unknown>;
  children: ChildRows[];
  sourcePath: string;
  /** Hash of the normalized authored file containing this entity. */
  sourceHash: string;
  /** Hash of the fully resolved row group (IDs, not keys). */
  compiledHash: string;
  semanticHash?: string | undefined;
  /** Semantic text used for embedding — needed to write semantic_entities. */
  semanticText?: string | undefined;
  lexicalHash?: string | undefined;
  deps: { target: string; kind: DepKind }[];
};

export type CompileResult = {
  entities: CompiledEntity[];
  /** File path → normalized source hash, for the manifest. */
  fileHashes: Map<string, string>;
  diagnostics: Diagnostic[];
  namespaceId: string | null;
  /** sha256 over sorted (path, hash) pairs — deployment/runtime provenance. */
  sourceHash: string;
};

/* ------------------------------------------------------------------ */
/* Semantic + lexical text (spec/13, normative)                         */
/* ------------------------------------------------------------------ */

export function conceptSemanticText(d: Record<string, unknown>): string {
  const parts = [d.name, ...strArr(d.aliases), d.description]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0);
  return parts.join("\n");
}

export function chunkSemanticText(
  itemTitle: string,
  headingPath: string[],
  content: string,
): string {
  const head = headingPath.filter((h) => h.length > 0).join(" > ");
  return [itemTitle, head, content].filter((s) => s.length > 0).join("\n");
}

export function authoredSemanticText(d: Record<string, unknown>): string | undefined {
  const t = d.semanticText;
  if (typeof t !== "string") return undefined;
  const n = t.replace(/\r\n?/g, "\n").trim();
  return n.length > 0 ? n : undefined;
}

const strArr = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

const asObj = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Lexical fields hashed with the FTS config name — config changes invalidate. */
function lexicalHash(ftsConfig: string, fields: Record<string, unknown>): string {
  return hashObject({ ftsConfig, fields });
}

/** PostgreSQL `unaccent(pre_normalized)` expression for a lexical column. */
function unaccentExpr(preNormalized: string) {
  return sql`unaccent(${preNormalized})`;
}

function dateOrNull(v: unknown): Date | null {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* ------------------------------------------------------------------ */
/* Compile                                                             */
/* ------------------------------------------------------------------ */

export function compileTree(loaded: LoadResult): CompileResult {
  const diagnostics: Diagnostic[] = [];
  const entities: CompiledEntity[] = [];
  const fileHashes = new Map<string, string>();
  const index = new EntityIndex();
  for (const e of loaded.entities) index.add(e);

  const knowledgeByPath = new Map<string, KnowledgeDocument>();
  for (const kd of loaded.knowledge) knowledgeByPath.set(kd.entity.path, kd);

  // Per-file sourceHash: canonicalized parsed content (path-independent, so
  // renames don't churn hashes).
  const fileHash = (e: SourceEntity): string => {
    const existing = fileHashes.get(e.path);
    if (existing) return existing;
    // loaded.bodies covers every markdown file (knowledge + prompt
    // fragments) — a body-only edit must change the file's sourceHash too.
    const body = loaded.bodies.get(e.path);
    const h = body !== undefined ? hashObject({ frontmatter: e.data, body }) : hashObject(e.data);
    fileHashes.set(e.path, h);
    return h;
  };

  const ref = (owner: SourceEntity, value: unknown, kind: EntityKind): string | null => {
    if (typeof value !== "string") return null;
    const { entity } = index.resolve(value, kind);
    if (!entity) {
      // Should be unreachable — validation precedes compile — but stay
      // defensive rather than emit a wrong row.
      diagnostics.push({
        severity: "error",
        code: SourceErrorCode.REFERENCE_NOT_FOUND,
        message: `unresolved ${kind} reference "${value}"`,
        location: { path: owner.path },
      });
      return null;
    }
    return entity.id ?? null;
  };

  const refDeps = (
    owner: SourceEntity,
    out: { target: string; kind: DepKind }[],
    value: unknown,
    kind: EntityKind,
  ): string | null => {
    const id = ref(owner, value, kind);
    if (id) out.push({ target: id, kind: "reference" });
    return id;
  };

  const nsEntity = loaded.entities.find((e) => e.kind === "namespace");
  const namespaceId = nsEntity?.id ?? null;
  if (!nsEntity || !namespaceId) {
    diagnostics.push({
      severity: "error",
      code: SourceErrorCode.MISSING_REQUIRED_FIELD,
      message: "namespace.jsonc is required and must carry a stable id",
      location: { path: "namespace.jsonc" },
    });
    return { entities, fileHashes, diagnostics, namespaceId: null, sourceHash: "" };
  }

  const emit = (e: CompiledEntity) => entities.push(e);

  for (const e of loaded.entities) {
    const d = e.data;
    const src = fileHash(e);
    const id = e.id ?? "";

    switch (e.kind) {
      case "config":
        break; // deployment-time input; not a runtime row
      case "namespace": {
        const deps: CompiledEntity["deps"] = [];
        const profileId = refDeps(e, deps, d.defaultRetrievalProfile, "retrieval-profile");
        emit({
          id,
          kind: e.kind,
          table: "namespaces",
          row: {
            id,
            key: d.key,
            name: d.name,
            description: d.description ?? null,
            defaultRetrievalProfileId: profileId,
            metadata: asObj(d.metadata),
          },
          children: [],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps,
        });
        break;
      }
      case "domain":
        emit({
          id,
          kind: e.kind,
          table: "domains",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            description: d.description ?? null,
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps: [],
        });
        break;
      case "concept": {
        const deps: CompiledEntity["deps"] = [];
        const domainIds = strArr(d.domains)
          .map((v) => refDeps(e, deps, v, "domain"))
          .filter((x): x is string => x !== null);
        const aliases = strArr(d.aliases);
        const semanticText = conceptSemanticText(d);
        const semanticHash = hashObject({ t: semanticText });
        emit({
          id,
          kind: e.kind,
          table: "concepts",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            normalizedKey: unaccentExpr(normalizeForLexical(String(d.key))),
            name: d.name,
            normalizedName: unaccentExpr(normalizeForLexical(String(d.name))),
            conceptType: d.type ?? null,
            description: d.description ?? null,
            status: d.status ?? "published",
            sourcePath: e.path,
            semanticHash,
            metadata: asObj(d.metadata),
          },
          children: [
            {
              table: "concept_aliases",
              parentColumn: "conceptId",
              rows: aliases.map((alias) => ({
                id: deriveId(namespaceId, "concept_alias", id, alias),
                namespaceId: namespaceId,
                conceptId: id,
                alias,
                normalizedAlias: unaccentExpr(normalizeForLexical(alias)),
                sourcePath: e.path,
              })),
            },
            {
              table: "concept_domains",
              parentColumn: "conceptId",
              rows: domainIds.map((domainId) => ({
                namespaceId: namespaceId,
                conceptId: id,
                domainId,
              })),
            },
          ],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          semanticHash,
          semanticText,
          deps,
        });
        break;
      }
      case "relation-type":
        emit({
          id,
          kind: e.kind,
          table: "relation_types",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            description: d.description ?? null,
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps: [],
        });
        break;
      case "relation": {
        const deps: CompiledEntity["deps"] = [];
        emit({
          id,
          kind: e.kind,
          table: "concept_relations",
          row: {
            id,
            namespaceId: namespaceId,
            sourceConceptId: refDeps(e, deps, d.source, "concept"),
            relationTypeId: refDeps(e, deps, d.type, "relation-type"),
            targetConceptId: refDeps(e, deps, d.target, "concept"),
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps,
        });
        break;
      }
      case "dimension": {
        const values = Array.isArray(d.values) ? (d.values as Record<string, unknown>[]) : [];
        const valueId = (key: string) => deriveId(namespaceId, "dimension_value", id, key);
        // Parents before children — the self-FK on parent_value_id is
        // checked row-by-row inside the multi-row insert.
        const ordered = orderValues(values);
        const valueRows = ordered.map((v) => ({
          id: valueId(String(v.key)),
          namespaceId: namespaceId,
          dimensionId: id,
          key: v.key,
          name: v.name ?? null,
          parentValueId: typeof v.parent === "string" ? valueId(v.parent) : null,
          sortOrder: typeof v.sortOrder === "number" ? v.sortOrder : null,
          sourcePath: e.path,
          compiledHash: hashObject(v),
          metadata: asObj(v.metadata),
        }));
        const closure = computeClosure(values, valueId).map((c) => ({
          namespaceId: namespaceId,
          dimensionId: id,
          ancestorValueId: c.ancestor,
          descendantValueId: c.descendant,
          depth: c.depth,
        }));
        emit({
          id,
          kind: e.kind,
          table: "dimension_definitions",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            description: d.description ?? null,
            valueType: d.valueType,
            cardinality: d.cardinality ?? "single",
            category: d.category,
            allowedOperators: strArr(d.allowedOperators),
            hierarchical: d.hierarchical === true,
            required: d.required === true,
            missingValueBehavior: d.missingValueBehavior ?? "no_match",
            trust: d.trust ?? "request",
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [
            { table: "dimension_values", parentColumn: "dimensionId", rows: valueRows },
            {
              table: "dimension_value_closure",
              parentColumn: "dimensionId",
              rows: closure,
            },
          ],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps: [],
        });
        break;
      }
      case "selection-group":
        emit({
          id,
          kind: e.kind,
          table: "selection_groups",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name ?? null,
            entityType: d.entityType,
            mode: d.mode ?? "highest_priority",
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps: [],
        });
        break;
      case "retrieval-profile": {
        const { id: _i, key: _k, name: _n, metadata: _m, ...config } = d;
        emit({
          id,
          kind: e.kind,
          table: "retrieval_profiles",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name ?? null,
            config,
            sourcePath: e.path,
          },
          children: [],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps: [],
        });
        break;
      }
      case "knowledge-item": {
        compileKnowledgeItem(
          e,
          namespaceId,
          knowledgeByPath.get(e.path),
          src,
          emit,
          refDeps,
          index,
        );
        break;
      }
      case "agent-template": {
        const deps: CompiledEntity["deps"] = [];
        const fragmentIds = strArr(d.promptFragments)
          .map((v) => refDeps(e, deps, v, "prompt-fragment"))
          .filter((x): x is string => x !== null);
        const budgets = asObj(d.budgets);
        emit({
          id,
          kind: e.kind,
          table: "agent_templates",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            description: d.description ?? null,
            status: d.status ?? "published",
            retrievalProfileId: refDeps(e, deps, d.retrievalProfile, "retrieval-profile"),
            maxSkills: numOrNull(budgets.maxSkills),
            maxTools: numOrNull(budgets.maxTools),
            promptTokenBudget: numOrNull(budgets.promptTokenBudget),
            bootstrapKnowledgeTokenBudget: numOrNull(budgets.bootstrapKnowledgeTokenBudget),
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [
            {
              table: "template_prompt_fragments",
              parentColumn: "templateId",
              rows: fragmentIds.map((promptFragmentId, i) => ({
                namespaceId: namespaceId,
                templateId: id,
                promptFragmentId,
                ordinal: i,
              })),
            },
          ],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          deps,
        });
        break;
      }
      case "prompt-fragment": {
        const deps: CompiledEntity["deps"] = [];
        const conceptIds = strArr(d.concepts)
          .map((v) => refDeps(e, deps, v, "concept"))
          .filter((x): x is string => x !== null);
        const fragmentSemanticText = authoredSemanticText(d);
        const fragmentSemanticHash = fragmentSemanticText
          ? hashObject({ t: fragmentSemanticText })
          : undefined;
        emit({
          id,
          kind: e.kind,
          table: "prompt_fragments",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            status: d.status ?? "published",
            inclusionMode: d.inclusion,
            section: d.section,
            orderHint: numOrNull(d.order) ?? 0,
            content: loaded.bodies.get(e.path) ?? "",
            selectionGroupId: refDeps(e, deps, d.selectionGroup, "selection-group"),
            priority: numOrNull(d.priority) ?? 0,
            authorizationExpression: d.authorization ?? null,
            applicabilityExpression: d.applicability ?? null,
            sourcePath: e.path,
            semanticHash: fragmentSemanticHash ?? null,
            metadata: asObj(d.metadata),
          },
          children: [
            {
              table: "prompt_fragment_concepts",
              parentColumn: "promptFragmentId",
              rows: conceptIds.map((conceptId) => ({
                namespaceId: namespaceId,
                promptFragmentId: id,
                conceptId,
              })),
            },
          ],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          semanticHash: fragmentSemanticHash,
          semanticText: fragmentSemanticText,
          deps,
        });
        break;
      }
      case "skill": {
        const deps: CompiledEntity["deps"] = [];
        const conceptIds = strArr(d.concepts)
          .map((v) => refDeps(e, deps, v, "concept"))
          .filter((x): x is string => x !== null);
        const toolIds = strArr(d.tools)
          .map((v) => refDeps(e, deps, v, "tool"))
          .filter((x): x is string => x !== null);
        const fragmentIds = strArr(d.promptFragments)
          .map((v) => refDeps(e, deps, v, "prompt-fragment"))
          .filter((x): x is string => x !== null);
        const authoredSemantic = authoredSemanticText(d);
        const semanticText = authoredSemantic ?? "";
        const semanticHash = hashObject({ t: semanticText });
        emit({
          id,
          kind: e.kind,
          table: "skills",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            description: d.description ?? null,
            status: d.status ?? "published",
            selectionGroupId: refDeps(e, deps, d.selectionGroup, "selection-group"),
            priority: numOrNull(d.priority) ?? 0,
            authorizationExpression: d.authorization ?? null,
            applicabilityExpression: d.applicability ?? null,
            semanticText,
            semanticHash,
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [
            {
              table: "skill_concepts",
              parentColumn: "skillId",
              rows: conceptIds.map((conceptId) => ({
                namespaceId: namespaceId,
                skillId: id,
                conceptId,
              })),
            },
            {
              table: "skill_tools",
              parentColumn: "skillId",
              rows: toolIds.map((toolId) => ({
                namespaceId: namespaceId,
                skillId: id,
                toolId,
              })),
            },
            {
              table: "skill_prompt_fragments",
              parentColumn: "skillId",
              rows: fragmentIds.map((promptFragmentId, i) => ({
                namespaceId: namespaceId,
                skillId: id,
                promptFragmentId,
                ordinal: i,
              })),
            },
          ],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          // entity-level semanticHash marks semantic indexability: absent
          // authored semanticText → no semantic_entities row.
          semanticHash: authoredSemantic ? semanticHash : undefined,
          semanticText: authoredSemantic,
          deps,
        });
        break;
      }
      case "tool": {
        const deps: CompiledEntity["deps"] = [];
        const conceptIds = strArr(d.concepts)
          .map((v) => refDeps(e, deps, v, "concept"))
          .filter((x): x is string => x !== null);
        const authoredSemantic = authoredSemanticText(d);
        const semanticText = authoredSemantic ?? "";
        const semanticHash = hashObject({ t: semanticText });
        emit({
          id,
          kind: e.kind,
          table: "tools",
          row: {
            id,
            namespaceId: namespaceId,
            key: d.key,
            name: d.name,
            description: d.description,
            status: d.status ?? "published",
            runtimeBinding: d.runtimeBinding,
            risk: d.risk ?? null,
            latency: d.latency ?? null,
            selectionGroupId: refDeps(e, deps, d.selectionGroup, "selection-group"),
            priority: numOrNull(d.priority) ?? 0,
            authorizationExpression: d.authorization ?? null,
            applicabilityExpression: d.applicability ?? null,
            semanticText,
            semanticHash,
            inputSchema: d.inputSchema ?? null,
            outputSchema: d.outputSchema ?? null,
            sourcePath: e.path,
            metadata: asObj(d.metadata),
          },
          children: [
            {
              table: "tool_concepts",
              parentColumn: "toolId",
              rows: conceptIds.map((conceptId) => ({
                namespaceId: namespaceId,
                toolId: id,
                conceptId,
              })),
            },
          ],
          sourcePath: e.path,
          sourceHash: src,
          compiledHash: "",
          semanticHash: authoredSemantic ? semanticHash : undefined,
          semanticText: authoredSemantic,
          deps,
        });
        // Tool dependencies are first-class derived entities (FK restrict on
        // target requires both tools to exist first).
        const depList = Array.isArray(d.dependencies)
          ? (d.dependencies as Record<string, unknown>[])
          : [];
        for (const dep of depList) {
          const targetId = refDeps(e, deps, dep.tool, "tool");
          if (!targetId) continue;
          emit({
            id: deriveId(namespaceId, "tool_dependency", id, targetId),
            kind: "tool-dependency",
            table: "tool_dependencies",
            row: {
              id: deriveId(namespaceId, "tool_dependency", id, targetId),
              namespaceId: namespaceId,
              sourceToolId: id,
              targetToolId: targetId,
              requirement: dep.requirement ?? "required",
              sourcePath: e.path,
            },
            children: [],
            sourcePath: e.path,
            sourceHash: src,
            compiledHash: "",
            deps: [
              { target: id, kind: "structural" },
              { target: targetId, kind: "reference" },
            ],
          });
        }
        break;
      }
      case "retrieval-eval":
      case "assembly-eval":
        break; // evals are validation-time artifacts, not runtime rows
      default:
        break;
    }
  }

  // Fill compiledHash now that rows are complete (hash covers resolved IDs,
  // so a key→different-entity change rewrites the entity while a pure rename
  // does not). SQL fragments (unaccent) hash to a marker — their inputs are
  // already covered by the sibling raw columns.
  for (const e of entities) {
    e.compiledHash = hashObject(
      sanitizeForHash({ row: e.row, children: e.children.map((c) => c.rows) }),
    );
    if (HAS_COMPILED_HASH.has(e.table)) e.row.compiledHash = e.compiledHash;
  }

  const sourceHash = hashObject([...fileHashes.entries()].sort(([a], [b]) => a.localeCompare(b)));

  return { entities, fileHashes, diagnostics, namespaceId, sourceHash };
}

/** Entity tables carrying a NOT NULL compiled_hash column. */
const HAS_COMPILED_HASH = new Set<EntityTable>([
  "domains",
  "concepts",
  "relation_types",
  "concept_relations",
  "knowledge_items",
  "knowledge_chunks",
  "selection_groups",
  "dimension_definitions",
  "retrieval_profiles",
  "agent_templates",
  "prompt_fragments",
  "skills",
  "tools",
]);

/** Replace drizzle SQL fragments with a stable marker for hashing. */
function sanitizeForHash(v: unknown): unknown {
  if (v instanceof SQL) return "$sql$";
  if (Array.isArray(v)) return v.map(sanitizeForHash);
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      out[k] = sanitizeForHash(x);
    }
    return out;
  }
  return v;
}

const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);

/** Topologically order dimension values so parents precede children. */
function orderValues(values: Record<string, unknown>[]): Record<string, unknown>[] {
  const byKey = new Map(values.map((v) => [String(v.key ?? ""), v]));
  const out: Record<string, unknown>[] = [];
  const done = new Set<string>();
  const visit = (v: Record<string, unknown>, stack: Set<string>) => {
    const key = String(v.key ?? "");
    if (done.has(key) || stack.has(key)) return;
    stack.add(key);
    const parent = typeof v.parent === "string" ? byKey.get(v.parent) : undefined;
    if (parent) visit(parent, stack);
    stack.delete(key);
    done.add(key);
    out.push(v);
  };
  for (const v of values) visit(v, new Set());
  return out;
}

/** Transitive closure incl. self-rows at depth 0. */
function computeClosure(
  values: Record<string, unknown>[],
  valueId: (key: string) => string,
): { ancestor: string; descendant: string; depth: number }[] {
  const parentOf = new Map<string, string>();
  for (const v of values) {
    if (typeof v.parent === "string") parentOf.set(String(v.key), v.parent);
  }
  const rows: { ancestor: string; descendant: string; depth: number }[] = [];
  for (const v of values) {
    const key = String(v.key);
    rows.push({ ancestor: valueId(key), descendant: valueId(key), depth: 0 });
    let cur = parentOf.get(key);
    let depth = 1;
    const seen = new Set([key]);
    while (cur !== undefined) {
      if (seen.has(cur)) break; // cycles are validation errors; stay defensive
      seen.add(cur);
      rows.push({ ancestor: valueId(cur), descendant: valueId(key), depth });
      cur = parentOf.get(cur);
      depth++;
    }
  }
  return rows;
}

/** Knowledge item → item row + derived source + chunk entities. */
function compileKnowledgeItem(
  e: SourceEntity,
  namespaceId: string,
  kd: KnowledgeDocument | undefined,
  src: string,
  emit: (c: CompiledEntity) => void,
  refDeps: (
    o: SourceEntity,
    out: { target: string; kind: DepKind }[],
    v: unknown,
    k: EntityKind,
  ) => string | null,
  index: EntityIndex,
): void {
  const d = e.data;
  const deps: CompiledEntity["deps"] = [];
  const id = e.id ?? "";

  let sourceId: string | null = null;
  const source = asObj(d.source);
  if (Object.keys(source).length > 0) {
    sourceId =
      typeof source.key === "string"
        ? deriveId(namespaceId, "knowledge_source", source.key)
        : deriveId(namespaceId, "knowledge_source", id);
    emit({
      id: sourceId,
      kind: "knowledge-source",
      table: "knowledge_sources",
      row: {
        id: sourceId,
        namespaceId: namespaceId,
        key: source.key ?? null,
        title: source.title,
        uri: source.uri ?? null,
        sourceType: source.type ?? null,
        checksum: source.checksum ?? null,
        metadata: asObj(source.metadata),
      },
      children: [],
      sourcePath: e.path,
      sourceHash: src,
      compiledHash: "",
      deps: [],
    });
  }

  const selectionGroupId = refDeps(e, deps, d.selectionGroup, "selection-group");
  const conceptIds = strArr(d.concepts)
    .map((v) => refDeps(e, deps, v, "concept"))
    .filter((x): x is string => x !== null);
  // search_text weight C carries concept *names* (spec/13) — a concept
  // rename must change the chunk's lexical representation.
  const conceptNames = strArr(d.concepts)
    .map((v) => index.resolve(v, "concept").entity?.data.name)
    .filter((x): x is string => typeof x === "string");

  emit({
    id,
    kind: e.kind,
    table: "knowledge_items",
    row: {
      id,
      namespaceId: namespaceId,
      key: d.key,
      title: d.title,
      normalizedTitle: unaccentExpr(normalizeForLexical(String(d.title))),
      summary: d.summary ?? null,
      status: d.status ?? "published",
      authorityScore: numOrNull(d.authorityScore),
      effectiveFrom: dateOrNull(d.effectiveFrom),
      effectiveTo: dateOrNull(d.effectiveTo),
      sourceId,
      sourcePath: e.path,
      metadata: asObj(d.metadata),
    },
    children: [],
    sourcePath: e.path,
    sourceHash: src,
    compiledHash: "",
    deps,
  });

  if (!kd) return;
  const title = String(d.title ?? "");
  const flatByKey = new Map(kd.flat.map((s) => [s.key, s]));
  for (const [ordinal, chunk] of kd.chunks.entries()) {
    const chunkId = deriveId(namespaceId, "knowledge_chunk", id, chunk.key);
    const sec = flatByKey.get(chunk.sectionKey);
    const headingPath = sec?.path ?? [];
    const semanticText = chunkSemanticText(title, headingPath, chunk.content);
    const semanticHash = hashObject({ t: semanticText });
    const heading = sec?.heading ?? null;
    // search_vector composition (spec/13, normative): item title + heading
    // path at weight A, chunk content at B, linked concept names at C —
    // all through the shared grounding_english config.
    const weightAText = [title, ...headingPath].filter((s) => s.length > 0).join(" ");
    const weightCText = conceptNames.join(" ");
    const chunkLexicalHash = lexicalHash("grounding_english", {
      a: weightAText,
      b: chunk.content,
      c: weightCText,
    });
    const chunkDeps: CompiledEntity["deps"] = [
      { target: id, kind: "structural" },
      // Concept names feed search_text (weight C) → search deps.
      ...conceptIds.map((t): { target: string; kind: DepKind } => ({
        target: t,
        kind: "search",
      })),
    ];
    emit({
      id: chunkId,
      kind: "knowledge-chunk",
      table: "knowledge_chunks",
      row: {
        id: chunkId,
        namespaceId: namespaceId,
        knowledgeItemId: id,
        chunkKey: chunk.key,
        ordinal,
        heading,
        normalizedHeading: heading !== null ? unaccentExpr(normalizeForLexical(heading)) : null,
        content: chunk.content,
        status: d.status ?? "published",
        priority: numOrNull(d.priority) ?? 0,
        authorityScore: numOrNull(d.authorityScore),
        effectiveFrom: dateOrNull(d.effectiveFrom),
        effectiveTo: dateOrNull(d.effectiveTo),
        selectionGroupId,
        authorizationExpression: d.authorization ?? null,
        applicabilityExpression: d.applicability ?? null,
        searchText: [weightAText, chunk.content, weightCText]
          .filter((s) => s.length > 0)
          .join("\n"),
        searchVector: sql`setweight(to_tsvector('grounding_english', ${weightAText}), 'A')
          || setweight(to_tsvector('grounding_english', ${chunk.content}), 'B')
          || setweight(to_tsvector('grounding_english', ${weightCText}), 'C')`,
        contentHash: hashObject({ t: chunk.content }),
        sourcePath: e.path,
        semanticHash,
        lexicalHash: chunkLexicalHash,
        metadata: {},
      },
      children: [
        {
          table: "chunk_concepts",
          parentColumn: "chunkId",
          rows: conceptIds.map((conceptId) => ({
            namespaceId: namespaceId,
            chunkId,
            conceptId,
          })),
        },
      ],
      sourcePath: e.path,
      sourceHash: src,
      compiledHash: "",
      semanticHash,
      semanticText,
      lexicalHash: chunkLexicalHash,
      deps: chunkDeps,
    });
  }
}
