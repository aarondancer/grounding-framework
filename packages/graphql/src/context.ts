import type { Database } from "@grounding/db";
import type { RetrievalServices } from "@grounding/retrieval";
import type { Loaders } from "./loaders.ts";

/**
 * Server-side ceilings applied at the GraphQL seam (spec/09: depth/cost
 * controls, hard page sizes).
 */
export type ServiceLimits = {
  /**
   * Hard cap on connection `first` and `resolveConcepts.limit`; values
   * above it fail INVALID_INPUT.
   */
  maxPageSize?: number;
  /**
   * Server ceiling on every numeric retrieval/assembly budget the client
   * can raise (spec/09): limits.maxChunks, limits.maxTokens, and all four
   * AgentAssemblyBudgetInput fields. Values above it fail INVALID_INPUT.
   */
  maxBudget?: number;
  /** Max field-selection nesting depth (fragment cycles guarded). */
  maxDepth?: number;
  /**
   * Max field cost: each field costs 1; connection fields add
   * ceil(first/50) — a `first: 200` list field costs 5.
   */
  maxCost?: number;
};

export const DEFAULT_LIMITS: Required<ServiceLimits> = {
  maxPageSize: 200,
  maxBudget: 100_000,
  maxDepth: 12,
  maxCost: 2000,
};

/**
 * Host-supplied runtime dependencies — the package's only seam.
 * Concrete wiring lives in packages/server + apps/web.
 */
export type ServiceContext = {
  db: Database | null;
  cache: RetrievalServices["cache"];
  environment: string;
  /** Query embedding provider; absent → vector channel degrades. */
  embedding?: RetrievalServices["embedding"];
  /**
   * Host hook (spec/09, spec/11): returns server-trusted context dimensions
   * for this request after authentication. Never client-controlled — the
   * result is merged into service requests as `trusted`, so `trust: server`
   * dimensions can only arrive here.
   */
  trustedContext?: (request: Request) => Record<string, unknown> | undefined;
  limits?: ServiceLimits;
};

/** Per-request resolver context. */
export type GraphQLContext = {
  services: ServiceContext;
  request: Request;
  /** Per-request entity batching (DataLoader-equivalent). */
  loaders: Loaders;
};
