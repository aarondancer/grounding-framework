/**
 * Retrieval profile configuration — spec/05 + retrieval-profile schema.
 * Defaults mirror the documented illustrative defaults; profiles override
 * per-key and request `limits` override packing bounds.
 */

export type RetrievalProfileConfig = {
  candidates: { vector: number; fullText: number; trigram: number; conceptLinked: number };
  concepts: { maxSeeds: number };
  graph: {
    maxDepth: number;
    direction: "incoming" | "outgoing" | "both";
    /** Ordered allowlist; empty/absent means all relation types allowed. */
    relationTypes: string[];
    candidateLimit: number;
  };
  packing: { maxChunks: number; maxTokens: number; maxChunksPerItem: number };
};

export const DEFAULT_PROFILE: RetrievalProfileConfig = {
  candidates: { vector: 60, fullText: 40, trigram: 20, conceptLinked: 30 },
  concepts: { maxSeeds: 4 },
  graph: { maxDepth: 1, direction: "both", relationTypes: [], candidateLimit: 30 },
  packing: { maxChunks: 10, maxTokens: 7000, maxChunksPerItem: 3 },
};

function int(v: unknown, fallback: number, min = 0): number {
  return typeof v === "number" && Number.isInteger(v) && v >= min ? v : fallback;
}

export function profileConfig(config: unknown): RetrievalProfileConfig {
  const c = (config ?? {}) as Record<string, Record<string, unknown>>;
  const cand = c.candidates ?? {};
  const conc = c.concepts ?? {};
  const graph = c.graph ?? {};
  const pack = c.packing ?? {};
  return {
    candidates: {
      vector: int(cand.vector, DEFAULT_PROFILE.candidates.vector),
      fullText: int(cand.fullText, DEFAULT_PROFILE.candidates.fullText),
      trigram: int(cand.trigram, DEFAULT_PROFILE.candidates.trigram),
      conceptLinked: int(cand.conceptLinked, DEFAULT_PROFILE.candidates.conceptLinked),
    },
    concepts: { maxSeeds: int(conc.maxSeeds, DEFAULT_PROFILE.concepts.maxSeeds) },
    graph: {
      maxDepth: Math.min(int(graph.maxDepth, DEFAULT_PROFILE.graph.maxDepth, 1), 2),
      direction:
        graph.direction === "incoming" ||
        graph.direction === "outgoing" ||
        graph.direction === "both"
          ? graph.direction
          : DEFAULT_PROFILE.graph.direction,
      relationTypes: Array.isArray(graph.relationTypes)
        ? graph.relationTypes.filter((t): t is string => typeof t === "string")
        : [],
      candidateLimit: int(graph.candidateLimit, DEFAULT_PROFILE.graph.candidateLimit),
    },
    packing: {
      maxChunks: int(pack.maxChunks, DEFAULT_PROFILE.packing.maxChunks, 1),
      maxTokens: int(pack.maxTokens, DEFAULT_PROFILE.packing.maxTokens, 1),
      maxChunksPerItem: int(pack.maxChunksPerItem, DEFAULT_PROFILE.packing.maxChunksPerItem, 1),
    },
  };
}
