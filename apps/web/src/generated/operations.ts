/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type AgentAssemblyBudgetInput = {
  bootstrapKnowledgeTokens?: number | null | undefined;
  maxSkills?: number | null | undefined;
  maxTools?: number | null | undefined;
  promptTokens?: number | null | undefined;
};

export type AgentAssemblyInput = {
  budgets?: AgentAssemblyBudgetInput | null | undefined;
  context?: unknown;
  diagnostics?: boolean | null | undefined;
  namespace?: string | null | undefined;
  retrievalProfile?: string | null | undefined;
  runtime?: AgentRuntimeInput | null | undefined;
  task?: string | null | undefined;
  template: string;
};

export type AgentRuntimeInput = {
  availableBindings?: Array<string> | null | undefined;
};

export type ConceptMatchType =
  | 'EXACT_ALIAS'
  | 'EXACT_KEY'
  | 'EXACT_NAME'
  | 'LEXICAL'
  | 'SEMANTIC'
  | 'TRIGRAM';

export type ConceptsInput = {
  after?: string | null | undefined;
  domain?: string | null | undefined;
  first?: number | null | undefined;
  search?: string | null | undefined;
  status?: LifecycleStatus | null | undefined;
  type?: string | null | undefined;
};

export type DependencyResolutionStatus =
  | 'BLOCKED_BY_DEPENDENCY'
  | 'INCLUDED'
  | 'OPTIONAL_OMITTED'
  | 'UNAVAILABLE';

export type DomainsInput = {
  after?: string | null | undefined;
  first?: number | null | undefined;
  search?: string | null | undefined;
};

export type EntityRefInput = {
  id?: string | number | null | undefined;
  key?: string | null | undefined;
};

export type GateExpressionKind =
  | 'APPLICABILITY'
  | 'AUTHORIZATION';

export type GateSimulationInput = {
  context: unknown;
  entity: EntityRefInput;
};

export type GateState =
  | 'FALSE'
  | 'SKIP'
  | 'TRUE'
  | 'UNKNOWN';

export type KnowledgeChunkRefInput = {
  id?: string | number | null | undefined;
  key?: string | null | undefined;
  knowledgeItem?: string | null | undefined;
};

export type KnowledgeItemsInput = {
  after?: string | null | undefined;
  concept?: string | null | undefined;
  domain?: string | null | undefined;
  first?: number | null | undefined;
  search?: string | null | undefined;
  status?: LifecycleStatus | null | undefined;
};

export type LifecycleStatus =
  | 'DEPRECATED'
  | 'DRAFT'
  | 'PUBLISHED';

export type OntologyNeighborhoodInput = {
  concept: EntityRefInput;
  depth?: number | null | undefined;
  direction?: RelationDirection | null | undefined;
  domain?: string | null | undefined;
  relationTypes?: Array<string> | null | undefined;
};

export type PromptFragmentInclusionMode =
  | 'ALWAYS'
  | 'APPLICABLE'
  | 'TASK_RELEVANT';

export type PromptFragmentsInput = {
  after?: string | null | undefined;
  concept?: string | null | undefined;
  first?: number | null | undefined;
  search?: string | null | undefined;
  selectionGroup?: string | null | undefined;
  status?: LifecycleStatus | null | undefined;
};

export type RelationDirection =
  | 'BOTH'
  | 'INCOMING'
  | 'OUTGOING';

export type RetrievalFiltersInput = {
  conceptIds?: Array<string | number> | null | undefined;
  domainIds?: Array<string | number> | null | undefined;
  includeDeprecated?: boolean | null | undefined;
  includeDraft?: boolean | null | undefined;
  knowledgeItemIds?: Array<string | number> | null | undefined;
};

export type RetrievalInput = {
  context?: unknown;
  diagnostics?: boolean | null | undefined;
  filters?: RetrievalFiltersInput | null | undefined;
  limits?: RetrievalLimitsInput | null | undefined;
  namespace?: string | null | undefined;
  profile?: string | null | undefined;
  query: string;
};

export type RetrievalLimitsInput = {
  maxChunks?: number | null | undefined;
  maxTokens?: number | null | undefined;
};

export type SelectionGroupMode =
  | 'ALL'
  | 'HIGHEST_PRIORITY'
  | 'MOST_SPECIFIC';

export type SkillsInput = {
  after?: string | null | undefined;
  concept?: string | null | undefined;
  first?: number | null | undefined;
  search?: string | null | undefined;
  selectionGroup?: string | null | undefined;
  status?: LifecycleStatus | null | undefined;
};

export type ToolDependencyRequirement =
  | 'OPTIONAL'
  | 'REQUIRED';

export type ToolLatency =
  | 'FAST_REMOTE'
  | 'LOCAL'
  | 'SLOW_REMOTE';

export type ToolRisk =
  | 'DESTRUCTIVE'
  | 'PRIVILEGED'
  | 'READ'
  | 'WRITE';

export type ToolsInput = {
  after?: string | null | undefined;
  concept?: string | null | undefined;
  first?: number | null | undefined;
  search?: string | null | undefined;
  selectionGroup?: string | null | undefined;
  status?: LifecycleStatus | null | undefined;
};

export type SourceFieldsFragment = { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null };

export type RuntimeInfoQueryVariables = Exact<{ [key: string]: never; }>;


export type RuntimeInfoQuery = { runtimeInfo: { environment: string, runtimeRevision: string, gitCommit: string | null, sourceHash: string, compilerVersion: string | null, namespace: { id: string, key: string } } };

export type ConceptsQueryVariables = Exact<{
  input?: ConceptsInput | null | undefined;
}>;


export type ConceptsQuery = { concepts: { totalCount: number | null, nodes: Array<{ id: string, key: string, name: string, type: string | null, description: string | null, status: LifecycleStatus, metadata: unknown, domains: Array<{ id: string, key: string, name: string }>, aliases: Array<{ id: string, alias: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type ConceptQueryVariables = Exact<{
  ref: EntityRefInput;
}>;


export type ConceptQuery = { concept: { id: string, key: string, name: string, type: string | null, description: string | null, status: LifecycleStatus, metadata: unknown, domains: Array<{ id: string, key: string, name: string }>, aliases: Array<{ id: string, alias: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null }, outgoingRelations: { totalCount: number | null, nodes: Array<{ id: string, type: { key: string, name: string }, targetConcept: { id: string, key: string, name: string }, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }> }, incomingRelations: { totalCount: number | null, nodes: Array<{ id: string, type: { key: string, name: string }, sourceConcept: { id: string, key: string, name: string } }> } } | null };

export type NeighborhoodQueryVariables = Exact<{
  input: OntologyNeighborhoodInput;
}>;


export type NeighborhoodQuery = { ontologyNeighborhood: { center: { id: string, key: string, name: string, type: string | null, status: LifecycleStatus }, concepts: Array<{ id: string, key: string, name: string, type: string | null, status: LifecycleStatus }>, relations: Array<{ id: string, type: { key: string, name: string }, sourceConcept: { id: string, key: string, name: string }, targetConcept: { id: string, key: string, name: string } }>, chunks: Array<{ id: string, key: string, heading: string | null, status: LifecycleStatus, knowledgeItem: { key: string, title: string } }> } };

export type KnowledgeItemsQueryVariables = Exact<{
  input?: KnowledgeItemsInput | null | undefined;
}>;


export type KnowledgeItemsQuery = { knowledgeItems: { totalCount: number | null, nodes: Array<{ id: string, key: string, title: string, summary: string | null, status: LifecycleStatus, authorityScore: number | null, effectiveFrom: string | null, effectiveTo: string | null, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type KnowledgeItemQueryVariables = Exact<{
  ref: EntityRefInput;
}>;


export type KnowledgeItemQuery = { knowledgeItem: { id: string, key: string, title: string, summary: string | null, status: LifecycleStatus, authorityScore: number | null, effectiveFrom: string | null, effectiveTo: string | null, metadata: unknown, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null }, chunks: { totalCount: number | null, nodes: Array<{ id: string, key: string, ordinal: number, heading: string | null, status: LifecycleStatus, priority: number, tokenCount: number | null, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }> }, sourceReference: { id: string, key: string | null, title: string, uri: string | null, type: string | null } | null } | null };

export type KnowledgeChunkQueryVariables = Exact<{
  ref: KnowledgeChunkRefInput;
}>;


export type KnowledgeChunkQuery = { knowledgeChunk: { id: string, key: string, ordinal: number, heading: string | null, content: string, status: LifecycleStatus, priority: number, authorityScore: number | null, tokenCount: number | null, effectiveFrom: string | null, effectiveTo: string | null, authorization: unknown, applicability: unknown, metadata: unknown, knowledgeItem: { id: string, key: string, title: string }, concepts: Array<{ id: string, key: string, name: string }>, selectionGroup: { id: string, key: string } | null, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } } | null };

export type DomainsQueryVariables = Exact<{
  input?: DomainsInput | null | undefined;
}>;


export type DomainsQuery = { domains: { totalCount: number | null, nodes: Array<{ id: string, key: string, name: string, description: string | null, metadata: unknown, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type DimensionsQueryVariables = Exact<{ [key: string]: never; }>;


export type DimensionsQuery = { dimensions: Array<{ id: string, key: string, name: string, description: string | null, valueType: string, cardinality: string, category: string, allowedOperators: Array<string>, hierarchical: boolean, required: boolean, missingValueBehavior: string, trust: string, values: { nodes: Array<{ key: string, name: string | null }> }, usedBy: Array<{ kind: GateExpressionKind, entity: { id: string } }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }> };

export type DimensionQueryVariables = Exact<{
  ref: EntityRefInput;
  valuesAfter?: string | null | undefined;
}>;


export type DimensionQuery = { dimension: { id: string, key: string, name: string, description: string | null, valueType: string, cardinality: string, category: string, allowedOperators: Array<string>, hierarchical: boolean, required: boolean, missingValueBehavior: string, trust: string, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null }, usedBy: Array<{ kind: GateExpressionKind, entity: { id: string, key: string, type: string } }>, values: { totalCount: number | null, nodes: Array<{ id: string, key: string, name: string | null, metadata: unknown, parent: { id: string } | null, children: Array<{ id: string, key: string }> }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } } | null };

export type SelectionGroupsQueryVariables = Exact<{ [key: string]: never; }>;


export type SelectionGroupsQuery = { selectionGroups: Array<{ id: string, key: string, name: string | null, entityType: string, mode: SelectionGroupMode, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null }, members: Array<
      | { __typename: 'KnowledgeChunk', id: string, key: string, priority: number }
      | { __typename: 'PromptFragment', id: string, key: string, name: string, priority: number }
      | { __typename: 'Skill', id: string, key: string, name: string, priority: number }
      | { __typename: 'Tool', id: string, key: string, name: string, priority: number }
    > }> };

export type AgentTemplatesQueryVariables = Exact<{ [key: string]: never; }>;


export type AgentTemplatesQuery = { agentTemplates: Array<{ id: string, key: string, name: string, description: string | null, status: LifecycleStatus, metadata: unknown, budgets: { maxSkills: number | null, maxTools: number | null, promptTokens: number | null, bootstrapKnowledgeTokens: number | null }, retrievalProfile: { id: string, key: string } | null, promptFragments: Array<{ id: string, key: string, name: string, section: string, inclusionMode: PromptFragmentInclusionMode, order: number }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }> };

export type AgentTemplateQueryVariables = Exact<{
  ref: EntityRefInput;
}>;


export type AgentTemplateQuery = { agentTemplate: { id: string, key: string, name: string, description: string | null, status: LifecycleStatus, metadata: unknown, budgets: { maxSkills: number | null, maxTools: number | null, promptTokens: number | null, bootstrapKnowledgeTokens: number | null }, retrievalProfile: { id: string, key: string, name: string | null } | null, promptFragments: Array<{ id: string, key: string, name: string, section: string, inclusionMode: PromptFragmentInclusionMode, order: number, status: LifecycleStatus }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } } | null };

export type SkillsQueryVariables = Exact<{
  input?: SkillsInput | null | undefined;
}>;


export type SkillsQuery = { skills: { totalCount: number | null, nodes: Array<{ id: string, key: string, name: string, description: string | null, status: LifecycleStatus, priority: number, selectionGroup: { id: string, key: string } | null, concepts: Array<{ id: string, key: string }>, tools: Array<{ id: string, key: string, name: string }>, promptFragments: Array<{ id: string, key: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type SkillQueryVariables = Exact<{
  ref: EntityRefInput;
}>;


export type SkillQuery = { skill: { id: string, key: string, name: string, description: string | null, status: LifecycleStatus, priority: number, authorization: unknown, applicability: unknown, metadata: unknown, selectionGroup: { id: string, key: string, name: string | null, mode: SelectionGroupMode } | null, concepts: Array<{ id: string, key: string, name: string }>, promptFragments: Array<{ id: string, key: string, name: string, section: string }>, tools: Array<{ id: string, key: string, name: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } } | null };

export type ToolsQueryVariables = Exact<{
  input?: ToolsInput | null | undefined;
}>;


export type ToolsQuery = { tools: { totalCount: number | null, nodes: Array<{ id: string, key: string, name: string, description: string, status: LifecycleStatus, priority: number, runtimeBinding: string, risk: ToolRisk | null, latency: ToolLatency | null, selectionGroup: { id: string, key: string } | null, concepts: Array<{ id: string, key: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type ToolQueryVariables = Exact<{
  ref: EntityRefInput;
}>;


export type ToolQuery = { tool: { id: string, key: string, name: string, description: string, status: LifecycleStatus, priority: number, runtimeBinding: string, risk: ToolRisk | null, latency: ToolLatency | null, authorization: unknown, applicability: unknown, inputSchema: unknown, outputSchema: unknown, metadata: unknown, selectionGroup: { id: string, key: string, name: string | null, mode: SelectionGroupMode } | null, concepts: Array<{ id: string, key: string, name: string }>, dependencies: Array<{ requirement: ToolDependencyRequirement, targetTool: { id: string, key: string, name: string, status: LifecycleStatus } }>, dependents: Array<{ requirement: ToolDependencyRequirement, sourceTool: { id: string, key: string, name: string, status: LifecycleStatus } }>, usedBy: Array<{ id: string, key: string, type: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } } | null };

export type PromptFragmentsQueryVariables = Exact<{
  input?: PromptFragmentsInput | null | undefined;
}>;


export type PromptFragmentsQuery = { promptFragments: { totalCount: number | null, nodes: Array<{ id: string, key: string, name: string, status: LifecycleStatus, inclusionMode: PromptFragmentInclusionMode, section: string, order: number, priority: number, selectionGroup: { id: string, key: string } | null, concepts: Array<{ id: string, key: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }>, pageInfo: { hasNextPage: boolean, endCursor: string | null } } };

export type PromptFragmentQueryVariables = Exact<{
  ref: EntityRefInput;
}>;


export type PromptFragmentQuery = { promptFragment: { id: string, key: string, name: string, status: LifecycleStatus, inclusionMode: PromptFragmentInclusionMode, section: string, order: number, priority: number, content: string, authorization: unknown, applicability: unknown, metadata: unknown, selectionGroup: { id: string, key: string, name: string | null, mode: SelectionGroupMode } | null, concepts: Array<{ id: string, key: string, name: string }>, usedBy: Array<{ id: string, key: string, type: string }>, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } } | null };

export type RetrieveQueryVariables = Exact<{
  input: RetrievalInput;
}>;


export type RetrieveQuery = { retrieve: { runtimeRevision: string, query: string, namespace: { key: string }, resolvedConcepts: Array<{ matchType: ConceptMatchType, matchedText: string | null, score: number | null, rank: number, concept: { id: string, key: string, name: string } }>, results: Array<{ score: number, rank: number, reasons: Array<{ code: string, message: string }> | null, chunk: { id: string, key: string, heading: string | null, ordinal: number, knowledgeItem: { key: string, title: string } } }>, packedContext: { estimatedTokens: number, maxTokens: number | null, maxChunks: number | null, chunks: Array<{ id: string, key: string }> } | null, diagnostics: { timings: Array<{ stage: string, milliseconds: number }>, candidateCounts: { vector: number, fullText: number, trigram: number, conceptLinked: number, graphLinked: number, unique: number, afterLifecycle: number, afterAuthorization: number, afterApplicability: number, afterSelectionGroups: number, packed: number }, exclusions: Array<{ stage: string, code: string, message: string, redacted: boolean, chunk: { id: string, key: string, type: string } | null }>, rankings: Array<{ chunkId: string, finalRank: number, vectorRank: number | null, vectorScore: number | null, fullTextRank: number | null, fullTextScore: number | null, trigramRank: number | null, trigramScore: number | null, conceptRank: number | null, graphRank: number | null, rrfScore: number, authorityScore: number, priority: number }>, graphPaths: Array<{ depth: number, seedConcept: { key: string }, targetConcept: { key: string }, steps: Array<{ direction: RelationDirection, relation: { key: string }, from: { key: string }, to: { key: string } }> }>, packing: { considered: number, packed: number, skippedForBudget: number, skippedForItemCap: number }, warnings: Array<{ code: string, message: string }>, errors: Array<{ code: string, message: string }> } | null } };

export type AssembleQueryVariables = Exact<{
  input: AgentAssemblyInput;
}>;


export type AssembleQuery = { assembleAgent: { runtimeRevision: string, contextHash: string, renderedPrompt: string | null, namespace: { key: string }, template: { id: string, key: string, name: string }, task: { text: string, hash: string, resolvedConcepts: Array<{ matchType: ConceptMatchType, rank: number, concept: { key: string, name: string } }> } | null, promptFragments: Array<{ renderedOrder: number, estimatedTokens: number, sources: Array<string>, fragment: { id: string, key: string, name: string, section: string, inclusionMode: PromptFragmentInclusionMode }, inclusionReasons: Array<{ code: string, message: string }> }>, skills: Array<{ rank: number | null, score: number | null, skill: { id: string, key: string, name: string }, inclusionReasons: Array<{ code: string, message: string }> }>, tools: Array<{ sources: Array<string>, tool: { id: string, key: string, name: string, runtimeBinding: string }, requiredBy: Array<{ id: string, key: string, type: string }>, inclusionReasons: Array<{ code: string, message: string }> }>, bootstrapKnowledge: Array<{ score: number, rank: number, chunk: { id: string, key: string, heading: string | null, knowledgeItem: { key: string } } }>, budgetUsage: { skills: number, maxSkills: number | null, tools: number, maxTools: number | null, promptTokens: number, maxPromptTokens: number | null, bootstrapKnowledgeTokens: number, maxBootstrapKnowledgeTokens: number | null }, diagnostics: { timings: Array<{ stage: string, milliseconds: number }>, warnings: Array<{ code: string, message: string }>, errors: Array<{ code: string, message: string }>, skillCandidates: Array<{ selected: boolean, rank: number | null, score: number | null, code: string | null, message: string | null, entity: { id: string, key: string, type: string }, causes: Array<{ entityType: string, entityId: string | null, code: string, message: string }> }>, toolCandidates: Array<{ selected: boolean, rank: number | null, score: number | null, code: string | null, message: string | null, entity: { id: string, key: string, type: string }, causes: Array<{ entityType: string, entityId: string | null, code: string, message: string }> }>, fragmentCandidates: Array<{ selected: boolean, rank: number | null, score: number | null, code: string | null, message: string | null, entity: { id: string, key: string, type: string }, causes: Array<{ entityType: string, entityId: string | null, code: string, message: string }> }>, dependencyResolutions: Array<{ requirement: ToolDependencyRequirement, status: DependencyResolutionStatus, reason: string | null, sourceTool: { key: string }, targetTool: { key: string } }>, bootstrapRetrieval: { timings: Array<{ stage: string, milliseconds: number }>, candidateCounts: { unique: number, afterLifecycle: number, afterAuthorization: number, afterApplicability: number, afterSelectionGroups: number, packed: number }, warnings: Array<{ code: string, message: string }>, errors: Array<{ code: string, message: string }> } | null } | null } };

export type SimulateGatesQueryVariables = Exact<{
  input: GateSimulationInput;
}>;


export type SimulateGatesQuery = { simulateGates: { entity: { id: string, key: string, type: string }, authorization: { state: GateState, eligible: boolean, specificity: Array<number> | null, diagnostics: Array<{ code: string, message: string }> } | null, applicability: { state: GateState, eligible: boolean, specificity: Array<number> | null, diagnostics: Array<{ code: string, message: string }> } | null } };

export type GlobalSearchQueryVariables = Exact<{
  q: string;
}>;


export type GlobalSearchQuery = { concepts: { nodes: Array<{ id: string, key: string, name: string, status: LifecycleStatus }> }, knowledgeItems: { nodes: Array<{ id: string, key: string, title: string, status: LifecycleStatus }> }, domains: { nodes: Array<{ id: string, key: string, name: string }> }, skills: { nodes: Array<{ id: string, key: string, name: string, status: LifecycleStatus }> }, tools: { nodes: Array<{ id: string, key: string, name: string, status: LifecycleStatus }> }, promptFragments: { nodes: Array<{ id: string, key: string, name: string, status: LifecycleStatus }> }, agentTemplates: Array<{ id: string, key: string, name: string, status: LifecycleStatus }>, selectionGroups: Array<{ id: string, key: string, entityType: string, mode: SelectionGroupMode }>, dimensions: Array<{ id: string, key: string, name: string }>, retrievalProfiles: Array<{ id: string, key: string, name: string | null }>, namespace: { id: string, key: string, name: string } | null };

export type RetrievalProfilesQueryVariables = Exact<{ [key: string]: never; }>;


export type RetrievalProfilesQuery = { retrievalProfiles: Array<{ id: string, key: string, name: string | null, config: unknown, source: { path: string, line: number | null, repositoryUrl: string | null, repositoryRef: string | null, viewUrl: string | null } }> };

export type OverviewQueryVariables = Exact<{ [key: string]: never; }>;


export type OverviewQuery = { runtimeInfo: { environment: string, runtimeRevision: string, gitCommit: string | null, sourceHash: string, compilerVersion: string | null, namespace: { id: string, key: string } }, concepts: { totalCount: number | null }, knowledgeItems: { totalCount: number | null }, domains: { totalCount: number | null }, skills: { totalCount: number | null }, tools: { totalCount: number | null }, promptFragments: { totalCount: number | null }, dimensions: Array<{ id: string }>, selectionGroups: Array<{ id: string }>, agentTemplates: Array<{ id: string }>, retrievalProfiles: Array<{ id: string }> };

export type NamespaceQueryVariables = Exact<{
  key?: string | null | undefined;
}>;


export type NamespaceQuery = { namespace: { id: string, key: string, name: string, description: string | null, metadata: unknown, defaultRetrievalProfile: { id: string, key: string, name: string | null } | null } | null };
