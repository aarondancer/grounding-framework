# 04 — Request Context, Rules, and Precedence

## Request context

Caller provides one final normalized object, e.g.:

```json
{
  "roles": ["manager"],
  "products": ["crm"],
  "regions": ["US-TX"],
  "permissions": ["analytics.read"],
  "featureFlags": ["pipeline-v2"],
  "teamSize": 12
}
```

Every key MUST exist in the namespace dimension registry. Unknown keys are request errors, not ignored warnings. The core does not own users/auth/session state and does not merge multiple context sources in v1.

## Dimension definition fields

- key/name/description
- valueType: `string|number|boolean|date|enum`
- cardinality: `single|multi`
- category: `authorization|eligibility|applicability|ranking|descriptive`
- allowedOperators
- hierarchical
- required
- missingValueBehavior: `no_match|unknown|ignore`
- trust: `server|request`

`trust` only determines whether an ordinary external caller may supply the dimension. It is not a multi-source merge system. Host middleware may inject any trusted value after authentication.

`category` is descriptive/advisory in v1: it drives Explorer organization, diagnostics, and validator warnings, but does not by itself make an expression legal or illegal. A hard safety exception applies to authorization: any dimension referenced by an authorization expression MUST NOT use `missingValueBehavior: "ignore"`; this is `UNSAFE_AUTHORIZATION_MISSING_BEHAVIOR`. Referencing a `descriptive` or `ranking` category from authorization is allowed but should emit `SUSPICIOUS_DIMENSION_CATEGORY_USAGE`.

For `valueType: "enum"`, `values` is required and non-empty. Context enum values are exact authored dimension-value keys. Unknown values are `CONTEXT_ENUM_VALUE_UNKNOWN`. Non-enum dimensions do not declare `values`, and `hierarchical: true` is valid only for enum dimensions.

## Expressions

Recursive form:

```text
Expression = {} | allOf[] | anyOf[] | noneOf[] | leaf
leaf = { dimension, operator, value? }
```

`{}` is the canonical true expression. Boolean arrays are non-empty.

Operators:
`equals`, `not_equals`, `includes`, `includes_all`, `includes_any`, `in`, `not_in`, `gt`, `gte`, `lt`, `lte`, `between`, `exists`, `not_exists`.

The exact operand/cardinality/type semantics, missing-value behavior, and three-valued evaluation rules are normative in `spec/12-rule-engine-normative.md`.

## Missing vs empty

Missing means absent/unknown and is handled by the dimension's `required` and `missingValueBehavior` settings. Explicit empty collections mean explicitly none and still count as present for `exists`.

## Authorization vs applicability

- authorization = hard gate; fail closed
- applicability = hard boolean eligibility gate
- authorization never becomes a soft ranking signal
- only applicability contributes selection-group specificity

## Hierarchical dimensions

Compiler materializes transitive closure including self depth 0. A descendant context may satisfy ancestor enum conditions as specified in the normative rule appendix.

## Selection groups

Higher numeric priority wins.

`highest_priority` order:
1. priority descending
2. specificity descending
3. stable UUID ascending

`most_specific` order:
1. specificity descending
2. priority descending
3. stable UUID ascending

`all` preserves every eligible member.

No hidden fallback. Generic fallback must be explicitly authored as a member with `applicability: {}`.

## Lifecycle participation

Normal runtime behavior uses `published` entities only:

- only published concepts participate in concept resolution and ontology traversal;
- only published knowledge/chunks are retrievable;
- only published skills/tools/prompt fragments are selectable;
- Agent Assembly against a draft/deprecated template is an error (`TEMPLATE_NOT_PUBLISHED`).

Explorer callers with appropriate host permission may browse draft/deprecated entities, but this does not change normal runtime selection semantics.
