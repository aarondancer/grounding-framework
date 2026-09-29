<!-- Reviewer checklist — delete lines that don't apply. See docs/testing/README.md. -->

## What & why

<!-- One paragraph: what changed and why. Link the spec section or ADR. -->

## Tests

<!-- Check the layers this change touches and name the tests added. -->

- [ ] Unit (`*.test.ts` next to the code)
- [ ] DB integration (real Postgres, gated via `@grounding/test-support`)
- [ ] Valkey integration (real cache)
- [ ] Eval fixture updated/added (`grounding/evals/`)
- [ ] E2E — justify below why a lower layer can't cover this
- [ ] N/A — no behavior change (explain in What & why)

## Verified

- [ ] `bun run lint` + `bun run typecheck` clean
- [ ] `bun test` (or `bun run test:integration`) passes
- [ ] CI green — checked after push
