import type { Diagnostic, DiagnosticCode } from "@grounding/core";
import { normalizeForLexical, SourceErrorCode, WarningCode } from "@grounding/core";
import type { SourceEntity, SourceTree } from "./tree.ts";
import { EntityIndex } from "./tree.ts";

/**
 * Deterministic semantic validation (spec/07): reference resolution,
 * expression/operator/cardinality checks, enum values, hierarchy cycles,
 * authorization safety, tool dependency cycles, selection-group typing,
 * lifecycle dependencies, chunk-key collisions, eval fixtures.
 */

export type ValidateOptions = {
  /** Promote warnings to errors (--strict). */
  strict?: boolean;
};

export type ValidateResult = {
  diagnostics: Diagnostic[];
  /** Number of error-severity diagnostics (after --strict promotion). */
  errors: number;
  warnings: number;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** dimension key → parsed dimension descriptor for expression checks. */
type DimensionInfo = {
  key: string;
  valueType: string;
  cardinality: string;
  category: string;
  allowedOperators: Set<string>;
  hierarchical: boolean;
  missingValueBehavior: string | null;
  valueKeys: Set<string>;
  entity: SourceEntity;
};

const MULTI_OPS = new Set(["includes", "includes_all", "includes_any"]);
const SINGLE_ONLY_OPS = new Set([
  "equals",
  "not_equals",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
]);
const ORDER_OPS = new Set(["gt", "gte", "lt", "lte", "between"]);
const ARRAY_OPS = new Set(["includes_all", "includes_any", "in", "not_in"]);
const NO_VALUE_OPS = new Set(["exists", "not_exists"]);

export function validateTree(tree: SourceTree, options: ValidateOptions = {}): ValidateResult {
  const diagnostics: Diagnostic[] = [...tree.diagnostics];
  const index = new EntityIndex();
  for (const e of tree.entities) index.add(e);
  diagnostics.push(...index.diagnostics);

  const emit = (
    severity: "error" | "warning",
    code: DiagnosticCode,
    message: string,
    path: string,
    pointer = "",
    details?: Record<string, unknown>,
    suggestion?: string,
  ) => {
    const d: Diagnostic = {
      severity,
      code,
      message,
      location: { path, pointer: pointer || undefined },
    };
    if (details !== undefined) d.details = details;
    if (suggestion !== undefined) d.suggestion = suggestion;
    diagnostics.push(d);
  };

  const dims = buildDimensionIndex(tree.entities, diagnostics);
  validateDimensionHierarchies(tree.entities, diagnostics);

  const ref = (
    owner: SourceEntity,
    field: string,
    value: unknown,
    expectedKind: SourceEntity["kind"],
    pointer: string,
  ): SourceEntity | undefined => {
    if (typeof value !== "string") return undefined;
    const { entity, typeMismatch } = index.resolve(value, expectedKind);
    if (typeMismatch) {
      emit(
        "error",
        SourceErrorCode.REFERENCE_TYPE_MISMATCH,
        `${field} "${value}" resolves to the wrong entity type (expected ${expectedKind})`,
        owner.path,
        pointer,
        { value },
      );
      return undefined;
    }
    if (!entity) {
      emit(
        "error",
        SourceErrorCode.REFERENCE_NOT_FOUND,
        `${field} "${value}" does not resolve to a ${expectedKind}`,
        owner.path,
        pointer,
        { value },
        suggestKey(value, index.keysOf(expectedKind)),
      );
      return undefined;
    }
    return entity;
  };

  const strArr = strArray;

  // --- per-entity reference + expression validation ----------------------
  for (const e of tree.entities) {
    const d = e.data;
    switch (e.kind) {
      case "namespace": {
        if (typeof d.defaultRetrievalProfile === "string") {
          ref(
            e,
            "defaultRetrievalProfile",
            d.defaultRetrievalProfile,
            "retrieval-profile",
            "/defaultRetrievalProfile",
          );
        }
        break;
      }
      case "concept": {
        for (const [i, v] of strArr(d.domains).entries()) {
          ref(e, "domains", v, "domain", `/domains/${i}`);
        }
        break;
      }
      case "relation": {
        ref(e, "source", d.source, "concept", "/source");
        ref(e, "type", d.type, "relation-type", "/type");
        ref(e, "target", d.target, "concept", "/target");
        break;
      }
      case "retrieval-profile": {
        const graph = (d.graph ?? {}) as Record<string, unknown>;
        for (const [i, v] of strArr(graph.relationTypes).entries()) {
          ref(e, "graph.relationTypes", v, "relation-type", `/graph/relationTypes/${i}`);
        }
        break;
      }
      case "knowledge-item":
      case "skill":
      case "tool":
      case "prompt-fragment": {
        for (const [i, v] of strArr(d.concepts).entries()) {
          ref(e, "concepts", v, "concept", `/concepts/${i}`);
        }
        validateSelectionGroup(e, index, emit);
        if (d.authorization !== undefined) {
          validateExpression(d.authorization, dims, e, "/authorization", true, emit);
        }
        if (d.applicability !== undefined) {
          validateExpression(d.applicability, dims, e, "/applicability", false, emit);
        }
        break;
      }
      case "agent-template": {
        for (const [i, v] of strArr(d.promptFragments).entries()) {
          ref(e, "promptFragments", v, "prompt-fragment", `/promptFragments/${i}`);
        }
        if (typeof d.retrievalProfile === "string") {
          ref(e, "retrievalProfile", d.retrievalProfile, "retrieval-profile", "/retrievalProfile");
        }
        break;
      }
      default:
        break;
    }

    // Kind-specific extras
    if (e.kind === "skill") {
      for (const [i, v] of strArr(d.promptFragments).entries()) {
        ref(e, "promptFragments", v, "prompt-fragment", `/promptFragments/${i}`);
      }
      for (const [i, v] of strArr(d.tools).entries()) {
        ref(e, "tools", v, "tool", `/tools/${i}`);
      }
    }
    if (e.kind === "tool") {
      const deps = Array.isArray(d.dependencies)
        ? (d.dependencies as Record<string, unknown>[])
        : [];
      deps.forEach((dep, i) => {
        const target = ref(e, "dependencies[].tool", dep.tool, "tool", `/dependencies/${i}/tool`);
        if (target && target === e) {
          emit(
            "error",
            SourceErrorCode.TOOL_SELF_DEPENDENCY,
            `tool "${e.key ?? e.id}" depends on itself`,
            e.path,
            `/dependencies/${i}`,
          );
        }
      });
    }
  }

  validateToolDependencyCycles(tree.entities, index, emit);
  validateLifecycleDependencies(tree.entities, index, emit);
  validateConceptNameCollisions(tree.entities, emit);
  validateEvals(tree, index, emit);
  validateKnowledgeChunkRefs(tree, emit);

  const promoted = options.strict
    ? diagnostics.map((dg) =>
        dg.severity === "warning" ? { ...dg, severity: "error" as const } : dg,
      )
    : diagnostics;
  const errors = promoted.filter((dg) => dg.severity === "error").length;
  return { diagnostics: promoted, errors, warnings: promoted.length - errors };
}

/* ------------------------------- dimensions ---------------------------- */

function buildDimensionIndex(
  entities: SourceEntity[],
  diagnostics: Diagnostic[],
): Map<string, DimensionInfo> {
  const dims = new Map<string, DimensionInfo>();
  for (const e of entities) {
    if (e.kind !== "dimension") continue;
    const d = e.data;
    const info: DimensionInfo = {
      key: String(d.key ?? ""),
      valueType: String(d.valueType ?? ""),
      cardinality: String(d.cardinality ?? "single"),
      category: String(d.category ?? ""),
      allowedOperators: new Set(strArray(d.allowedOperators)),
      hierarchical: d.hierarchical === true,
      missingValueBehavior:
        typeof d.missingValueBehavior === "string" ? d.missingValueBehavior : null,
      valueKeys: new Set(),
      entity: e,
    };
    const values = Array.isArray(d.values) ? (d.values as Record<string, unknown>[]) : [];
    // spec/12: `values`/`hierarchical` are only meaningful on enum dimensions.
    if (info.valueType !== "enum" && values.length > 0) {
      diagnostics.push({
        severity: "error",
        code: SourceErrorCode.SCHEMA_VALIDATION_FAILED,
        message: `dimension "${info.key}" declares values but valueType is "${info.valueType}" (only enum dimensions have values)`,
        location: { path: e.path, pointer: "/values" },
      });
    }
    if (info.hierarchical && info.valueType !== "enum") {
      diagnostics.push({
        severity: "error",
        code: SourceErrorCode.SCHEMA_VALIDATION_FAILED,
        message: `dimension "${info.key}" is hierarchical but valueType is "${info.valueType}" (hierarchies are only defined over enum values)`,
        location: { path: e.path, pointer: "/hierarchical" },
      });
    }
    for (const v of values) {
      const key = typeof v.key === "string" ? v.key : "";
      if (key && info.valueKeys.has(key)) {
        diagnostics.push({
          severity: "error",
          code: SourceErrorCode.DUPLICATE_KEY,
          message: `duplicate enum value key "${key}" in dimension "${info.key}"`,
          location: { path: e.path },
        });
      }
      info.valueKeys.add(key);
    }
    dims.set(info.key, info);
  }
  return dims;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

/** Levenshtein distance (deterministic suggestion support, spec/07). */
function editDistance(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0] ?? 0;
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = prev[j] ?? 0;
      prev[j] = Math.min(
        (prev[j] ?? 0) + 1,
        (prev[j - 1] ?? 0) + 1,
        last + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      last = cur;
    }
  }
  return prev[b.length] ?? 0;
}

/**
 * Deterministic suggestion for an unresolved key reference (spec/07):
 * the closest registered key of the same kind by edit distance,
 * ties broken lexicographically (candidates arrive sorted). Returns a
 * suggestion string only when the match is plausibly a typo.
 */
function suggestKey(value: string, candidates: string[]): string | undefined {
  if (candidates.length === 0) return undefined;
  let best = candidates[0] ?? "";
  let bestDist = editDistance(value, best);
  for (const c of candidates.slice(1)) {
    const dist = editDistance(value, c);
    if (dist < bestDist) {
      best = c;
      bestDist = dist;
    }
  }
  const threshold = Math.max(2, Math.floor(value.length / 3));
  return bestDist <= threshold ? `did you mean "${best}"?` : undefined;
}

/** dimension.values[].parent cycles → HIERARCHY_CYCLE (spec/07, spec/12). */
function validateDimensionHierarchies(entities: SourceEntity[], diagnostics: Diagnostic[]): void {
  for (const e of entities) {
    if (e.kind !== "dimension") continue;
    const values = Array.isArray(e.data.values) ? (e.data.values as Record<string, unknown>[]) : [];
    const parentOf = new Map<string, string>();
    const keys = new Set<string>();
    for (const v of values) {
      if (typeof v.key === "string") keys.add(v.key);
    }
    for (const v of values) {
      const key = typeof v.key === "string" ? v.key : null;
      const parent = typeof v.parent === "string" ? v.parent : null;
      if (!key || !parent) continue;
      if (!keys.has(parent)) {
        diagnostics.push({
          severity: "error",
          code: SourceErrorCode.REFERENCE_NOT_FOUND,
          message: `dimension value "${key}" references unknown parent "${parent}"`,
          location: { path: e.path },
        });
        continue;
      }
      parentOf.set(key, parent);
    }
    // Cycle walk
    for (const start of parentOf.keys()) {
      const seen = new Set<string>([start]);
      let cur = parentOf.get(start);
      while (cur !== undefined) {
        if (seen.has(cur)) {
          diagnostics.push({
            severity: "error",
            code: SourceErrorCode.HIERARCHY_CYCLE,
            message: `dimension "${e.data.key}" hierarchy contains a cycle via "${cur}"`,
            location: { path: e.path },
          });
          break;
        }
        seen.add(cur);
        cur = parentOf.get(cur);
      }
    }
  }
}

/* ------------------------------- expressions --------------------------- */

type Emit = (
  severity: "error" | "warning",
  code: DiagnosticCode,
  message: string,
  path: string,
  pointer?: string,
  details?: Record<string, unknown>,
) => void;

const BOOLEAN_KEYS = new Set(["allOf", "anyOf", "noneOf"]);

function validateExpression(
  expr: unknown,
  dims: Map<string, DimensionInfo>,
  owner: SourceEntity,
  pointer: string,
  authorization: boolean,
  emit: Emit,
): void {
  if (typeof expr !== "object" || expr === null || Array.isArray(expr)) {
    emit(
      "error",
      SourceErrorCode.INVALID_EXPRESSION,
      "expression must be an object",
      owner.path,
      pointer,
    );
    return;
  }
  const keys = Object.keys(expr as Record<string, unknown>);
  if (keys.length === 0) return; // {} is the canonical TRUE expression

  for (const boolKey of BOOLEAN_KEYS) {
    const child = (expr as Record<string, unknown>)[boolKey];
    if (child === undefined) continue;
    if (!Array.isArray(child) || child.length === 0) {
      emit(
        "error",
        SourceErrorCode.INVALID_EXPRESSION,
        `${boolKey} must contain at least one expression`,
        owner.path,
        `${pointer}/${boolKey}`,
      );
      continue;
    }
    for (const [i, sub] of child.entries()) {
      validateExpression(sub, dims, owner, `${pointer}/${boolKey}/${i}`, authorization, emit);
    }
  }

  const leaf = expr as Record<string, unknown>;
  if (leaf.dimension === undefined && leaf.operator === undefined) {
    if (!keys.some((k) => BOOLEAN_KEYS.has(k))) {
      emit(
        "error",
        SourceErrorCode.INVALID_EXPRESSION,
        "expression node is neither a boolean group nor a leaf",
        owner.path,
        pointer,
      );
    }
    return;
  }

  const dimKey = String(leaf.dimension);
  const dim = dims.get(dimKey);
  if (!dim) {
    emit(
      "error",
      SourceErrorCode.UNKNOWN_DIMENSION,
      `unknown dimension "${dimKey}"`,
      owner.path,
      pointer,
    );
    return;
  }
  const operator = String(leaf.operator);

  if (!dim.allowedOperators.has(operator)) {
    emit(
      "error",
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      `operator "${operator}" is not in allowedOperators for dimension "${dimKey}"`,
      owner.path,
      pointer,
    );
  }
  if (dim.cardinality === "multi" && SINGLE_ONLY_OPS.has(operator)) {
    emit(
      "error",
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      `operator "${operator}" is invalid on multi-cardinality dimension "${dimKey}"`,
      owner.path,
      pointer,
    );
  }
  if (dim.cardinality === "single" && MULTI_OPS.has(operator)) {
    emit(
      "error",
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      `operator "${operator}" requires a multi-cardinality dimension ("${dimKey}" is single)`,
      owner.path,
      pointer,
    );
  }
  if (ORDER_OPS.has(operator) && dim.valueType !== "number" && dim.valueType !== "date") {
    emit(
      "error",
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      `operator "${operator}" requires a number/date dimension ("${dimKey}" is ${dim.valueType})`,
      owner.path,
      pointer,
    );
  }

  const hasValue = leaf.value !== undefined;
  if (NO_VALUE_OPS.has(operator)) {
    if (hasValue) {
      emit(
        "error",
        SourceErrorCode.INVALID_EXPRESSION,
        `operator "${operator}" must not carry a value`,
        owner.path,
        `${pointer}/value`,
      );
    }
  } else if (!hasValue || leaf.value === null) {
    emit(
      "error",
      SourceErrorCode.INVALID_EXPRESSION,
      `operator "${operator}" requires a non-null value`,
      owner.path,
      `${pointer}/value`,
    );
  }

  if (hasValue) {
    validateRuleValue(leaf.value, operator, dim, owner, `${pointer}/value`, emit);
  }

  if (authorization) {
    if (dim.missingValueBehavior === "ignore") {
      emit(
        "error",
        SourceErrorCode.UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR,
        `authorization expression references "${dimKey}" which has missingValueBehavior "ignore"`,
        owner.path,
        pointer,
      );
    }
    if (dim.category === "descriptive" || dim.category === "ranking") {
      emit(
        "warning",
        WarningCode.SUSPICIOUS_DIMENSION_CATEGORY_USAGE,
        `dimension "${dimKey}" has category "${dim.category}" but is used in authorization`,
        owner.path,
        pointer,
      );
    }
  }
}

function validateRuleValue(
  value: unknown,
  operator: string,
  dim: DimensionInfo,
  owner: SourceEntity,
  pointer: string,
  emit: Emit,
): void {
  if (operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      emit(
        "error",
        SourceErrorCode.INVALID_EXPRESSION,
        `between requires exactly [lower, upper]`,
        owner.path,
        pointer,
      );
      return;
    }
    const [lo, hi] = value;
    validateScalar(lo, dim, owner, `${pointer}/0`, emit);
    validateScalar(hi, dim, owner, `${pointer}/1`, emit);
    if (compareScalars(lo, hi, dim.valueType) > 0) {
      emit(
        "error",
        SourceErrorCode.INVALID_EXPRESSION,
        `between lower bound exceeds upper bound`,
        owner.path,
        pointer,
      );
    }
    return;
  }
  if (ARRAY_OPS.has(operator)) {
    if (!Array.isArray(value) || value.length === 0) {
      emit(
        "error",
        SourceErrorCode.INVALID_EXPRESSION,
        `operator "${operator}" requires a non-empty array`,
        owner.path,
        pointer,
      );
      return;
    }
    for (const [i, v] of value.entries()) {
      validateScalar(v, dim, owner, `${pointer}/${i}`, emit);
    }
    return;
  }
  if (Array.isArray(value) || (typeof value === "object" && value !== null)) {
    emit(
      "error",
      SourceErrorCode.INVALID_EXPRESSION,
      `operator "${operator}" requires a scalar value`,
      owner.path,
      pointer,
    );
    return;
  }
  validateScalar(value, dim, owner, pointer, emit);
}

function validateScalar(
  value: unknown,
  dim: DimensionInfo,
  owner: SourceEntity,
  pointer: string,
  emit: Emit,
): void {
  switch (dim.valueType) {
    case "string":
      if (typeof value !== "string") invalidType(value, dim, owner, pointer, emit);
      break;
    case "number":
      if (typeof value !== "number") invalidType(value, dim, owner, pointer, emit);
      break;
    case "boolean":
      if (typeof value !== "boolean") invalidType(value, dim, owner, pointer, emit);
      break;
    case "date":
      if (
        typeof value !== "string" ||
        !ISO_DATE.test(value) ||
        Number.isNaN(Date.parse(`${value}T00:00:00Z`))
      ) {
        invalidType(value, dim, owner, pointer, emit, "expected YYYY-MM-DD");
      }
      break;
    case "enum":
      if (typeof value !== "string" || !dim.valueKeys.has(value)) {
        emit(
          "error",
          SourceErrorCode.DIMENSION_VALUE_NOT_FOUND,
          `value ${JSON.stringify(value)} is not a registered value of dimension "${dim.key}"`,
          owner.path,
          pointer,
        );
      }
      break;
    default:
      break;
  }
}

function invalidType(
  value: unknown,
  dim: DimensionInfo,
  owner: SourceEntity,
  pointer: string,
  emit: Emit,
  extra = "",
): void {
  emit(
    "error",
    SourceErrorCode.INVALID_FIELD_TYPE,
    `value ${JSON.stringify(value)} does not match dimension "${dim.key}" valueType ${dim.valueType} ${extra}`.trim(),
    owner.path,
    pointer,
  );
}

function compareScalars(a: unknown, b: unknown, valueType: string): number {
  if (valueType === "number") return (a as number) - (b as number);
  return String(a).localeCompare(String(b)); // ISO dates order lexically
}

/* ------------------------- selection groups ---------------------------- */

const MEMBER_ENTITY_TYPE: Record<string, string> = {
  "knowledge-item": "knowledge_chunk",
  "prompt-fragment": "prompt_fragment",
  skill: "skill",
  tool: "tool",
};

function validateSelectionGroup(e: SourceEntity, index: EntityIndex, emit: Emit): void {
  const sg = e.data.selectionGroup;
  if (typeof sg !== "string") return;
  const { entity: group, typeMismatch } = index.resolve(sg, "selection-group");
  if (typeMismatch || !group) {
    emit(
      "error",
      typeMismatch ? SourceErrorCode.REFERENCE_TYPE_MISMATCH : SourceErrorCode.REFERENCE_NOT_FOUND,
      `selectionGroup "${sg}" does not resolve to a selection-group`,
      e.path,
      "/selectionGroup",
    );
    return;
  }
  const memberType = MEMBER_ENTITY_TYPE[e.kind];
  const groupType = group.data.entityType;
  if (memberType && groupType !== memberType) {
    emit(
      "error",
      SourceErrorCode.SELECTION_GROUP_TYPE_MISMATCH,
      `${e.kind} "${e.key ?? e.id}" joins group "${group.key}" whose entityType is "${String(groupType)}" (needs ${memberType})`,
      e.path,
      "/selectionGroup",
    );
  }
}

/* -------------------------- tool dependency graph ---------------------- */

function toolEdges(
  entities: SourceEntity[],
  index: EntityIndex,
): Map<SourceEntity, { target: SourceEntity; requirement: string }[]> {
  const edges = new Map<SourceEntity, { target: SourceEntity; requirement: string }[]>();
  const tools = entities.filter((e) => e.kind === "tool");
  const toolSet = new Set(tools);
  for (const tool of tools) {
    const deps = Array.isArray(tool.data.dependencies)
      ? (tool.data.dependencies as Record<string, unknown>[])
      : [];
    const list: { target: SourceEntity; requirement: string }[] = [];
    for (const dep of deps) {
      if (typeof dep.tool !== "string") continue;
      const { entity: target } = index.resolve(dep.tool, "tool");
      if (target && toolSet.has(target)) {
        list.push({
          target,
          requirement: dep.requirement === "required" ? "required" : "optional",
        });
      }
    }
    edges.set(tool, list);
  }
  return edges;
}

/** Every required/optional dependency participates in cycle detection (spec/06). */
function validateToolDependencyCycles(
  entities: SourceEntity[],
  index: EntityIndex,
  emit: Emit,
): void {
  const edges = toolEdges(entities, index);
  const color = new Map<SourceEntity, "gray" | "black">();
  const stack: SourceEntity[] = [];

  const dfs = (node: SourceEntity) => {
    color.set(node, "gray");
    stack.push(node);
    for (const { target } of edges.get(node) ?? []) {
      const c = color.get(target);
      if (c === "gray") {
        const cyclePath = [...stack.slice(stack.indexOf(target)), target]
          .map((t) => t.key ?? t.id)
          .join(" -> ");
        emit(
          "error",
          SourceErrorCode.TOOL_DEPENDENCY_CYCLE,
          `tool dependency cycle: ${cyclePath}`,
          node.path,
        );
      } else if (c === undefined) {
        dfs(target);
      }
    }
    stack.pop();
    color.set(node, "black");
  };

  for (const node of edges.keys()) {
    if (!color.has(node)) dfs(node);
  }
}

/* --------------------------- lifecycle deps ---------------------------- */

const PUBLISHED = "published";

/** spec/06: published Agent Assembly entities may not require non-published deps. */
function validateLifecycleDependencies(
  entities: SourceEntity[],
  index: EntityIndex,
  emit: Emit,
): void {
  const requirePublished = (
    owner: SourceEntity,
    target: SourceEntity | undefined,
    field: string,
  ) => {
    if (owner.data.status === PUBLISHED && target && target.data.status !== PUBLISHED) {
      emit(
        "error",
        SourceErrorCode.INVALID_LIFECYCLE_DEPENDENCY,
        `published ${owner.kind} "${owner.key ?? owner.id}" requires ${field} "${target.key ?? target.id}" which is ${String(target.data.status ?? "unpublished")}`,
        owner.path,
      );
    }
  };

  for (const e of entities) {
    if (e.kind === "agent-template") {
      for (const v of strArray(e.data.promptFragments)) {
        requirePublished(e, index.resolve(v, "prompt-fragment").entity, "promptFragment");
      }
    } else if (e.kind === "skill") {
      for (const v of strArray(e.data.promptFragments)) {
        requirePublished(e, index.resolve(v, "prompt-fragment").entity, "promptFragment");
      }
      for (const v of strArray(e.data.tools)) {
        requirePublished(e, index.resolve(v, "tool").entity, "tool");
      }
    } else if (e.kind === "tool") {
      const deps = Array.isArray(e.data.dependencies)
        ? (e.data.dependencies as Record<string, unknown>[])
        : [];
      for (const dep of deps) {
        if (dep.requirement === "required" && typeof dep.tool === "string") {
          requirePublished(e, index.resolve(dep.tool, "tool").entity, "required tool dependency");
        }
      }
    }
  }
}

/* ----------------------- concept name/alias collisions ----------------- */

function validateConceptNameCollisions(entities: SourceEntity[], emit: Emit): void {
  const seen = new Map<string, SourceEntity>();
  for (const e of entities) {
    if (e.kind !== "concept") continue;
    const terms = [e.data.name, ...(Array.isArray(e.data.aliases) ? e.data.aliases : [])];
    for (const term of terms) {
      if (typeof term !== "string" || term.length === 0) continue;
      const normalized = normalizeForLexical(term);
      const prior = seen.get(normalized);
      if (prior && prior !== e) {
        emit(
          "warning",
          WarningCode.AMBIGUOUS_EXACT_LEXICAL_MATCH,
          `concept "${e.key}" shares normalized name/alias "${normalized}" with "${prior.key}"`,
          e.path,
        );
      } else if (!prior) {
        seen.set(normalized, e);
      }
    }
  }
}

/* -------------------------------- evals -------------------------------- */

function validateEvals(tree: SourceTree, index: EntityIndex, emit: Emit): void {
  const chunkKeys = new Map<string, Set<string>>();
  for (const kd of tree.knowledge) {
    if (kd.entity.key) chunkKeys.set(kd.entity.key, new Set(kd.chunks.map((c) => c.key)));
  }
  const chunkRef = (owner: SourceEntity, value: string, field: string) => {
    const hash = value.indexOf("#");
    if (hash === -1) return; // schema pattern already rejected
    const itemKey = value.slice(0, hash);
    const chunkKey = value.slice(hash + 1);
    const { entity: item } = index.resolve(itemKey, "knowledge-item");
    if (!item) {
      emit(
        "error",
        SourceErrorCode.REFERENCE_NOT_FOUND,
        `${field} "${value}": no knowledge item "${itemKey}"`,
        owner.path,
      );
      return;
    }
    const keys = chunkKeys.get(item.key ?? itemKey);
    if (keys && !keys.has(chunkKey)) {
      emit(
        "error",
        SourceErrorCode.REFERENCE_NOT_FOUND,
        `${field} "${value}": no chunk "${chunkKey}" in item "${itemKey}"`,
        owner.path,
      );
    }
  };

  for (const e of tree.entities) {
    if (e.kind === "retrieval-eval") {
      const d = e.data;
      if (typeof d.profile === "string")
        refEval(e, "profile", d.profile, "retrieval-profile", index, emit);
      const expect = (d.expect ?? {}) as Record<string, unknown>;
      for (const v of strArray(expect.resolvedConcepts)) {
        refEval(e, "expect.resolvedConcepts", v, "concept", index, emit);
      }
      for (const field of ["includeChunks", "excludeChunks"]) {
        for (const v of strArray(expect[field])) chunkRef(e, v, `expect.${field}`);
      }
      for (const [i, entry] of (Array.isArray(expect.topK) ? expect.topK : []).entries()) {
        const chunk = (entry as Record<string, unknown>).chunk;
        if (typeof chunk === "string") chunkRef(e, chunk, `expect.topK[${i}]`);
      }
      for (const [i, pair] of (Array.isArray(expect.outranks) ? expect.outranks : []).entries()) {
        for (const v of Array.isArray(pair) ? pair : []) {
          if (typeof v === "string") chunkRef(e, v, `expect.outranks[${i}]`);
        }
      }
    } else if (e.kind === "assembly-eval") {
      const d = e.data;
      refEval(e, "template", d.template, "agent-template", index, emit);
      if (typeof d.retrievalProfile === "string") {
        refEval(e, "retrievalProfile", d.retrievalProfile, "retrieval-profile", index, emit);
      }
      const expect = (d.expect ?? {}) as Record<string, unknown>;
      for (const v of strArray(expect.skills)) refEval(e, "expect.skills", v, "skill", index, emit);
      for (const v of strArray(expect.excludeSkills))
        refEval(e, "expect.excludeSkills", v, "skill", index, emit);
      for (const v of strArray(expect.tools)) refEval(e, "expect.tools", v, "tool", index, emit);
      for (const v of strArray(expect.excludeTools))
        refEval(e, "expect.excludeTools", v, "tool", index, emit);
      for (const v of strArray(expect.promptFragments))
        refEval(e, "expect.promptFragments", v, "prompt-fragment", index, emit);
      for (const v of strArray(expect.excludePromptFragments))
        refEval(e, "expect.excludePromptFragments", v, "prompt-fragment", index, emit);
    }
  }
}

function refEval(
  owner: SourceEntity,
  field: string,
  value: unknown,
  kind: SourceEntity["kind"],
  index: EntityIndex,
  emit: Emit,
): void {
  if (typeof value !== "string") return;
  const { entity, typeMismatch } = index.resolve(value, kind);
  if (typeMismatch) {
    emit(
      "error",
      SourceErrorCode.REFERENCE_TYPE_MISMATCH,
      `${field} "${value}" resolves to the wrong type (expected ${kind})`,
      owner.path,
    );
  } else if (!entity) {
    emit(
      "error",
      SourceErrorCode.REFERENCE_NOT_FOUND,
      `${field} "${value}" does not resolve to a ${kind}`,
      owner.path,
    );
  }
}

/** Chunk-key collisions across derived chunks of one item (belt & braces). */
function validateKnowledgeChunkRefs(tree: SourceTree, emit: Emit): void {
  for (const kd of tree.knowledge) {
    const seen = new Map<string, number>();
    for (const c of kd.chunks) {
      const n = (seen.get(c.key) ?? 0) + 1;
      seen.set(c.key, n);
      if (n > 1) {
        emit(
          "error",
          SourceErrorCode.DUPLICATE_DERIVED_CHUNK_KEY,
          `derived chunk key "${c.key}" occurs ${n} times in "${kd.entity.key ?? kd.entity.path}"`,
          kd.entity.path,
        );
      }
    }
  }
}
