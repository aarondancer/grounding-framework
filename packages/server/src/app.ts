import yoga from "@elysiajs/graphql-yoga";
import {
  buildSchema,
  createLoaders,
  type GraphQLContext,
  type ServiceContext,
  securityPlugins,
  toGraphQLError,
} from "@grounding/graphql";
import { Elysia } from "elysia";

export type ServerDeps = ServiceContext;

/**
 * Reusable Elysia app: /graphql via GraphQL Yoga plus the two allowed
 * infrastructure endpoints. Mounted inside TanStack Start server routes.
 */
export function createServerApp(deps: ServerDeps) {
  const services: ServiceContext = deps;
  const schema = buildSchema();

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
        schema,
        // Per-request context: host services + request + batching loaders.
        // Yoga's `context` accepts a factory (initialContext) => ctx; the
        // Elysia adapter forwards it verbatim but its .d.ts mistypes the prop
        // as the resolved context value — cast locally.
        // `loaders` is only reachable after resolvers check `services.db`.
        context: ((initial: { request: Request }): GraphQLContext => ({
          services,
          request: initial.request,
          loaders: deps.db
            ? createLoaders(deps.db)
            : (null as unknown as GraphQLContext["loaders"]),
        })) as unknown as GraphQLContext,
        plugins: securityPlugins(deps.limits),
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
