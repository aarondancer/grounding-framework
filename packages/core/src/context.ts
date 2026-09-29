import { RuntimeErrorCode } from "./codes.ts";
import type { Diagnostic } from "./errors.ts";
import type { DimensionDefinition, RequestContext } from "./expressions.ts";

/**
 * Runtime request-context validation — spec/04 + spec/12 (normative).
 *
 * The evaluator consumes a `DimensionRegistry` built from materialized
 * dimension definitions, enum values, and the transitive value closure.
 * `normalizeContext` is the API boundary: it merges caller-supplied and
 * host-injected (trusted) values, enforces the trust boundary, and produces
 * the normalized context all rule evaluation runs against.
 */

export type EnumValueRuntime = {
  /** Stable value id. */
  id: string;
  /** Depth from the hierarchy root (root depth 0). */
  depth: number;
  /** Value ids of self + every ancestor (from dimension_value_closure). */
  ancestorIds: ReadonlySet<string>;
};

export type RuntimeDimension = DimensionDefinition & {
  /** Enum value key → runtime record. Present only for enum dimensions. */
  values?: ReadonlyMap<string, EnumValueRuntime>;
};

/** Dimension key → runtime definition. */
export type DimensionRegistry = ReadonlyMap<string, RuntimeDimension>;

export type DimensionValueRow = {
  dimensionId: string;
  id: string;
  key: string;
};

export type DimensionClosureRow = {
  dimensionId: string;
  ancestorValueId: string;
  descendantValueId: string;
  depth: number;
};

/**
 * Compose the runtime registry from materialized rows. Closure rows already
 * include self (depth 0); a value's own depth is the maximum closure depth
 * where it appears as descendant.
 */
export function buildDimensionRegistry(input: {
  dimensions: DimensionDefinition[];
  values: DimensionValueRow[];
  closure: DimensionClosureRow[];
}): DimensionRegistry {
  const byId = new Map(input.dimensions.map((d) => [d.id, d]));
  const depthOf = new Map<string, number>();
  const ancestorsOf = new Map<string, Set<string>>();
  for (const row of input.closure) {
    const set = ancestorsOf.get(row.descendantValueId) ?? new Set<string>();
    ancestorsOf.set(row.descendantValueId, set);
    set.add(row.ancestorValueId);
    if (row.depth > (depthOf.get(row.descendantValueId) ?? 0)) {
      depthOf.set(row.descendantValueId, row.depth);
    }
  }

  const valuesByDimension = new Map<string, Map<string, EnumValueRuntime>>();
  for (const v of input.values) {
    const dim = byId.get(v.dimensionId);
    if (!dim) continue;
    const m = valuesByDimension.get(v.dimensionId) ?? new Map<string, EnumValueRuntime>();
    valuesByDimension.set(v.dimensionId, m);
    m.set(v.key, {
      id: v.id,
      depth: depthOf.get(v.id) ?? 0,
      ancestorIds: ancestorsOf.get(v.id) ?? new Set([v.id]),
    });
  }

  const registry = new Map<string, RuntimeDimension>();
  for (const d of input.dimensions) {
    const values = valuesByDimension.get(d.id);
    registry.set(d.key, values ? { ...d, values } : { ...d });
  }
  return registry;
}

/** Normalized context: dimension key → scalar or readonly scalar[]. */
export type NormalizedContext = ReadonlyMap<string, unknown>;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function isValidCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  // Round-trip through UTC to reject 2025-02-30-style overflow.
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** Runtime type check for a scalar against a dimension's valueType (no coercion). */
export function matchesValueType(
  valueType: RuntimeDimension["valueType"],
  value: unknown,
): boolean {
  switch (valueType) {
    case "string":
    case "enum":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "date":
      return typeof value === "string" && isValidCalendarDate(value);
  }
}

function err(code: Diagnostic["code"], message: string, key: string): Diagnostic {
  return { severity: "error", code, message, details: { dimension: key } };
}

/**
 * Validate and normalize a request context against the namespace's dimension
 * registry (spec/12 "Context validation").
 *
 * `caller` is the ordinary client-supplied object; `trusted` is host-injected
 * after authentication. Caller keys on `trust: "server"` dimensions are
 * rejected (`CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE`); trusted values may set
 * any dimension and take precedence. Any error yields `context: undefined`.
 */
export function normalizeContext(
  registry: DimensionRegistry,
  input: { caller?: RequestContext; trusted?: RequestContext },
): { context?: NormalizedContext; diagnostics: Diagnostic[] } {
  const diagnostics: Diagnostic[] = [];
  const merged = new Map<string, unknown>();

  for (const [key, value] of Object.entries(input.caller ?? {})) {
    const dim = registry.get(key);
    if (!dim) {
      diagnostics.push(
        err(RuntimeErrorCode.UNKNOWN_CONTEXT_DIMENSION, `unknown context dimension "${key}"`, key),
      );
      continue;
    }
    if (dim.trust === "server") {
      diagnostics.push(
        err(
          RuntimeErrorCode.CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE,
          `dimension "${key}" is server-trusted and cannot be set by a caller`,
          key,
        ),
      );
      continue;
    }
    merged.set(key, value);
  }
  for (const [key, value] of Object.entries(input.trusted ?? {})) {
    const dim = registry.get(key);
    if (!dim) {
      diagnostics.push(
        err(
          RuntimeErrorCode.UNKNOWN_CONTEXT_DIMENSION,
          `trusted context dimension "${key}" is not registered`,
          key,
        ),
      );
      continue;
    }
    merged.set(key, value);
  }

  for (const dim of registry.values()) {
    if (dim.required && !merged.has(dim.key)) {
      diagnostics.push(
        err(
          RuntimeErrorCode.REQUIRED_CONTEXT_DIMENSION_MISSING,
          `required context dimension "${dim.key}" is absent`,
          dim.key,
        ),
      );
    }
  }

  for (const [key, value] of merged) {
    const dim = registry.get(key);
    if (!dim) continue; // already diagnosed
    const isArray = Array.isArray(value);
    if (dim.cardinality === "single" && isArray) {
      diagnostics.push(
        err(
          RuntimeErrorCode.CONTEXT_TYPE_MISMATCH,
          `dimension "${key}" is single-cardinality but received an array`,
          key,
        ),
      );
      continue;
    }
    if (dim.cardinality === "multi" && !isArray) {
      diagnostics.push(
        err(
          RuntimeErrorCode.CONTEXT_TYPE_MISMATCH,
          `dimension "${key}" is multi-cardinality but received a scalar`,
          key,
        ),
      );
      continue;
    }
    const list: unknown[] = isArray ? (value as unknown[]) : [value];
    if (isArray) {
      const seen = new Set<unknown>();
      for (const item of list) {
        if (seen.has(item)) {
          diagnostics.push(
            err(
              RuntimeErrorCode.INVALID_CONTEXT,
              `duplicate value "${String(item)}" in multi dimension "${key}"`,
              key,
            ),
          );
          break;
        }
        seen.add(item);
      }
      if (seen.size !== list.length) continue;
    }
    let ok = true;
    for (const item of list) {
      if (!matchesValueType(dim.valueType, item)) {
        diagnostics.push(
          err(
            RuntimeErrorCode.CONTEXT_TYPE_MISMATCH,
            `value for "${key}" does not match valueType "${dim.valueType}"`,
            key,
          ),
        );
        ok = false;
        continue;
      }
      if (dim.valueType === "enum" && !dim.values?.has(item as string)) {
        diagnostics.push(
          err(
            RuntimeErrorCode.CONTEXT_ENUM_VALUE_UNKNOWN,
            `value "${String(item)}" is not a registered value of dimension "${key}"`,
            key,
          ),
        );
        ok = false;
      }
    }
    if (!ok) continue;
    // multi stores a readonly scalar[] (explicitly empty array stays present)
    merged.set(key, dim.cardinality === "multi" ? Object.freeze([...list]) : value);
  }

  return diagnostics.some((d) => d.severity === "error")
    ? { diagnostics }
    : { context: merged, diagnostics };
}
