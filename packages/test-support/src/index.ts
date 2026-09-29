import { afterAll, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { RuntimeCache } from "@grounding/cache";
import type { Database } from "@grounding/db";
import type { EmbeddingProvider } from "@grounding/embeddings";

/**
 * Shared test scaffolding (spec/11). The ONE place that knows how tests get
 * real services: do not re-implement env gating, corpus writers, or service
 * factories in test files — extend this module instead (docs/testing).
 */

// ---------------------------------------------------------------------------
// Service gating
// ---------------------------------------------------------------------------

/**
 * Missing required services are a hard failure when
 * GROUNDING_REQUIRE_SERVICES=1 (CI); locally they degrade to a skip so
 * `bun test` stays usable without Compose up.
 */
export function gatedTest(needs: { db?: boolean; cache?: boolean }) {
  const missing: string[] = [];
  if (needs.db && !process.env.DATABASE_URL) missing.push("DATABASE_URL");
  if (needs.cache && !process.env.VALKEY_ADDRESSES) missing.push("VALKEY_ADDRESSES");
  if (missing.length > 0 && process.env.GROUNDING_REQUIRE_SERVICES === "1") {
    return (name: string, fn: () => unknown | Promise<unknown>) =>
      test(name, () => {
        void fn;
        throw new Error(`required test services unavailable: ${missing.join(", ")}`);
      });
  }
  return missing.length ? test.skip : test;
}

/** Whether the shared test DB is configured — for `afterAll` cleanup hooks
 * that can't express gating through `dbTest`. */
export function servicesConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Requires real PostgreSQL (DATABASE_URL). */
export const dbTest = gatedTest({ db: true });
/** Requires real PostgreSQL + Valkey (DATABASE_URL + VALKEY_ADDRESSES). */
export const dbCacheTest = gatedTest({ db: true, cache: true });
/** Requires real Valkey only. */
export const valkeyTest = gatedTest({ cache: true });

// ---------------------------------------------------------------------------
// Corpus fixtures
// ---------------------------------------------------------------------------

const tmpDirs: string[] = [];

afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

/** Write a `Record<relativePath, contents>` corpus into a fresh tmpdir. */
export function writeCorpus(prefix: string, files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tmpDirs.push(dir);
  for (const [rel, raw] of Object.entries(files)) {
    const p = join(dir, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, raw, "utf8");
  }
  return dir;
}

// ---------------------------------------------------------------------------
// Services + materialization
// ---------------------------------------------------------------------------

export type TestServicesOptions = {
  /** `null` disables embedding entirely; absent → deterministic 1536. */
  provider?: EmbeddingProvider | null;
  /** Attach a real Valkey-backed RuntimeCache. */
  cache?: boolean;
  /** Fresh environment per run keeps revisioned cache keys isolated. */
  environment?: string;
};

export type TestServices = {
  db: Database;
  cache: RuntimeCache | null;
  embedding: { provider: EmbeddingProvider; configHash: string } | null;
  environment: string;
};

/** DB connection + service bundle matching RetrievalServices/AssemblyServices. */
export async function makeTestServices(opts: TestServicesOptions = {}) {
  const { connect } = await import("@grounding/db");
  const conn = connect();
  let cache: RuntimeCache | null = null;
  if (opts.cache) {
    const { cacheConfigFromEnv, createRuntimeCache } = await import("@grounding/cache");
    cache = await createRuntimeCache(cacheConfigFromEnv());
  }
  const provider =
    opts.provider === undefined
      ? (await import("@grounding/embeddings")).deterministicProvider(1536)
      : opts.provider;
  const services: TestServices = {
    db: conn.db,
    cache,
    embedding: provider ? { provider, configHash: "test-deterministic" } : null,
    environment: opts.environment ?? "local",
  };
  return { conn, services };
}

/** Clean-build a corpus dir into the test DB; throws on any diagnostic. */
export async function ensureBuilt(
  db: Database,
  dir: string,
  opts: { provider?: EmbeddingProvider } = {},
) {
  const { build } = await import("@grounding/compiler");
  const provider =
    opts.provider ?? (await import("@grounding/embeddings")).deterministicProvider(1536);
  const res = await build(dir, db, { clean: true, provider });
  if (!res.ok) throw new Error(`fixture build failed: ${JSON.stringify(res.diagnostics)}`);
}

/** Delete all namespaces — tests that resolve the *default* namespace need it. */
export async function resetNamespaces(db: Database) {
  const { sql } = await import("drizzle-orm");
  await db.execute(sql`delete from namespaces`);
}

/** Rebuild the repo's canonical `grounding/` corpus (shared-DB restore). */
export async function rebuildCanonicalCorpus(db: Database) {
  const { findGroundingRoot } = await import("@grounding/source");
  const root = findGroundingRoot(process.cwd());
  if (!root) return;
  await ensureBuilt(db, root);
}
