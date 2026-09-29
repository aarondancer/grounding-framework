import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Resolver types generated from the canonical SDL (graphql/schema.graphql).
 * Used for typed resolver signatures — run `bun run codegen` after SDL edits.
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
  },
};

export default config;
