/**
 * Agent Assembly orchestrator (spec/06). Pipeline: resolve explicit published
 * template -> validate context -> task embedding + concept resolution ->
 * parallel candidate discovery (skills / task-relevant fragments / direct
 * tools) -> lifecycle/authorization/applicability gates -> selection groups ->
 * semantic+concept ranking -> skill selection -> skill fragments/tools ->
 * recursive tool dependency closure with causal diagnostics -> bootstrap
 * retrieval -> effective budgets -> deterministic fragment ordering ->
 * structured AgentAssemblyResult.
 */

import {
  CacheKind,
  DEFAULT_TTLS_MS,
  LEASE_TTL_MS,
  type RuntimeCache,
  revisionedKey,
} from "@grounding/cache";
import {
  AssemblyCode,
  AssemblyReasonCode,
  AssemblyStage,
  type Diagnostic,
  type DimensionRegistry,
  type Expression,
  estimateTokens,
  evaluateAuthorization,
  evaluateExpression,
  type NormalizedContext,
  normalizeContext,
  normalizeForLexical,
  RetrievalExclusionCode,
  RuntimeErrorCode,
  resolveSelectionGroup,
  type Specificity,
  StageTimings,
  sha256,
  WarningCode,
  ZERO_SPECIFICITY,
} from "@grounding/core";
import { type Database, loadDimensionRegistry } from "@grounding/db";
import type { EmbeddingProvider } from "@grounding/embeddings";
import type {
  DiagnosticWarning,
  ResolvedConcept,
  RetrievalProfileConfig,
} from "@grounding/retrieval";
import {
  DEFAULT_PROFILE,
  profileConfig,
  RetrievalRequestError,
  resolveConcepts,
  resolveNamespace,
  retrieve,
  runtimeRevision,
} from "@grounding/retrieval";
import { sql } from "drizzle-orm";
import {
  conceptLinkedIds,
  fetchFragments,
  fetchSkills,
  fetchTools,
  groupModes,
  type SemanticEntityType,
  semanticCandidates,
  skillConceptIds,
  skillFragments,
  skillToolIds,
  type ToolEdge,
  templateFragments,
  toolEdges,
} from "./candidates.ts";
import { type GateOutcome, resolveClosure } from "./closure.ts";
import type {
  AgentAssemblyResult,
  AssembleRequest,
  AssemblyCandidateDiagnostic,
  AssemblyReason,
  AssemblyTemplateRow,
  DiagnosticCause,
  EntityRef,
  FragmentRow,
  SkillRow,
  ToolRow,
} from "./types.ts";

/** Installation hard ceilings — deployment bound, always applied (spec/06). */
export type AssemblyHardLimits = {
  maxSkills: number;
  maxTools: number;
  promptTokens: number;
  bootstrapKnowledgeTokens: number;
};

export const DEFAULT_HARD_LIMITS: AssemblyHardLimits = {
  maxSkills: 32,
  maxTools: 64,
  promptTokens: 32_768,
  bootstrapKnowledgeTokens: 4_096,
};

/** Host-supplied assembly dependencies — the package's only seam. */
export type AssemblyServices = {
  db: Database;
  cache: RuntimeCache | null;
  /** Task embedding provider; a non-empty task without one fails assembly. */
  embedding?: { provider: EmbeddingProvider; configHash: string } | null;
  /** Runtime-state environment; defaults to GROUNDING_ENV ?? "local". */
  environment?: string;
  /** Deployment hard ceilings; defaults apply when absent. */
  hardLimits?: Partial<AssemblyHardLimits>;
};

/** Request-level failures (template, context, budgets, embedding). */
export class AssemblyRequestError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: Diagnostic[],
  ) {
    super(message);
    this.name = "AssemblyRequestError";
  }
}

function fail(code: string, message: string): never {
  throw new AssemblyRequestError(message, [
    { severity: "error", code: code as Diagnostic["code"], message },
  ]);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export async function assembleAgent(
  services: AssemblyServices,
  request: AssembleRequest,
): Promise<AgentAssemblyResult> {
  const environment = services.environment ?? process.env.GROUNDING_ENV ?? "local";
  const diagnosticsOn = request.diagnostics === true;
  if (request.template.trim() === "") {
    fail(RuntimeErrorCode.INVALID_INPUT, "template key is required");
  }
  if (
    request.budgets !== undefined &&
    (typeof request.budgets !== "object" || request.budgets === null)
  ) {
    fail(RuntimeErrorCode.INVALID_INPUT, "request budgets must be an object");
  }
  for (const [name, value] of Object.entries(request.budgets ?? {})) {
    if (value !== undefined && (!Number.isInteger(value) || value < 0)) {
      fail(
        RuntimeErrorCode.INVALID_INPUT,
        `request budget "${name}" must be a non-negative integer`,
      );
    }
  }

  // spec/06: an absent binding list means "all available". Treat explicit
  // null the same so gating semantics and the cache key agree.
  const availableBindings = request.runtime?.availableBindings ?? undefined;

  let namespace: { id: string; key: string };
  try {
    namespace = await resolveNamespace(services.db, request.namespace);
  } catch (err) {
    if (err instanceof RetrievalRequestError) {
      throw new AssemblyRequestError(err.message, err.diagnostics);
    }
    throw err;
  }
  const [registry, revision] = await Promise.all([
    loadDimensionRegistry(services.db, namespace.id),
    runtimeRevision(services.db, namespace.id, environment),
  ]);
  const validationStart = performance.now();
  const normalized = normalizeContext(registry, {
    ...(request.context !== undefined ? { caller: request.context } : {}),
    ...(request.trusted !== undefined ? { trusted: request.trusted } : {}),
  });
  if (!normalized.context || normalized.diagnostics.some((d) => d.severity === "error")) {
    throw new AssemblyRequestError("request context failed validation", normalized.diagnostics);
  }
  const contextValidationMs = performance.now() - validationStart;
  const context = normalized.context;

  const compute = () =>
    assembleUncached(services, {
      request,
      namespace,
      environment,
      registry,
      revision,
      context,
      contextValidationMs,
      diagnosticsOn,
      availableBindings,
    });

  if (!services.cache) return compute();
  const key = revisionedKey({
    kind: CacheKind.ASSEMBLY_RESULT,
    namespaceId: namespace.id,
    runtimeRevision: revision,
    input: {
      environment,
      template: request.template,
      task: request.task ?? null,
      context: canonicalContextEntries(context),
      retrievalProfile: request.retrievalProfile ?? null,
      budgets: request.budgets
        ? {
            maxSkills: request.budgets.maxSkills ?? null,
            maxTools: request.budgets.maxTools ?? null,
            promptTokens: request.budgets.promptTokens ?? null,
            bootstrapKnowledgeTokens: request.budgets.bootstrapKnowledgeTokens ?? null,
          }
        : null,
      // Resolved ceilings + effective provider identity affect results.
      hardLimits: resolveHardLimits(services),
      embeddingConfigHash: services.embedding?.configHash ?? null,
      // Absent list and empty list are semantically distinct — keep both.
      availableBindings: availableBindings ? [...new Set(availableBindings)].sort() : null,
      diagnostics: diagnosticsOn,
    },
  });
  const value = await services.cache.getOrCompute(
    key,
    { ttlMs: DEFAULT_TTLS_MS["assembly-result"], leaseMs: LEASE_TTL_MS },
    compute,
  );
  const revived = reviveResult(value);
  if (revived) return revived;
  // Malformed payload → recompute and overwrite the corrupt slot so it
  // self-heals rather than miss-looping until TTL (spec/16).
  const fresh = await compute();
  await services.cache
    .set(key, fresh, { ttlMs: DEFAULT_TTLS_MS["assembly-result"] })
    .catch(() => {});
  return fresh;
}

/**
 * Cached dates arrive as ISO strings — revive chunk effective windows. A
 * malformed payload degrades to a cache miss rather than failing the request.
 */
function reviveResult(v: unknown): AgentAssemblyResult | null {
  try {
    const r = v as AgentAssemblyResult | null;
    if (
      !r ||
      typeof r !== "object" ||
      typeof r.template?.key !== "string" ||
      typeof r.contextHash !== "string" ||
      !Array.isArray(r.promptFragments) ||
      !Array.isArray(r.skills) ||
      !Array.isArray(r.tools) ||
      !Array.isArray(r.bootstrapKnowledge)
    ) {
      return null;
    }
    const reviveDate = (d: unknown): Date | null =>
      d === null || d === undefined ? null : new Date(d as string);
    for (const item of r.bootstrapKnowledge) {
      const c = (item as { chunk?: Record<string, unknown> } | null)?.chunk;
      if (!c || typeof c !== "object") return null;
      c.effectiveFrom = reviveDate(c.effectiveFrom);
      c.effectiveTo = reviveDate(c.effectiveTo);
      c.itemEffectiveFrom = reviveDate(c.itemEffectiveFrom);
      c.itemEffectiveTo = reviveDate(c.itemEffectiveTo);
    }
    return r;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Pipeline internals
// ---------------------------------------------------------------------------

type EffectiveBudgets = {
  maxSkills: number;
  maxTools: number;
  promptTokens: number;
  bootstrapKnowledgeTokens: number;
};

type EntityGateRow = {
  id: string;
  key: string;
  status: string;
  authorizationExpression: unknown;
  applicabilityExpression: unknown;
  selectionGroupId: string | null;
  priority: number;
};

type GateResult = {
  pass: boolean;
  code: string | null;
  message: string | null;
  redacted: boolean;
  specificity: Specificity;
};

/** Lifecycle -> authorization -> applicability; fail closed, redact authz. */
function gateEntity(
  row: EntityGateRow,
  entityType: string,
  registry: DimensionRegistry,
  context: NormalizedContext,
  diagnosticsErrors: Diagnostic[],
): GateResult {
  const no = (code: string, message: string, redacted = false): GateResult => ({
    pass: false,
    code,
    message,
    redacted,
    specificity: ZERO_SPECIFICITY,
  });
  if (row.status !== "published") {
    return no(
      RetrievalExclusionCode.LIFECYCLE_NOT_PUBLISHED,
      `${entityType} lifecycle status is "${row.status}"`,
    );
  }
  if (row.authorizationExpression) {
    const out = evaluateAuthorization(registry, context, row.authorizationExpression as Expression);
    if (!out.allowed) {
      diagnosticsErrors.push(...out.diagnostics);
      return no(
        RetrievalExclusionCode.AUTHORIZATION_NO_MATCH,
        "candidate failed authorization",
        true,
      );
    }
  }
  if (row.applicabilityExpression) {
    const out = evaluateExpression(registry, context, row.applicabilityExpression as Expression);
    if (out.state !== "true") {
      diagnosticsErrors.push(...out.diagnostics);
      return no(
        RetrievalExclusionCode.APPLICABILITY_NO_MATCH,
        `${entityType} is not applicable in this context`,
      );
    }
    return { pass: true, code: null, message: null, redacted: false, specificity: out.specificity };
  }
  return { pass: true, code: null, message: null, redacted: false, specificity: ZERO_SPECIFICITY };
}

type RankedCandidate<T extends EntityGateRow> = {
  row: T;
  score: number | null;
  gate: GateResult;
  sources: string[];
  reasons: AssemblyReason[];
  /** Set when the candidate lost selection-group resolution. */
  groupRejected?: boolean;
};

/** Selection-group resolution over eligible candidates of one entity type. */
async function resolveGroups<T extends EntityGateRow>(
  db: Database,
  namespaceId: string,
  candidates: RankedCandidate<T>[],
  onRejected: (c: RankedCandidate<T>) => void,
): Promise<RankedCandidate<T>[]> {
  const ids = [
    ...new Set(
      candidates.map((c) => c.row.selectionGroupId).filter((g): g is string => g !== null),
    ),
  ];
  const modes = await groupModes(db, namespaceId, ids);
  const grouped = new Map<string, RankedCandidate<T>[]>();
  const out: RankedCandidate<T>[] = [];
  for (const c of candidates) {
    const g = c.row.selectionGroupId;
    if (g && modes.has(g)) {
      const list = grouped.get(g) ?? [];
      list.push(c);
      grouped.set(g, list);
    } else {
      out.push(c);
    }
  }
  const groupIds = [...grouped.keys()].sort();
  for (const g of groupIds) {
    const members = (grouped.get(g) ?? []).map((member) => ({
      member,
      id: member.row.id,
      priority: member.row.priority,
      specificity: member.gate.specificity,
    }));
    const { selected, rejected } = resolveSelectionGroup(
      members,
      modes.get(g) ?? "highest_priority",
    );
    for (const m of selected) out.push(m.member);
    for (const m of rejected) onRejected(m.member);
  }
  return out;
}

/** score desc (nulls last), priority desc, id asc. */
function rankOrder<T extends EntityGateRow>(a: RankedCandidate<T>, b: RankedCandidate<T>): number {
  const sa = a.score ?? Number.NEGATIVE_INFINITY;
  const sb = b.score ?? Number.NEGATIVE_INFINITY;
  if (sb !== sa) return sb - sa;
  if (b.row.priority !== a.row.priority) return b.row.priority - a.row.priority;
  return a.row.id < b.row.id ? -1 : a.row.id > b.row.id ? 1 : 0;
}

function entityRef(row: { id: string; key: string }, type: string): EntityRef {
  return { id: row.id, key: row.key, type };
}

function minPresent(...values: (number | null | undefined)[]): number {
  let m: number | undefined;
  for (const v of values) {
    if (v === null || v === undefined) continue;
    m = m === undefined ? v : Math.min(m, v);
  }
  return m ?? Number.POSITIVE_INFINITY;
}

function resolveHardLimits(services: AssemblyServices): AssemblyHardLimits {
  const overrides = Object.fromEntries(
    Object.entries(services.hardLimits ?? {}).filter(([, v]) => v !== undefined),
  );
  return { ...DEFAULT_HARD_LIMITS, ...overrides };
}

/**
 * Canonical context entries: keys sorted, array values sorted so equivalent
 * contexts produce identical cache keys and hashes.
 */
function canonicalContextEntries(context: NormalizedContext): [string, unknown][] {
  return [...context.entries()]
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
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

async function assembleUncached(
  services: AssemblyServices,
  args: {
    request: AssembleRequest;
    namespace: { id: string; key: string };
    environment: string;
    registry: DimensionRegistry;
    revision: number;
    context: NormalizedContext;
    contextValidationMs: number;
    diagnosticsOn: boolean;
    availableBindings: string[] | undefined;
  },
): Promise<AgentAssemblyResult> {
  const {
    request,
    namespace,
    environment,
    registry,
    revision,
    context,
    contextValidationMs,
    diagnosticsOn,
    availableBindings,
  } = args;
  const db = services.db;
  const timings = new StageTimings();
  const warnings: DiagnosticWarning[] = [];
  const diagnosticsErrors: Diagnostic[] = [];
  const skillDiags: AssemblyCandidateDiagnostic[] = [];
  const toolDiags: AssemblyCandidateDiagnostic[] = [];
  const fragmentDiags: AssemblyCandidateDiagnostic[] = [];

  const ref = (row: { id: string; key: string }, type: string, redacted: boolean): EntityRef =>
    redacted ? { id: "", key: "", type } : entityRef(row, type);
  const diagFor = (
    list: AssemblyCandidateDiagnostic[],
    row: { id: string; key: string },
    type: string,
    entry: Omit<AssemblyCandidateDiagnostic, "entity" | "causes"> & { causes?: DiagnosticCause[] },
    redacted = false,
  ) => {
    list.push({
      entity: ref(row, type, redacted),
      causes: entry.causes ?? [],
      ...entry,
      // A redacted candidate must not leak its relevance signal either.
      rank: redacted ? null : entry.rank,
      score: redacted ? null : entry.score,
    });
  };

  // -- template_resolution ----------------------------------------------------
  const template = await timings.time(AssemblyStage.TEMPLATE_RESOLUTION, async () => {
    const rows = await db.execute(sql`
      select id, namespace_id, key, name, description, status,
             retrieval_profile_id, max_skills, max_tools, prompt_token_budget,
             bootstrap_knowledge_token_budget, source_path, metadata
      from agent_templates
      where namespace_id = ${namespace.id} and key = ${request.template}
    `);
    const r = (rows.rows as Record<string, unknown>[])[0];
    if (!r) {
      fail(
        RuntimeErrorCode.TEMPLATE_NOT_FOUND,
        `template "${request.template}" does not exist in namespace "${namespace.key}"`,
      );
    }
    if (r.status !== "published") {
      fail(
        RuntimeErrorCode.TEMPLATE_NOT_PUBLISHED,
        `template "${request.template}" is not published (status "${String(r.status)}")`,
      );
    }
    return {
      id: r.id as string,
      namespaceId: r.namespace_id as string,
      key: r.key as string,
      name: r.name as string,
      description: (r.description as string | null) ?? null,
      status: r.status as string,
      retrievalProfileId: (r.retrieval_profile_id as string | null) ?? null,
      maxSkills: (r.max_skills as number | null) ?? null,
      maxTools: (r.max_tools as number | null) ?? null,
      promptTokenBudget: (r.prompt_token_budget as number | null) ?? null,
      bootstrapKnowledgeTokenBudget: (r.bootstrap_knowledge_token_budget as number | null) ?? null,
      sourcePath: r.source_path as string,
      metadata: r.metadata ?? {},
    } satisfies AssemblyTemplateRow;
  });

  // -- context_validation ------------------------------------------------------
  // Validation ran pre-cache in assembleAgent; record its real elapsed time so
  // cached results keep honest stage timings.
  timings.record(AssemblyStage.CONTEXT_VALIDATION, contextValidationMs);

  // Resolve the effective retrieval profile: request key > template profile.
  let profile: RetrievalProfileConfig = DEFAULT_PROFILE;
  let profileKey: string | undefined;
  if (request.retrievalProfile !== undefined) {
    const rows = await db.execute(sql`
        select key, config from retrieval_profiles
        where namespace_id = ${namespace.id} and key = ${request.retrievalProfile}
      `);
    const r = (rows.rows as { key: string; config: unknown }[])[0];
    if (!r) {
      fail(
        RuntimeErrorCode.PROFILE_NOT_FOUND,
        `retrieval profile "${request.retrievalProfile}" does not exist`,
      );
    }
    profileKey = r.key;
    profile = profileConfig(r.config);
  } else if (template.retrievalProfileId) {
    const rows = await db.execute(sql`
        select key, config from retrieval_profiles where id = ${template.retrievalProfileId}
      `);
    const r = (rows.rows as { key: string; config: unknown }[])[0];
    if (r) {
      profileKey = r.key;
      profile = profileConfig(r.config);
    }
  }

  const hard = resolveHardLimits(services);
  const effective: EffectiveBudgets = {
    maxSkills: minPresent(template.maxSkills, request.budgets?.maxSkills, hard.maxSkills),
    maxTools: minPresent(template.maxTools, request.budgets?.maxTools, hard.maxTools),
    promptTokens: minPresent(
      template.promptTokenBudget,
      request.budgets?.promptTokens,
      hard.promptTokens,
    ),
    bootstrapKnowledgeTokens: minPresent(
      template.bootstrapKnowledgeTokenBudget,
      request.budgets?.bootstrapKnowledgeTokens,
      hard.bootstrapKnowledgeTokens,
    ),
  };

  const task = request.task?.trim() ? request.task : null;

  // -- task_embedding ------------------------------------------------------------
  let taskVector: number[] | null = null;
  if (task !== null) {
    await timings.time(AssemblyStage.TASK_EMBEDDING, async () => {
      const emb = services.embedding;
      if (!emb) {
        fail(
          RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
          "task embedding unavailable: no embedding provider configured",
        );
      }
      const normalizedTask = normalizeForLexical(task);
      const embed = async () => {
        const [vec] = await emb.provider.embed([normalizedTask]);
        if (!vec) {
          fail(
            RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
            "task embedding unavailable: provider returned no vector",
          );
        }
        return vec;
      };
      try {
        taskVector = services.cache
          ? await services.cache.getOrCompute(
              revisionedKey({
                kind: CacheKind.QUERY_EMBEDDING,
                namespaceId: namespace.id,
                runtimeRevision: revision,
                input: {
                  environment,
                  normalizedQuery: normalizedTask,
                  configHash: emb.configHash,
                },
              }),
              { ttlMs: DEFAULT_TTLS_MS["query-embedding"], leaseMs: LEASE_TTL_MS },
              embed,
            )
          : await embed();
      } catch (err) {
        if (err instanceof AssemblyRequestError) throw err;
        fail(
          RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
          `task embedding unavailable: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      if (taskVector === null) {
        fail(
          RuntimeErrorCode.EMBEDDING_UNAVAILABLE,
          "task embedding unavailable: provider returned no vector",
        );
      }
    });
  }

  // -- task_concept_resolution ---------------------------------------------------
  // taskVector is non-null whenever task is non-null (task_embedding fails the
  // request otherwise), so semantic resolution is always available here.
  let resolvedConcepts: ResolvedConcept[] = [];
  if (task !== null) {
    const res = await timings.time(AssemblyStage.TASK_CONCEPT_RESOLUTION, () =>
      resolveConcepts(db, namespace.id, task, {
        limit: profile.concepts.maxSeeds,
        queryVector: taskVector,
      }),
    );
    resolvedConcepts = res.matches;
    warnings.push(...res.warnings);
  }
  const conceptIds = resolvedConcepts.map((m) => m.concept.id);

  // -- discovery (parallel) -------------------------------------------------------
  type Discovery = Map<string, { score: number | null; rank: number | null }>;
  const discover = async (entityType: SemanticEntityType): Promise<Discovery> => {
    const [sem, linked] = await Promise.all([
      taskVector
        ? semanticCandidates(db, namespace.id, entityType, taskVector, profile.candidates.vector)
        : Promise.resolve([]),
      conceptLinkedIds(db, namespace.id, entityType, conceptIds),
    ]);
    const out: Discovery = new Map();
    for (const [i, s] of sem.entries()) {
      out.set(s.entityId, { score: s.score, rank: i + 1 });
    }
    for (const id of linked) {
      const cur = out.get(id);
      out.set(id, { score: cur?.score ?? null, rank: cur?.rank ?? null });
    }
    return out;
  };

  const [skillDiscovery, toolDiscovery, fragmentDiscovery] = await Promise.all([
    timings.time(AssemblyStage.SKILL_DISCOVERY, () => discover("skill")),
    timings.time(AssemblyStage.TOOL_DISCOVERY, () => discover("tool")),
    timings.time(AssemblyStage.FRAGMENT_DISCOVERY, async () => ({
      discovered: await discover("prompt_fragment"),
      template: await templateFragments(db, namespace.id, template.id),
    })),
  ]);

  // -- assembly_filtering ----------------------------------------------------------
  const filtered = await timings.time(AssemblyStage.ASSEMBLY_FILTERING, async () => {
    const [skillRows, toolRows] = await Promise.all([
      fetchSkills(db, namespace.id, [...skillDiscovery.keys()]),
      fetchTools(db, namespace.id, [...toolDiscovery.keys()]),
    ]);
    return {
      skills: skillRows.map(
        (row): RankedCandidate<SkillRow> => ({
          row,
          score: skillDiscovery.get(row.id)?.score ?? null,
          gate: gateEntity(row, "skill", registry, context, diagnosticsErrors),
          sources: [],
          reasons: [],
        }),
      ),
      tools: toolRows.map(
        (row): RankedCandidate<ToolRow> => ({
          row,
          score: toolDiscovery.get(row.id)?.score ?? null,
          gate: gateEntity(row, "tool", registry, context, diagnosticsErrors),
          sources: [],
          reasons: [],
        }),
      ),
    };
  });
  const skills = filtered.skills;
  const directTools = filtered.tools;
  const eligibleSkills = skills.filter((c) => c.gate.pass);
  for (const c of skills) {
    if (!c.gate.pass) {
      diagFor(
        skillDiags,
        c.row,
        "skill",
        {
          selected: false,
          rank: skillDiscovery.get(c.row.id)?.rank ?? null,
          score: c.score,
          code: c.gate.code,
          message: c.gate.message,
        },
        c.gate.redacted,
      );
    }
  }
  for (const c of directTools) {
    if (!c.gate.pass) {
      diagFor(
        toolDiags,
        c.row,
        "tool",
        {
          selected: false,
          rank: toolDiscovery.get(c.row.id)?.rank ?? null,
          score: c.score,
          code: c.gate.code,
          message: c.gate.message,
        },
        c.gate.redacted,
      );
    }
  }

  const fragmentRows = new Map<
    string,
    { row: FragmentRow; sources: string[]; reasons: AssemblyReason[]; score: number | null }
  >();
  const addFragment = (
    row: FragmentRow,
    source: string,
    reason: AssemblyReason,
    score: number | null,
  ) => {
    const cur = fragmentRows.get(row.id);
    if (cur) {
      if (!cur.sources.includes(source)) cur.sources.push(source);
      cur.reasons.push(reason);
      if (cur.score === null && score !== null) cur.score = score;
    } else {
      fragmentRows.set(row.id, { row, sources: [source], reasons: [reason], score });
    }
  };
  for (const f of fragmentDiscovery.template) {
    const code =
      f.inclusionMode === "always"
        ? AssemblyReasonCode.TEMPLATE_FRAGMENT
        : f.inclusionMode === "applicable"
          ? AssemblyReasonCode.APPLICABLE_FRAGMENT
          : AssemblyReasonCode.TASK_RELEVANT_FRAGMENT;
    addFragment(
      f,
      "template",
      { code, message: `fragment listed by template "${template.key}"` },
      null,
    );
  }
  {
    const templateIds = new Set(fragmentDiscovery.template.map((f) => f.id));
    const discoveredIds = [...fragmentDiscovery.discovered.keys()].filter(
      (id) => !templateIds.has(id),
    );
    const discoveredRows = await fetchFragments(db, namespace.id, discoveredIds);
    for (const row of discoveredRows) {
      addFragment(
        row,
        "task",
        {
          code: AssemblyReasonCode.TASK_RELEVANT_FRAGMENT,
          message: "fragment selected from task relevance",
        },
        fragmentDiscovery.discovered.get(row.id)?.score ?? null,
      );
    }
  }

  const fragments: RankedCandidate<FragmentRow>[] = [...fragmentRows.values()].map((e) => {
    const gate = gateEntity(e.row, "prompt fragment", registry, context, diagnosticsErrors);
    // task_relevant fragments are not considered without a task.
    if (gate.pass && e.row.inclusionMode === "task_relevant" && task === null) {
      return {
        row: e.row,
        score: e.score,
        gate: {
          pass: false,
          code: AssemblyCode.TASK_REQUIRED_FOR_FRAGMENT,
          message: "task_relevant fragment is not considered without a task",
          redacted: false,
          specificity: ZERO_SPECIFICITY,
        } satisfies GateResult,
        sources: e.sources,
        reasons: e.reasons,
      };
    }
    return { row: e.row, score: e.score, gate, sources: e.sources, reasons: e.reasons };
  });
  const eligibleFragments = fragments.filter((c) => c.gate.pass);
  for (const c of fragments) {
    if (!c.gate.pass) {
      diagFor(
        fragmentDiags,
        c.row,
        "prompt_fragment",
        {
          selected: false,
          rank: fragmentDiscovery.discovered.get(c.row.id)?.rank ?? null,
          score: c.score,
          code: c.gate.code,
          message: c.gate.message,
        },
        c.gate.redacted,
      );
    }
  }

  // -- selection_groups -------------------------------------------------------------
  const afterGroups = await timings.time(AssemblyStage.SELECTION_GROUPS, async () => {
    const rejectDiag = (
      list: AssemblyCandidateDiagnostic[],
      c: RankedCandidate<EntityGateRow>,
      type: string,
    ) => {
      c.groupRejected = true;
      diagFor(list, c.row, type, {
        selected: false,
        rank: null,
        score: c.score,
        code: RetrievalExclusionCode.SELECTION_GROUP_NOT_SELECTED,
        message: "not selected by its selection group",
      });
    };
    const skillsOut = await resolveGroups(db, namespace.id, eligibleSkills, (c) =>
      rejectDiag(skillDiags, c, "skill"),
    );
    const toolsOut = await resolveGroups(
      db,
      namespace.id,
      directTools.filter((t) => t.gate.pass),
      (c) => rejectDiag(toolDiags, c, "tool"),
    );
    // First pass over fragments known before skill selection; skill-attached
    // fragments joining later re-resolve affected groups (see below).
    await resolveGroups(db, namespace.id, eligibleFragments, (c) =>
      rejectDiag(fragmentDiags, c, "prompt_fragment"),
    );
    return { skills: skillsOut, tools: toolsOut };
  });

  // -- skill_selection ---------------------------------------------------------------
  const selection = await timings.time(AssemblyStage.SKILL_SELECTION, async () => {
    const ranked = [...afterGroups.skills].sort(rankOrder);
    const selected = ranked.slice(0, effective.maxSkills);
    const selectedIds = new Set(selected.map((c) => c.row.id));
    for (const [i, c] of ranked.entries()) {
      if (!selectedIds.has(c.row.id)) {
        diagFor(skillDiags, c.row, "skill", {
          selected: false,
          rank: i + 1,
          score: c.score,
          code: null,
          message: "omitted by effective maxSkills budget",
        });
      }
    }
    // Skill-linked fragments, tools, and concepts ride the selection.
    const skillIds = selected.map((c) => c.row.id);
    const [fragsBySkill, toolsBySkill, conceptsBySkill] = await Promise.all([
      skillFragments(db, namespace.id, skillIds),
      skillToolIds(db, namespace.id, skillIds),
      skillConceptIds(db, namespace.id, skillIds),
    ]);
    return { selected, ranked, fragsBySkill, toolsBySkill, conceptsBySkill };
  });
  let selectedSkills = selection.selected;

  // Gate skill fragments the same way as discovered ones.
  for (const c of selectedSkills) {
    for (const f of selection.fragsBySkill.get(c.row.id) ?? []) {
      const existing = fragmentRows.get(f.id);
      const reason: AssemblyReason = {
        code: AssemblyReasonCode.SELECTED_SKILL,
        message: `fragment included because skill "${c.row.key}" was selected`,
        details: { skill: c.row.key },
      };
      if (existing) {
        const src = `skill:${c.row.key}`;
        if (!existing.sources.includes(src)) existing.sources.push(src);
        existing.reasons.push(reason);
      } else {
        fragmentRows.set(f.id, {
          row: f,
          sources: [`skill:${c.row.key}`],
          reasons: [reason],
          score: null,
        });
      }
    }
  }
  // Gate the newly added skill fragments (they may not have been gated yet).
  const gatedFragmentIds = new Set(fragments.map((c) => c.row.id));
  const skillAdded: RankedCandidate<FragmentRow>[] = [];
  for (const [id, e] of fragmentRows) {
    if (gatedFragmentIds.has(id)) continue;
    let gate = gateEntity(e.row, "prompt fragment", registry, context, diagnosticsErrors);
    if (gate.pass && e.row.inclusionMode === "task_relevant" && task === null) {
      gate = {
        pass: false,
        code: AssemblyCode.TASK_REQUIRED_FOR_FRAGMENT,
        message: "task_relevant fragment is not considered without a task",
        redacted: false,
        specificity: ZERO_SPECIFICITY,
      };
    }
    const cand = { row: e.row, score: e.score, gate, sources: e.sources, reasons: e.reasons };
    fragments.push(cand);
    skillAdded.push(cand);
    if (!gate.pass) {
      diagFor(
        fragmentDiags,
        e.row,
        "prompt_fragment",
        {
          selected: false,
          rank: null,
          score: e.score,
          code: gate.code,
          message: gate.message,
        },
        gate.redacted,
      );
    }
  }

  // A skill-attached fragment may share a selection group with template or
  // discovered fragments. Re-resolve affected groups over the full eligible
  // set so skill content cannot bypass group competition (spec/12).
  const affectedGroups = [
    ...new Set(
      skillAdded
        .filter((c) => c.gate.pass && c.row.selectionGroupId !== null)
        .map((c) => c.row.selectionGroupId as string),
    ),
  ].sort();
  if (affectedGroups.length > 0) {
    const modes = await groupModes(db, namespace.id, affectedGroups);
    for (const g of affectedGroups) {
      const mode = modes.get(g);
      if (!mode) continue;
      const members = fragments
        .filter((c) => c.row.selectionGroupId === g && c.gate.pass && c.groupRejected !== true)
        .map((member) => ({
          member,
          id: member.row.id,
          priority: member.row.priority,
          specificity: member.gate.specificity,
        }));
      const { rejected } = resolveSelectionGroup(members, mode);
      for (const m of rejected) {
        m.member.groupRejected = true;
        diagFor(fragmentDiags, m.member.row, "prompt_fragment", {
          selected: false,
          rank: null,
          score: m.member.score,
          code: RetrievalExclusionCode.SELECTION_GROUP_NOT_SELECTED,
          message: "not selected by its selection group",
        });
      }
    }
  }

  // -- dependency_closure -------------------------------------------------------------
  const closure = await timings.time(AssemblyStage.DEPENDENCY_CLOSURE, async () => {
    // Tool gate adds runtime-binding availability to the shared entity gate.
    // Gate outcomes are memoized across closure re-resolutions (viability
    // loop + budget drops) so evaluator diagnostics aren't emitted twice.
    const bindingSet = availableBindings === undefined ? null : new Set(availableBindings);
    const gated = new Map(directTools.map((c) => [c.row.id, c.gate]));
    /** Authorization-denied tools — identity is redacted in diagnostics. */
    const redactedToolIds = new Set<string>();
    const toolGate = (tool: ToolRow): GateOutcome => {
      let g = gated.get(tool.id);
      if (!g) {
        g = gateEntity(tool, "tool", registry, context, diagnosticsErrors);
        gated.set(tool.id, g);
      }
      if (g.redacted) redactedToolIds.add(tool.id);
      if (!g.pass) return { usable: false, code: g.code, message: g.message };
      if (bindingSet !== null && !bindingSet.has(tool.runtimeBinding)) {
        return {
          usable: false,
          code: AssemblyCode.RUNTIME_BINDING_UNAVAILABLE,
          message: `runtime binding "${tool.runtimeBinding}" is not available`,
        };
      }
      return { usable: true, code: null, message: null };
    };

    const directIds = new Set(afterGroups.tools.map((c) => c.row.id));
    let currentSkills = selectedSkills;
    const removedSkills = new Map<string, DiagnosticCause[]>();

    // Fetch all tools/edges reachable from seeds (incremental BFS).
    const tools = new Map<string, ToolRow>();
    const edges: ToolEdge[] = [];
    const edgesFetched = new Set<string>();
    const allSeeds = () => {
      const s = new Set(directIds);
      for (const c of currentSkills) {
        for (const tid of selection.toolsBySkill.get(c.row.id) ?? []) s.add(tid);
      }
      return s;
    };
    for (const t of afterGroups.tools) tools.set(t.row.id, t.row);
    const fetchEdges = async (seedIds: Set<string>) => {
      const newSources = [...seedIds].filter((id) => !edgesFetched.has(id));
      for (const id of newSources) edgesFetched.add(id);
      const batch = await toolEdges(db, namespace.id, newSources);
      edges.push(...batch);
      const missing = new Set<string>();
      for (const e of batch) {
        if (!tools.has(e.sourceToolId)) missing.add(e.sourceToolId);
        if (!tools.has(e.targetToolId)) missing.add(e.targetToolId);
      }
      for (const id of seedIds) if (!tools.has(id)) missing.add(id);
      for (const t of await fetchTools(db, namespace.id, [...missing])) {
        tools.set(t.id, t);
      }
    };

    let seeds = allSeeds();
    await fetchEdges(seeds);
    // Expand until every reachable tool's edges have been fetched. `reached`
    // is recomputed per round over the accumulated edge list (so edges fetched
    // in round N are walked in round N+1); the frontier is the reachable set
    // minus tools whose edges are already fetched. Terminates when the
    // frontier is empty — |tools| bounds the rounds.
    for (;;) {
      const reached = new Set(seeds);
      const queue = [...seeds];
      while (queue.length > 0) {
        const cur = queue.pop();
        if (cur === undefined) break;
        for (const e of edges) {
          if (e.sourceToolId === cur && !reached.has(e.targetToolId)) {
            reached.add(e.targetToolId);
            queue.push(e.targetToolId);
          }
        }
      }
      const frontier = [...reached].filter((id) => !edgesFetched.has(id));
      if (frontier.length === 0) break;
      await fetchEdges(new Set(frontier));
    }

    const requiredSeeds = new Set<string>();
    for (const c of currentSkills) {
      for (const tid of selection.toolsBySkill.get(c.row.id) ?? []) requiredSeeds.add(tid);
    }

    let result = resolveClosure({
      seeds,
      requiredSeeds,
      tools,
      edges,
      redactedIds: redactedToolIds,
      gate: toolGate,
    });

    // Skill viability: all direct tools are required in v1 — a skill drops
    // when any direct tool is not usable+included. Repeat to a fixpoint since
    // dropping a skill shrinks the seed set.
    for (let pass = 0; pass <= selectedSkills.length; pass++) {
      const viable = currentSkills.filter((c) =>
        (selection.toolsBySkill.get(c.row.id) ?? []).every((tid) => result.included.has(tid)),
      );
      if (viable.length === currentSkills.length) break;
      const dropped = currentSkills.filter((c) => !viable.includes(c));
      for (const c of dropped) {
        const causes: DiagnosticCause[] = [];
        const tids: string[] = selection.toolsBySkill.get(c.row.id) ?? [];
        for (const tid of tids) {
          if (result.included.has(tid)) continue;
          const v = result.verdicts.get(tid);
          causes.push({
            entityType: "tool",
            entityId: redactedToolIds.has(tid) ? null : tid,
            code:
              v?.gate.code ?? v?.causes[0]?.code ?? AssemblyCode.REQUIRED_DEPENDENCY_UNAVAILABLE,
            message: v?.gate.message ?? "required tool is not usable",
          });
          causes.push(...(v?.causes ?? []));
        }
        removedSkills.set(c.row.id, causes);
      }
      currentSkills = viable;
      seeds = allSeeds();
      const rs = new Set<string>();
      for (const c of currentSkills) {
        for (const tid of selection.toolsBySkill.get(c.row.id) ?? []) rs.add(tid);
      }
      result = resolveClosure({
        seeds,
        requiredSeeds: rs,
        tools,
        edges,
        redactedIds: redactedToolIds,
        gate: toolGate,
      });
    }

    return {
      result,
      tools,
      edges,
      toolGate,
      redactedToolIds,
      removedSkills,
      finalSkills: currentSkills,
    };
  });
  selectedSkills = closure.finalSkills;
  const selectedSkillIds = new Set(selectedSkills.map((c) => c.row.id));
  const alreadyDiagnosed = new Set(skillDiags.filter((d) => !d.selected).map((d) => d.entity.id));
  for (const [i, c] of selection.ranked.entries()) {
    if (selectedSkillIds.has(c.row.id)) {
      diagFor(skillDiags, c.row, "skill", {
        selected: true,
        rank: i + 1,
        score: c.score,
        code: null,
        message: null,
      });
    } else if (!alreadyDiagnosed.has(c.row.id)) {
      const causes = closure.removedSkills.get(c.row.id);
      diagFor(skillDiags, c.row, "skill", {
        selected: false,
        rank: i + 1,
        score: c.score,
        code: causes ? AssemblyCode.SKILL_REQUIRED_TOOL_UNAVAILABLE : null,
        message: causes ? "skill removed: a required tool is unavailable" : null,
        ...(causes ? { causes } : {}),
      });
    }
  }

  // -- bootstrap_retrieval -----------------------------------------------------------
  const bootstrap = await timings.time(AssemblyStage.BOOTSTRAP_RETRIEVAL, async () => {
    if (task === null) return null;
    // Selected concepts = task-resolved ∪ concepts of finally-selected skills
    // (spec/06: bootstrap retrieval runs "with selected concepts").
    const selectedConceptIds = new Set(conceptIds);
    for (const c of selectedSkills) {
      for (const cid of selection.conceptsBySkill.get(c.row.id) ?? []) {
        selectedConceptIds.add(cid);
      }
    }
    return retrieve(services, {
      namespace: namespace.key,
      query: task,
      ...(request.context !== undefined ? { context: request.context } : {}),
      ...(request.trusted !== undefined ? { trusted: request.trusted } : {}),
      ...(profileKey !== undefined ? { profile: profileKey } : {}),
      filters: { conceptIds: [...selectedConceptIds].sort() },
      limits: { maxTokens: effective.bootstrapKnowledgeTokens },
      diagnostics: diagnosticsOn,
    });
  });

  // -- budget_application --------------------------------------------------------------
  const budget = await timings.time(AssemblyStage.BUDGET_APPLICATION, async () => {
    // Required tools are indivisible; overage is a hard assembly failure.
    let result = closure.result;
    if (result.required.size > effective.maxTools) {
      fail(
        RuntimeErrorCode.ASSEMBLY_BUDGET_EXCEEDED,
        `required tool closure (${result.required.size}) exceeds effective maxTools (${effective.maxTools})`,
      );
    }
    // Drop least-relevant droppable tools until within budget.
    const excluded = new Set<string>();
    const dropOrder = (ids: string[]) =>
      ids
        .map((id) => ({ id, c: afterGroups.tools.find((t) => t.row.id === id) }))
        .sort((a, b) => {
          const sa = a.c?.score ?? Number.NEGATIVE_INFINITY;
          const sb = b.c?.score ?? Number.NEGATIVE_INFINITY;
          if (sa !== sb) return sa - sb;
          const pa = a.c?.row.priority ?? 0;
          const pb = b.c?.row.priority ?? 0;
          if (pa !== pb) return pa - pb;
          return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
        })
        .map((x) => x.id);
    for (let guard = 0; guard <= closure.tools.size; guard++) {
      if (result.included.size <= effective.maxTools) break;
      const droppable = [...result.included].filter((id) => !result.required.has(id));
      const [drop] = dropOrder(droppable);
      if (drop === undefined) break;
      excluded.add(drop);
      const reqSeeds = new Set<string>();
      for (const c of selectedSkills) {
        for (const tid of selection.toolsBySkill.get(c.row.id) ?? []) reqSeeds.add(tid);
      }
      const seeds = new Set([...reqSeeds, ...afterGroups.tools.map((t) => t.row.id)]);
      result = resolveClosure({
        seeds,
        requiredSeeds: reqSeeds,
        tools: closure.tools,
        edges: closure.edges,
        excluded,
        redactedIds: closure.redactedToolIds,
        gate: closure.toolGate,
      });
    }
    if (result.included.size > effective.maxTools) {
      fail(
        RuntimeErrorCode.ASSEMBLY_BUDGET_EXCEEDED,
        `included tools (${result.included.size}) exceed effective maxTools (${effective.maxTools}) and required dependencies are indivisible`,
      );
    }
    return { result, excluded };
  });

  const finalIncluded = budget.result.included;
  // Optional-dependency omissions surface as registered warnings (spec/14).
  for (const res of budget.result.resolutions) {
    if (res.status === "OPTIONAL_OMITTED") {
      warnings.push({
        code: WarningCode.OPTIONAL_TOOL_DEPENDENCY_UNAVAILABLE,
        message: `optional dependency ${res.targetTool.key === "" ? "(redacted)" : `"${res.targetTool.key}"`} of tool ${res.sourceTool.key === "" ? "(redacted)" : `"${res.sourceTool.key}"`} is unavailable and was omitted`,
      });
    }
  }
  const toolCandidateIds = new Set(afterGroups.tools.map((c) => c.row.id));
  const diagnosedToolIds = new Set(
    directTools.filter((c) => !c.gate.pass || c.groupRejected === true).map((c) => c.row.id),
  );
  const emitToolDiag = (
    row: ToolRow,
    opts: { rank: number | null; score: number | null; omittedOptional?: boolean },
  ) => {
    const v = budget.result.verdicts.get(row.id);
    const included = finalIncluded.has(row.id);
    const omitted = opts.omittedOptional === true && !included;
    diagFor(
      toolDiags,
      row,
      "tool",
      {
        selected: included,
        rank: opts.rank,
        score: opts.score,
        code: included
          ? null
          : omitted
            ? AssemblyCode.OPTIONAL_DEPENDENCY_OMITTED
            : (v?.gate.code ?? null),
        message: included
          ? null
          : omitted
            ? "optional dependency is not usable and was omitted"
            : (v?.gate.message ?? "tool not in final closure"),
        ...(v ? { causes: v.causes } : {}),
      },
      v?.gate.code === RetrievalExclusionCode.AUTHORIZATION_NO_MATCH,
    );
  };

  // Tool diagnostics: discovered candidates + closure-only tools.
  for (const c of afterGroups.tools) {
    emitToolDiag(c.row, {
      rank: toolDiscovery.get(c.row.id)?.rank ?? null,
      score: c.score,
    });
  }
  for (const [id, tool] of closure.tools) {
    if (toolCandidateIds.has(id) || diagnosedToolIds.has(id)) continue;
    // A closure-only tool reached solely through optional edges was omitted.
    const incoming = closure.edges.filter((e) => e.targetToolId === id);
    emitToolDiag(tool, {
      rank: null,
      score: null,
      omittedOptional: incoming.length > 0 && incoming.every((e) => e.requirement === "optional"),
    });
  }

  // Assembled tools: sources/requiredBy provenance.
  const requiredBy = new Map<string, EntityRef[]>();
  for (const c of selectedSkills) {
    for (const tid of selection.toolsBySkill.get(c.row.id) ?? []) {
      if (!finalIncluded.has(tid)) continue;
      const list = requiredBy.get(tid) ?? [];
      list.push(entityRef(c.row, "skill"));
      requiredBy.set(tid, list);
    }
  }
  for (const e of closure.edges) {
    if (e.requirement !== "required") continue;
    if (!finalIncluded.has(e.sourceToolId) || !finalIncluded.has(e.targetToolId)) continue;
    const src = closure.tools.get(e.sourceToolId);
    if (!src) continue;
    const list = requiredBy.get(e.targetToolId) ?? [];
    const r = entityRef(src, "tool");
    if (!list.some((x) => x.id === r.id)) list.push(r);
    requiredBy.set(e.targetToolId, list);
  }
  for (const list of requiredBy.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const assembledTools = [...finalIncluded]
    .map((id) => {
      const tool = closure.tools.get(id);
      if (!tool) return null;
      const sources: string[] = [];
      const reasons: AssemblyReason[] = [];
      if (toolCandidateIds.has(id)) {
        sources.push("task");
        reasons.push({
          code: AssemblyReasonCode.DIRECT_TASK_TOOL,
          message: "tool selected directly from task relevance",
        });
      }
      for (const c of selectedSkills) {
        if ((selection.toolsBySkill.get(c.row.id) ?? []).includes(id)) {
          sources.push(`skill:${c.row.key}`);
          reasons.push({
            code: AssemblyReasonCode.SKILL_REQUIRED_TOOL,
            message: `tool required directly by selected skill "${c.row.key}"`,
            details: { skill: c.row.key },
          });
        }
      }
      const depEdges = closure.edges.filter(
        (e) => e.targetToolId === id && finalIncluded.has(e.sourceToolId),
      );
      // Required edges dominate optional ones for the inclusion reason.
      const depEdge = depEdges.find((e) => e.requirement === "required") ?? depEdges[0];
      if (depEdge) {
        sources.push("dependency");
        reasons.push({
          code:
            depEdge.requirement === "required"
              ? AssemblyReasonCode.REQUIRED_TOOL_DEPENDENCY
              : AssemblyReasonCode.OPTIONAL_TOOL_DEPENDENCY,
          message:
            depEdge.requirement === "required"
              ? "tool included as required dependency closure"
              : "usable optional dependency included in closure",
        });
      }
      sources.sort();
      return {
        tool,
        sources,
        requiredBy: requiredBy.get(id) ?? [],
        inclusionReasons: reasons,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => (a.tool.id < b.tool.id ? -1 : a.tool.id > b.tool.id ? 1 : 0));

  // -- prompt_rendering ---------------------------------------------------------------
  const rendered = await timings.time(AssemblyStage.PROMPT_RENDERING, async () => {
    // Required content = `always` fragments; indivisible (spec/06).
    // Group losers are excluded even when template-listed.
    const finalFrags = fragments.filter((c) => c.gate.pass && c.groupRejected !== true);
    // Any `always` fragment that failed gating or lost its group was noted
    // during selection — required content cannot be satisfied, so fail.
    const missing = fragments.filter(
      (c) => c.row.inclusionMode === "always" && !finalFrags.includes(c),
    );
    if (missing.length > 0) {
      // Redacted candidates must not leak their key even into this message.
      const named = missing
        .map((c) => (c.gate.redacted ? "(redacted)" : c.row.key))
        .sort()
        .join(", ");
      fail(
        RuntimeErrorCode.ASSEMBLY_REQUIREMENT_UNSATISFIED,
        `required prompt fragment(s) cannot be included: ${named}`,
      );
    }
    if (finalFrags.length > 0) {
      warnings.push({
        code: WarningCode.TOKEN_COUNT_APPROXIMATE,
        message: "prompt token usage uses the deterministic approximation",
      });
    }
    const ordered = [...finalFrags].sort((a, b) => {
      if (a.row.section !== b.row.section) return a.row.section < b.row.section ? -1 : 1;
      if (a.row.orderHint !== b.row.orderHint) return a.row.orderHint - b.row.orderHint;
      return a.row.key < b.row.key ? -1 : a.row.key > b.row.key ? 1 : 0;
    });
    const requiredTokens = ordered
      .filter((c) => c.row.inclusionMode === "always")
      .reduce((n, c) => n + estimateTokens(c.row.content), 0);
    if (requiredTokens > effective.promptTokens) {
      fail(
        RuntimeErrorCode.ASSEMBLY_BUDGET_EXCEEDED,
        `required prompt content (${requiredTokens} tokens) exceeds effective prompt budget (${effective.promptTokens})`,
      );
    }
    let used = 0;
    const packed: typeof ordered = [];
    for (const c of ordered) {
      const tokens = estimateTokens(c.row.content);
      if (c.row.inclusionMode === "always") {
        used += tokens;
        packed.push(c);
        continue;
      }
      if (used + tokens <= effective.promptTokens) {
        used += tokens;
        packed.push(c);
      } else {
        diagFor(fragmentDiags, c.row, "prompt_fragment", {
          selected: false,
          rank: null,
          score: c.score,
          code: null,
          message: "omitted by effective prompt token budget",
        });
      }
    }
    return { packed, used };
  });

  const assembledFragments = rendered.packed.map((c, i) => ({
    fragment: c.row,
    sources: [...c.sources].sort(),
    renderedOrder: i,
    estimatedTokens: estimateTokens(c.row.content),
    inclusionReasons: c.reasons,
  }));

  for (const c of fragments) {
    const packedHit = rendered.packed.some((p) => p.row.id === c.row.id);
    if (packedHit && !fragmentDiags.some((d) => d.entity.id === c.row.id && d.selected)) {
      diagFor(fragmentDiags, c.row, "prompt_fragment", {
        selected: true,
        rank: fragmentDiscovery.discovered.get(c.row.id)?.rank ?? null,
        score: c.score,
        code: null,
        message: null,
      });
    }
  }

  const assembledSkills = selection.ranked
    .map((c, i) => ({ c, rank: i + 1 }))
    .filter(({ c }) => selectedSkillIds.has(c.row.id))
    .map(({ c, rank }) => ({
      skill: c.row,
      rank,
      score: c.score,
      inclusionReasons: [
        {
          code: AssemblyReasonCode.SELECTED_SKILL,
          message: "skill selected by semantic/concept ranking",
        } satisfies AssemblyReason,
      ],
    }));

  const bootstrapItems = bootstrap?.results ?? [];
  const bootstrapTokens =
    bootstrap?.packedContext?.estimatedTokens ??
    bootstrapItems.reduce((n, i) => n + (i.chunk.tokenCount ?? estimateTokens(i.chunk.content)), 0);

  const diagnostics = diagnosticsOn
    ? {
        skillCandidates: [...skillDiags].sort(diagOrder),
        toolCandidates: [...toolDiags].sort(diagOrder),
        fragmentCandidates: [...fragmentDiags].sort(diagOrder),
        dependencyResolutions: budget.result.resolutions,
        bootstrapRetrieval: bootstrap?.diagnostics ?? null,
        timings: timings.toArray(),
        warnings,
        ...(diagnosticsErrors.length > 0 ? { diagnosticsErrors } : {}),
      }
    : null;

  return {
    namespace: { id: namespace.id, key: namespace.key },
    runtimeRevision: revision,
    template,
    contextHash: sha256(JSON.stringify(canonicalContextEntries(context))),
    task: task !== null ? { text: task, hash: sha256(task), resolvedConcepts } : null,
    promptFragments: assembledFragments,
    skills: assembledSkills,
    tools: assembledTools,
    bootstrapKnowledge: bootstrapItems,
    renderedPrompt:
      assembledFragments.length > 0
        ? assembledFragments.map((f) => f.fragment.content).join("\n\n")
        : null,
    budgetUsage: {
      skills: assembledSkills.length,
      maxSkills: Number.isFinite(effective.maxSkills) ? effective.maxSkills : null,
      tools: assembledTools.length,
      maxTools: Number.isFinite(effective.maxTools) ? effective.maxTools : null,
      promptTokens: rendered.used,
      maxPromptTokens: Number.isFinite(effective.promptTokens) ? effective.promptTokens : null,
      bootstrapKnowledgeTokens: bootstrapTokens,
      maxBootstrapKnowledgeTokens: Number.isFinite(effective.bootstrapKnowledgeTokens)
        ? effective.bootstrapKnowledgeTokens
        : null,
    },
    diagnostics,
  };
}

function diagOrder(a: AssemblyCandidateDiagnostic, b: AssemblyCandidateDiagnostic): number {
  if (a.entity.id !== b.entity.id) return a.entity.id < b.entity.id ? -1 : 1;
  const ca = a.code ?? "";
  const cb = b.code ?? "";
  return ca < cb ? -1 : ca > cb ? 1 : 0;
}
