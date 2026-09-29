import { RuntimeErrorCode } from "@grounding/core";
import {
  type FieldNode,
  GraphQLError,
  Kind,
  type SelectionSetNode,
  type ValidationContext,
  type ValidationRule,
} from "graphql";
import type { Plugin } from "graphql-yoga";
import { DEFAULT_LIMITS, type ServiceLimits } from "./context.ts";

/**
 * Query depth/cost controls (spec/09): rejects requests whose selection depth
 * or computed cost exceeds server ceilings, with INVALID_INPUT — stable
 * extensions.code, no clamping.
 *
 * Depth: field-selection nesting (fragment spreads count the spread's own
 * fields at the same level; cycles guarded). Cost: each field 1 point; a
 * field with a `first` arg adds ceil(first/50) — a variable/non-literal
 * `first` charges the worst case so cost can't be evaded via `$vars`.
 */
export function depthCostRule(maxDepth: number, maxCost: number, worstFirst = 200): ValidationRule {
  return (context: ValidationContext) => ({
    OperationDefinition(node) {
      let depthReported = false;
      const measure = (
        selSet: SelectionSetNode | undefined,
        depth: number,
        seen: Set<string>,
      ): number => {
        if (!selSet) return 0;
        if (depth > maxDepth) {
          if (!depthReported) {
            depthReported = true;
            context.reportError(
              new GraphQLError(`query depth exceeds maximum of ${maxDepth}`, {
                nodes: [node],
                extensions: { code: RuntimeErrorCode.INVALID_INPUT },
              }),
            );
          }
          return 0;
        }
        let cost = 0;
        for (const sel of selSet.selections) {
          if (sel.kind === Kind.FIELD) {
            const field = sel as FieldNode;
            let c = 1;
            const firstArg = field.arguments?.find((a) => a.name.value === "first");
            if (firstArg) {
              // Literal Int charges its size; anything else (variable,
              // object) charges the worst case so the surcharge can't be
              // evaded via `$first`.
              const n =
                firstArg.value.kind === Kind.INT
                  ? Number.parseInt(firstArg.value.value, 10)
                  : worstFirst;
              c += Math.ceil(n / 50);
            }
            cost += c + measure(field.selectionSet, depth + 1, new Set(seen));
          } else if (sel.kind === Kind.INLINE_FRAGMENT) {
            cost += measure(sel.selectionSet, depth, new Set(seen));
          } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
            const name = sel.name.value;
            if (seen.has(name)) continue;
            const frag = context.getFragment(name);
            const next = new Set(seen);
            next.add(name);
            cost += measure(frag?.selectionSet, depth, next);
          }
        }
        return cost;
      };
      const cost = measure(node.selectionSet, 1, new Set());
      if (cost > maxCost) {
        context.reportError(
          new GraphQLError(`query cost ${cost} exceeds maximum of ${maxCost}`, {
            nodes: [node],
            extensions: { code: RuntimeErrorCode.INVALID_INPUT },
          }),
        );
      }
    },
  });
}

/** Envelop plugins enforcing service limits at validation time. */
export function securityPlugins(limits?: ServiceLimits): Plugin[] {
  const merged = { ...DEFAULT_LIMITS, ...limits };
  return [
    {
      onValidate({ addValidationRule }) {
        addValidationRule(depthCostRule(merged.maxDepth, merged.maxCost, merged.maxPageSize));
      },
    },
  ];
}
