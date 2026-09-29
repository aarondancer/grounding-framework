import { describe, expect, test } from "bun:test";
import {
  buildDimensionRegistry,
  type DimensionRegistry,
  type NormalizedContext,
  normalizeContext,
} from "./context.ts";
import type { DimensionDefinition, Expression } from "./expressions.ts";
import {
  compareSpecificity,
  evaluateAuthorization,
  evaluateExpression,
  isEligible,
  resolveSelectionGroup,
  type Specificity,
} from "./rules.ts";

/**
 * Normative rule-engine matrix — spec/12. The evaluator is pure: tests build
 * the registry in memory; loadDimensionRegistry covers the DB seam.
 */

function dim(partial: Partial<DimensionDefinition> & Pick<DimensionDefinition, "key">) {
  return {
    id: `d-${partial.key}`,
    name: partial.key,
    valueType: "string",
    cardinality: "single",
    category: "applicability",
    allowedOperators: [
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
    ],
    hierarchical: false,
    required: false,
    missingValueBehavior: "no_match",
    trust: "request",
    ...partial,
  } as DimensionDefinition;
}

/** values: [key, parentKey?][] — produces rows + transitive closure. */
function enumDim(
  partial: Partial<DimensionDefinition> & Pick<DimensionDefinition, "key">,
  values: [key: string, parent?: string][],
) {
  const d = dim({ ...partial, valueType: "enum" });
  const idOf = new Map(values.map(([k], i) => [k, `${d.id}-v${i}`]));
  const parentOf = new Map(values.filter((v) => v[1]).map(([k, p]) => [k, p as string]));
  const closure: {
    dimensionId: string;
    ancestorValueId: string;
    descendantValueId: string;
    depth: number;
  }[] = [];
  for (const [key] of values) {
    let cur: string | undefined = key;
    let depth = 0;
    while (cur !== undefined) {
      closure.push({
        dimensionId: d.id,
        ancestorValueId: idOf.get(cur) as string,
        descendantValueId: idOf.get(key) as string,
        depth,
      });
      cur = parentOf.get(cur);
      depth += 1;
    }
  }
  const valueRows = values.map(([key]) => ({
    dimensionId: d.id,
    id: idOf.get(key) as string,
    key,
  }));
  return { definition: d, values: valueRows, closure };
}

const regions = enumDim({ key: "regions", cardinality: "multi", hierarchical: true }, [
  ["US"],
  ["CA"],
  ["US-TX", "US"],
  ["US-TX-AUSTIN", "US-TX"],
]);
const region = enumDim({ key: "region", cardinality: "single", hierarchical: true }, [
  ["US"],
  ["CA"],
  ["US-TX", "US"],
  ["US-TX-AUSTIN", "US-TX"],
]);
const products = enumDim({ key: "products", cardinality: "multi" }, [["crm"], ["analytics"]]);

const dimensions: DimensionDefinition[] = [
  regions.definition,
  region.definition,
  products.definition,
  dim({ key: "teamSize", valueType: "number" }),
  dim({ key: "plan", valueType: "string", required: true }),
  dim({ key: "flags", cardinality: "multi", missingValueBehavior: "ignore" }),
  dim({ key: "soft", missingValueBehavior: "unknown" }),
  dim({ key: "perms", cardinality: "multi", trust: "server", category: "authorization" }),
  dim({ key: "started", valueType: "date" }),
];
const registry: DimensionRegistry = buildDimensionRegistry({
  dimensions,
  values: [...regions.values, ...region.values, ...products.values],
  closure: [...regions.closure, ...region.closure, ...products.closure],
});

function ctx(entries: Record<string, unknown>, trusted?: Record<string, unknown>) {
  const { context, diagnostics } = normalizeContext(registry, {
    caller: entries,
    ...(trusted !== undefined ? { trusted } : {}),
  });
  return { context, diagnostics };
}

function evalExpr(context: NormalizedContext, expression: Expression) {
  return evaluateExpression(registry, context, expression);
}

const BASE = { plan: "pro" };
function norm(entries: Record<string, unknown>, trusted?: Record<string, unknown>) {
  const { context, diagnostics } = ctx({ ...BASE, ...entries }, trusted);
  if (diagnostics.length > 0)
    throw new Error(`fixture context invalid: ${JSON.stringify(diagnostics)}`);
  return context as NormalizedContext;
}

describe("context validation", () => {
  test("unknown caller key → UNKNOWN_CONTEXT_DIMENSION", () => {
    const { diagnostics } = ctx({ ...BASE, produts: ["x"] });
    expect(diagnostics.map((d) => d.code)).toContain("UNKNOWN_CONTEXT_DIMENSION");
  });

  test("caller cannot set trust:server dimension; trusted injection can", () => {
    const caller = ctx({ ...BASE, perms: ["analytics.read"] });
    expect(caller.diagnostics.map((d) => d.code)).toContain(
      "CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE",
    );
    const injected = ctx(BASE, { perms: ["analytics.read"] });
    expect(injected.diagnostics).toEqual([]);
    expect(injected.context?.get("perms")).toEqual(["analytics.read"]);
  });

  test("required dimension absent → REQUIRED_CONTEXT_DIMENSION_MISSING", () => {
    const { diagnostics } = ctx({});
    expect(diagnostics.map((d) => d.code)).toContain("REQUIRED_CONTEXT_DIMENSION_MISSING");
  });

  test("cardinality mismatches → CONTEXT_TYPE_MISMATCH", () => {
    expect(ctx({ ...BASE, teamSize: [12] }).diagnostics.map((d) => d.code)).toContain(
      "CONTEXT_TYPE_MISMATCH",
    );
    expect(ctx({ ...BASE, flags: "x" }).diagnostics.map((d) => d.code)).toContain(
      "CONTEXT_TYPE_MISMATCH",
    );
  });

  test("no coercion: '12' is not a number", () => {
    expect(ctx({ ...BASE, teamSize: "12" }).diagnostics.map((d) => d.code)).toContain(
      "CONTEXT_TYPE_MISMATCH",
    );
  });

  test("date requires YYYY-MM-DD calendar date", () => {
    expect(ctx({ ...BASE, started: "2025-02-30" }).diagnostics.map((d) => d.code)).toContain(
      "CONTEXT_TYPE_MISMATCH",
    );
    expect(ctx({ ...BASE, started: "yesterday" }).diagnostics.map((d) => d.code)).toContain(
      "CONTEXT_TYPE_MISMATCH",
    );
    expect(ctx({ ...BASE, started: "2025-02-28" }).diagnostics).toEqual([]);
  });

  test("enum value must be a registered key", () => {
    expect(
      ctx({ ...BASE, products: ["unknown-product"] }).diagnostics.map((d) => d.code),
    ).toContain("CONTEXT_ENUM_VALUE_UNKNOWN");
  });

  test("duplicate multi values rejected; empty array is present and valid", () => {
    expect(ctx({ ...BASE, flags: ["a", "a"] }).diagnostics.map((d) => d.code)).toContain(
      "INVALID_CONTEXT",
    );
    const { context, diagnostics } = ctx({ ...BASE, flags: [] });
    expect(diagnostics).toEqual([]);
    expect(context?.has("flags")).toBe(true);
    expect(context?.get("flags")).toEqual([]);
  });
});

describe("leaf operators", () => {
  const cases: [Expression, Record<string, unknown>, "true" | "false" | "unknown" | "skip"][] = [
    [{ dimension: "teamSize", operator: "equals", value: 12 }, { teamSize: 12 }, "true"],
    [{ dimension: "teamSize", operator: "equals", value: 12 }, { teamSize: 13 }, "false"],
    [{ dimension: "teamSize", operator: "not_equals", value: 12 }, { teamSize: 13 }, "true"],
    [{ dimension: "flags", operator: "includes", value: "a" }, { flags: ["a", "b"] }, "true"],
    [{ dimension: "flags", operator: "includes", value: "z" }, { flags: ["a", "b"] }, "false"],
    [
      { dimension: "flags", operator: "includes_all", value: ["a", "b"] },
      { flags: ["a", "b", "c"] },
      "true",
    ],
    [
      { dimension: "flags", operator: "includes_all", value: ["a", "z"] },
      { flags: ["a", "b"] },
      "false",
    ],
    [
      { dimension: "flags", operator: "includes_any", value: ["z", "b"] },
      { flags: ["a", "b"] },
      "true",
    ],
    [{ dimension: "teamSize", operator: "in", value: [10, 12] }, { teamSize: 12 }, "true"],
    [{ dimension: "teamSize", operator: "not_in", value: [10, 12] }, { teamSize: 12 }, "false"],
    [{ dimension: "teamSize", operator: "not_in", value: [10, 12] }, { teamSize: 99 }, "true"],
    [{ dimension: "teamSize", operator: "gt", value: 10 }, { teamSize: 12 }, "true"],
    [{ dimension: "teamSize", operator: "gte", value: 12 }, { teamSize: 12 }, "true"],
    [{ dimension: "teamSize", operator: "lt", value: 10 }, { teamSize: 12 }, "false"],
    [{ dimension: "teamSize", operator: "lte", value: 12 }, { teamSize: 12 }, "true"],
    [{ dimension: "teamSize", operator: "between", value: [10, 12] }, { teamSize: 12 }, "true"],
    [{ dimension: "teamSize", operator: "between", value: [10, 12] }, { teamSize: 13 }, "false"],
    [
      { dimension: "started", operator: "gte", value: "2025-01-01" },
      { started: "2025-03-01" },
      "true",
    ],
    [
      { dimension: "started", operator: "between", value: ["2025-01-01", "2025-12-31"] },
      { started: "2025-06-15" },
      "true",
    ],
    [{ dimension: "flags", operator: "exists" }, { flags: [] }, "true"],
    [{ dimension: "flags", operator: "not_exists" }, { flags: [] }, "false"],
    [{ dimension: "flags", operator: "exists" }, {}, "false"],
    [{ dimension: "flags", operator: "not_exists" }, {}, "true"],
  ];
  for (const [expr, extra, expected] of cases) {
    test(`${JSON.stringify(expr)} with ${JSON.stringify(extra)} → ${expected}`, () => {
      expect(evalExpr(norm(extra), expr).state).toBe(expected);
    });
  }

  test("explicitly empty multi is present: exists TRUE, membership FALSE", () => {
    const c = norm({ flags: [] });
    expect(evalExpr(c, { dimension: "flags", operator: "includes", value: "a" }).state).toBe(
      "false",
    );
    expect(evalExpr(c, { dimension: "flags", operator: "includes_any", value: ["a"] }).state).toBe(
      "false",
    );
    expect(evalExpr(c, { dimension: "flags", operator: "includes_all", value: ["a"] }).state).toBe(
      "false",
    );
  });

  test("presence ops reject an authored value; value ops require one", () => {
    const c = norm({ teamSize: 5 });
    expect(
      evalExpr(c, { dimension: "flags", operator: "exists", value: "x" }).diagnostics[0]?.code,
    ).toBe("INVALID_OPERATOR_FOR_DIMENSION");
    expect(evalExpr(c, { dimension: "teamSize", operator: "equals" }).diagnostics[0]?.code).toBe(
      "INVALID_EXPRESSION",
    );
    expect(
      evalExpr(c, { dimension: "teamSize", operator: "in", value: [] }).diagnostics[0]?.code,
    ).toBe("INVALID_EXPRESSION");
    expect(
      evalExpr(c, { dimension: "teamSize", operator: "between", value: [1] }).diagnostics[0]?.code,
    ).toBe("INVALID_EXPRESSION");
  });

  test("operator/dimension contract enforced at evaluation", () => {
    const c = norm({ flags: ["a"], teamSize: 5 });
    // includes on a single dim / gt on a multi dim are invalid (spec table)
    expect(
      evalExpr(c, { dimension: "teamSize", operator: "includes", value: 5 }).diagnostics[0]?.code,
    ).toBe("INVALID_OPERATOR_FOR_DIMENSION");
    expect(
      evalExpr(c, { dimension: "flags", operator: "gt", value: "a" }).diagnostics[0]?.code,
    ).toBe("INVALID_OPERATOR_FOR_DIMENSION");
    // allowedOperators restriction
    const strict = buildDimensionRegistry({
      dimensions: [dim({ key: "s", allowedOperators: ["equals"] })],
      values: [],
      closure: [],
    });
    const out = evaluateExpression(strict, new Map([["s", "x"]]), {
      dimension: "s",
      operator: "not_equals",
      value: "y",
    });
    expect(out.diagnostics[0]?.code).toBe("INVALID_OPERATOR_FOR_DIMENSION");
  });

  test("undefined dimension / unregistered enum value use dedicated codes", () => {
    const c = norm({ region: "US", teamSize: 5 });
    expect(
      evalExpr(c, { dimension: "nope", operator: "equals", value: 1 }).diagnostics[0]?.code,
    ).toBe("UNKNOWN_DIMENSION");
    expect(
      evalExpr(c, { dimension: "region", operator: "equals", value: "ZZ" }).diagnostics[0]?.code,
    ).toBe("DIMENSION_VALUE_NOT_FOUND");
    // wrong-typed non-enum rule operand
    expect(
      evalExpr(c, { dimension: "teamSize", operator: "equals", value: "5" }).diagnostics[0]?.code,
    ).toBe("INVALID_EXPRESSION");
    // reversed between bounds never match silently
    expect(
      evalExpr(c, { dimension: "teamSize", operator: "between", value: [10, 1] }).diagnostics[0]
        ?.code,
    ).toBe("INVALID_EXPRESSION");
  });
});

describe("hierarchy-aware enum matching", () => {
  test("descendant context satisfies ancestor rules (includes/any/all)", () => {
    const c = norm({ regions: ["US-TX-AUSTIN"] });
    expect(evalExpr(c, { dimension: "regions", operator: "includes", value: "US" }).state).toBe(
      "true",
    );
    expect(evalExpr(c, { dimension: "regions", operator: "includes", value: "US-TX" }).state).toBe(
      "true",
    );
    expect(evalExpr(c, { dimension: "regions", operator: "includes", value: "CA" }).state).toBe(
      "false",
    );
    expect(
      evalExpr(c, { dimension: "regions", operator: "includes_all", value: ["US", "US-TX"] }).state,
    ).toBe("true");
    expect(
      evalExpr(c, { dimension: "regions", operator: "includes_any", value: ["CA", "US"] }).state,
    ).toBe("true");
  });

  test("single-cardinality equals/in expand ancestors", () => {
    const c = norm({ region: "US-TX-AUSTIN" });
    expect(evalExpr(c, { dimension: "region", operator: "equals", value: "US" }).state).toBe(
      "true",
    );
    expect(evalExpr(c, { dimension: "region", operator: "in", value: ["CA", "US"] }).state).toBe(
      "true",
    );
  });

  test("negatives evaluate after ancestor expansion", () => {
    const c = norm({ region: "US-TX-AUSTIN" });
    expect(evalExpr(c, { dimension: "region", operator: "not_equals", value: "US" }).state).toBe(
      "false",
    );
    expect(evalExpr(c, { dimension: "region", operator: "not_equals", value: "CA" }).state).toBe(
      "true",
    );
    expect(evalExpr(c, { dimension: "region", operator: "not_in", value: ["US"] }).state).toBe(
      "false",
    );
  });
});

describe("missing-value behavior and boolean algebra", () => {
  test("no_match → FALSE; unknown → UNKNOWN; ignore → SKIP→TRUE at top level", () => {
    const c = norm({});
    expect(evalExpr(c, { dimension: "teamSize", operator: "equals", value: 1 }).state).toBe(
      "false",
    );
    expect(evalExpr(c, { dimension: "soft", operator: "equals", value: "x" }).state).toBe(
      "unknown",
    );
    expect(evalExpr(c, { dimension: "flags", operator: "includes", value: "a" }).state).toBe(
      "true",
    ); // skip → top-level TRUE
  });

  test("{} is TRUE with specificity (0,0)", () => {
    const out = evalExpr(norm({}), {});
    expect(out.state).toBe("true");
    expect(out.specificity).toEqual([0, 0]);
  });

  test("allOf: false if any false, true if all true, else unknown", () => {
    const c = norm({ teamSize: 5 });
    expect(
      evalExpr(c, { allOf: [{ dimension: "teamSize", operator: "gt", value: 1 }, {}] }).state,
    ).toBe("true");
    expect(
      evalExpr(c, { allOf: [{ dimension: "teamSize", operator: "gt", value: 10 }, {}] }).state,
    ).toBe("false");
    // unknown propagation
    expect(
      evalExpr(c, { allOf: [{ dimension: "soft", operator: "equals", value: "x" }, {}] }).state,
    ).toBe("unknown");
    expect(
      evalExpr(c, {
        allOf: [
          { dimension: "soft", operator: "equals", value: "x" },
          { dimension: "teamSize", operator: "gt", value: 10 },
        ],
      }).state,
    ).toBe("false");
  });

  test("anyOf mirrors; noneOf negates anyOf", () => {
    const c = norm({ teamSize: 5 });
    expect(
      evalExpr(c, {
        anyOf: [
          { dimension: "teamSize", operator: "gt", value: 10 },
          { dimension: "soft", operator: "equals", value: "x" },
        ],
      }).state,
    ).toBe("unknown");
    expect(
      evalExpr(c, { anyOf: [{ dimension: "teamSize", operator: "gt", value: 1 }] }).state,
    ).toBe("true");
    expect(
      evalExpr(c, {
        anyOf: [
          { dimension: "teamSize", operator: "gt", value: 10 },
          { dimension: "plan", operator: "equals", value: "free" },
        ],
      }).state,
    ).toBe("false");
    expect(
      evalExpr(c, { noneOf: [{ dimension: "teamSize", operator: "gt", value: 10 }] }).state,
    ).toBe("true");
    expect(
      evalExpr(c, { noneOf: [{ dimension: "teamSize", operator: "gt", value: 1 }] }).state,
    ).toBe("false");
    expect(
      evalExpr(c, { noneOf: [{ dimension: "soft", operator: "equals", value: "x" }] }).state,
    ).toBe("unknown");
  });

  test("all children skipped → node TRUE", () => {
    const c = norm({}); // flags absent + ignore → skip
    expect(
      evalExpr(c, { allOf: [{ dimension: "flags", operator: "includes", value: "a" }] }).state,
    ).toBe("true");
    expect(
      evalExpr(c, {
        allOf: [
          { dimension: "flags", operator: "includes", value: "a" },
          { dimension: "teamSize", operator: "equals", value: 1 },
        ],
      }).state,
    ).toBe("false"); // skip removed; remaining leaf decides
  });
});

describe("specificity", () => {
  test("positive leaf counts matched leaves + hierarchy depth of rule value", () => {
    const c = norm({ regions: ["US-TX"], teamSize: 5 });
    const leaf = evalExpr(c, { dimension: "regions", operator: "includes", value: "US-TX" });
    expect(leaf.specificity).toEqual([1, 1]); // US-TX depth 1
    const shallow = evalExpr(c, { dimension: "regions", operator: "includes", value: "US" });
    expect(shallow.specificity).toEqual([1, 0]);
    const nonEnum = evalExpr(c, { dimension: "teamSize", operator: "gt", value: 1 });
    expect(nonEnum.specificity).toEqual([1, 0]);
  });

  test("negatives, presence ops, and noneOf contribute zero", () => {
    const c = norm({ region: "US", flags: [] });
    expect(
      evalExpr(c, { dimension: "region", operator: "not_equals", value: "CA" }).specificity,
    ).toEqual([0, 0]);
    expect(evalExpr(c, { dimension: "flags", operator: "exists" }).specificity).toEqual([0, 0]);
    expect(
      evalExpr(c, { noneOf: [{ dimension: "region", operator: "equals", value: "CA" }] })
        .specificity,
    ).toEqual([0, 0]);
  });

  test("allOf sums successful children; anyOf takes the max branch", () => {
    const c = norm({ regions: ["US-TX"], teamSize: 5 });
    const all = evalExpr(c, {
      allOf: [
        { dimension: "regions", operator: "includes", value: "US-TX" },
        { dimension: "teamSize", operator: "gt", value: 1 },
      ],
    });
    expect(all.specificity).toEqual([2, 1]);
    const any = evalExpr(c, {
      anyOf: [
        { dimension: "regions", operator: "includes", value: "US" }, // (1,0)
        { dimension: "regions", operator: "includes", value: "US-TX" }, // (1,1)
      ],
    });
    expect(any.specificity).toEqual([1, 1]);
    expect(compareSpecificity([1, 1], [1, 0]) > 0).toBe(true);
    expect(compareSpecificity([2, 0], [1, 9]) > 0).toBe(true);
  });
});

describe("authorization fails closed", () => {
  test("evaluation error → denied with AUTHORIZATION_EVALUATION_FAILED", () => {
    const { allowed, diagnostics } = evaluateAuthorization(registry, norm({}), {
      dimension: "nonexistent-dim",
      operator: "equals",
      value: "x",
    });
    expect(allowed).toBe(false);
    expect(diagnostics[0]?.code).toBe("AUTHORIZATION_EVALUATION_FAILED");
  });
  test("authorization referencing an ignore-behavior dimension fails closed", () => {
    // Even though absent+ignore leaf would SKIP→TRUE in plain evaluation, the
    // auth seam refuses it outright (spec/12 UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR).
    const { allowed, diagnostics } = evaluateAuthorization(registry, norm({}), {
      dimension: "flags",
      operator: "includes",
      value: "a",
    });
    expect(allowed).toBe(false);
    expect(diagnostics[0]?.code).toBe("UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR");
  });
  test("FALSE and UNKNOWN do not authorize", () => {
    expect(
      evaluateAuthorization(registry, norm({}), {
        dimension: "teamSize",
        operator: "equals",
        value: 1,
      }).allowed,
    ).toBe(false);
    expect(
      evaluateAuthorization(registry, norm({}), {
        dimension: "soft",
        operator: "equals",
        value: "x",
      }).allowed,
    ).toBe(false);
    expect(
      isEligible(
        evalExpr(norm({ teamSize: 1 }), { dimension: "teamSize", operator: "equals", value: 1 }),
      ),
    ).toBe(true);
  });
});

describe("selection groups", () => {
  const member = (id: string, priority: number, specificity: Specificity = [0, 0]) => ({
    member: id,
    id,
    priority,
    specificity,
  });

  test("highest_priority: priority DESC, specificity DESC, uuid ASC", () => {
    const m = [
      member("00000000-0000-7000-8000-000000000003", 1, [1, 0]),
      member("00000000-0000-7000-8000-000000000001", 2),
      member("00000000-0000-7000-8000-000000000002", 1, [2, 0]),
    ];
    const { selected, rejected } = resolveSelectionGroup(m, "highest_priority");
    expect(selected[0]?.id).toBe("00000000-0000-7000-8000-000000000001");
    expect(rejected).toHaveLength(2);
  });

  test("most_specific: specificity DESC, priority DESC, uuid ASC", () => {
    const m = [
      member("00000000-0000-7000-8000-000000000003", 5, [1, 0]),
      member("00000000-0000-7000-8000-000000000001", 1, [2, 1]),
      member("00000000-0000-7000-8000-000000000002", 1, [2, 0]),
    ];
    const { selected } = resolveSelectionGroup(m, "most_specific");
    expect(selected[0]?.id).toBe("00000000-0000-7000-8000-000000000001");
  });

  test("ties break on stable uuid ASC", () => {
    const m = [
      member("ffffffff-0000-7000-8000-000000000003", 0),
      member("00000000-0000-7000-8000-000000000001", 0),
    ];
    expect(resolveSelectionGroup(m, "highest_priority").selected[0]?.id).toBe(
      "00000000-0000-7000-8000-000000000001",
    );
  });

  test("all keeps every eligible member deterministically", () => {
    const m = [
      member("bbbbbbbb-0000-7000-8000-000000000002", 0),
      member("aaaaaaaa-0000-7000-8000-000000000001", 0),
    ];
    const { selected, rejected } = resolveSelectionGroup(m, "all");
    expect(selected.map((s) => s.id)).toEqual([
      "aaaaaaaa-0000-7000-8000-000000000001",
      "bbbbbbbb-0000-7000-8000-000000000002",
    ]);
    expect(rejected).toEqual([]);
  });
});
