import {
  CacheKind,
  DEFAULT_TTLS_MS,
  LEASE_TTL_MS,
  type RuntimeCache,
  revisionedKey,
} from "@grounding/cache";
import {
  type Diagnostic,
  type DimensionRegistry,
  type Expression,
  estimateTokens,
  evaluateAuthorization,
  evaluateExpression,
  type NormalizedContext,
  normalizeContext,
  normalizeForLexical,
  pack,
  RetrievalExclusionCode,
  RetrievalReasonCode,
  RetrievalStage,
  RuntimeErrorCode,
  reciprocalRankFusion,
  resolveSelectionGroup,
  type SelectionGroupMode,
  type Specificity,
  StageTimings,
  sha256,
  WarningCode,
  ZERO_SPECIFICITY,
} from "@grounding/core";
import { type Database, loadDimensionRegistry } from "@grounding/db";
import type { EmbeddingProvider } from "@grounding/embeddings";
import { sql } from "drizzle-orm";
import {
  conceptLinkedCandidates,
  fullTextCandidates,
  ontologyCandidates,
  trigramCandidates,
  vectorCandidates,
} from "./candidates.ts";
import { resolveConcepts } from "./concepts.ts";
import { DEFAULT_PROFILE, profileConfig, type RetrievalProfileConfig } from "./profile.ts";
import type {
  Candidate,
  ChannelId,
  ChunkRow,
  ConceptResolutionResult,
  ConceptRow,
  DiagnosticWarning,
  OntologyPath,
  RetrievalDiagnostics,
  RetrievalExclusion,
  RetrievalResult,
  RetrievalResultItem,
  RetrieveRequest,
} from "./types.ts";

/** Host-supplied retrieval dependencies — the package's only seam. */
export type RetrievalServices = {
  db: Database;
  cache: RuntimeCache | null;
  /** Query embedding provider; absent/disabled → vector channel unavailable. */
  embedding?: { provider: EmbeddingProvider; configHash: string } | null;
  /** Runtime-state environment; defaults to GROUNDING_ENV ?? "local". */
  environment?: string;
};

/** Request-level failures (context validation, namespace, profile). */
export class RetrievalRequestError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: Diagnostic[],
  ) {
    super(message);
    this.name = "RetrievalRequestError";
  }
}

export type NamespaceRow = { id: string; key: string };

const CHANNEL_IDS = ["vector", "fullText", "trigram", "conceptLinked", "graphLinked"] as const;

const REASON = {
  vector: RetrievalReasonCode.VECTOR_MATCH,
  fullText: RetrievalReasonCode.FULL_TEXT_MATCH,
  trigram: RetrievalReasonCode.TRIGRAM_MATCH,
  conceptLinked: RetrievalReasonCode.DIRECT_CONCEPT_LINK,
  graphLinked: RetrievalReasonCode.ONTOLOGY_CONCEPT_LINK,
} as const satisfies Record<ChannelId, string>;

const VECTOR_DOWN_WARNING: DiagnosticWarning = {
  code: WarningCode.VECTOR_CHANNEL_UNAVAILABLE,
  message: "vector channel unavailable; degrading to lexical/concept/ontology channels",
};
const GRAPH_DOWN_WARNING: DiagnosticWarning = {
  code: WarningCode.ONTOLOGY_CHANNEL_UNAVAILABLE,
  message: "ontology candidate generation failed; direct channels preserved",
};

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

/**
 * Full retrieval pipeline (spec/05). Service-level API — GraphQL resolvers
 * map over this in M7.
 */
export async function retrieve(
  services: RetrievalServices,
  request: RetrieveRequest,
): Promise<RetrievalResult> {
  const environment = services.environment ?? process.env.GROUNDING_ENV ?? "local";
  const diagnosticsOn = request.diagnostics === true;

  if (request.query.trim() === "") {
    throw new RetrievalRequestError("query must be non-empty", [
      {
        severity: "error",
        code: RuntimeErrorCode.INVALID_INPUT,
        message: "query must be non-empty",
      },
    ]);
  }

  // Stage: context_validation (also covers namespace resolution).
  const timings = new StageTimings();
  const { namespace, registry, revision, context } = await timings.time(
    RetrievalStage.CONTEXT_VALIDATION,
    async () => {
      const namespace = await resolveNamespace(services.db, request.namespace);
      const [registry, revision] = await Promise.all([
        loadDimensionRegistry(services.db, namespace.id),
        runtimeRevision(services.db, namespace.id, environment),
      ]);
      const normalized = normalizeContext(registry, {
        ...(request.context !== undefined ? { caller: request.context } : {}),
        ...(request.trusted !== undefined ? { trusted: request.trusted } : {}),
      });
      if (!normalized.context || normalized.diagnostics.some((d) => d.severity === "error")) {
        throw new RetrievalRequestError(
          "request context failed validation",
          normalized.diagnostics,
        );
      }
      return { namespace, registry, revision, context: normalized.context };
    },
  );

  const profile = await loadProfile(services.db, namespace, request.profile);

  // Whole-result cache: canonically hashes every semantically relevant input
  // (query, normalized context, profile, filters, limits, diagnostics flag,
  // environment) under <namespace>:<runtimeRevision>. runtimeRevision is a
  // per-environment counter, so environment MUST be in the hashed input —
  // two environments sharing a Valkey instance collide otherwise (spec/16).
  // Set-like inputs are sorted before hashing (spec/16 canonicalization).
  const sortIds = (v: string[] | undefined) => (v ? [...v].sort() : v);
  const filters = request.filters
    ? {
        conceptIds: sortIds(request.filters.conceptIds),
        domainIds: sortIds(request.filters.domainIds),
        knowledgeItemIds: sortIds(request.filters.knowledgeItemIds),
        includeDraft: request.filters.includeDraft ?? null,
        includeDeprecated: request.filters.includeDeprecated ?? null,
      }
    : null;

  const compute = () =>
    retrieveUncached(services, {
      request,
      namespace,
      environment,
      registry,
      revision,
      context,
      profile,
      timings,
      diagnosticsOn,
    });

  if (services.cache) {
    const key = revisionedKey({
      kind: CacheKind.RETRIEVAL_RESULT,
      namespaceId: namespace.id,
      runtimeRevision: revision,
      input: {
        environment,
        query: request.query,
        // Multi-valued dimensions are sets — sort array values so equivalent
        // contexts canonicalize identically (spec/16).
        context: [...context.entries()]
          .map(([k, v]) => {
            const canon = Array.isArray(v)
              ? [...v].sort((a, b) => {
                  const sa = JSON.stringify(a);
                  const sb = JSON.stringify(b);
                  return sa < sb ? -1 : sa > sb ? 1 : 0;
                })
              : v;
            return [k, canon] as [string, unknown];
          })
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        profile,
        filters,
        limits: request.limits ?? null,
        diagnostics: diagnosticsOn,
      },
    });
    // getOrCompute supplies process-local single-flight + cross-process lease
    // around the most expensive operation in the system (spec/16).
    const value = await services.cache.getOrCompute(
      key,
      { ttlMs: DEFAULT_TTLS_MS["retrieval-result"], leaseMs: LEASE_TTL_MS },
      compute,
    );
    return reviveResult(value) ?? compute();
  }
  return compute();
}

/**
 * `resolveConcepts` GraphQL operation — concept resolution over an arbitrary
 * term, independent of a retrieval run.
 */
export async function resolveConceptsForNamespace(
  services: RetrievalServices,
  args: { namespace?: string; text: string; limit?: number },
): Promise<ConceptResolutionResult> {
  const environment = services.environment ?? process.env.GROUNDING_ENV ?? "local";
  const namespace = await resolveNamespace(services.db, args.namespace);
  const revision = await runtimeRevision(services.db, namespace.id, environment);
  const normalized = normalizeForLexical(args.text);

  let queryVector: number[] | null = null;
  let vectorDown = !services.embedding;
  try {
    queryVector = await queryEmbedding(services, namespace.id, revision, normalized, environment);
  } catch {
    vectorDown = true;
  }
  if (queryVector === null && services.embedding) vectorDown = true;

  const compute = async (): Promise<ConceptResolutionResult> => {
    const res = await resolveConcepts(services.db, namespace.id, args.text, {
      ...(args.limit !== undefined ? { limit: args.limit } : {}),
      queryVector,
    });
    // spec/05: resolveConcepts degrades on vector outage like retrieve does.
    if (vectorDown) res.warnings.push({ ...VECTOR_DOWN_WARNING });
    return res;
  };
  if (!services.cache) return compute();
  return services.cache.getOrCompute(
    revisionedKey({
      kind: CacheKind.CONCEPT_RESOLUTION,
      namespaceId: namespace.id,
      runtimeRevision: revision,
      input: {
        environment,
        // Raw text is semantically relevant — EXACT_KEY matches on it and two
        // raw strings can normalize identically while matching differently.
        text: args.text,
        normalizedQuery: normalized,
        limit: args.limit ?? null,
        vectorHash: queryVector ? sha256(JSON.stringify(queryVector)) : null,
      },
    }),
    { ttlMs: DEFAULT_TTLS_MS["concept-resolution"], leaseMs: LEASE_TTL_MS },
    compute,
  );
}

// ---------------------------------------------------------------------------
// Pipeline internals
// ---------------------------------------------------------------------------

export async function resolveNamespace(
  db: Database,
  key: string | undefined,
): Promise<NamespaceRow> {
  if (key !== undefined) {
    const rows = await db.execute(
      sql`select id, key from namespaces where key = ${key} or id::text = ${key} order by (key = ${key}) desc limit 1`,
    );
    const row = (rows.rows as NamespaceRow[])[0];
    if (!row) {
      throw new RetrievalRequestError(`namespace "${key}" does not exist`, [
        {
          severity: "error",
          code: RuntimeErrorCode.NAMESPACE_NOT_FOUND,
          message: `namespace "${key}" does not exist`,
        },
      ]);
    }
    return row;
  }
  const rows = await db.execute(sql`select id, key from namespaces order by key`);
  const all = rows.rows as NamespaceRow[];
  if (all.length === 1 && all[0]) return all[0];
  if (all.length === 0) {
    throw new RetrievalRequestError("no namespaces exist", [
      {
        severity: "error",
        code: RuntimeErrorCode.NAMESPACE_NOT_FOUND,
        message: "no namespaces are materialized",
      },
    ]);
  }
  throw new RetrievalRequestError("namespace is required when multiple exist", [
    {
      severity: "error",
      code: RuntimeErrorCode.INVALID_INPUT,
      message: `namespace is required (${all.map((n) => n.key).join(", ")})`,
    },
  ]);
}

export async function runtimeRevision(
  db: Database,
  namespaceId: string,
  environment: string,
): Promise<number> {
  const rows = await db.execute(sql`
    select runtime_revision as rev from namespace_runtime_state
    where namespace_id = ${namespaceId} and environment = ${environment}
  `);
  const rev = (rows.rows as { rev: number }[])[0]?.rev;
  return typeof rev === "number" ? rev : 0;
}

async function loadProfile(
  db: Database,
  namespace: NamespaceRow,
  key: string | undefined,
): Promise<RetrievalProfileConfig> {
  if (key === undefined) {
    const rows = await db.execute(sql`
      select rp.config from retrieval_profiles rp
      join namespaces n on n.default_retrieval_profile_id = rp.id
      where n.id = ${namespace.id}
    `);
    const row = (rows.rows as { config: unknown }[])[0];
    return row ? profileConfig(row.config) : DEFAULT_PROFILE;
  }
  const rows = await db.execute(sql`
    select config from retrieval_profiles
    where namespace_id = ${namespace.id} and key = ${key}
  `);
  const row = (rows.rows as { config: unknown }[])[0];
  if (!row) {
    throw new RetrievalRequestError(`retrieval profile "${key}" does not exist`, [
      {
        severity: "error",
        code: RuntimeErrorCode.PROFILE_NOT_FOUND,
        message: `retrieval profile "${key}" does not exist in namespace "${namespace.key}"`,
      },
    ]);
  }
  return profileConfig(row.config);
}

async function fetchChunks(
  db: Database,
  namespaceId: string,
  chunkIds: string[],
  filters: RetrieveRequest["filters"],
): Promise<ChunkRow[]> {
  if (chunkIds.length === 0) return [];
  const cond = [sql`kc.id in ${chunkIds}`];
  if (filters?.knowledgeItemIds?.length) {
    cond.push(sql`kc.knowledge_item_id in ${filters.knowledgeItemIds}`);
  }
  if (filters?.conceptIds?.length) {
    cond.push(sql`kc.id in (
      select chunk_id from chunk_concepts
      where namespace_id = ${namespaceId} and concept_id in ${filters.conceptIds}
    )`);
  }
  if (filters?.domainIds?.length) {
    cond.push(sql`kc.id in (
      select cc.chunk_id from chunk_concepts cc
      join concept_domains cd on cd.concept_id = cc.concept_id and cd.namespace_id = cc.namespace_id
      where cc.namespace_id = ${namespaceId} and cd.domain_id in ${filters.domainIds}
    )`);
  }
  const rows = await db.execute(sql`
    select kc.id, kc.namespace_id, kc.knowledge_item_id, kc.chunk_key, kc.ordinal,
           kc.heading, kc.content, kc.status, kc.priority, kc.authority_score,
           kc.effective_from, kc.effective_to, kc.selection_group_id,
           kc.authorization_expression, kc.applicability_expression, kc.token_count,
           ki.status as item_status, ki.authority_score as item_authority_score,
           ki.effective_from as item_effective_from, ki.effective_to as item_effective_to
    from knowledge_chunks kc
    join knowledge_items ki on ki.id = kc.knowledge_item_id and ki.namespace_id = kc.namespace_id
    where kc.namespace_id = ${namespaceId} and ${sql.join(cond, sql` and `)}
    order by kc.id
  `);
  return (rows.rows as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    namespaceId: r.namespace_id as string,
    knowledgeItemId: r.knowledge_item_id as string,
    chunkKey: r.chunk_key as string,
    ordinal: r.ordinal as number,
    heading: (r.heading as string | null) ?? null,
    content: r.content as string,
    status: r.status as string,
    priority: r.priority as number,
    authorityScore: (r.authority_score as number | null) ?? null,
    effectiveFrom: (r.effective_from as Date | null) ?? null,
    effectiveTo: (r.effective_to as Date | null) ?? null,
    selectionGroupId: (r.selection_group_id as string | null) ?? null,
    authorizationExpression: r.authorization_expression ?? null,
    applicabilityExpression: r.applicability_expression ?? null,
    tokenCount: (r.token_count as number | null) ?? null,
    itemStatus: r.item_status as string,
    itemAuthorityScore: (r.item_authority_score as number | null) ?? null,
    itemEffectiveFrom: (r.item_effective_from as Date | null) ?? null,
    itemEffectiveTo: (r.item_effective_to as Date | null) ?? null,
  }));
}

/** One query embedding per request, cached under revisioned `query-embedding`. */
async function queryEmbedding(
  services: RetrievalServices,
  namespaceId: string,
  revision: number,
  normalizedQuery: string,
  environment: string,
): Promise<number[] | null> {
  const emb = services.embedding;
  if (!emb) return null;
  const compute = async () => {
    const [vec] = await emb.provider.embed([normalizedQuery]);
    return vec ?? null;
  };
  if (!services.cache) return compute();
  return services.cache.getOrCompute(
    revisionedKey({
      kind: CacheKind.QUERY_EMBEDDING,
      namespaceId,
      runtimeRevision: revision,
      // configHash identifies the resolved *effective* provider (including env
      // overrides) — provider/model/dimensions alone can collide (spec/16).
      input: { environment, normalizedQuery, configHash: emb.configHash },
    }),
    { ttlMs: DEFAULT_TTLS_MS["query-embedding"], leaseMs: LEASE_TTL_MS },
    compute,
  );
}

function lifecycleOk(chunk: ChunkRow, allowed: ReadonlySet<string>): boolean {
  return allowed.has(chunk.status) && allowed.has(chunk.itemStatus);
}

function withinWindow(chunk: ChunkRow, at: Date): boolean {
  const t = at.getTime();
  const opens = (d: Date | null) => d !== null && new Date(d).getTime() > t;
  const closed = (d: Date | null) => d !== null && new Date(d).getTime() <= t;
  return !(
    opens(chunk.effectiveFrom) ||
    opens(chunk.itemEffectiveFrom) ||
    closed(chunk.effectiveTo) ||
    closed(chunk.itemEffectiveTo)
  );
}

async function retrieveUncached(
  services: RetrievalServices,
  args: {
    request: RetrieveRequest;
    namespace: NamespaceRow;
    environment: string;
    registry: DimensionRegistry;
    revision: number;
    context: NormalizedContext;
    profile: RetrievalProfileConfig;
    timings: StageTimings;
    diagnosticsOn: boolean;
  },
): Promise<RetrievalResult> {
  const {
    request,
    namespace,
    environment,
    registry,
    revision,
    context,
    profile,
    timings,
    diagnosticsOn,
  } = args;
  const db = services.db;
  const warnings: DiagnosticWarning[] = [];

  // -- query_normalization ----------------------------------------------------
  const normalizedQuery = await timings.time(RetrievalStage.QUERY_NORMALIZATION, () =>
    normalizeForLexical(request.query),
  );

  // -- query_embedding ----------------------------------------------------------
  let queryVector: number[] | null = null;
  let vectorDown = false;
  await timings.time(RetrievalStage.QUERY_EMBEDDING, async () => {
    try {
      queryVector = await queryEmbedding(
        services,
        namespace.id,
        revision,
        normalizedQuery,
        environment,
      );
    } catch {
      vectorDown = true;
    }
  });
  if (vectorDown || (services.embedding && queryVector === null) || !services.embedding) {
    vectorDown = true;
    warnings.push(VECTOR_DOWN_WARNING);
  }

  // -- concept_resolution --------------------------------------------------------
  let resolution!: ConceptResolutionResult;
  await timings.time(RetrievalStage.CONCEPT_RESOLUTION, async () => {
    const compute = () =>
      resolveConcepts(db, namespace.id, request.query, {
        limit: profile.concepts.maxSeeds,
        queryVector,
      });
    resolution = services.cache
      ? await services.cache.getOrCompute(
          revisionedKey({
            kind: CacheKind.CONCEPT_RESOLUTION,
            namespaceId: namespace.id,
            runtimeRevision: revision,
            input: {
              environment,
              // Raw query is semantically relevant: EXACT_KEY matches on it.
              query: request.query,
              normalizedQuery,
              maxSeeds: profile.concepts.maxSeeds,
              vectorHash: queryVector ? sha256(JSON.stringify(queryVector)) : null,
            },
          }),
          { ttlMs: DEFAULT_TTLS_MS["concept-resolution"], leaseMs: LEASE_TTL_MS },
          compute,
        )
      : await compute();
  });
  warnings.push(...resolution.warnings);
  const seeds = resolution.matches.map((m) => m.concept);

  // -- candidate channels: run in parallel, degrade per spec/05 -----------------
  const channelWork: {
    id: ChannelId;
    stage: string;
    promise: Promise<Candidate[] | { candidates: Candidate[]; paths: OntologyPath[] }>;
  }[] = [
    {
      id: "vector",
      stage: RetrievalStage.VECTOR_CANDIDATES,
      promise: queryVector
        ? vectorCandidates(db, namespace.id, queryVector, profile.candidates.vector)
        : Promise.resolve([]),
    },
    {
      id: "fullText",
      stage: RetrievalStage.FTS_CANDIDATES,
      promise: fullTextCandidates(db, namespace.id, normalizedQuery, profile.candidates.fullText),
    },
    {
      id: "trigram",
      stage: RetrievalStage.TRIGRAM_CANDIDATES,
      promise: trigramCandidates(db, namespace.id, normalizedQuery, profile.candidates.trigram),
    },
    {
      id: "conceptLinked",
      stage: RetrievalStage.CONCEPT_LINKED_CANDIDATES,
      promise: conceptLinkedCandidates(
        db,
        namespace.id,
        seeds.map((s) => s.id),
        profile.candidates.conceptLinked,
      ),
    },
    {
      id: "graphLinked",
      stage: RetrievalStage.ONTOLOGY_CANDIDATES,
      promise: ontologyWithCache(
        services,
        namespace.id,
        revision,
        environment,
        seeds,
        profile.graph,
      ),
    },
  ];
  const timed = channelWork.map((c) => timings.time(c.stage, () => c.promise));
  const settled = await Promise.allSettled(timed);

  const channelResults = {
    vector: [] as Candidate[],
    fullText: [] as Candidate[],
    trigram: [] as Candidate[],
    conceptLinked: [] as Candidate[],
    graphLinked: [] as Candidate[],
  };
  const graphPaths: OntologyPath[] = [];
  for (const [i, work] of channelWork.entries()) {
    const id = work.id;
    const s = settled[i];
    if (!s) continue;
    if (s.status === "fulfilled") {
      if (id === "graphLinked") {
        const v = s.value as { candidates: Candidate[]; paths: OntologyPath[] };
        channelResults.graphLinked = v.candidates;
        graphPaths.push(...v.paths);
      } else {
        channelResults[id] = s.value as Candidate[];
      }
      continue;
    }
    if (id === "vector") {
      vectorDown = true;
      warnings.push(VECTOR_DOWN_WARNING);
    } else if (id === "graphLinked") {
      warnings.push(GRAPH_DOWN_WARNING);
    } else {
      // FTS/trigram/concept-linked have no degradation path — surface failure.
      const reason = s.reason instanceof Error ? s.reason.message : String(s.reason);
      throw new RetrievalRequestError(`candidate channel ${id} failed: ${reason}`, [
        { severity: "error", code: RuntimeErrorCode.INTERNAL_ERROR, message: reason },
      ]);
    }
  }

  // -- candidate_merge ----------------------------------------------------------
  const perChunk = await timings.time(RetrievalStage.CANDIDATE_MERGE, () => {
    const map = new Map<string, Map<ChannelId, { rank: number; score: number | null }>>();
    for (const id of CHANNEL_IDS) {
      for (const c of channelResults[id]) {
        let m = map.get(c.chunkId);
        if (!m) {
          m = new Map();
          map.set(c.chunkId, m);
        }
        const cur = m.get(id);
        if (!cur || c.rank < cur.rank) m.set(id, { rank: c.rank, score: c.score });
      }
    }
    return map;
  });

  // -- hard eligibility ------------------------------------------------------------
  const exclusions: RetrievalExclusion[] = [];
  const fetched = await fetchChunks(db, namespace.id, [...perChunk.keys()], request.filters);
  const at = new Date();
  const lifecycleStatuses = new Set(["published"]);
  if (request.filters?.includeDraft) lifecycleStatuses.add("draft");
  if (request.filters?.includeDeprecated) lifecycleStatuses.add("deprecated");

  // A chunk failing authorization must never expose identity — including via
  // an earlier lifecycle exclusion entry (spec/14 restricted diagnostics).
  const authzDenied = (chunk: ChunkRow): boolean => {
    if (!chunk.authorizationExpression) return false;
    return !evaluateAuthorization(registry, context, chunk.authorizationExpression as Expression)
      .allowed;
  };
  const pushLifecycleExclusion = (
    chunk: ChunkRow,
    code: RetrievalExclusionCode,
    message: string,
  ) => {
    const denied = authzDenied(chunk);
    exclusions.push({
      chunk: denied ? {} : { id: chunk.id },
      redacted: denied,
      stage: RetrievalStage.LIFECYCLE_FILTER,
      code,
      message: denied ? "candidate excluded" : message,
    });
  };

  const alive = await timings.time(RetrievalStage.LIFECYCLE_FILTER, () =>
    fetched.filter((chunk) => {
      if (!lifecycleOk(chunk, lifecycleStatuses)) {
        pushLifecycleExclusion(
          chunk,
          RetrievalExclusionCode.LIFECYCLE_NOT_PUBLISHED,
          `candidate lifecycle status is "${chunk.status}"`,
        );
        return false;
      }
      if (!withinWindow(chunk, at)) {
        pushLifecycleExclusion(
          chunk,
          RetrievalExclusionCode.OUTSIDE_EFFECTIVE_WINDOW,
          "candidate is outside its effective window",
        );
        return false;
      }
      return true;
    }),
  );

  // Authorization: fail closed; never leak identity into diagnostics (spec/14:
  // redacted entries carry no ids/keys for non-privileged callers).
  // Fail-closed evaluation diagnostics (AUTHORIZATION_EVALUATION_FAILED et al.)
  // are surfaced — flattened to an exclusion AND preserved as diagnostics.
  const diagnosticsErrors: Diagnostic[] = [];
  const authorized = await timings.time(RetrievalStage.AUTHORIZATION, () =>
    alive.filter((chunk) => {
      if (!chunk.authorizationExpression) return true;
      const out = evaluateAuthorization(
        registry,
        context,
        chunk.authorizationExpression as Expression,
      );
      if (out.allowed) return true;
      diagnosticsErrors.push(...out.diagnostics);
      exclusions.push({
        chunk: {},
        redacted: true,
        stage: RetrievalStage.AUTHORIZATION,
        code: RetrievalExclusionCode.AUTHORIZATION_NO_MATCH,
        message: "candidate failed authorization",
      });
      return false;
    }),
  );

  const specificityById = new Map<string, Specificity>();
  const applicable = await timings.time(RetrievalStage.APPLICABILITY, () =>
    authorized.filter((chunk) => {
      if (!chunk.applicabilityExpression) {
        specificityById.set(chunk.id, ZERO_SPECIFICITY);
        return true;
      }
      const out = evaluateExpression(
        registry,
        context,
        chunk.applicabilityExpression as Expression,
      );
      if (out.state !== "true") {
        exclusions.push({
          chunk: { id: chunk.id },
          redacted: false,
          stage: RetrievalStage.APPLICABILITY,
          code: RetrievalExclusionCode.APPLICABILITY_NO_MATCH,
          message: "candidate is not applicable in this context",
        });
        return false;
      }
      specificityById.set(chunk.id, out.specificity);
      return true;
    }),
  );

  // -- selection_groups -------------------------------------------------------------
  const selected = await timings.time(RetrievalStage.SELECTION_GROUPS, async () => {
    const groupIds = [
      ...new Set(applicable.map((c) => c.selectionGroupId).filter((g): g is string => g !== null)),
    ];
    const modes = new Map<string, SelectionGroupMode>();
    if (groupIds.length > 0) {
      const rows = await db.execute(sql`
        select id, mode from selection_groups
        where namespace_id = ${namespace.id} and id in ${groupIds}
      `);
      for (const r of rows.rows as { id: string; mode: string }[]) {
        modes.set(r.id, r.mode as SelectionGroupMode);
      }
    }
    const grouped = new Map<string, ChunkRow[]>();
    const ungrouped: ChunkRow[] = [];
    for (const c of applicable) {
      if (c.selectionGroupId) {
        const list = grouped.get(c.selectionGroupId) ?? [];
        list.push(c);
        grouped.set(c.selectionGroupId, list);
      } else {
        ungrouped.push(c);
      }
    }
    const out = [...ungrouped];
    for (const [gid, members] of grouped) {
      const mode = modes.get(gid) ?? "highest_priority";
      const res = resolveSelectionGroup(
        members.map((m) => ({
          member: m,
          id: m.id,
          priority: m.priority,
          specificity: specificityById.get(m.id) ?? ZERO_SPECIFICITY,
        })),
        mode,
      );
      for (const w of res.selected) out.push(w.member);
      for (const l of res.rejected) {
        exclusions.push({
          chunk: { id: l.member.id },
          redacted: false,
          stage: RetrievalStage.SELECTION_GROUPS,
          code: RetrievalExclusionCode.SELECTION_GROUP_NOT_SELECTED,
          message: `candidate lost selection group (${mode})`,
        });
      }
    }
    return out;
  });

  // -- rrf_fusion + final_ordering -------------------------------------------------
  // RRF fuses each candidate's rank *within its channel output* — filtering to
  // survivors first would compress ranks and inflate post-gate positions, and
  // would desync rrfScore from the ranks diagnostics report (spec/05 fusion).
  const rrf = await timings.time(RetrievalStage.RRF_FUSION, () =>
    reciprocalRankFusion(CHANNEL_IDS.map((id) => channelResults[id].map((c) => c.chunkId))),
  );

  const ranked = await timings.time(RetrievalStage.FINAL_ORDERING, () =>
    selected
      .map((chunk) => ({ chunk, rrfScore: rrf.get(chunk.id) ?? 0 }))
      .sort(
        (a, b) =>
          b.rrfScore - a.rrfScore ||
          (b.chunk.authorityScore ?? 0) - (a.chunk.authorityScore ?? 0) ||
          b.chunk.priority - a.chunk.priority ||
          (a.chunk.id < b.chunk.id ? -1 : 1),
      ),
  );

  // -- packing ----------------------------------------------------------------------
  const { packed, budget } = await timings.time(RetrievalStage.PACKING, () => {
    const budget = {
      maxChunks: request.limits?.maxChunks ?? profile.packing.maxChunks,
      maxTokens: request.limits?.maxTokens ?? profile.packing.maxTokens,
      maxChunksPerItem: profile.packing.maxChunksPerItem,
    };
    // v1 has no exact tokenizer — materialized tokenCount and the NULL
    // fallback both use the deterministic approximation (spec/05).
    const packables = ranked.map(({ chunk }) => ({
      item: chunk,
      itemId: chunk.knowledgeItemId,
      tokenCount: chunk.tokenCount ?? estimateTokens(chunk.content),
    }));
    const packed = pack(packables, budget);
    for (const s of packed.skippedForItemCap) {
      exclusions.push({
        chunk: { id: s.item.id },
        redacted: false,
        stage: RetrievalStage.PACKING,
        code: RetrievalExclusionCode.PACKING_ITEM_CAP,
        message: "skipped by per-item diversity cap",
      });
    }
    for (const s of packed.skippedForBudget) {
      exclusions.push({
        chunk: { id: s.item.id },
        redacted: false,
        stage: RetrievalStage.PACKING,
        code: RetrievalExclusionCode.PACKING_TOKEN_BUDGET,
        message: "skipped by token/chunk budget",
      });
    }
    return { packed, budget };
  });
  if (packed.packed.length > 0) {
    warnings.push({
      code: WarningCode.TOKEN_COUNT_APPROXIMATE,
      message: "token counts use the configured deterministic approximation",
    });
  }

  // -- result assembly ---------------------------------------------------------------
  const packedIds = new Set(packed.packed.map((p) => p.item.id));
  const results: RetrievalResultItem[] = [];
  const rankings: RetrievalDiagnostics["rankings"] = [];
  ranked.forEach(({ chunk, rrfScore }, i) => {
    const membership =
      perChunk.get(chunk.id) ?? new Map<ChannelId, { rank: number; score: number | null }>();
    if (packedIds.has(chunk.id)) {
      results.push({
        chunk,
        score: rrfScore,
        rank: results.length + 1,
        reasons: [...membership.keys()].map((ch) => ({
          code: REASON[ch],
          message: `discovered via ${ch}`,
        })),
      });
    }
    rankings.push({
      chunkId: chunk.id,
      finalRank: i + 1,
      vectorRank: membership.get("vector")?.rank ?? null,
      vectorScore: membership.get("vector")?.score ?? null,
      fullTextRank: membership.get("fullText")?.rank ?? null,
      fullTextScore: membership.get("fullText")?.score ?? null,
      trigramRank: membership.get("trigram")?.rank ?? null,
      trigramScore: membership.get("trigram")?.score ?? null,
      conceptRank: membership.get("conceptLinked")?.rank ?? null,
      graphRank: membership.get("graphLinked")?.rank ?? null,
      rrfScore,
      authorityScore: chunk.authorityScore ?? 0,
      priority: chunk.priority,
    });
  });

  return {
    namespace,
    runtimeRevision: revision,
    query: request.query,
    resolvedConcepts: resolution.matches,
    results,
    packedContext: {
      chunks: packed.packed.map((p) => p.item),
      estimatedTokens: packed.totalTokens,
      maxTokens: budget.maxTokens,
      maxChunks: budget.maxChunks,
    },
    diagnostics: diagnosticsOn
      ? {
          timings: timings.toArray(),
          candidateCounts: {
            vector: channelResults.vector.length,
            fullText: channelResults.fullText.length,
            trigram: channelResults.trigram.length,
            conceptLinked: channelResults.conceptLinked.length,
            graphLinked: channelResults.graphLinked.length,
            unique: perChunk.size,
            afterLifecycle: alive.length,
            afterAuthorization: authorized.length,
            afterApplicability: applicable.length,
            afterSelectionGroups: selected.length,
            packed: packed.packed.length,
          },
          exclusions,
          rankings,
          graphPaths,
          packing: {
            considered: ranked.length,
            packed: packed.packed.length,
            skippedForBudget: packed.skippedForBudget.length,
            skippedForItemCap: packed.skippedForItemCap.length,
          },
          warnings,
          ...(diagnosticsErrors.length > 0 ? { diagnosticsErrors } : {}),
        }
      : null,
  };
}

async function ontologyWithCache(
  services: RetrievalServices,
  namespaceId: string,
  revision: number,
  environment: string,
  seeds: ConceptRow[],
  graph: RetrievalProfileConfig["graph"],
): Promise<{ candidates: Candidate[]; paths: OntologyPath[] }> {
  const compute = () => ontologyCandidates(services.db, namespaceId, seeds, graph);
  if (!services.cache || seeds.length === 0) return compute();
  return services.cache.getOrCompute(
    revisionedKey({
      kind: CacheKind.ONTOLOGY_NEIGHBORHOOD,
      namespaceId,
      runtimeRevision: revision,
      input: { environment, seeds: seeds.map((s) => s.id).sort(), graph },
    }),
    { ttlMs: DEFAULT_TTLS_MS["ontology-neighborhood"], leaseMs: LEASE_TTL_MS },
    compute,
  );
}

function reviveResult(r: RetrievalResult): RetrievalResult | null {
  // A well-formed JSON payload that isn't a RetrievalResult must behave as a
  // miss, not a request fault (spec/16).
  try {
    if (!Array.isArray(r.results) || !r.namespace || typeof r.runtimeRevision !== "number") {
      return null;
    }
    const revive = (c: ChunkRow): ChunkRow => ({
      ...c,
      effectiveFrom: c.effectiveFrom ? new Date(c.effectiveFrom) : null,
      effectiveTo: c.effectiveTo ? new Date(c.effectiveTo) : null,
      itemEffectiveFrom: c.itemEffectiveFrom ? new Date(c.itemEffectiveFrom) : null,
      itemEffectiveTo: c.itemEffectiveTo ? new Date(c.itemEffectiveTo) : null,
    });
    return {
      ...r,
      results: r.results.map((it) => ({ ...it, chunk: revive(it.chunk) })),
      packedContext: r.packedContext
        ? { ...r.packedContext, chunks: r.packedContext.chunks.map(revive) }
        : null,
    };
  } catch {
    return null;
  }
}
