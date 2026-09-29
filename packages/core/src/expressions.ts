/**
 * Recursive rule expressions — spec/04 + spec/12 (normative).
 * `{}` is the canonical true expression. Boolean arrays are non-empty.
 */

export const OPERATORS = [
  "equals",
  "not_equals",
  "includes",
  "includes_all",
  "includes_any",
  "in",
  "not_in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "exists",
  "not_exists",
] as const;

export type Operator = (typeof OPERATORS)[number];

export const PRESENCE_OPERATORS = ["exists", "not_exists"] as const;
export const COMPARISON_OPERATORS = ["gt", "gte", "lt", "lte", "between"] as const;
/** Positive matched leaves count toward specificity (spec/12). */
export const POSITIVE_OPERATORS = [
  "equals",
  "includes",
  "includes_all",
  "includes_any",
  "in",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
] as const;

export type ExpressionLeaf = {
  dimension: string;
  operator: Operator;
  value?: unknown;
};

export type Expression =
  | Record<string, never> // {} — canonical true
  | { allOf: Expression[] }
  | { anyOf: Expression[] }
  | { noneOf: Expression[] }
  | ExpressionLeaf;

export type DimensionValueType = "string" | "number" | "boolean" | "date" | "enum";
export type DimensionCardinality = "single" | "multi";
export type DimensionCategory =
  | "authorization"
  | "eligibility"
  | "applicability"
  | "ranking"
  | "descriptive";
export type MissingValueBehavior = "no_match" | "unknown" | "ignore";
export type DimensionTrust = "server" | "request";
export type LifecycleStatus = "draft" | "published" | "deprecated";

export type DimensionDefinition = {
  id: string;
  key: string;
  name: string;
  description?: string;
  valueType: DimensionValueType;
  cardinality: DimensionCardinality;
  category: DimensionCategory;
  allowedOperators: Operator[];
  hierarchical: boolean;
  required: boolean;
  missingValueBehavior: MissingValueBehavior;
  trust: DimensionTrust;
};

export type DimensionValue = {
  id: string;
  key: string;
  name?: string;
  /** Key of the parent value within the same dimension. */
  parent?: string;
  sortOrder?: number;
};

/** Normalized request context: dimension key -> scalar or scalar[]. */
export type RequestContext = Record<string, unknown>;
