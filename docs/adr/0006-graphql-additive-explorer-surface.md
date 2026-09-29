---
title: "ADR-0006: Additive GraphQL surface for Explorer (gates, backlinks, source links)"
status: accepted
date: 2026-02-19
---

# ADR-0006: Additive GraphQL surface for Explorer (gates, backlinks, source links)

## Context

spec/10 requires the Explorer to display gate expressions, simulate them under
the persistent context, show dimension "used by" backlinks, link catalog rows
to their authored source files on GitHub, and let users browse
reverse-dependencies from a concept to the entities that reference it.

The authored SDL in `graphql/schema.graphql` (locked at M0) exposed none of
these: gated entities did not return their `authorization`/`applicability`
expressions, `DimensionDefinition` had no usage backlinks, browse inputs had
no `concept` filter, `SourceLocation.viewUrl` had no persisted repository
metadata to build from, and there was no gate-simulation query.

## Decision

Extend the SDL **additively only** — no existing field or input changed
shape, no semantics altered:

- `authorization`/`applicability` (`JSON`) on `KnowledgeChunk`, `Skill`,
  `Tool`, `PromptFragment` — the authored gate expressions verbatim.
- `Query.simulateGates(input: GateSimulationInput!): GateSimulation!` —
  evaluates one entity's gates under a caller-supplied context through the
  normative rule engine (`@grounding/core`), returning `{ state, eligible,
  specificity, diagnostics }` per gate. `specificity` is the normative
  (positiveLeafCount, hierarchyDepth) tuple so the Explorer can apply
  selection-group ordering modes itself.
- `DimensionDefinition.usedBy: [DimensionUsage!]!` — every gated entity whose
  authorization/applicability expression references the dimension, computed
  from the materialized catalog via `leafDimensions`.
- `concept` filter on `SkillsInput`, `ToolsInput`, `PromptFragmentsInput`,
  and `KnowledgeItemsInput` — exact concept key; the concept's backlink
  browse.
- `Tool.usedBy` / `PromptFragment.usedBy: [EntityRef!]!` — reverse link-table
  lookups (`skill_tools`, `template_prompt_fragments`,
  `skill_prompt_fragments`) for the spec/10 "used by" backlink sections on
  tool and fragment detail pages.
- `OntologyNeighborhood.chunks: [KnowledgeChunk!]!` — chunks linked to any
  neighborhood concept via `chunk_concepts`; powers the Explorer "linked
  chunks" toggle (spec/10).
- `SourceLocation.repositoryUrl`/`repositoryRef`/`viewUrl` — populated from
  `repository.url` in `grounding.config.jsonc` plus the build's git commit;
  persisted as build provenance so links stay pinned to the materialized
  revision.

## Consequences

- Existing clients are unaffected; every addition is a nullable-or-list field
  or a new optional input key.
- `simulateGates` reuses the same `evaluateAuthorization`/`evaluateExpression`
  path as retrieval — Explorer can never diverge from normative semantics.
- `usedBy` is computed per-request over four small gated tables; if catalogs
  grow large this becomes a materialized backlink index — noted as follow-up.
- Browse stays gate-free per ADR-0005: expressions are *displayed*, not
  enforced, on browse surfaces.
