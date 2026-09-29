import { describe, expect } from "bun:test";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { connect } from "@grounding/db";
import { dbTest as it, writeCorpus } from "@grounding/test-support";
import { runDeploy, runDeployments } from "./index.ts";

/**
 * Immutable Git-revision deployment (M9). Real git repo fixture, real
 * PostgreSQL: deploy HEAD → deploy --ref prior sha = rollback.
 * Skipped without DATABASE_URL; CI always sets it.
 */

const NS = "019f0000-0000-7000-8000-000000000001";

function corpusFiles(conceptKey: string, conceptId: string): Record<string, string> {
  return {
    "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
    "namespace.jsonc": `{"id":"${NS}","key":"deploy-test","name":"DT","defaultRetrievalProfile":"default"}`,
    "retrieval-profiles/default.jsonc": `{"id":"019f0000-0000-7000-8000-000000000010","key":"default"}`,
    "concepts/main.jsonc": `{"id":"${conceptId}","key":"${conceptKey}","name":"${conceptKey}","status":"published"}`,
  };
}

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, { cwd, encoding: "utf8" }).trim();
}

function commit(dir: string): string {
  git(dir, ["add", "-A"]);
  git(dir, ["-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "c"]);
  return git(dir, ["rev-parse", "HEAD"]);
}

describe("grounding deploy", () => {
  it("deploys HEAD, deploys --ref for rollback, and preserves deployment history", async () => {
    const dir = writeCorpus(
      "grounding-deploy-",
      corpusFiles("alpha", "019f0000-0000-7000-8000-000000000020"),
    );
    git(dir, ["init", "-qb", "main"]);
    const sha1 = commit(dir);

    const { pool } = connect();
    const revision = async (): Promise<number> => {
      const s = await pool.query(
        "select runtime_revision from namespace_runtime_state where namespace_id = $1",
        [NS],
      );
      return Number(s.rows[0]?.runtime_revision ?? 0);
    };
    try {
      const before = await revision();

      // Deploy v1.
      expect(await runDeploy({ format: "json" }, dir)).toBe(0);
      let keys = await pool.query("select key from concepts where namespace_id = $1", [NS]);
      expect(keys.rows.map((r: { key: string }) => r.key)).toEqual(["alpha"]);

      // Commit v2 (alpha removed, beta added), dirty the tree (gamma is NOT
      // committed — must not leak into the deployment), then deploy HEAD.
      writeFileSync(
        join(dir, "concepts/main.jsonc"),
        `{"id":"019f0000-0000-7000-8000-000000000021","key":"beta","name":"beta","status":"published"}`,
      );
      const sha2 = commit(dir);
      writeFileSync(
        join(dir, "concepts/main.jsonc"),
        `{"id":"019f0000-0000-7000-8000-000000000022","key":"gamma","name":"gamma","status":"published"}`,
      );
      expect(await runDeploy({ format: "json" }, dir)).toBe(0);
      keys = await pool.query("select key from concepts where namespace_id = $1", [NS]);
      expect(keys.rows.map((r: { key: string }) => r.key)).toEqual(["beta"]);

      // Rollback: redeploy the prior immutable revision. Reconcile deletes
      // (DB baseline) remove beta even though the worktree has no manifest.
      expect(await runDeploy({ ref: sha1, format: "json" }, dir)).toBe(0);
      keys = await pool.query("select key from concepts where namespace_id = $1", [NS]);
      expect(keys.rows.map((r: { key: string }) => r.key)).toEqual(["alpha"]);

      // History: three deployments kept; exactly one active, pointing at the
      // rolled-back commit.
      const deployments = await pool.query(
        "select d.git_commit, d.status, (s.active_deployment_id = d.id) as active \
         from deployments d \
         left join namespace_runtime_state s \
           on s.namespace_id = d.namespace_id and s.environment = d.environment \
         where d.namespace_id = $1",
        [NS],
      );
      expect(deployments.rows.length).toBe(3);
      const byStatus = deployments.rows.reduce(
        (acc: Record<string, number>, r: { status: string }) => ({
          ...acc,
          [r.status]: (acc[r.status] ?? 0) + 1,
        }),
        {},
      );
      expect(byStatus).toEqual({ superseded: 2, active: 1 });
      const active = deployments.rows.find((r: { active: boolean }) => r.active);
      expect(active.git_commit).toBe(sha1);
      expect(deployments.rows.map((r: { git_commit: string }) => r.git_commit).sort()).toEqual(
        [sha1, sha1, sha2].sort(),
      );

      // Each deploy bumped the runtime revision (cache namespace rotation,
      // spec/16); state points at the rolled-back commit.
      expect(await revision()).toBe(before + 3);
      const state = await pool.query(
        "select git_commit from namespace_runtime_state where namespace_id = $1",
        [NS],
      );
      expect(state.rows[0].git_commit).toBe(sha1);
    } finally {
      await pool.query("delete from namespaces where id = $1", [NS]);
      await pool.end();
    }
  });

  it("deployments lists history for the corpus namespace", async () => {
    const dir = writeCorpus(
      "grounding-deploy-list-",
      corpusFiles("alpha", "019f0000-0000-7000-8000-000000000023"),
    );
    git(dir, ["init", "-qb", "main"]);
    commit(dir);
    const { pool } = connect();
    try {
      expect(await runDeploy({ format: "json" }, dir)).toBe(0);
      const captured: string[] = [];
      const orig = process.stdout.write.bind(process.stdout);
      process.stdout.write = ((chunk: string) => {
        captured.push(String(chunk));
        return true;
      }) as typeof process.stdout.write;
      let code: number;
      try {
        code = await runDeployments({ format: "json" }, dir);
      } finally {
        process.stdout.write = orig;
      }
      expect(code).toBe(0);
      const out = JSON.parse(captured.join("")) as {
        namespaceId: string;
        deployments: { status: string; active: boolean }[];
      };
      expect(out.namespaceId).toBe(NS);
      expect(out.deployments.length).toBeGreaterThanOrEqual(1);
      expect(out.deployments[0]?.active).toBe(true);
      expect(out.deployments[0]?.status).toBe("active");
    } finally {
      await pool.query("delete from namespaces where id = $1", [NS]);
      await pool.end();
    }
  });

  it("refuses to deploy outside a git repository", async () => {
    const dir = writeCorpus(
      "grounding-deploy-nogit-",
      corpusFiles("alpha", "019f0000-0000-7000-8000-000000000024"),
    );
    expect(await runDeploy({ format: "json" }, dir)).toBe(1);
  });

  it("fails cleanly on an unresolvable ref", async () => {
    const dir = writeCorpus(
      "grounding-deploy-badref-",
      corpusFiles("alpha", "019f0000-0000-7000-8000-000000000025"),
    );
    git(dir, ["init", "-qb", "main"]);
    commit(dir);
    const { pool } = connect();
    try {
      expect(await runDeploy({ ref: "refs/heads/does-not-exist", format: "json" }, dir)).toBe(1);
    } finally {
      await pool.query("delete from namespaces where id = $1", [NS]);
      await pool.end();
    }
  });
});
