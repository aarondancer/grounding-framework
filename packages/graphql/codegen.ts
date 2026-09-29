import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Resolver types generated from the canonical SDL (graphql/schema.graphql).
 * Used for typed resolver signatures — run `bun run codegen` after SDL edits.
 *
 * Also generates, for the Explorer (`apps/web`): typed operation results for
 * every document in `lib/api.ts` (spec/15 — documents are generated, never
 * hand-mirrored) and an introspection JSON for Graphcache's union/interface
 * resolution (`cacheExchange({ schema })`).
 */
const config: CodegenConfig = {
  schema: "../../graphql/schema.graphql",
  generates: {
    "src/generated/resolvers-types.ts": {
      plugins: ["typescript", "typescript-resolvers"],
      config: {
        enumsAsTypes: false,
        scalars: {
          JSON: "unknown",
          DateTime: "Date",
          Long: "string",
        },
        // Resolvers take hand-mapped context; don't bind generated types to
        // GraphQLContext here (parent types are service/DB rows, not entities).
        useTypeImports: true,
      },
    },
    "../../apps/web/src/generated/operations.ts": {
      documents: "../../apps/web/src/lib/api.ts",
      plugins: ["typescript-operations"],
      config: {
        // Operation result/variable types only — the schema types live in
        // resolvers-types.ts; the Explorer imports operation types.
        onlyOperationTypes: true,
        enumsAsTypes: false,
        scalars: {
          JSON: "unknown",
          DateTime: "string",
          Long: "string",
        },
        useTypeImports: true,
      },
    },
    "../../apps/web/src/generated/schema.json": {
      plugins: ["introspection"],
      config: { minify: true },
    },
  },
};

export default config;
