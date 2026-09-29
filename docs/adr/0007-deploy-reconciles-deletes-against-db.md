# ADR-0007: Deploy reconciles deletes against DB state, not the manifest

`grounding deploy --ref <sha>` materializes an immutable Git revision from a detached worktree, so no `.grounding/manifest.json` exists there. Before this ADR, `planMaterialization` computed `deletes` only from `manifest.entities` — a manifest-less build would upsert everything but delete nothing, leaving entities from a newer revision stranded after a rollback deploy.

We decided the delete baseline is the **database's current entity ids** (`namespaceEntityIds`), not the manifest. The manifest remains the upsert-diff optimization (its `compiledHash`/`semanticHash` comparisons avoid rewriting unchanged rows), but deletes are always computed as `dbIds − compiledIds`. This makes `build` self-healing against manifest/DB drift and satisfies spec/07's "manifest deletion does not compromise correctness" invariant.

Two consequences:

- `build --clean` no longer deletes `deployments` rows. They are audit history, not runtime state — needed for `grounding deployments` to list rollback targets. Prior rows are superseded inside the same transaction.
- Deployments are recorded with a `deploying → active | failed` lifecycle: `beginDeployment` inserts a `deploying` row before the entity transaction so a crashed materialization is visible in history rather than absent.