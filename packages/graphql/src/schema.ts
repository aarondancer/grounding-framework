import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { type Diagnostic, GroundingError, RuntimeErrorCode } from "@grounding/core";
import { GraphQLError } from "graphql";
import { createSchema, type GraphQLSchemaWithContext } from "graphql-yoga";
import type { GraphQLContext } from "./context.ts";
import { buildResolvers } from "./resolvers.ts";
import { DateTimeScalar, JSONScalar, LongScalar } from "./scalars.ts";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Canonical SDL lives at repo root: graphql/schema.graphql (spec/09).
 * Walks up from this module (src tree or bundled output inside a repo
 * checkout); GROUNDING_GRAPHQL_SDL_PATH overrides for standalone deploys.
 */
function schemaPath(): string {
  const override = process.env.GROUNDING_GRAPHQL_SDL_PATH;
  if (override) return override;
  let dir = here;
  for (;;) {
    const candidate = resolve(dir, "graphql/schema.graphql");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new GroundingError(
        RuntimeErrorCode.INTERNAL_ERROR,
        "graphql/schema.graphql not found above module path",
      );
    }
    dir = parent;
  }
}

export function loadSDL(): string {
  return readFileSync(schemaPath(), "utf8");
}

/**
 * SDL + resolver map. Services flow through the per-request context
 * (ServiceContext in context.ts), so schema building takes no deps.
 */
export function buildSchema(): GraphQLSchemaWithContext<GraphQLContext> {
  return createSchema<GraphQLContext>({
    typeDefs: loadSDL(),
    resolvers: {
      JSON: JSONScalar,
      DateTime: DateTimeScalar,
      Long: LongScalar,
      ...buildResolvers(),
    },
  });
}

/** Map thrown errors to GraphQL errors with stable extensions.code (spec/09). */
export function toGraphQLError(error: unknown): GraphQLError {
  // Yoga/envelop wrap resolver throws in GraphQLError; unwrap. Duck-typed —
  // duplicate graphql installs must not break instanceof checks.
  const wrapped = error as { originalError?: unknown; extensions?: { code?: unknown } };
  const original = wrapped?.originalError ?? error;
  const extCode = (original as { extensions?: { code?: unknown } })?.extensions?.code;
  if (typeof extCode === "string" && original instanceof GraphQLError) {
    return original;
  }
  // Service request errors (retrieval/assembly) carry a diagnostic list;
  // the first error-severity diagnostic's registry code becomes
  // extensions.code and the full list is exposed under extensions.diagnostics
  // (services already redact unauthorized identity — spec/11).
  const diagnostics = (original as { diagnostics?: Diagnostic[] })?.diagnostics;
  if (Array.isArray(diagnostics) && diagnostics.length > 0) {
    const primary =
      diagnostics.find((d) => d.severity === "error")?.code ??
      diagnostics[0]?.code ??
      RuntimeErrorCode.INTERNAL_ERROR;
    return new GraphQLError(original instanceof Error ? original.message : "request failed", {
      extensions: {
        code: primary,
        diagnostics: diagnostics.map((d) => ({
          severity: d.severity,
          code: d.code,
          message: d.message,
          ...(d.location ? { location: d.location } : {}),
        })),
      },
    });
  }
  if (original instanceof GroundingError) {
    return new GraphQLError(original.message, {
      extensions: {
        code: original.code,
        ...(original.details ? { details: original.details } : {}),
      },
    });
  }
  return new GraphQLError("internal error", {
    extensions: { code: RuntimeErrorCode.INTERNAL_ERROR },
  });
}
