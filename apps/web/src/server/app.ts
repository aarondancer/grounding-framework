import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cacheConfigFromEnv, createRuntimeCache, type RuntimeCache } from "@grounding/cache";
import { hashObject } from "@grounding/core";
import { connect, type Database } from "@grounding/db";
import {
  type EmbeddingConfig,
  type EmbeddingProvider,
  resolveProvider,
} from "@grounding/embeddings";
import { createServerApp } from "@grounding/server";
import { findGroundingRoot, GROUNDING_CONFIG_NAME, parseJsonc } from "@grounding/source";

/**
 * Server-only singleton: lazily creates the Elysia app (and infra deps) once
 * per process. Imported dynamically by server routes so nothing lands in the
 * browser bundle.
 */
let cached: { app: ReturnType<typeof createServerApp> } | null = null;
let cacheClient: RuntimeCache | null = null;

/**
 * Resolve the runtime embedding provider from grounding.config.jsonc +
 * env overrides — mirroring `grounding build` so `configHash` keys the
 * embedding-content cache identically (spec/16).
 */
function resolveEmbedding(): { provider: EmbeddingProvider; configHash: string } | null {
  const root = findGroundingRoot(process.cwd());
  if (!root) return null;
  let config: EmbeddingConfig;
  try {
    const parsed = parseJsonc(readFileSync(join(root, GROUNDING_CONFIG_NAME), "utf8"), "config");
    config = ((parsed.value as { embedding?: EmbeddingConfig })?.embedding ??
      {}) as EmbeddingConfig;
  } catch {
    return null;
  }
  const resolved = resolveProvider(config, process.env);
  if (!("embed" in resolved)) return null; // provider unavailable → degrade
  return {
    provider: resolved,
    configHash: hashObject({
      provider: resolved.provider,
      model: resolved.model,
      dimensions: resolved.dimensions,
    }),
  };
}

export async function getServerApp() {
  if (cached) return cached.app;

  let db: Database | null = null;
  if (process.env.DATABASE_URL) {
    // `db` retains the underlying pool; no separate handle needed in M0.
    db = connect().db;
  }
  if (process.env.VALKEY_ADDRESSES || process.env.VALKEY_MODE) {
    try {
      cacheClient = await createRuntimeCache(cacheConfigFromEnv());
    } catch {
      cacheClient = null; // cache outage is a miss; health endpoints report it
    }
  }

  cached = {
    app: createServerApp({
      db,
      cache: cacheClient,
      environment: process.env.GROUNDING_ENV ?? "local",
      embedding: resolveEmbedding(),
    }),
  };
  return cached.app;
}

/** Forward a TanStack Start server-route request to the Elysia app. */
export async function forwardToServerApp(request: Request): Promise<Response> {
  const app = await getServerApp();
  return app.handle(request);
}
