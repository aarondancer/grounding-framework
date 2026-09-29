---
title: "ADR-0005: GraphQL browse vs delivery authorization"
status: accepted
date: 2026-02-19
---

# ADR-0005: GraphQL browse vs delivery authorization

## Context

spec/09 exposes browse queries (`concepts`, `knowledgeItems`, `skills`,
`tools`, `promptFragments`, `dimensions`, `selectionGroups`,
`retrievalProfiles`, `agentTemplates`, `ontologyNeighborhood`) so the
Explorer can be built entirely on GraphQL. The spec does not state whether
authorization/applicability expressions filter these browse results.

spec/11 requires that unauthorized content not leak through retrieval
diagnostics — but says nothing about the authored catalog itself.

## Decision

Browse queries expose the materialized catalog verbatim for the resolved
default namespace; they do not evaluate authorization/applicability
expressions. Content-level gates apply only to the *delivery* surfaces
(`retrieve`, `assembleAgent`, `resolveConcepts`) — where unauthorized
candidates are excluded and diagnostics redact their identity.

Rationale: the catalog is a faithful mirror of the Git-authored source,
which is plaintext. The privilege boundary is repository access
(spec/11 already treats Git access as privileged); runtime authorization
expressions exist to scope *contextual delivery to agents*, not to hide
the catalog from platform operators. Filtering browse would also make
Explorer's authoring/debugging views (which exist to inspect exactly
those rules) incoherent.

Corollaries:

- `trust: server` dimensions can only be set by the host `trustedContext`
  hook; clients attempting them get `CONTEXT_DIMENSION_NOT_CLIENT_SETTABLE`.
- v1 emits retrieval/assembly exclusions with `redacted: true` and blank
  entity refs for every caller — no privileged diagnostic permission
  exists yet, so spec/09's optional restricted-metadata path stays unused.
- Key-scoped browse refs (`EntityRefInput.key`) resolve against the
  default namespace; with multiple namespaces materialized, callers must
  use `id` refs (ambiguity fails with `NAMESPACE_NOT_FOUND`/`INVALID_INPUT`).

## Consequences

- Explorer can render full catalog/browse pages without a permission
  model; authn stays a host concern in front of `/graphql`.
- Any future restricted-metadata diagnostics permission needs a context
  hook plus service-level support — noted as follow-up, not built in v1.
- Per-request timeouts are not enforced at the GraphQL seam in v1; depth,
  cost, and page-size ceilings are. Reverse-proxy timeouts are the
  intended v1 guard.
