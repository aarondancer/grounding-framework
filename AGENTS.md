---
description: "Agent orientation for the grounding-platform repo: doc map, working rules, design and domain language."
title: AGENTS.md — repo guide for agents
---

# Grounding Platform

A Git-authored, PostgreSQL-materialized knowledgebase + ontology + contextual retrieval platform, with Agent Assembly. This repo currently contains **only the locked v1 spec pack** in `implementation-reference/` — no implementation code exists yet. Build it per `implementation-reference/implementation/implementation-plan.md`, which also defines the monorepo package layout.

## Find the right doc

Paths below are under `implementation-reference/`. Read the file for the branch you're on, not the whole pack.

- Implementing anything: `implementation/agent-build-instructions.md` (mission, priority order, locked invariants, per-PR deliverables), then the `spec/` file for the subsystem you're touching.
- Picking a dependency or tool: `spec/15-locked-technology-stack.md` + `implementation/open-decisions.md`. Anything not listed as open is locked.
- Authorization/applicability/specificity/selection semantics: `spec/12-rule-engine-normative.md` (normative).
- Chunking, text normalization, FTS/trigram/search text: `spec/13-chunking-normalization-search.md` (normative).
- Diagnostic codes, stage names, reason codes: `spec/14-diagnostic-error-code-registry.md`. Closed vocabularies — never invent synonymous strings.
- Caching: `spec/16-valkey-caching.md` + `skills/valkey-production/SKILL.md`.
- Authoring or fixing a source file: the matching `schemas/*.schema.json` contract plus a working example under `examples/grounding/`.
- Scope check ("is X in v1?"): `implementation/scope-matrix.md`.
- Acceptance bar: `implementation/definition-of-done.md`.
- Architecture and data flow: `spec/01-architecture.md`; full reading order in `README.md`.

`FULL_V1_SPEC.md` is a concatenated rendering of README + REVIEW_FIXES + spec/ + implementation/. Read the individual files; don't load it whole.

## Working rules

- The spec is normative and the stack is locked. On ambiguity, choose the smallest behavior compatible with locked invariants and record a short ADR — never a silent redesign, never scope expansion.
- Real PostgreSQL/Valkey semantics are required in tests; mocking pgvector/FTS/trigram is not valid sole verification.
- Cache failure is a miss; it must never change authorization or result semantics.
- Local services: `docker compose -f ops/compose.yaml up -d` (Postgres 17 + pgvector, Valkey; details in `ops/README.md`).
- This repo is an OpenKnowledge project (`.ok/`): route `.md` reads/writes through the `open-knowledge` MCP tools (`exec`, `search`, `write`, `edit`), never native file tools — the `open-knowledge` project skill carries the full contract.

## Verifying while you work

- **Run the type checker continuously, not just at the end.** While implementing, re-run `bun run typecheck` (or the package-scoped `tsc -p <pkg>/tsconfig.json --noEmit`) after each meaningful change — treat it as the compile step, not a final gate. Where a TypeScript language server is available (e.g. `typescript-language-server` in editor/agent tooling), prefer its diagnostics over ad-hoc checking so errors surface at the edit site.
- Standard gates before claiming work done: `bun run lint`, `bun run typecheck`, `bun test`, `bun run --filter='@grounding/web' build`. A pre-commit hook runs lint + typecheck; keep it fast and honest rather than bypassing it.
- **Testing policy lives in `docs/testing/README.md` — follow its layer map.** Tests colocate as `*.test.ts` next to the code; service-dependent tests gate only through `@grounding/test-support` (`dbTest`, `dbCacheTest`, `valkeyTest`, `writeCorpus`, `makeTestServices`, `ensureBuilt`) — never hand-rolled `process.env` skips or fixture writers. CI sets `GROUNDING_REQUIRE_SERVICES=1`, so a missing service is a failure, not a silent skip (`bun run test:integration` runs the same gate locally). Evals (`bun run eval`, incl. `--kind agent` CLI backends) and e2e (`tests/e2e/`) are local-only — never wire them into CI.
- `apps/web` typecheck first runs `tsr generate` — `routeTree.gen.ts` is a build artifact, never edited by hand and not committed.
- **After every push, check CI.** `gh run list --limit 5`, then `gh run watch` or `gh run view --log-failed` on failure. Do not report a push as done until the `ci` workflow is green — if it failed, fix and push again in the same task.

## Design language

Design **deep modules** — a lot of behaviour behind a small interface, at a clean seam, tested through that interface. The shared vocabulary (module, interface, seam, adapter, depth, leverage, locality) is normative: `docs/codebase-design/README.md`. Reach for it whenever code is being designed, restructured, or named.

## Domain language

`CONTEXT.md` at the repo root is the project glossary — challenge fuzzy terms and record resolved ones inline as they crystallise. ADRs live in `docs/adr/` (created lazily, sequential numbering) and are for decisions that are hard to reverse, surprising without context, and a real trade-off — including the spec-ambiguity ADRs the build instructions call for. Discipline and formats: `docs/domain-modeling/README.md`.
