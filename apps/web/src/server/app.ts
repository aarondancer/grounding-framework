import { cacheConfigFromEnv, createRuntimeCache, type RuntimeCache } from "@grounding/cache";
import { connect, type Database } from "@grounding/db";
import { createServerApp } from "@grounding/server";

/**
 * Server-only singleton: lazily creates the Elysia app (and infra deps) once
 * per process. Imported dynamically by server routes so nothing lands in the
 * browser bundle.
 */
let cached: { app: ReturnType<typeof createServerApp> } | null = null;
let cacheClient: RuntimeCache | null = null;

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
    }),
  };
  return cached.app;
}

/** Forward a TanStack Start server-route request to the Elysia app. */
export async function forwardToServerApp(request: Request): Promise<Response> {
  const app = await getServerApp();
  return app.handle(request);
}
