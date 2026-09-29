# 10 — Grounding Explorer

## Purpose

Read-only observability, navigation, visualization, experimentation, and diagnostics. It is not an admin/CMS.

## Locked implementation

Explorer is a React application built with TanStack Start. Domain data is loaded through urql/Graphcache against the canonical GraphQL API during SSR and client navigation. Base UI provides headless primitives, Tailwind CSS provides styling, React Flow + Dagre provide graph visualization/layout, and TanStack Table provides table behavior. Do not introduce Radix/shadcn primitives or TanStack Query.

## Navigation

```text
Overview
Explore
  Concepts & Ontology
  Knowledge
  Domains
  Dimensions
  Selection Groups
Agent Assembly
  Templates
  Skills
  Tools
  Prompt Fragments
Playgrounds
  Retrieval
  Agent Assembly
Developer
  GraphQL
  Runtime
```

Add global search/command palette across all major entity types.

## Cross-navigation

Every entity view exposes clickable relationships and backlinks (`used by`, `requires`, `linked concepts`, `knowledge using concept`, etc.). Breadcrumbs preserve location. Source link opens exact GitHub file at deployed commit when repository metadata permits.

## Ontology visualization

Interactive local neighborhood graph, not whole-graph hairball. Controls: incoming/outgoing/both, relation filters, depth 1/2, domain filter, expand node, recenter, linked chunks. Selecting a node opens details without losing graph state.

## Dimensions

Render hierarchies as trees and dynamically generate context controls based on value type/cardinality. Provide `used by` counts and backlinks.

## Persistent context simulator

User builds simulated context once; it remains available while browsing and playground testing. Pages can display whether current context is authorized/applicable and which selection-group variant wins.

## Retrieval playground

Inputs: query, context, profile, limits, lifecycle debug toggles (privileged). Visualize pipeline counts and movement, concept resolution, candidates by channel, authorization/applicability exclusions, selection groups, ontology-derived candidate channel, RRF components, packing, timings, why/why-not.

## Agent Assembly playground

Inputs: template, task, context, runtime bindings, budgets/profile. Visualize selected skills/fragments/tools, composition tree, tool dependency graph with required/optional edges, unavailable causes, bootstrap knowledge, rendered prompt, budget usage, timings.

## GraphQL panel

Provide a raw GraphQL query/variables/result panel for developer integration. It uses the same schema; no separate Explorer API.

## Non-goals

No editing, commits, approvals, deployments, user/role management, or generic SQL/database console.
