/**
 * Agent Assembly service types — mirror the GraphQL contract
 * (graphql/schema.graphql AgentAssemblyResult) without depending on GraphQL;
 * resolvers map 1:1 in M7.
 */

import type { Diagnostic } from "@grounding/core";
import type {
  DiagnosticWarning,
  ResolvedConcept,
  RetrievalDiagnostics,
  RetrievalResultItem,
} from "@grounding/retrieval";

export type EntityRef = { id: string; key: string; type: string };

/** Row mirrors for materialized Agent Assembly entities. */
export type AssemblyTemplateRow = {
  id: string;
  namespaceId: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  retrievalProfileId: string | null;
  maxSkills: number | null;
  maxTools: number | null;
  promptTokenBudget: number | null;
  bootstrapKnowledgeTokenBudget: number | null;
  sourcePath: string;
  metadata: unknown;
};

export type SkillRow = {
  id: string;
  namespaceId: string;
  key: string;
  name: string;
  description: string | null;
  status: string;
  selectionGroupId: string | null;
  priority: number;
  authorizationExpression: unknown;
  applicabilityExpression: unknown;
  semanticText: string;
  semanticHash: string;
  sourcePath: string;
  metadata: unknown;
};

export type ToolRow = {
  id: string;
  namespaceId: string;
  key: string;
  name: string;
  status: string;
  description: string;
  runtimeBinding: string;
  risk: string | null;
  latency: string | null;
  selectionGroupId: string | null;
  priority: number;
  authorizationExpression: unknown;
  applicabilityExpression: unknown;
  semanticText: string;
  semanticHash: string;
  inputSchema: unknown;
  outputSchema: unknown;
  sourcePath: string;
  metadata: unknown;
};

export type FragmentRow = {
  id: string;
  namespaceId: string;
  key: string;
  name: string;
  status: string;
  inclusionMode: "always" | "applicable" | "task_relevant";
  section: string;
  orderHint: number;
  content: string;
  selectionGroupId: string | null;
  priority: number;
  authorizationExpression: unknown;
  applicabilityExpression: unknown;
  sourcePath: string;
  semanticHash: string | null;
  metadata: unknown;
};

export type AssembleBudgets = {
  maxSkills?: number;
  maxTools?: number;
  promptTokens?: number;
  bootstrapKnowledgeTokens?: number;
};

export type AssembleRequest = {
  /** Namespace key (or id when unambiguous); defaults when one namespace exists. */
  namespace?: string;
  /** Explicit template key — required. */
  template: string;
  /** Ordinary caller-supplied context. */
  context?: Record<string, unknown>;
  /** Host-injected trusted context (post-authentication). */
  trusted?: Record<string, unknown>;
  /** Optional task; non-empty task requires a shared task embedding. */
  task?: string;
  /** Optional retrieval-profile key; overrides the template's profile. */
  retrievalProfile?: string;
  budgets?: AssembleBudgets;
  /** Absent or null list = all bindings available; [] = none. */
  runtime?: { availableBindings?: string[] | null };
  diagnostics?: boolean;
};

export type AssemblyReason = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

export type AssembledSkill = {
  skill: SkillRow;
  rank: number | null;
  score: number | null;
  inclusionReasons: AssemblyReason[];
};

export type AssembledTool = {
  tool: ToolRow;
  /** e.g. "task", "skill:<key>", "dependency" — provenance strings, not codes. */
  sources: string[];
  requiredBy: EntityRef[];
  inclusionReasons: AssemblyReason[];
};

export type AssembledPromptFragment = {
  fragment: FragmentRow;
  sources: string[];
  renderedOrder: number;
  estimatedTokens: number;
  inclusionReasons: AssemblyReason[];
};

export type AssembledTask = {
  text: string;
  hash: string;
  resolvedConcepts: ResolvedConcept[];
};

export type DiagnosticCause = {
  entityType: string;
  entityId: string | null;
  code: string;
  message: string;
};

export type AssemblyCandidateDiagnostic = {
  entity: EntityRef;
  selected: boolean;
  rank: number | null;
  score: number | null;
  code: string | null;
  message: string | null;
  causes: DiagnosticCause[];
};

export type DependencyResolution = {
  sourceTool: { id: string; key: string };
  targetTool: { id: string; key: string };
  requirement: "required" | "optional";
  status: "INCLUDED" | "UNAVAILABLE" | "OPTIONAL_OMITTED" | "BLOCKED_BY_DEPENDENCY";
  reason: string | null;
};

export type AgentAssemblyBudgetUsage = {
  skills: number;
  maxSkills: number | null;
  tools: number;
  maxTools: number | null;
  promptTokens: number;
  maxPromptTokens: number | null;
  bootstrapKnowledgeTokens: number;
  maxBootstrapKnowledgeTokens: number | null;
};

export type AgentAssemblyDiagnostics = {
  skillCandidates: AssemblyCandidateDiagnostic[];
  toolCandidates: AssemblyCandidateDiagnostic[];
  fragmentCandidates: AssemblyCandidateDiagnostic[];
  dependencyResolutions: DependencyResolution[];
  bootstrapRetrieval: RetrievalDiagnostics | null;
  timings: { stage: string; milliseconds: number }[];
  warnings: DiagnosticWarning[];
  /** Evaluator diagnostics from fail-closed gates (no GraphQL counterpart in v1). */
  diagnosticsErrors?: Diagnostic[];
};

export type AgentAssemblyResult = {
  namespace: { id: string; key: string };
  runtimeRevision: number;
  template: AssemblyTemplateRow;
  contextHash: string;
  task: AssembledTask | null;
  promptFragments: AssembledPromptFragment[];
  skills: AssembledSkill[];
  tools: AssembledTool[];
  bootstrapKnowledge: RetrievalResultItem[];
  renderedPrompt: string | null;
  budgetUsage: AgentAssemblyBudgetUsage;
  diagnostics: AgentAssemblyDiagnostics | null;
};
