# Hierarchy depth contribution for multi-valued enum rule operands

spec/12 defines specificity as the lexicographic tuple `(positiveMatchedLeafCount, hierarchyDepthSum)` and says "only the matched hierarchical enum constraint contributes hierarchy depth." It does not specify what a single leaf contributes when one operator references several enum values and more than one constraint matches — e.g. `includes_any: [US, US-TX]` or `includes_all: [US, US-TX-AUSTIN]` evaluated against context `US-TX-AUSTIN`.

Decision: a leaf contributes the **maximum** depth among its matched enum rule values. The tuple counts *leaves*, so one leaf contributes one depth value; taking the deepest matched constraint rewards the more specific authored rule and keeps a multi-valued leaf's contribution commensurate with a single-valued leaf's.

Alternatives considered:

- Sum all matched rule-value depths — rejected: it lets a leaf inflate its specificity by listing several ancestors of one constraint (`includes_any: [US, US-TX, US-TX-AUSTIN]` would contribute 0+1+2), which contradicts the leaf-counting semantics of the first tuple element and can be gamed by enumerating ancestors.
- Depth of the context value — rejected: specificity is a property of the authored rule, not the request; a broad `US` rule must not score the depth of a specific `US-TX-AUSTIN` context.

Non-hierarchical and non-enum leaves contribute depth 0, per spec.
