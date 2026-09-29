import { canonicalSerialize, sha256 } from "@grounding/core";

/**
 * Key formats (spec/16):
 *   grounding:v1:<kind>:<namespace-id>:<runtime-revision>:<sha256>
 *   grounding:v1:embedding-content:<embedding-config-hash>:<semantic-hash>
 * Never place raw query/context/auth values in key names — hash canonical inputs.
 */

const PREFIX = "grounding:v1";

export type CacheKey = string & { readonly __brand: "CacheKey" };

export type RevisionedKeyInput = {
  kind: CacheKind;
  namespaceId: string;
  runtimeRevision: number | bigint;
  /** All semantically relevant inputs; canonical-serialized and hashed. */
  input: unknown;
};

export function revisionedKey(input: RevisionedKeyInput): CacheKey {
  const hash = sha256(canonicalSerialize(input.input));
  return `${PREFIX}:${input.kind}:${input.namespaceId}:${input.runtimeRevision}:${hash}` as CacheKey;
}

/** Content-addressed cache entries are intentionally revision-independent. */
export function contentKey(
  kind: ContentCacheKind,
  configHash: string,
  contentHash: string,
): CacheKey {
  return `${PREFIX}:${kind}:${configHash}:${contentHash}` as CacheKey;
}

export function leaseKey(forKey: CacheKey): CacheKey {
  return `${PREFIX}:lease:${sha256(forKey)}` as CacheKey;
}

/** Kind segment of a key (`grounding:v1:<kind>:...`) for metrics labels. */
export function cacheKeyKind(key: CacheKey): string {
  return key.slice(PREFIX.length + 1, key.indexOf(":", PREFIX.length + 1));
}

export const CacheKind = {
  QUERY_EMBEDDING: "query-embedding",
  CONCEPT_RESOLUTION: "concept-resolution",
  RETRIEVAL_RESULT: "retrieval-result",
  ASSEMBLY_RESULT: "assembly-result",
  ONTOLOGY_NEIGHBORHOOD: "ontology-neighborhood",
} as const;
export type CacheKind = (typeof CacheKind)[keyof typeof CacheKind];

export const ContentCacheKind = {
  EMBEDDING_CONTENT: "embedding-content",
} as const;
export type ContentCacheKind = (typeof ContentCacheKind)[keyof typeof ContentCacheKind];

/** Default TTL posture (ms) — spec/16 table. Tuneable within hard bounds. */
export const DEFAULT_TTLS_MS = {
  "embedding-content": 7 * 24 * 60 * 60 * 1000, // long (days)
  "query-embedding": 30 * 60 * 1000, // medium (tens of minutes)
  "concept-resolution": 30 * 60 * 1000,
  "retrieval-result": 5 * 60 * 1000, // short (minutes)
  "assembly-result": 5 * 60 * 1000,
  "ontology-neighborhood": 30 * 60 * 1000,
} as const;

/** Single-flight lease TTL — short-lived coordination, not a cache kind. */
export const LEASE_TTL_MS = 30 * 1000;
