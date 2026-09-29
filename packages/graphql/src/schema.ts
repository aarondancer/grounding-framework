import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GroundingError, RuntimeErrorCode } from "@grounding/core";
import { GraphQLError } from "graphql";
import { createSchema, type GraphQLSchemaWithContext } from "graphql-yoga";
import type { GraphQLContext, ServiceContext } from "./context.ts";
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

function notImplemented(name: string): never {
  throw new GroundingError(RuntimeErrorCode.INTERNAL_ERROR, `${name} is not implemented yet`);
}

export function buildSchema(services: ServiceContext): GraphQLSchemaWithContext<GraphQLContext> {
  return createSchema<GraphQLContext>({
    typeDefs: loadSDL(),
    resolvers: {
      JSON: JSONScalar,
      DateTime: DateTimeScalar,
      Long: LongScalar,
      Query: {
        runtimeInfo: () => {
          if (!services.db) {
            throw new GroundingError(RuntimeErrorCode.INTERNAL_ERROR, "database not configured");
          }
          // Minimal M0 runtime info; full deployment state lands with the compiler.
          return {
            namespace: { id: "unknown", key: "unknown" },
            environment: services.environment,
            runtimeRevision: 0,
            gitCommit: null,
            sourceHash: "unknown",
            compilerVersion: null,
          };
        },
        retrieve: () => notImplemented("retrieve"),
        resolveConcepts: () => notImplemented("resolveConcepts"),
        assembleAgent: () => notImplemented("assembleAgent"),
        namespace: () => notImplemented("namespace"),
        concepts: () => notImplemented("concepts"),
        concept: () => notImplemented("concept"),
        ontologyNeighborhood: () => notImplemented("ontologyNeighborhood"),
        domains: () => notImplemented("domains"),
        knowledgeItems: () => notImplemented("knowledgeItems"),
        knowledgeItem: () => notImplemented("knowledgeItem"),
        knowledgeChunk: () => notImplemented("knowledgeChunk"),
        dimensions: () => notImplemented("dimensions"),
        dimension: () => notImplemented("dimension"),
        selectionGroups: () => notImplemented("selectionGroups"),
        retrievalProfiles: () => notImplemented("retrievalProfiles"),
        agentTemplates: () => notImplemented("agentTemplates"),
        agentTemplate: () => notImplemented("agentTemplate"),
        skills: () => notImplemented("skills"),
        skill: () => notImplemented("skill"),
        tools: () => notImplemented("tools"),
        tool: () => notImplemented("tool"),
        promptFragments: () => notImplemented("promptFragments"),
        promptFragment: () => notImplemented("promptFragment"),
      },
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
