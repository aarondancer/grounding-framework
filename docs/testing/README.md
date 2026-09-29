---
title: Testing Guidelines
description: Normative test layers, placement, service gating, and per-change expectations — read before writing or modifying any test.
---

# Testing Guidelines

Normative basis: `implementation-reference/spec/11-testing-security-observability.md` + `implementation-reference/spec/15-locked-technology-stack.md` (§Testing and quality). This doc is the working policy: where tests live, which layer a change needs, and the mechanics every test shares.

## Layers and where they run

| Layer | Location | Services | Where it runs |
|---|---|---|---|
| 1. Unit | `packages/*/src/*.test.ts`, `apps/web/src/**/*.test.{ts,tsx}` | none — no DB, Valkey, network, or timers | `bun test` everywhere |
| 2. PostgreSQL integration | same colocated files | real Postgres (never mocked — pgvector/FTS/trigram semantics are the point) | `bun test` with `DATABASE_URL`; CI integration job |
| 3. Valkey integration | same colocated files | real Valkey via GLIDE | `bun test` with `VALKEY_ADDRESSES`; CI integration job |
| 4. Deterministic evals | fixtures in `grounding/evals/**`, runner in `packages/evals` | same services as 2–3 | **local only** — `bun run eval` |
| 5. E2E | `tests/e2e/**` | full stack | **local only, sparingly** — reserve for source→DB→API/UI round trips that integration tests can't cover |
| 6. Agent-run evals | `grounding eval --kind agent` via `packages/evals` backends | services + an agent CLI | **local only** |

Unit + integration is the default and the priority — for backend *and* frontend. E2E is the exception: add one only when no lower layer can express the behavior, because it is the slowest and most brittle layer.

## Hard rules

1. **Every new module or behavior change ships a test in the matching layer** (map below). At minimum one test per new public function/module.
2. **Service gating goes only through `@grounding/test-support`**: `dbTest` (Postgres), `dbCacheTest` (Postgres + Valkey), `valkeyTest` (Valkey only). Never write `process.env.X ? test : test.skip` in a test file.
3. **Fixtures come from `@grounding/test-support`**: `writeCorpus`, `makeTestServices`, `ensureBuilt`, `resetNamespaces`, `rebuildCanonicalCorpus`. No local corpus writers or service factories.
4. **CI treats missing services as failure**: the integration job sets `GROUNDING_REQUIRE_SERVICES=1`, so a skipped-for-missing-env test is a red CI, not a silent skip. Locally they still skip so `bun test` works without Compose.
5. **Each suite owns a unique namespace + UUID prefix**; cache-affecting tests use a fresh `environment` so revisioned keys stay isolated.
6. **Behavior, not implementation** — assert user-visible outcomes and stable spec/14 codes; never invent diagnostic strings.
7. **Deterministic evals use robust assertions** (`include`, `exclude`, `within top K`, `A outranks B`) — never exact ranks. Chunk refs are `knowledgeItemKey#chunkKey`.
8. **Frontend**: Testing Library component tests are the default for Explorer work; Playwright/browser E2E only for flows that genuinely need a browser.

## Which layer for your change

| Change | Minimum test |
|---|---|
| New function/module in `packages/` | Unit |
| SQL, materialization, schema, registry | DB integration |
| Cache behavior, key shapes, leases | Valkey integration |
| Retrieval/assembly pipeline behavior | DB integration and/or an eval fixture under `grounding/evals/` |
| GraphQL SDL/resolver | DB integration through the schema (`packages/graphql`) |
| Explorer component/page (`apps/web`) | Testing Library component test |
| Full source→DB→API round trip | e2e — sparingly; prefer covering via integration |
| Assembled-agent execution quality | agent eval (local) |

## Commands

- `bun test` — whole suite; service-dependent tests skip locally without env vars.
- `bun run test:integration` — applies migrations, then runs the suite with `GROUNDING_REQUIRE_SERVICES=1` (Compose must be up: `bun run compose:up`).
- `bun run eval` — deterministic evals; builds the corpus first (`-- --no-build` to skip).
- `bun run eval -- --kind agent --backend codex --effort low` — run assembled agents via a real backend.
- `bun run eval -- --kind agent --backend devin` — same via the Devin CLI.

## Agent eval backends (`packages/evals`)

Vendor-agnostic: `AgentBackend` is the contract (`packages/evals/src/backends/types.ts`); adding a backend = implement it + register in `backends/registry.ts`. Shipped backends:

- **codex** — `codex exec` non-interactive (`--json`, `--output-schema`, `-o`). Defaults: model `gpt-6-luna`, effort `medium`, sandbox `workspace-write`.
- **devin** — `devin -p` print mode. Defaults: model `swe-2-medium`, OS sandbox + Autonomous permissions, trust prompt skipped.
- **openai-compatible** — `POST /chat/completions`; covers LiteLLM, Ollama, vLLM. Requires `openaiCompatible.baseUrl` + `model`.

Resolution order: `--backend/--judge/--model/--effort` flags → env vars (`CODEX_BIN`/`CODEX_MODEL`/`CODEX_EFFORT`/`CODEX_SANDBOX`, `DEVIN_BIN`/`DEVIN_MODEL`, `OPENAI_BASE_URL`/`OPENAI_MODEL`/`OPENAI_API_KEY_ENV`, `LITELLM_BASE_URL`/`LITELLM_MODEL`, `GROUNDING_EVAL_AGENT_BACKEND`, `GROUNDING_EVAL_JUDGE_BACKEND`) → `<grounding-root>/evals.config.jsonc` → defaults. A backend that grades another run is wired with `--judge <name>`; judges prefer `--output-schema`/`response_format` structured output and fall back to parsing embedded JSON.
