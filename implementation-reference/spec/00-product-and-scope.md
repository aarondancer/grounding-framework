# 00 — Product, Scope, and Locked Decisions

## Purpose

Build a low-latency grounding platform whose core value is **context engineering**: selecting the right knowledge and agent resources for a request based on semantics, ontology, applicability, authorization, precedence, and quality.

## Core axes

1. Content — knowledge items, chunks, provenance.
2. Semantics — concepts, aliases, domains, relation types, ontology graph.
3. Applicability — when/where/for whom knowledge applies and is allowed.
4. Quality — authority, freshness/effective dates, priority, lifecycle.

## V1 must ship

- namespaces (one per deployment by default)
- concepts, aliases, domains, relation types, relations
- knowledge items/chunks/sources
- dimensions and hierarchical dimension values
- authorization/applicability expressions
- selection groups (`highest_priority`, `most_specific`, `all`)
- lifecycle states: `draft`, `published`, `deprecated`
- simple retrieval profiles
- hybrid retrieval and context packing
- Agent Assembly: templates, skills, prompt fragments, tools, tool dependencies, bootstrap knowledge
- Git/GitHub authoring
- deterministic validator/compiler
- PostgreSQL 17 runtime
- Valkey shared/server cache
- GraphQL external API implemented with Elysia + GraphQL Yoga
- read-only Explorer implemented with TanStack Start + React + urql/Graphcache + Base UI

## V1 simplifications

- no full admin/editing UI
- no content audit log beyond Git; deployment/runtime logs only
- no platform-owned feature-flag system; feature flags may be supplied in normalized request context
- retrieval profiles are simple named configs; no inheritance
- concept types are plain strings; no registry
- domains are first-class but lightweight/non-central
- semantic index is generic infrastructure but only opt-in entity types are embedded
- caller supplies one final normalized context object; no multi-source context merging
- one embedding dimensionality per installation in v1
- one runtime revision counter in v1
- one primary source per knowledge item in v1

## Semantic entity types indexed in v1

- concept
- knowledge_chunk
- skill
- tool
- prompt_fragment

## Deferred to v1.5+

First-class capabilities/policies, richer profile management, concept-type registry, multi-source context merging, granular revision counters, deployment promotion/artifact system, preview environments, runtime binding version negotiation, advanced provenance, blue/green embedding migration, automatic rollback, control plane, cross-namespace imports.

## OpenKnowledge distinction

Do not use `OpenKnowledge`, `Open Knowledge`, `OKF`, or `Open Knowledge Format` as internal naming. This platform is not a Markdown workspace/wiki/editor; it is a structured grounding/runtime system.
