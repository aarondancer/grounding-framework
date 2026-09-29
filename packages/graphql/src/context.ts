import type { Database } from "@grounding/db";

/**
 * Service surface the resolvers call into. Concrete implementations are wired
 * by the server package; retrieval/assembly land in M5/M6 and fill these in.
 */
export type ServiceContext = {
  db: Database | null;
  environment: string;
};

export type GraphQLContext = ServiceContext & {
  request: Request;
};
