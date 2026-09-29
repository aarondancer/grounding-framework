import yoga from "@elysiajs/graphql-yoga";
import type { RuntimeCache } from "@grounding/cache";
import type { Database } from "@grounding/db";
import { buildSchema, type ServiceContext, toGraphQLError } from "@grounding/graphql";
import { Elysia } from "elysia";

export type ServerDeps = {
  db: Database | null;
  cache: RuntimeCache | null;
  environment: string;
};

/**
 * Reusable Elysia app: /graphql via GraphQL Yoga plus the two allowed
 * infrastructure endpoints. Mounted inside TanStack Start server routes.
 */
export function createServerApp(deps: ServerDeps) {
  const services: ServiceContext = { db: deps.db, environment: deps.environment };

  const app = new Elysia()
    .get("/healthz", async () => ({
      ok: true,
      valkey: deps.cache ? await deps.cache.ping() : "unconfigured",
    }))
    .get("/readyz", async () => {
      const checks: Record<string, unknown> = {};
      let ready = true;
      if (deps.db) {
        try {
          await deps.db.execute("select 1");
          checks.postgres = true;
        } catch {
          checks.postgres = false;
          ready = false;
        }
      } else {
        checks.postgres = "unconfigured";
      }
      // Cache failure degrades to miss; /readyz still reports state (spec/16).
      checks.valkey = deps.cache ? await deps.cache.ping() : "unconfigured";
      return new Response(JSON.stringify({ ready, checks }), {
        status: ready ? 200 : 503,
        headers: { "content-type": "application/json" },
      });
    })
    .use(
      yoga({
        path: "/graphql",
        schema: buildSchema(services),
        // Typed errors carry stable extensions.code (spec/09); unexpected
        // errors mask to INTERNAL_ERROR.
        maskedErrors: {
          errorMessage: "internal error",
          maskError: (error) => toGraphQLError(error),
        },
      }),
    );

  return app;
}
