import type { Diagnostic } from "@grounding/core";

export type DiagnosticWarning = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/** spec/14: unauthorized candidates are redacted — `chunk` carries no identity. */
export type RetrievalExclusion = {
  chunk: { id?: string; key?: string };
  redacted: boolean;
  stage: string;
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

/**
 * Service-level retrieval types — mirror the GraphQL contract (graphql/schema
 * .graphql) without depending on GraphQL types; resolvers map 1:1 in M7.
 */

export type ConceptMatchType =
  | "EXACT_KEY"
  | "EXACT_NAME"
  | "EXACT_ALIAS"
  | "LEXICAL"
  | "TRIGRAM"
  | "SEMANTIC";

export type ConceptRow = {
  id: string;
  namespaceId: string;
  key: string;
  name: string;
  status: string;
  description: string | null;
};

export type ResolvedConcept = {
  concept: ConceptRow;
  matchType: ConceptMatchType;
  matchedText: string | null;
  score: number | null;
  rank: number;
};

export type ConceptResolutionResult = {
  matches: ResolvedConcept[];
  warnings: DiagnosticWarning[];
};

export type RetrieveRequest = {
  /** Namespace key (or id when unambiguous); defaults when one namespace exists. */
  namespace?: string;
  query: string;
  /** Ordinary caller-supplied context. */
  context?: Record<string, unknown>;
  /** Host-injected trusted context (post-authentication). */
  trusted?: Record<string, unknown>;
  profile?: string;
  filters?: {
    conceptIds?: string[];
    domainIds?: string[];
    knowledgeItemIds?: string[];
    includeDraft?: boolean;
    includeDeprecated?: boolean;
  };
  limits?: { maxChunks?: number; maxTokens?: number };
  diagnostics?: boolean;
};

export type ChannelId = "vector" | "fullText" | "trigram" | "conceptLinked" | "graphLinked";

/** Candidate discovered by one channel; `rank` is 1-based within the channel. */
export type Candidate = {
  chunkId: string;
  channel: ChannelId;
  rank: number;
  score: number | null;
};

export type ChunkRow = {
  id: string;
  namespaceId: string;
  knowledgeItemId: string;
  chunkKey: string;
  ordinal: number;
  heading: string | null;
  content: string;
  status: string;
  priority: number;
  authorityScore: number | null;
  effectiveFrom: Date | null;
  effectiveTo: Date | null;
  selectionGroupId: string | null;
  authorizationExpression: unknown;
  applicabilityExpression: unknown;
  tokenCount: number | null;
  itemStatus: string;
  itemAuthorityScore: number | null;
  itemEffectiveFrom: Date | null;
  itemEffectiveTo: Date | null;
};

export type RetrievalResultItem = {
  chunk: ChunkRow;
  score: number;
  rank: number;
  reasons: { code: string; message: string }[];
};

export type RetrievalResult = {
  namespace: { id: string; key: string };
  runtimeRevision: number;
  query: string;
  resolvedConcepts: ResolvedConcept[];
  results: RetrievalResultItem[];
  packedContext: {
    chunks: ChunkRow[];
    estimatedTokens: number;
    maxTokens: number;
    maxChunks: number;
  } | null;
  diagnostics: RetrievalDiagnostics | null;
};

export type RetrievalDiagnostics = {
  timings: { stage: string; milliseconds: number }[];
  candidateCounts: {
    vector: number;
    fullText: number;
    trigram: number;
    conceptLinked: number;
    graphLinked: number;
    unique: number;
    afterLifecycle: number;
    afterAuthorization: number;
    afterApplicability: number;
    afterSelectionGroups: number;
    packed: number;
  };
  exclusions: RetrievalExclusion[];
  rankings: {
    chunkId: string;
    finalRank: number;
    vectorRank: number | null;
    vectorScore: number | null;
    fullTextRank: number | null;
    fullTextScore: number | null;
    trigramRank: number | null;
    trigramScore: number | null;
    conceptRank: number | null;
    graphRank: number | null;
    rrfScore: number;
    authorityScore: number;
    priority: number;
  }[];
  graphPaths: OntologyPath[];
  packing: {
    considered: number;
    packed: number;
    skippedForBudget: number;
    skippedForItemCap: number;
  };
  warnings: DiagnosticWarning[];
  /** Evaluator diagnostics from fail-closed gates (no GraphQL counterpart in v1). */
  diagnosticsErrors?: Diagnostic[];
};

export type OntologyPath = {
  seedConcept: ConceptRow;
  targetConcept: ConceptRow;
  depth: number;
  steps: {
    relation: { key: string; name: string | null };
    direction: "incoming" | "outgoing";
    from: ConceptRow;
    to: ConceptRow;
  }[];
};
