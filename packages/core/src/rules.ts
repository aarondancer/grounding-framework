import { RuntimeErrorCode, SourceErrorCode } from "./codes.ts";
import {
  type DimensionRegistry,
  matchesValueType,
  type NormalizedContext,
  type RuntimeDimension,
} from "./context.ts";
import type { Diagnostic } from "./errors.ts";
import {
  COMPARISON_OPERATORS,
  type DimensionValueType,
  type Expression,
  type ExpressionLeaf,
  type Operator,
  POSITIVE_OPERATORS,
  PRESENCE_OPERATORS,
} from "./expressions.ts";

/**
 * Normative rule evaluation — spec/12.
 *
 * Four internal states TRUE/FALSE/UNKNOWN/SKIP; only final TRUE passes
 * eligibility. Authorization is a fail-closed hard gate; applicability is a
 * hard gate that also produces the specificity tuple for selection groups.
 */

export type QuadState = "true" | "false" | "unknown" | "skip";

/**
 * (positiveMatchedLeafCount, hierarchyDepthSum) — lexicographic.
 * Positive leaves are equals, includes, includes_all, includes_any, in, and
 * the comparison operators; presence, negative, and noneOf subtrees contribute zero.
 */
export type Specificity = readonly [number, number];

export const ZERO_SPECIFICITY: Specificity = [0, 0] as const;

export type EvalOutcome = {
  state: QuadState;
  specificity: Specificity;
  diagnostics: Diagnostic[];
};

const outcome = (state: QuadState, specificity: Specificity = ZERO_SPECIFICITY): EvalOutcome => ({
  state,
  specificity,
  diagnostics: [],
});

function evalError(
  message: string,
  code: Diagnostic["code"] = SourceErrorCode.INVALID_EXPRESSION,
  dimension?: string,
): EvalOutcome {
  return {
    state: "false",
    specificity: ZERO_SPECIFICITY,
    diagnostics: [
      {
        severity: "error",
        code,
        message,
        ...(dimension !== undefined ? { details: { dimension } } : {}),
      },
    ],
  };
}

function isLeaf(expr: Expression): expr is ExpressionLeaf {
  return typeof expr === "object" && expr !== null && "dimension" in expr && "operator" in expr;
}

/** Public entry: TRUE is the only eligible outcome. SKIP at the top collapses to TRUE. */
export function evaluateExpression(
  registry: DimensionRegistry,
  context: NormalizedContext,
  expression: Expression,
): EvalOutcome {
  const out = evalNode(registry, context, expression);
  return out.state === "skip" ? { ...out, state: "true" } : out;
}

export function isEligible(outcome: EvalOutcome): boolean {
  return outcome.state === "true";
}

/**
 * Authorization entry point: identical evaluator, but any evaluation error or
 * non-TRUE state fails closed and surfaces a diagnostic (spec/12).
 */
export function evaluateAuthorization(
  registry: DimensionRegistry,
  context: NormalizedContext,
  expression: Expression,
): { allowed: boolean; diagnostics: Diagnostic[] } {
  // spec/12 hard safety: an authorization expression must never reference a
  // dimension that skips on absence — SKIP could silently broaden access.
  // Build-time validation enforces this; the runtime seam re-checks.
  const ignored = leafDimensions(expression).filter(
    (k) => registry.get(k)?.missingValueBehavior === "ignore",
  );
  if (ignored.length > 0) {
    return {
      allowed: false,
      diagnostics: [
        {
          severity: "error",
          code: SourceErrorCode.UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR,
          message: `authorization expression references dimensions with missingValueBehavior "ignore": ${ignored.join(", ")}`,
          details: { dimensions: ignored },
        },
      ],
    };
  }
  const out = evaluateExpression(registry, context, expression);
  if (out.diagnostics.length > 0) {
    return {
      allowed: false,
      diagnostics: [
        {
          severity: "error",
          code: RuntimeErrorCode.AUTHORIZATION_EVALUATION_FAILED,
          message: "authorization expression could not be evaluated safely; failing closed",
          details: {
            causes: out.diagnostics.map((d) => ({ code: d.code, message: d.message })),
          },
        },
      ],
    };
  }
  return { allowed: out.state === "true", diagnostics: [] };
}

/**
 * Every `dimension` key referenced by an expression — walks only the
 * normative combinators (allOf/anyOf/noneOf). Used by authorization
 * pre-checks and by the API's dimension "used by" backlinks.
 */
export function leafDimensions(expr: Expression): string[] {
  if (expr === null || typeof expr !== "object") return [];
  if (isLeaf(expr)) return [expr.dimension];
  const out: string[] = [];
  for (const key of ["allOf", "anyOf", "noneOf"] as const) {
    const children = (expr as Record<string, unknown>)[key];
    if (Array.isArray(children)) {
      for (const c of children) out.push(...leafDimensions(c as Expression));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Boolean composition (spec/12 "After removing SKIP children")
// ---------------------------------------------------------------------------

function evalNode(
  registry: DimensionRegistry,
  context: NormalizedContext,
  expr: Expression,
): EvalOutcome {
  if (expr === null || typeof expr !== "object") {
    return evalError("expression must be an object");
  }
  if (isLeaf(expr)) return evalLeaf(registry, context, expr);
  for (const combinator of ["allOf", "anyOf", "noneOf"] as const) {
    const children = (expr as Record<string, unknown>)[combinator];
    if (Array.isArray(children)) {
      if (children.length === 0) {
        return evalError(`"${combinator}" requires at least one child expression`);
      }
      return evalBoolean(registry, context, combinator, children as Expression[]);
    }
  }
  if (Object.keys(expr).length === 0) return outcome("true"); // {} — canonical true
  return evalError("expression has no recognized combinator or leaf shape");
}

function evalBoolean(
  registry: DimensionRegistry,
  context: NormalizedContext,
  combinator: "allOf" | "anyOf" | "noneOf",
  children: Expression[],
): EvalOutcome {
  const diagnostics: Diagnostic[] = [];
  const outcomes = children.map((c) => {
    const o = evalNode(registry, context, c);
    diagnostics.push(...o.diagnostics);
    return o;
  });
  const live = outcomes.filter((o) => o.state !== "skip");
  const base = (): EvalOutcome => ({ state: "true", specificity: ZERO_SPECIFICITY, diagnostics });

  if (live.length === 0) return base(); // all skipped → TRUE
  const states = live.map((o) => o.state);

  switch (combinator) {
    case "allOf": {
      const state = states.includes("false")
        ? "false"
        : states.every((s) => s === "true")
          ? "true"
          : "unknown";
      // specificity = component-wise sum of successful children
      let spec = ZERO_SPECIFICITY;
      for (const o of live) {
        if (o.state === "true") {
          spec = [spec[0] + o.specificity[0], spec[1] + o.specificity[1]] as const;
        }
      }
      return { state, specificity: spec, diagnostics };
    }
    case "anyOf": {
      const state = states.includes("true")
        ? "true"
        : states.every((s) => s === "false")
          ? "false"
          : "unknown";
      // specificity = max tuple among successful branches
      let spec = ZERO_SPECIFICITY;
      for (const o of live) {
        if (o.state === "true" && compareSpecificity(o.specificity, spec) > 0) {
          spec = o.specificity;
        }
      }
      return { state, specificity: spec, diagnostics };
    }
    case "noneOf": {
      const state = states.includes("true")
        ? "false"
        : states.every((s) => s === "false")
          ? "true"
          : "unknown";
      return { state, specificity: ZERO_SPECIFICITY, diagnostics };
    }
  }
}

// ---------------------------------------------------------------------------
// Leaf evaluation
// ---------------------------------------------------------------------------

function evalLeaf(
  registry: DimensionRegistry,
  context: NormalizedContext,
  leaf: ExpressionLeaf,
): EvalOutcome {
  const dim = registry.get(leaf.dimension);
  if (!dim) {
    return evalError(
      `expression references undefined dimension "${leaf.dimension}"`,
      SourceErrorCode.UNKNOWN_DIMENSION,
      leaf.dimension,
    );
  }
  const operator = leaf.operator;
  if (!OPERATOR_SET.has(operator)) {
    return evalError(
      `unknown operator "${String(operator)}"`,
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      leaf.dimension,
    );
  }

  const present = context.has(dim.key);
  const isPresence = (PRESENCE_OPERATORS as readonly string[]).includes(operator);
  if (isPresence) {
    // spec/12: an authored `value` on exists/not_exists is invalid source.
    if (leaf.value !== undefined) {
      return evalError(
        `operator "${operator}" does not accept a value`,
        SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
        dim.key,
      );
    }
    return outcome(operator === "exists" ? booleanState(present) : booleanState(!present));
  }

  if (leaf.value === undefined || leaf.value === null) {
    return evalError(`operator "${operator}" requires a non-null value`, undefined, dim.key);
  }
  if (!dim.allowedOperators.includes(operator)) {
    return evalError(
      `operator "${operator}" is not allowed for dimension "${dim.key}"`,
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      dim.key,
    );
  }

  if (!present) {
    switch (dim.missingValueBehavior) {
      case "ignore":
        return outcome("skip");
      case "unknown":
        return outcome("unknown");
      case "no_match":
        return outcome("false");
    }
  }

  // Cardinality↔operator contract (spec/12): includes* are multi-only;
  // equals/in/comparisons are single-only; presence ops take either.
  const multiOnly =
    operator === "includes" || operator === "includes_all" || operator === "includes_any";
  const singleOnly = !multiOnly && !isPresence;
  if (dim.cardinality === "single" && multiOnly) {
    return evalError(
      `operator "${operator}" requires a multi-cardinality dimension`,
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      dim.key,
    );
  }
  if (dim.cardinality === "multi" && singleOnly) {
    return evalError(
      `operator "${operator}" requires a single-cardinality dimension`,
      SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
      dim.key,
    );
  }

  const c = context.get(dim.key);
  const cardinalityOk = dim.cardinality === "multi" ? Array.isArray(c) : !Array.isArray(c);
  if (!cardinalityOk) {
    return evalError(
      `context value cardinality mismatch for "${dim.key}"`,
      RuntimeErrorCode.CONTEXT_TYPE_MISMATCH,
      dim.key,
    );
  }

  const negative = operator === "not_equals" || operator === "not_in";
  const positiveOp = (
    negative ? (operator === "not_equals" ? "equals" : "in") : operator
  ) as Operator;

  const matched = matchPositive(dim, positiveOp, c, leaf.value);
  if ("diagnostics" in matched) return matched;
  const result = negative ? !matched.matched : matched.matched;
  if (!result) return outcome("false");
  const spec: Specificity = (POSITIVE_OPERATORS as readonly string[]).includes(operator)
    ? [1, matched.depth]
    : ZERO_SPECIFICITY;
  return outcome("true", spec);
}

const OPERATOR_SET = new Set<string>([
  ...PRESENCE_OPERATORS,
  ...COMPARISON_OPERATORS,
  "equals",
  "not_equals",
  "includes",
  "includes_all",
  "includes_any",
  "in",
  "not_in",
]);

function booleanState(b: boolean): QuadState {
  return b ? "true" : "false";
}

type MatchResult = { matched: boolean; depth: number } | EvalOutcome;

function isError(r: MatchResult): r is EvalOutcome {
  return "diagnostics" in r;
}

/**
 * Positive-direction match for one leaf; `depth` is the hierarchy depth of
 * the matched enum rule value (0 for non-hierarchical/non-enum matches).
 */
function matchPositive(dim: RuntimeDimension, op: Operator, c: unknown, r: unknown): MatchResult {
  const cset: unknown[] = dim.cardinality === "multi" ? (c as unknown[]) : [c];

  switch (op) {
    case "equals":
    case "includes":
      return scalarMatch(dim, cset, r);
    case "in":
    case "includes_any": {
      if (!isNonEmptyArray(r)) {
        return evalError(`"${op}" requires a non-empty array value`, undefined, dim.key);
      }
      let depth = 0;
      let matched = false;
      for (const rv of r) {
        const m = scalarMatch(dim, cset, rv);
        if (isError(m)) return m;
        if (m.matched) {
          matched = true;
          if (m.depth > depth) depth = m.depth;
        }
      }
      return { matched, depth };
    }
    case "includes_all": {
      if (!isNonEmptyArray(r))
        return evalError('"includes_all" requires a non-empty array', undefined, dim.key);
      let depth = 0;
      let all = true;
      for (const rv of r) {
        const m = scalarMatch(dim, cset, rv);
        if (isError(m)) return m;
        if (!m.matched) all = false;
        else if (m.depth > depth) depth = m.depth;
      }
      return { matched: all, depth };
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      if (!isOrderedDimension(dim)) {
        return evalError(
          `operator "${op}" is invalid for ${dim.valueType}/${dim.cardinality}`,
          SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
          dim.key,
        );
      }
      const cmp = compareValues(dim.valueType, c, r);
      if (cmp === null) {
        return evalError(`incomparable values for "${op}"`, undefined, dim.key);
      }
      const ok = op === "gt" ? cmp > 0 : op === "gte" ? cmp >= 0 : op === "lt" ? cmp < 0 : cmp <= 0;
      return { matched: ok, depth: 0 };
    }
    case "between": {
      if (!isOrderedDimension(dim)) {
        return evalError(
          `"between" is invalid for ${dim.valueType}/${dim.cardinality}`,
          SourceErrorCode.INVALID_OPERATOR_FOR_DIMENSION,
          dim.key,
        );
      }
      if (!Array.isArray(r) || r.length !== 2) {
        return evalError('"between" requires exactly [lower, upper]', undefined, dim.key);
      }
      const bounds = compareValues(dim.valueType, r[0], r[1]);
      if (bounds === null) {
        return evalError("incomparable between bounds", undefined, dim.key);
      }
      // spec/12: a reversed range is invalid source; never swap implicitly.
      if (bounds > 0) {
        return evalError('"between" requires lower <= upper', undefined, dim.key);
      }
      const lo = compareValues(dim.valueType, c, r[0]);
      const hi = compareValues(dim.valueType, c, r[1]);
      if (lo === null || hi === null) {
        return evalError("incomparable between bounds", undefined, dim.key);
      }
      return { matched: lo >= 0 && hi <= 0, depth: 0 };
    }
    default:
      return evalError(`unsupported positive operator "${op}"`, undefined, dim.key);
  }
}

/**
 * equals/includes membership. For enum dimensions a context descendant
 * satisfies an ancestor rule: match iff the rule value id is in the context
 * value's ancestor closure (which includes self). `depth` is the rule value's
 * depth — the more specific authored constraint earns the specificity.
 */
function scalarMatch(dim: RuntimeDimension, cset: unknown[], r: unknown): MatchResult {
  if (dim.valueType === "enum") {
    if (typeof r !== "string") {
      return evalError("enum rule value must be a string key", undefined, dim.key);
    }
    const rv = dim.values?.get(r);
    if (!rv) {
      return evalError(
        `rule value "${r}" is not a registered value of dimension "${dim.key}"`,
        SourceErrorCode.DIMENSION_VALUE_NOT_FOUND,
        dim.key,
      );
    }
    for (const cv of cset) {
      const entry = typeof cv === "string" ? dim.values?.get(cv) : undefined;
      if (!entry) {
        return evalError(
          `context value "${String(cv)}" is not a registered value of dimension "${dim.key}"`,
          SourceErrorCode.DIMENSION_VALUE_NOT_FOUND,
          dim.key,
        );
      }
      if (entry.ancestorIds.has(rv.id)) return { matched: true, depth: rv.depth };
    }
    return { matched: false, depth: 0 };
  }
  // No coercion (spec/12): rule operands must match the dimension value type.
  if (!matchesValueType(dim.valueType, r)) {
    return evalError(
      `rule value does not match valueType "${dim.valueType}" for dimension "${dim.key}"`,
      undefined,
      dim.key,
    );
  }
  for (const cv of cset) {
    if (cv === r) return { matched: true, depth: 0 };
  }
  return { matched: false, depth: 0 };
}

function isOrderedDimension(dim: RuntimeDimension): boolean {
  return dim.cardinality === "single" && (dim.valueType === "number" || dim.valueType === "date");
}

function compareValues(type: DimensionValueType, a: unknown, b: unknown): number | null {
  if (type === "number" && typeof a === "number" && typeof b === "number") return a - b;
  if (type === "date" && typeof a === "string" && typeof b === "string") {
    return a < b ? -1 : a > b ? 1 : 0; // ISO YYYY-MM-DD compares lexically
  }
  return null;
}

function isNonEmptyArray(v: unknown): v is unknown[] {
  return Array.isArray(v) && v.length > 0;
}

export function compareSpecificity(a: Specificity, b: Specificity): number {
  return a[0] !== b[0] ? a[0] - b[0] : a[1] - b[1];
}

// ---------------------------------------------------------------------------
// Selection groups (spec/12)
// ---------------------------------------------------------------------------

export type SelectionGroupMode = "highest_priority" | "most_specific" | "all";

export type GroupMember<T> = {
  member: T;
  /** Stable entity id used as the final tie-breaker (UUID ASC). */
  id: string;
  priority: number;
  /** Specificity of the member's applicability outcome; zero for non-applicability contexts. */
  specificity: Specificity;
};

/**
 * Resolve a selection group over already-eligible members. Eligibility is
 * evaluated before group resolution (spec/12); this function only orders.
 * Ranked modes return a single winner; `all` preserves every member in a
 * deterministic UUID order — downstream ranking owns final ordering.
 */
export function resolveSelectionGroup<T>(
  members: GroupMember<T>[],
  mode: SelectionGroupMode,
): { selected: GroupMember<T>[]; rejected: GroupMember<T>[] } {
  const byUuid = (a: GroupMember<T>, b: GroupMember<T>) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  if (mode === "all") {
    return { selected: [...members].sort(byUuid), rejected: [] };
  }
  const sorted = [...members].sort((a, b) => {
    const primary =
      mode === "highest_priority"
        ? b.priority - a.priority || compareSpecificity(b.specificity, a.specificity)
        : compareSpecificity(b.specificity, a.specificity) || b.priority - a.priority;
    return primary !== 0 ? primary : byUuid(a, b);
  });
  const [winner, ...rest] = sorted;
  return winner ? { selected: [winner], rejected: rest } : { selected: [], rejected: [] };
}
