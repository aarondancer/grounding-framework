# 12 — Normative Rule Engine Semantics

This section is normative. Implementations MUST produce the same result for the same dimension registry, normalized context, and expression.

## Context validation

A request context is a map from dimension key to a value matching that dimension definition.

- Unknown context keys are errors: `UNKNOWN_CONTEXT_DIMENSION`. They are never silently ignored. This catches typos such as `produts` instead of `products`.
- A dimension with `required: true` MUST be present. Absence is `REQUIRED_CONTEXT_DIMENSION_MISSING`; `missingValueBehavior` does not override `required`.
- `single` dimensions accept one scalar. `multi` dimensions accept an array of scalars; arrays are treated as sets for expression semantics and duplicate values are rejected during normalization.
- No arbitrary coercion is performed. For example, the string `"12"` is not accepted for a numeric dimension.
- `date` values use ISO calendar-date form `YYYY-MM-DD`, interpreted as a date without a time zone.
- For `enum` dimensions, every context value MUST be an exact authored dimension-value key. An unregistered value is `CONTEXT_ENUM_VALUE_UNKNOWN`; it is not treated as an arbitrary string.
- A context key that is present with `[]` on a multi dimension is explicitly empty and is different from an absent key.

## Trivial true expression

The empty object is the canonical authored true expression:

```json
{}
```

It compiles to the internal constant `TRUE`. This is the normal way to author a generic fallback selection-group member.

`allOf`, `anyOf`, and `noneOf` MUST contain at least one child. Empty boolean arrays are invalid because `{}` already provides an unambiguous true expression.

## Leaf operator semantics

The expression's `dimension` identifies the context value. In the table below, `C` is the normalized context value and `R` is the authored rule `value`.

| Operator | Allowed cardinality | Allowed value types | Rule value shape | Semantics |
|---|---|---|---|---|
| `equals` | single | all | scalar | `C == R` |
| `not_equals` | single | all | scalar | `C != R` |
| `includes` | multi | all | scalar | `R` is a member of set `C` |
| `includes_all` | multi | all | non-empty array | every value in `R` is a member of set `C` |
| `includes_any` | multi | all | non-empty array | `C` and `R` have a non-empty intersection |
| `in` | single | all | non-empty array | `C` is a member of `R` |
| `not_in` | single | all | non-empty array | `C` is not a member of `R` |
| `gt` | single | number/date | scalar | `C > R` |
| `gte` | single | number/date | scalar | `C >= R` |
| `lt` | single | number/date | scalar | `C < R` |
| `lte` | single | number/date | scalar | `C <= R` |
| `between` | single | number/date | exactly `[lower, upper]` | inclusive: `lower <= C <= upper` |
| `exists` | single/multi | all | omitted | context key is present, including an explicitly empty multi value |
| `not_exists` | single/multi | all | omitted | context key is absent |

`includes` never means substring search. Comparison operators are invalid on multi-cardinality dimensions in v1. The validator MUST reject an operator not listed in the dimension's `allowedOperators`, and MUST reject operators incompatible with the dimension's type/cardinality even if mistakenly listed there.

For `exists` and `not_exists`, an authored `value` is invalid. Every other leaf operator requires a non-null `value`; explicit JSON `null` is invalid and is never a sentinel for missing data. Array-valued rule operands must also contain only values valid for the referenced dimension type.

For `between`, both bounds are normalized and type-checked using the referenced dimension's comparator, and the validator MUST require `lower <= upper`. A reversed range (`lower > upper`) is invalid source and fails with `INVALID_EXPRESSION`; runtime evaluation never swaps bounds implicitly.

## Enum and hierarchical values

For `enum` dimensions, `values` is required and non-empty. Authored rule values are exact dimension-value keys and compile to stable value IDs. A referenced enum value that does not exist fails validation with `DIMENSION_VALUE_NOT_FOUND`. Non-enum dimensions MUST NOT declare `values`; `hierarchical: true` is valid only for enum dimensions.

For hierarchical dimensions, a context descendant satisfies an ancestor membership/equality rule. Example hierarchy:

```text
US
└── US-TX
    └── US-TX-AUSTIN
```

Context `US-TX-AUSTIN` satisfies rules for `US-TX-AUSTIN`, `US-TX`, and `US`. This applies to `equals`, `includes`, `includes_all`, `includes_any`, and `in` when the compared value is an enum value. Negative operators are evaluated after ancestor expansion.

## Missing-value behavior

`missingValueBehavior` applies only when the dimension is not required and the context key is absent.

- `no_match`: a normal leaf evaluates `FALSE`. `exists` evaluates `FALSE`; `not_exists` evaluates `TRUE`.
- `unknown`: a normal leaf evaluates `UNKNOWN`. `exists` evaluates `FALSE`; `not_exists` evaluates `TRUE`.
- `ignore`: the leaf evaluates `SKIP` and is removed from its parent boolean expression. `exists`/`not_exists` still explicitly test presence and are never skipped.

Boolean evaluation uses four internal states: `TRUE`, `FALSE`, `UNKNOWN`, and `SKIP`.

After removing `SKIP` children:

- `allOf`: `FALSE` if any child is false; `TRUE` if all are true; otherwise `UNKNOWN`.
- `anyOf`: `TRUE` if any child is true; `FALSE` if all are false; otherwise `UNKNOWN`.
- `noneOf`: logical negation of `anyOf`; `FALSE` if any child is true, `TRUE` if all are false, otherwise `UNKNOWN`.
- if all children of a boolean node were skipped, the node evaluates `TRUE`.
- `{}` evaluates `TRUE`.

Only final `TRUE` passes eligibility. `FALSE` and `UNKNOWN` do not. Authorization therefore fails closed.

## Missing vs explicitly empty

For a multi dimension with context `[]`:

- `exists` is `TRUE` because the key is present.
- `not_exists` is `FALSE`.
- `includes` is `FALSE`.
- `includes_any` is `FALSE`.
- `includes_all` is `TRUE` only if the authored array were empty, but empty rule arrays are invalid; therefore it is `FALSE` for every valid `includes_all` rule.

## Authorization and applicability

Authorization and applicability use the same evaluator but have different semantics:

- authorization is a hard gate and never contributes a ranking score;
- applicability is a hard eligibility gate and provides the specificity measurement used by selection groups;
- an evaluator error on authorization fails closed and surfaces a diagnostic rather than returning the entity.

Dimension `category` is advisory metadata in v1 rather than a separate expression type system. However, a dimension referenced anywhere inside an authorization expression MUST NOT have `missingValueBehavior: "ignore"`; validation fails with `UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR` because skipping a missing auth constraint could broaden access. Using a `descriptive` or `ranking` category in authorization is permitted but should emit `SUSPICIOUS_DIMENSION_CATEGORY_USAGE`.

## Priority

Higher numeric priority wins. Default priority is `0`. Negative values are allowed.

Outside a selection group, priority is not added to retrieval score. It is a deterministic tie-breaker after `rrfScore` and `authorityScore`, as defined in `spec/05-retrieval.md`. This prevents implementation-specific score calibration.

## Specificity

Specificity is derived from the successful **applicability** expression only. Authorization never increases specificity.

Specificity is the lexicographic tuple:

```text
(positiveMatchedLeafCount, hierarchyDepthSum)
```

A positive matched leaf is one of:

`equals`, `includes`, `includes_all`, `includes_any`, `in`, `gt`, `gte`, `lt`, `lte`, `between`.

`exists`, `not_exists`, `not_equals`, `not_in`, and anything under `noneOf` contribute zero. This prevents exclusions from artificially making a variant more specific.

Composition:

- `{}` => `(0, 0)`
- positive leaf => `(1, hierarchyDepthIfApplicable)`
- `allOf` => component-wise sum of successful children
- `anyOf` => maximum specificity tuple among successful branches
- `noneOf` => `(0, 0)`
- skipped branches contribute zero

Hierarchy depth is measured from the dimension's hierarchy root, with root depth `0`. Only the matched hierarchical enum constraint contributes hierarchy depth.

## Selection-group ordering

Eligibility is evaluated before group resolution.

`highest_priority`:

```text
priority DESC
specificity DESC
stable UUID ASC
```

`most_specific`:

```text
specificity DESC
priority DESC
stable UUID ASC
```

`all`: keep every eligible member; ordinary retrieval/assembly ranking handles later ordering.

There is no implicit fallback. A generic fallback must be an authored member with `applicability: {}`.
