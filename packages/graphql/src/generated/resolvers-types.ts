import type { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  DateTime: { input: Date; output: Date; }
  JSON: { input: unknown; output: unknown; }
  Long: { input: string; output: string; }
};

export type AgentAssemblyBudgetInput = {
  bootstrapKnowledgeTokens?: InputMaybe<Scalars['Int']['input']>;
  maxSkills?: InputMaybe<Scalars['Int']['input']>;
  maxTools?: InputMaybe<Scalars['Int']['input']>;
  promptTokens?: InputMaybe<Scalars['Int']['input']>;
};

export type AgentAssemblyBudgetUsage = {
  __typename?: 'AgentAssemblyBudgetUsage';
  bootstrapKnowledgeTokens: Scalars['Int']['output'];
  maxBootstrapKnowledgeTokens?: Maybe<Scalars['Int']['output']>;
  maxPromptTokens?: Maybe<Scalars['Int']['output']>;
  maxSkills?: Maybe<Scalars['Int']['output']>;
  maxTools?: Maybe<Scalars['Int']['output']>;
  promptTokens: Scalars['Int']['output'];
  skills: Scalars['Int']['output'];
  tools: Scalars['Int']['output'];
};

export type AgentAssemblyDiagnostics = {
  __typename?: 'AgentAssemblyDiagnostics';
  bootstrapRetrieval?: Maybe<RetrievalDiagnostics>;
  dependencyResolutions: Array<ToolDependencyResolution>;
  fragmentCandidates: Array<AssemblyCandidateDiagnostic>;
  skillCandidates: Array<AssemblyCandidateDiagnostic>;
  timings: Array<StageTiming>;
  toolCandidates: Array<AssemblyCandidateDiagnostic>;
  warnings: Array<DiagnosticWarning>;
};

export type AgentAssemblyInput = {
  budgets?: InputMaybe<AgentAssemblyBudgetInput>;
  context?: InputMaybe<Scalars['JSON']['input']>;
  diagnostics?: InputMaybe<Scalars['Boolean']['input']>;
  namespace?: InputMaybe<Scalars['String']['input']>;
  retrievalProfile?: InputMaybe<Scalars['String']['input']>;
  runtime?: InputMaybe<AgentRuntimeInput>;
  task?: InputMaybe<Scalars['String']['input']>;
  template: Scalars['String']['input'];
};

export type AgentAssemblyResult = {
  __typename?: 'AgentAssemblyResult';
  bootstrapKnowledge: Array<RetrievalResultItem>;
  budgetUsage: AgentAssemblyBudgetUsage;
  contextHash: Scalars['String']['output'];
  diagnostics?: Maybe<AgentAssemblyDiagnostics>;
  namespace: NamespaceRef;
  promptFragments: Array<AssembledPromptFragment>;
  renderedPrompt?: Maybe<Scalars['String']['output']>;
  runtimeRevision: Scalars['Long']['output'];
  skills: Array<AssembledSkill>;
  task?: Maybe<AssembledTask>;
  template: AgentTemplate;
  tools: Array<AssembledTool>;
};

export type AgentRuntimeInput = {
  availableBindings?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type AgentTemplate = {
  __typename?: 'AgentTemplate';
  budgets: AgentTemplateBudgets;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
  promptFragments: Array<PromptFragment>;
  retrievalProfile?: Maybe<RetrievalProfile>;
  source: SourceLocation;
  status: LifecycleStatus;
};

export type AgentTemplateBudgets = {
  __typename?: 'AgentTemplateBudgets';
  bootstrapKnowledgeTokens?: Maybe<Scalars['Int']['output']>;
  maxSkills?: Maybe<Scalars['Int']['output']>;
  maxTools?: Maybe<Scalars['Int']['output']>;
  promptTokens?: Maybe<Scalars['Int']['output']>;
};

export type AssembledPromptFragment = {
  __typename?: 'AssembledPromptFragment';
  estimatedTokens: Scalars['Int']['output'];
  fragment: PromptFragment;
  inclusionReasons: Array<AssemblyReason>;
  renderedOrder: Scalars['Int']['output'];
  sources: Array<Scalars['String']['output']>;
};

export type AssembledSkill = {
  __typename?: 'AssembledSkill';
  inclusionReasons: Array<AssemblyReason>;
  rank?: Maybe<Scalars['Int']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  skill: Skill;
};

export type AssembledTask = {
  __typename?: 'AssembledTask';
  hash: Scalars['String']['output'];
  resolvedConcepts: Array<ResolvedConcept>;
  text: Scalars['String']['output'];
};

export type AssembledTool = {
  __typename?: 'AssembledTool';
  inclusionReasons: Array<AssemblyReason>;
  requiredBy: Array<EntityRef>;
  sources: Array<Scalars['String']['output']>;
  tool: Tool;
};

export type AssemblyCandidateDiagnostic = {
  __typename?: 'AssemblyCandidateDiagnostic';
  causes: Array<DiagnosticCause>;
  code?: Maybe<Scalars['String']['output']>;
  entity: EntityRef;
  message?: Maybe<Scalars['String']['output']>;
  rank?: Maybe<Scalars['Int']['output']>;
  score?: Maybe<Scalars['Float']['output']>;
  selected: Scalars['Boolean']['output'];
};

export type AssemblyReason = {
  __typename?: 'AssemblyReason';
  code: Scalars['String']['output'];
  details?: Maybe<Scalars['JSON']['output']>;
  message: Scalars['String']['output'];
};

export type Concept = {
  __typename?: 'Concept';
  aliases: Array<ConceptAlias>;
  description?: Maybe<Scalars['String']['output']>;
  domains: Array<Domain>;
  id: Scalars['ID']['output'];
  incomingRelations: ConceptRelationConnection;
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
  outgoingRelations: ConceptRelationConnection;
  source: SourceLocation;
  status: LifecycleStatus;
  type?: Maybe<Scalars['String']['output']>;
};


export type ConceptIncomingRelationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};


export type ConceptOutgoingRelationsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export type ConceptAlias = {
  __typename?: 'ConceptAlias';
  alias: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type ConceptConnection = {
  __typename?: 'ConceptConnection';
  nodes: Array<Concept>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export enum ConceptMatchType {
  ExactAlias = 'EXACT_ALIAS',
  ExactKey = 'EXACT_KEY',
  ExactName = 'EXACT_NAME',
  Lexical = 'LEXICAL',
  Semantic = 'SEMANTIC',
  Trigram = 'TRIGRAM'
}

export type ConceptRelation = {
  __typename?: 'ConceptRelation';
  id: Scalars['ID']['output'];
  source: SourceLocation;
  sourceConcept: Concept;
  targetConcept: Concept;
  type: RelationType;
};

export type ConceptRelationConnection = {
  __typename?: 'ConceptRelationConnection';
  nodes: Array<ConceptRelation>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type ConceptResolutionInput = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  namespace?: InputMaybe<Scalars['String']['input']>;
  text: Scalars['String']['input'];
};

export type ConceptResolutionResult = {
  __typename?: 'ConceptResolutionResult';
  matches: Array<ResolvedConcept>;
  warnings: Array<DiagnosticWarning>;
};

export type ConceptsInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  domain?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<LifecycleStatus>;
  type?: InputMaybe<Scalars['String']['input']>;
};

export enum DependencyResolutionStatus {
  BlockedByDependency = 'BLOCKED_BY_DEPENDENCY',
  Included = 'INCLUDED',
  OptionalOmitted = 'OPTIONAL_OMITTED',
  Unavailable = 'UNAVAILABLE'
}

export type DiagnosticCause = {
  __typename?: 'DiagnosticCause';
  code: Scalars['String']['output'];
  entityId?: Maybe<Scalars['ID']['output']>;
  entityType: Scalars['String']['output'];
  message: Scalars['String']['output'];
};

export type DiagnosticWarning = {
  __typename?: 'DiagnosticWarning';
  code: Scalars['String']['output'];
  details?: Maybe<Scalars['JSON']['output']>;
  message: Scalars['String']['output'];
};

export type DimensionDefinition = {
  __typename?: 'DimensionDefinition';
  allowedOperators: Array<Scalars['String']['output']>;
  cardinality: Scalars['String']['output'];
  category: Scalars['String']['output'];
  description?: Maybe<Scalars['String']['output']>;
  hierarchical: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  missingValueBehavior: Scalars['String']['output'];
  name: Scalars['String']['output'];
  required: Scalars['Boolean']['output'];
  source: SourceLocation;
  trust: Scalars['String']['output'];
  valueType: Scalars['String']['output'];
  values: DimensionValueConnection;
};


export type DimensionDefinitionValuesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type DimensionValue = {
  __typename?: 'DimensionValue';
  children: Array<DimensionValue>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name?: Maybe<Scalars['String']['output']>;
  parent?: Maybe<DimensionValue>;
};

export type DimensionValueConnection = {
  __typename?: 'DimensionValueConnection';
  nodes: Array<DimensionValue>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type Domain = {
  __typename?: 'Domain';
  concepts: ConceptConnection;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
  source: SourceLocation;
};


export type DomainConceptsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type DomainConnection = {
  __typename?: 'DomainConnection';
  nodes: Array<Domain>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type DomainsInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
};

export type EntityRef = {
  __typename?: 'EntityRef';
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  type: Scalars['String']['output'];
};

export type EntityRefInput = {
  id?: InputMaybe<Scalars['ID']['input']>;
  key?: InputMaybe<Scalars['String']['input']>;
};

export type KnowledgeChunk = {
  __typename?: 'KnowledgeChunk';
  authorityScore?: Maybe<Scalars['Float']['output']>;
  concepts: Array<Concept>;
  content: Scalars['String']['output'];
  effectiveFrom?: Maybe<Scalars['DateTime']['output']>;
  effectiveTo?: Maybe<Scalars['DateTime']['output']>;
  heading?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  knowledgeItem: KnowledgeItem;
  metadata: Scalars['JSON']['output'];
  ordinal: Scalars['Int']['output'];
  priority: Scalars['Int']['output'];
  selectionGroup?: Maybe<SelectionGroup>;
  source: SourceLocation;
  status: LifecycleStatus;
  tokenCount?: Maybe<Scalars['Int']['output']>;
};

export type KnowledgeChunkConnection = {
  __typename?: 'KnowledgeChunkConnection';
  nodes: Array<KnowledgeChunk>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type KnowledgeChunkRefInput = {
  id?: InputMaybe<Scalars['ID']['input']>;
  key?: InputMaybe<Scalars['String']['input']>;
  knowledgeItem?: InputMaybe<Scalars['String']['input']>;
};

export type KnowledgeItem = {
  __typename?: 'KnowledgeItem';
  authorityScore?: Maybe<Scalars['Float']['output']>;
  chunks: KnowledgeChunkConnection;
  effectiveFrom?: Maybe<Scalars['DateTime']['output']>;
  effectiveTo?: Maybe<Scalars['DateTime']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  source: SourceLocation;
  sourceReference?: Maybe<KnowledgeSource>;
  status: LifecycleStatus;
  summary?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
};


export type KnowledgeItemChunksArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
};

export type KnowledgeItemConnection = {
  __typename?: 'KnowledgeItemConnection';
  nodes: Array<KnowledgeItem>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type KnowledgeItemsInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  concept?: InputMaybe<Scalars['String']['input']>;
  domain?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<LifecycleStatus>;
};

export type KnowledgeSource = {
  __typename?: 'KnowledgeSource';
  checksum?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key?: Maybe<Scalars['String']['output']>;
  metadata: Scalars['JSON']['output'];
  title: Scalars['String']['output'];
  type?: Maybe<Scalars['String']['output']>;
  uri?: Maybe<Scalars['String']['output']>;
};

export enum LifecycleStatus {
  Deprecated = 'DEPRECATED',
  Draft = 'DRAFT',
  Published = 'PUBLISHED'
}

export type Namespace = {
  __typename?: 'Namespace';
  defaultRetrievalProfile?: Maybe<RetrievalProfile>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
};

export type NamespaceRef = {
  __typename?: 'NamespaceRef';
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
};

export type OntologyNeighborhood = {
  __typename?: 'OntologyNeighborhood';
  center: Concept;
  concepts: Array<Concept>;
  relations: Array<ConceptRelation>;
};

export type OntologyNeighborhoodInput = {
  concept: EntityRefInput;
  depth?: InputMaybe<Scalars['Int']['input']>;
  direction?: InputMaybe<RelationDirection>;
  domain?: InputMaybe<Scalars['String']['input']>;
  relationTypes?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type OntologyPath = {
  __typename?: 'OntologyPath';
  depth: Scalars['Int']['output'];
  seedConcept: Concept;
  steps: Array<OntologyPathStep>;
  targetConcept: Concept;
};

export type OntologyPathStep = {
  __typename?: 'OntologyPathStep';
  direction: RelationDirection;
  from: Concept;
  relation: RelationType;
  to: Concept;
};

export type PackedContext = {
  __typename?: 'PackedContext';
  chunks: Array<KnowledgeChunk>;
  estimatedTokens: Scalars['Int']['output'];
  maxChunks?: Maybe<Scalars['Int']['output']>;
  maxTokens?: Maybe<Scalars['Int']['output']>;
};

export type PackingDiagnostics = {
  __typename?: 'PackingDiagnostics';
  considered: Scalars['Int']['output'];
  packed: Scalars['Int']['output'];
  skippedForBudget: Scalars['Int']['output'];
  skippedForItemCap: Scalars['Int']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  endCursor?: Maybe<Scalars['String']['output']>;
  hasNextPage: Scalars['Boolean']['output'];
};

export type PromptFragment = {
  __typename?: 'PromptFragment';
  concepts: Array<Concept>;
  content: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  inclusionMode: PromptFragmentInclusionMode;
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
  order: Scalars['Int']['output'];
  priority: Scalars['Int']['output'];
  section: Scalars['String']['output'];
  selectionGroup?: Maybe<SelectionGroup>;
  source: SourceLocation;
  status: LifecycleStatus;
};

export type PromptFragmentConnection = {
  __typename?: 'PromptFragmentConnection';
  nodes: Array<PromptFragment>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export enum PromptFragmentInclusionMode {
  Always = 'ALWAYS',
  Applicable = 'APPLICABLE',
  TaskRelevant = 'TASK_RELEVANT'
}

export type PromptFragmentsInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  selectionGroup?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<LifecycleStatus>;
};

export type Query = {
  __typename?: 'Query';
  agentTemplate?: Maybe<AgentTemplate>;
  agentTemplates: Array<AgentTemplate>;
  assembleAgent: AgentAssemblyResult;
  concept?: Maybe<Concept>;
  concepts: ConceptConnection;
  dimension?: Maybe<DimensionDefinition>;
  dimensions: Array<DimensionDefinition>;
  domains: DomainConnection;
  knowledgeChunk?: Maybe<KnowledgeChunk>;
  knowledgeItem?: Maybe<KnowledgeItem>;
  knowledgeItems: KnowledgeItemConnection;
  namespace?: Maybe<Namespace>;
  ontologyNeighborhood: OntologyNeighborhood;
  promptFragment?: Maybe<PromptFragment>;
  promptFragments: PromptFragmentConnection;
  resolveConcepts: ConceptResolutionResult;
  retrievalProfiles: Array<RetrievalProfile>;
  retrieve: RetrievalResult;
  runtimeInfo: RuntimeInfo;
  selectionGroups: Array<SelectionGroup>;
  skill?: Maybe<Skill>;
  skills: SkillConnection;
  tool?: Maybe<Tool>;
  tools: ToolConnection;
};


export type QueryAgentTemplateArgs = {
  ref: EntityRefInput;
};


export type QueryAssembleAgentArgs = {
  input: AgentAssemblyInput;
};


export type QueryConceptArgs = {
  ref: EntityRefInput;
};


export type QueryConceptsArgs = {
  input?: InputMaybe<ConceptsInput>;
};


export type QueryDimensionArgs = {
  ref: EntityRefInput;
};


export type QueryDomainsArgs = {
  input?: InputMaybe<DomainsInput>;
};


export type QueryKnowledgeChunkArgs = {
  ref: KnowledgeChunkRefInput;
};


export type QueryKnowledgeItemArgs = {
  ref: EntityRefInput;
};


export type QueryKnowledgeItemsArgs = {
  input?: InputMaybe<KnowledgeItemsInput>;
};


export type QueryNamespaceArgs = {
  key?: InputMaybe<Scalars['String']['input']>;
};


export type QueryOntologyNeighborhoodArgs = {
  input: OntologyNeighborhoodInput;
};


export type QueryPromptFragmentArgs = {
  ref: EntityRefInput;
};


export type QueryPromptFragmentsArgs = {
  input?: InputMaybe<PromptFragmentsInput>;
};


export type QueryResolveConceptsArgs = {
  input: ConceptResolutionInput;
};


export type QueryRetrieveArgs = {
  input: RetrievalInput;
};


export type QuerySkillArgs = {
  ref: EntityRefInput;
};


export type QuerySkillsArgs = {
  input?: InputMaybe<SkillsInput>;
};


export type QueryToolArgs = {
  ref: EntityRefInput;
};


export type QueryToolsArgs = {
  input?: InputMaybe<ToolsInput>;
};

export enum RelationDirection {
  Both = 'BOTH',
  Incoming = 'INCOMING',
  Outgoing = 'OUTGOING'
}

export type RelationType = {
  __typename?: 'RelationType';
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  name: Scalars['String']['output'];
};

export type ResolvedConcept = {
  __typename?: 'ResolvedConcept';
  concept: Concept;
  matchType: ConceptMatchType;
  matchedText?: Maybe<Scalars['String']['output']>;
  rank: Scalars['Int']['output'];
  score?: Maybe<Scalars['Float']['output']>;
};

export type RetrievalCandidateCounts = {
  __typename?: 'RetrievalCandidateCounts';
  afterApplicability: Scalars['Int']['output'];
  afterAuthorization: Scalars['Int']['output'];
  afterLifecycle: Scalars['Int']['output'];
  afterSelectionGroups: Scalars['Int']['output'];
  conceptLinked: Scalars['Int']['output'];
  fullText: Scalars['Int']['output'];
  graphLinked: Scalars['Int']['output'];
  packed: Scalars['Int']['output'];
  trigram: Scalars['Int']['output'];
  unique: Scalars['Int']['output'];
  vector: Scalars['Int']['output'];
};

export type RetrievalDiagnostics = {
  __typename?: 'RetrievalDiagnostics';
  candidateCounts: RetrievalCandidateCounts;
  exclusions: Array<RetrievalExclusion>;
  graphPaths: Array<OntologyPath>;
  packing: PackingDiagnostics;
  rankings: Array<RetrievalRankingDiagnostic>;
  timings: Array<StageTiming>;
  warnings: Array<DiagnosticWarning>;
};

export type RetrievalExclusion = {
  __typename?: 'RetrievalExclusion';
  chunk?: Maybe<EntityRef>;
  code: Scalars['String']['output'];
  details?: Maybe<Scalars['JSON']['output']>;
  message: Scalars['String']['output'];
  redacted: Scalars['Boolean']['output'];
  stage: Scalars['String']['output'];
};

export type RetrievalFiltersInput = {
  conceptIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  domainIds?: InputMaybe<Array<Scalars['ID']['input']>>;
  includeDeprecated?: InputMaybe<Scalars['Boolean']['input']>;
  includeDraft?: InputMaybe<Scalars['Boolean']['input']>;
  knowledgeItemIds?: InputMaybe<Array<Scalars['ID']['input']>>;
};

export type RetrievalInput = {
  context?: InputMaybe<Scalars['JSON']['input']>;
  diagnostics?: InputMaybe<Scalars['Boolean']['input']>;
  filters?: InputMaybe<RetrievalFiltersInput>;
  limits?: InputMaybe<RetrievalLimitsInput>;
  namespace?: InputMaybe<Scalars['String']['input']>;
  profile?: InputMaybe<Scalars['String']['input']>;
  query: Scalars['String']['input'];
};

export type RetrievalLimitsInput = {
  maxChunks?: InputMaybe<Scalars['Int']['input']>;
  maxTokens?: InputMaybe<Scalars['Int']['input']>;
};

export type RetrievalProfile = {
  __typename?: 'RetrievalProfile';
  config: Scalars['JSON']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  name?: Maybe<Scalars['String']['output']>;
  source: SourceLocation;
};

export type RetrievalRankingDiagnostic = {
  __typename?: 'RetrievalRankingDiagnostic';
  authorityScore: Scalars['Float']['output'];
  chunkId: Scalars['ID']['output'];
  conceptRank?: Maybe<Scalars['Int']['output']>;
  finalRank: Scalars['Int']['output'];
  fullTextRank?: Maybe<Scalars['Int']['output']>;
  fullTextScore?: Maybe<Scalars['Float']['output']>;
  graphRank?: Maybe<Scalars['Int']['output']>;
  priority: Scalars['Int']['output'];
  rrfScore: Scalars['Float']['output'];
  trigramRank?: Maybe<Scalars['Int']['output']>;
  trigramScore?: Maybe<Scalars['Float']['output']>;
  vectorRank?: Maybe<Scalars['Int']['output']>;
  vectorScore?: Maybe<Scalars['Float']['output']>;
};

export type RetrievalReason = {
  __typename?: 'RetrievalReason';
  code: Scalars['String']['output'];
  details?: Maybe<Scalars['JSON']['output']>;
  message: Scalars['String']['output'];
};

export type RetrievalResult = {
  __typename?: 'RetrievalResult';
  diagnostics?: Maybe<RetrievalDiagnostics>;
  namespace: NamespaceRef;
  packedContext?: Maybe<PackedContext>;
  query: Scalars['String']['output'];
  resolvedConcepts: Array<ResolvedConcept>;
  results: Array<RetrievalResultItem>;
  runtimeRevision: Scalars['Long']['output'];
};

export type RetrievalResultItem = {
  __typename?: 'RetrievalResultItem';
  chunk: KnowledgeChunk;
  rank: Scalars['Int']['output'];
  reasons?: Maybe<Array<RetrievalReason>>;
  score: Scalars['Float']['output'];
};

export type RuntimeInfo = {
  __typename?: 'RuntimeInfo';
  compilerVersion?: Maybe<Scalars['String']['output']>;
  environment: Scalars['String']['output'];
  gitCommit?: Maybe<Scalars['String']['output']>;
  namespace: NamespaceRef;
  runtimeRevision: Scalars['Long']['output'];
  sourceHash: Scalars['String']['output'];
};

export type SelectionGroup = {
  __typename?: 'SelectionGroup';
  entityType: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  members: Array<SelectionGroupMember>;
  mode: SelectionGroupMode;
  name?: Maybe<Scalars['String']['output']>;
  source: SourceLocation;
};

export type SelectionGroupMember = KnowledgeChunk | PromptFragment | Skill | Tool;

export enum SelectionGroupMode {
  All = 'ALL',
  HighestPriority = 'HIGHEST_PRIORITY',
  MostSpecific = 'MOST_SPECIFIC'
}

export type Skill = {
  __typename?: 'Skill';
  concepts: Array<Concept>;
  description?: Maybe<Scalars['String']['output']>;
  id: Scalars['ID']['output'];
  key: Scalars['String']['output'];
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
  priority: Scalars['Int']['output'];
  promptFragments: Array<PromptFragment>;
  selectionGroup?: Maybe<SelectionGroup>;
  source: SourceLocation;
  status: LifecycleStatus;
  tools: Array<Tool>;
};

export type SkillConnection = {
  __typename?: 'SkillConnection';
  nodes: Array<Skill>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type SkillsInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  selectionGroup?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<LifecycleStatus>;
};

export type SourceLocation = {
  __typename?: 'SourceLocation';
  line?: Maybe<Scalars['Int']['output']>;
  path: Scalars['String']['output'];
  repositoryRef?: Maybe<Scalars['String']['output']>;
  repositoryUrl?: Maybe<Scalars['String']['output']>;
  viewUrl?: Maybe<Scalars['String']['output']>;
};

export type StageTiming = {
  __typename?: 'StageTiming';
  milliseconds: Scalars['Float']['output'];
  stage: Scalars['String']['output'];
};

export type Tool = {
  __typename?: 'Tool';
  concepts: Array<Concept>;
  dependencies: Array<ToolDependency>;
  dependents: Array<ToolDependency>;
  description: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  inputSchema?: Maybe<Scalars['JSON']['output']>;
  key: Scalars['String']['output'];
  latency?: Maybe<ToolLatency>;
  metadata: Scalars['JSON']['output'];
  name: Scalars['String']['output'];
  outputSchema?: Maybe<Scalars['JSON']['output']>;
  priority: Scalars['Int']['output'];
  risk?: Maybe<ToolRisk>;
  runtimeBinding: Scalars['String']['output'];
  selectionGroup?: Maybe<SelectionGroup>;
  source: SourceLocation;
  status: LifecycleStatus;
};

export type ToolConnection = {
  __typename?: 'ToolConnection';
  nodes: Array<Tool>;
  pageInfo: PageInfo;
  totalCount?: Maybe<Scalars['Int']['output']>;
};

export type ToolDependency = {
  __typename?: 'ToolDependency';
  requirement: ToolDependencyRequirement;
  sourceTool: Tool;
  targetTool: Tool;
};

export enum ToolDependencyRequirement {
  Optional = 'OPTIONAL',
  Required = 'REQUIRED'
}

export type ToolDependencyResolution = {
  __typename?: 'ToolDependencyResolution';
  reason?: Maybe<Scalars['String']['output']>;
  requirement: ToolDependencyRequirement;
  sourceTool: Tool;
  status: DependencyResolutionStatus;
  targetTool: Tool;
};

export enum ToolLatency {
  FastRemote = 'FAST_REMOTE',
  Local = 'LOCAL',
  SlowRemote = 'SLOW_REMOTE'
}

export enum ToolRisk {
  Destructive = 'DESTRUCTIVE',
  Privileged = 'PRIVILEGED',
  Read = 'READ',
  Write = 'WRITE'
}

export type ToolsInput = {
  after?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  search?: InputMaybe<Scalars['String']['input']>;
  selectionGroup?: InputMaybe<Scalars['String']['input']>;
  status?: InputMaybe<LifecycleStatus>;
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = Record<PropertyKey, never>, TParent = Record<PropertyKey, never>, TContext = Record<PropertyKey, never>, TArgs = Record<PropertyKey, never>> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping of union types */
export type ResolversUnionTypes<_RefType extends Record<string, unknown>> = {
  SelectionGroupMember:
    | ( Omit<KnowledgeChunk, 'selectionGroup'> & { selectionGroup?: Maybe<_RefType['SelectionGroup']> } )
    | ( Omit<PromptFragment, 'selectionGroup'> & { selectionGroup?: Maybe<_RefType['SelectionGroup']> } )
    | ( Omit<Skill, 'promptFragments' | 'selectionGroup' | 'tools'> & { promptFragments: Array<_RefType['PromptFragment']>, selectionGroup?: Maybe<_RefType['SelectionGroup']>, tools: Array<_RefType['Tool']> } )
    | ( Omit<Tool, 'dependencies' | 'dependents' | 'selectionGroup'> & { dependencies: Array<_RefType['ToolDependency']>, dependents: Array<_RefType['ToolDependency']>, selectionGroup?: Maybe<_RefType['SelectionGroup']> } )
  ;
};


/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AgentAssemblyBudgetInput: AgentAssemblyBudgetInput;
  AgentAssemblyBudgetUsage: ResolverTypeWrapper<AgentAssemblyBudgetUsage>;
  AgentAssemblyDiagnostics: ResolverTypeWrapper<Omit<AgentAssemblyDiagnostics, 'dependencyResolutions'> & { dependencyResolutions: Array<ResolversTypes['ToolDependencyResolution']> }>;
  AgentAssemblyInput: AgentAssemblyInput;
  AgentAssemblyResult: ResolverTypeWrapper<Omit<AgentAssemblyResult, 'bootstrapKnowledge' | 'diagnostics' | 'promptFragments' | 'skills' | 'template' | 'tools'> & { bootstrapKnowledge: Array<ResolversTypes['RetrievalResultItem']>, diagnostics?: Maybe<ResolversTypes['AgentAssemblyDiagnostics']>, promptFragments: Array<ResolversTypes['AssembledPromptFragment']>, skills: Array<ResolversTypes['AssembledSkill']>, template: ResolversTypes['AgentTemplate'], tools: Array<ResolversTypes['AssembledTool']> }>;
  AgentRuntimeInput: AgentRuntimeInput;
  AgentTemplate: ResolverTypeWrapper<Omit<AgentTemplate, 'budgets' | 'promptFragments'> & { budgets: ResolversTypes['AgentTemplateBudgets'], promptFragments: Array<ResolversTypes['PromptFragment']> }>;
  AgentTemplateBudgets: ResolverTypeWrapper<AgentTemplateBudgets>;
  AssembledPromptFragment: ResolverTypeWrapper<Omit<AssembledPromptFragment, 'fragment'> & { fragment: ResolversTypes['PromptFragment'] }>;
  AssembledSkill: ResolverTypeWrapper<Omit<AssembledSkill, 'skill'> & { skill: ResolversTypes['Skill'] }>;
  AssembledTask: ResolverTypeWrapper<AssembledTask>;
  AssembledTool: ResolverTypeWrapper<Omit<AssembledTool, 'tool'> & { tool: ResolversTypes['Tool'] }>;
  AssemblyCandidateDiagnostic: ResolverTypeWrapper<AssemblyCandidateDiagnostic>;
  AssemblyReason: ResolverTypeWrapper<AssemblyReason>;
  Boolean: ResolverTypeWrapper<Scalars['Boolean']['output']>;
  Concept: ResolverTypeWrapper<Concept>;
  ConceptAlias: ResolverTypeWrapper<ConceptAlias>;
  ConceptConnection: ResolverTypeWrapper<ConceptConnection>;
  ConceptMatchType: ConceptMatchType;
  ConceptRelation: ResolverTypeWrapper<ConceptRelation>;
  ConceptRelationConnection: ResolverTypeWrapper<ConceptRelationConnection>;
  ConceptResolutionInput: ConceptResolutionInput;
  ConceptResolutionResult: ResolverTypeWrapper<ConceptResolutionResult>;
  ConceptsInput: ConceptsInput;
  DateTime: ResolverTypeWrapper<Scalars['DateTime']['output']>;
  DependencyResolutionStatus: DependencyResolutionStatus;
  DiagnosticCause: ResolverTypeWrapper<DiagnosticCause>;
  DiagnosticWarning: ResolverTypeWrapper<DiagnosticWarning>;
  DimensionDefinition: ResolverTypeWrapper<DimensionDefinition>;
  DimensionValue: ResolverTypeWrapper<DimensionValue>;
  DimensionValueConnection: ResolverTypeWrapper<DimensionValueConnection>;
  Domain: ResolverTypeWrapper<Domain>;
  DomainConnection: ResolverTypeWrapper<DomainConnection>;
  DomainsInput: DomainsInput;
  EntityRef: ResolverTypeWrapper<EntityRef>;
  EntityRefInput: EntityRefInput;
  Float: ResolverTypeWrapper<Scalars['Float']['output']>;
  ID: ResolverTypeWrapper<Scalars['ID']['output']>;
  Int: ResolverTypeWrapper<Scalars['Int']['output']>;
  JSON: ResolverTypeWrapper<Scalars['JSON']['output']>;
  KnowledgeChunk: ResolverTypeWrapper<Omit<KnowledgeChunk, 'selectionGroup'> & { selectionGroup?: Maybe<ResolversTypes['SelectionGroup']> }>;
  KnowledgeChunkConnection: ResolverTypeWrapper<Omit<KnowledgeChunkConnection, 'nodes'> & { nodes: Array<ResolversTypes['KnowledgeChunk']> }>;
  KnowledgeChunkRefInput: KnowledgeChunkRefInput;
  KnowledgeItem: ResolverTypeWrapper<KnowledgeItem>;
  KnowledgeItemConnection: ResolverTypeWrapper<KnowledgeItemConnection>;
  KnowledgeItemsInput: KnowledgeItemsInput;
  KnowledgeSource: ResolverTypeWrapper<KnowledgeSource>;
  LifecycleStatus: LifecycleStatus;
  Long: ResolverTypeWrapper<Scalars['Long']['output']>;
  Namespace: ResolverTypeWrapper<Namespace>;
  NamespaceRef: ResolverTypeWrapper<NamespaceRef>;
  OntologyNeighborhood: ResolverTypeWrapper<OntologyNeighborhood>;
  OntologyNeighborhoodInput: OntologyNeighborhoodInput;
  OntologyPath: ResolverTypeWrapper<OntologyPath>;
  OntologyPathStep: ResolverTypeWrapper<OntologyPathStep>;
  PackedContext: ResolverTypeWrapper<Omit<PackedContext, 'chunks'> & { chunks: Array<ResolversTypes['KnowledgeChunk']> }>;
  PackingDiagnostics: ResolverTypeWrapper<PackingDiagnostics>;
  PageInfo: ResolverTypeWrapper<PageInfo>;
  PromptFragment: ResolverTypeWrapper<Omit<PromptFragment, 'selectionGroup'> & { selectionGroup?: Maybe<ResolversTypes['SelectionGroup']> }>;
  PromptFragmentConnection: ResolverTypeWrapper<Omit<PromptFragmentConnection, 'nodes'> & { nodes: Array<ResolversTypes['PromptFragment']> }>;
  PromptFragmentInclusionMode: PromptFragmentInclusionMode;
  PromptFragmentsInput: PromptFragmentsInput;
  Query: ResolverTypeWrapper<Record<PropertyKey, never>>;
  RelationDirection: RelationDirection;
  RelationType: ResolverTypeWrapper<RelationType>;
  ResolvedConcept: ResolverTypeWrapper<ResolvedConcept>;
  RetrievalCandidateCounts: ResolverTypeWrapper<RetrievalCandidateCounts>;
  RetrievalDiagnostics: ResolverTypeWrapper<RetrievalDiagnostics>;
  RetrievalExclusion: ResolverTypeWrapper<RetrievalExclusion>;
  RetrievalFiltersInput: RetrievalFiltersInput;
  RetrievalInput: RetrievalInput;
  RetrievalLimitsInput: RetrievalLimitsInput;
  RetrievalProfile: ResolverTypeWrapper<RetrievalProfile>;
  RetrievalRankingDiagnostic: ResolverTypeWrapper<RetrievalRankingDiagnostic>;
  RetrievalReason: ResolverTypeWrapper<RetrievalReason>;
  RetrievalResult: ResolverTypeWrapper<Omit<RetrievalResult, 'packedContext' | 'results'> & { packedContext?: Maybe<ResolversTypes['PackedContext']>, results: Array<ResolversTypes['RetrievalResultItem']> }>;
  RetrievalResultItem: ResolverTypeWrapper<Omit<RetrievalResultItem, 'chunk'> & { chunk: ResolversTypes['KnowledgeChunk'] }>;
  RuntimeInfo: ResolverTypeWrapper<RuntimeInfo>;
  SelectionGroup: ResolverTypeWrapper<Omit<SelectionGroup, 'members'> & { members: Array<ResolversTypes['SelectionGroupMember']> }>;
  SelectionGroupMember: ResolverTypeWrapper<ResolversUnionTypes<ResolversTypes>['SelectionGroupMember']>;
  SelectionGroupMode: SelectionGroupMode;
  Skill: ResolverTypeWrapper<Omit<Skill, 'promptFragments' | 'selectionGroup' | 'tools'> & { promptFragments: Array<ResolversTypes['PromptFragment']>, selectionGroup?: Maybe<ResolversTypes['SelectionGroup']>, tools: Array<ResolversTypes['Tool']> }>;
  SkillConnection: ResolverTypeWrapper<Omit<SkillConnection, 'nodes'> & { nodes: Array<ResolversTypes['Skill']> }>;
  SkillsInput: SkillsInput;
  SourceLocation: ResolverTypeWrapper<SourceLocation>;
  StageTiming: ResolverTypeWrapper<StageTiming>;
  String: ResolverTypeWrapper<Scalars['String']['output']>;
  Tool: ResolverTypeWrapper<Omit<Tool, 'dependencies' | 'dependents' | 'selectionGroup'> & { dependencies: Array<ResolversTypes['ToolDependency']>, dependents: Array<ResolversTypes['ToolDependency']>, selectionGroup?: Maybe<ResolversTypes['SelectionGroup']> }>;
  ToolConnection: ResolverTypeWrapper<Omit<ToolConnection, 'nodes'> & { nodes: Array<ResolversTypes['Tool']> }>;
  ToolDependency: ResolverTypeWrapper<Omit<ToolDependency, 'sourceTool' | 'targetTool'> & { sourceTool: ResolversTypes['Tool'], targetTool: ResolversTypes['Tool'] }>;
  ToolDependencyRequirement: ToolDependencyRequirement;
  ToolDependencyResolution: ResolverTypeWrapper<Omit<ToolDependencyResolution, 'sourceTool' | 'targetTool'> & { sourceTool: ResolversTypes['Tool'], targetTool: ResolversTypes['Tool'] }>;
  ToolLatency: ToolLatency;
  ToolRisk: ToolRisk;
  ToolsInput: ToolsInput;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AgentAssemblyBudgetInput: AgentAssemblyBudgetInput;
  AgentAssemblyBudgetUsage: AgentAssemblyBudgetUsage;
  AgentAssemblyDiagnostics: Omit<AgentAssemblyDiagnostics, 'dependencyResolutions'> & { dependencyResolutions: Array<ResolversParentTypes['ToolDependencyResolution']> };
  AgentAssemblyInput: AgentAssemblyInput;
  AgentAssemblyResult: Omit<AgentAssemblyResult, 'bootstrapKnowledge' | 'diagnostics' | 'promptFragments' | 'skills' | 'template' | 'tools'> & { bootstrapKnowledge: Array<ResolversParentTypes['RetrievalResultItem']>, diagnostics?: Maybe<ResolversParentTypes['AgentAssemblyDiagnostics']>, promptFragments: Array<ResolversParentTypes['AssembledPromptFragment']>, skills: Array<ResolversParentTypes['AssembledSkill']>, template: ResolversParentTypes['AgentTemplate'], tools: Array<ResolversParentTypes['AssembledTool']> };
  AgentRuntimeInput: AgentRuntimeInput;
  AgentTemplate: Omit<AgentTemplate, 'budgets' | 'promptFragments'> & { budgets: ResolversParentTypes['AgentTemplateBudgets'], promptFragments: Array<ResolversParentTypes['PromptFragment']> };
  AgentTemplateBudgets: AgentTemplateBudgets;
  AssembledPromptFragment: Omit<AssembledPromptFragment, 'fragment'> & { fragment: ResolversParentTypes['PromptFragment'] };
  AssembledSkill: Omit<AssembledSkill, 'skill'> & { skill: ResolversParentTypes['Skill'] };
  AssembledTask: AssembledTask;
  AssembledTool: Omit<AssembledTool, 'tool'> & { tool: ResolversParentTypes['Tool'] };
  AssemblyCandidateDiagnostic: AssemblyCandidateDiagnostic;
  AssemblyReason: AssemblyReason;
  Boolean: Scalars['Boolean']['output'];
  Concept: Concept;
  ConceptAlias: ConceptAlias;
  ConceptConnection: ConceptConnection;
  ConceptRelation: ConceptRelation;
  ConceptRelationConnection: ConceptRelationConnection;
  ConceptResolutionInput: ConceptResolutionInput;
  ConceptResolutionResult: ConceptResolutionResult;
  ConceptsInput: ConceptsInput;
  DateTime: Scalars['DateTime']['output'];
  DiagnosticCause: DiagnosticCause;
  DiagnosticWarning: DiagnosticWarning;
  DimensionDefinition: DimensionDefinition;
  DimensionValue: DimensionValue;
  DimensionValueConnection: DimensionValueConnection;
  Domain: Domain;
  DomainConnection: DomainConnection;
  DomainsInput: DomainsInput;
  EntityRef: EntityRef;
  EntityRefInput: EntityRefInput;
  Float: Scalars['Float']['output'];
  ID: Scalars['ID']['output'];
  Int: Scalars['Int']['output'];
  JSON: Scalars['JSON']['output'];
  KnowledgeChunk: Omit<KnowledgeChunk, 'selectionGroup'> & { selectionGroup?: Maybe<ResolversParentTypes['SelectionGroup']> };
  KnowledgeChunkConnection: Omit<KnowledgeChunkConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['KnowledgeChunk']> };
  KnowledgeChunkRefInput: KnowledgeChunkRefInput;
  KnowledgeItem: KnowledgeItem;
  KnowledgeItemConnection: KnowledgeItemConnection;
  KnowledgeItemsInput: KnowledgeItemsInput;
  KnowledgeSource: KnowledgeSource;
  Long: Scalars['Long']['output'];
  Namespace: Namespace;
  NamespaceRef: NamespaceRef;
  OntologyNeighborhood: OntologyNeighborhood;
  OntologyNeighborhoodInput: OntologyNeighborhoodInput;
  OntologyPath: OntologyPath;
  OntologyPathStep: OntologyPathStep;
  PackedContext: Omit<PackedContext, 'chunks'> & { chunks: Array<ResolversParentTypes['KnowledgeChunk']> };
  PackingDiagnostics: PackingDiagnostics;
  PageInfo: PageInfo;
  PromptFragment: Omit<PromptFragment, 'selectionGroup'> & { selectionGroup?: Maybe<ResolversParentTypes['SelectionGroup']> };
  PromptFragmentConnection: Omit<PromptFragmentConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['PromptFragment']> };
  PromptFragmentsInput: PromptFragmentsInput;
  Query: Record<PropertyKey, never>;
  RelationType: RelationType;
  ResolvedConcept: ResolvedConcept;
  RetrievalCandidateCounts: RetrievalCandidateCounts;
  RetrievalDiagnostics: RetrievalDiagnostics;
  RetrievalExclusion: RetrievalExclusion;
  RetrievalFiltersInput: RetrievalFiltersInput;
  RetrievalInput: RetrievalInput;
  RetrievalLimitsInput: RetrievalLimitsInput;
  RetrievalProfile: RetrievalProfile;
  RetrievalRankingDiagnostic: RetrievalRankingDiagnostic;
  RetrievalReason: RetrievalReason;
  RetrievalResult: Omit<RetrievalResult, 'packedContext' | 'results'> & { packedContext?: Maybe<ResolversParentTypes['PackedContext']>, results: Array<ResolversParentTypes['RetrievalResultItem']> };
  RetrievalResultItem: Omit<RetrievalResultItem, 'chunk'> & { chunk: ResolversParentTypes['KnowledgeChunk'] };
  RuntimeInfo: RuntimeInfo;
  SelectionGroup: Omit<SelectionGroup, 'members'> & { members: Array<ResolversParentTypes['SelectionGroupMember']> };
  SelectionGroupMember: ResolversUnionTypes<ResolversParentTypes>['SelectionGroupMember'];
  Skill: Omit<Skill, 'promptFragments' | 'selectionGroup' | 'tools'> & { promptFragments: Array<ResolversParentTypes['PromptFragment']>, selectionGroup?: Maybe<ResolversParentTypes['SelectionGroup']>, tools: Array<ResolversParentTypes['Tool']> };
  SkillConnection: Omit<SkillConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['Skill']> };
  SkillsInput: SkillsInput;
  SourceLocation: SourceLocation;
  StageTiming: StageTiming;
  String: Scalars['String']['output'];
  Tool: Omit<Tool, 'dependencies' | 'dependents' | 'selectionGroup'> & { dependencies: Array<ResolversParentTypes['ToolDependency']>, dependents: Array<ResolversParentTypes['ToolDependency']>, selectionGroup?: Maybe<ResolversParentTypes['SelectionGroup']> };
  ToolConnection: Omit<ToolConnection, 'nodes'> & { nodes: Array<ResolversParentTypes['Tool']> };
  ToolDependency: Omit<ToolDependency, 'sourceTool' | 'targetTool'> & { sourceTool: ResolversParentTypes['Tool'], targetTool: ResolversParentTypes['Tool'] };
  ToolDependencyResolution: Omit<ToolDependencyResolution, 'sourceTool' | 'targetTool'> & { sourceTool: ResolversParentTypes['Tool'], targetTool: ResolversParentTypes['Tool'] };
  ToolsInput: ToolsInput;
};

export type AgentAssemblyBudgetUsageResolvers<ContextType = any, ParentType extends ResolversParentTypes['AgentAssemblyBudgetUsage'] = ResolversParentTypes['AgentAssemblyBudgetUsage']> = {
  bootstrapKnowledgeTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  maxBootstrapKnowledgeTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxPromptTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxSkills?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxTools?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  promptTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  skills?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  tools?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type AgentAssemblyDiagnosticsResolvers<ContextType = any, ParentType extends ResolversParentTypes['AgentAssemblyDiagnostics'] = ResolversParentTypes['AgentAssemblyDiagnostics']> = {
  bootstrapRetrieval?: Resolver<Maybe<ResolversTypes['RetrievalDiagnostics']>, ParentType, ContextType>;
  dependencyResolutions?: Resolver<Array<ResolversTypes['ToolDependencyResolution']>, ParentType, ContextType>;
  fragmentCandidates?: Resolver<Array<ResolversTypes['AssemblyCandidateDiagnostic']>, ParentType, ContextType>;
  skillCandidates?: Resolver<Array<ResolversTypes['AssemblyCandidateDiagnostic']>, ParentType, ContextType>;
  timings?: Resolver<Array<ResolversTypes['StageTiming']>, ParentType, ContextType>;
  toolCandidates?: Resolver<Array<ResolversTypes['AssemblyCandidateDiagnostic']>, ParentType, ContextType>;
  warnings?: Resolver<Array<ResolversTypes['DiagnosticWarning']>, ParentType, ContextType>;
};

export type AgentAssemblyResultResolvers<ContextType = any, ParentType extends ResolversParentTypes['AgentAssemblyResult'] = ResolversParentTypes['AgentAssemblyResult']> = {
  bootstrapKnowledge?: Resolver<Array<ResolversTypes['RetrievalResultItem']>, ParentType, ContextType>;
  budgetUsage?: Resolver<ResolversTypes['AgentAssemblyBudgetUsage'], ParentType, ContextType>;
  contextHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  diagnostics?: Resolver<Maybe<ResolversTypes['AgentAssemblyDiagnostics']>, ParentType, ContextType>;
  namespace?: Resolver<ResolversTypes['NamespaceRef'], ParentType, ContextType>;
  promptFragments?: Resolver<Array<ResolversTypes['AssembledPromptFragment']>, ParentType, ContextType>;
  renderedPrompt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  runtimeRevision?: Resolver<ResolversTypes['Long'], ParentType, ContextType>;
  skills?: Resolver<Array<ResolversTypes['AssembledSkill']>, ParentType, ContextType>;
  task?: Resolver<Maybe<ResolversTypes['AssembledTask']>, ParentType, ContextType>;
  template?: Resolver<ResolversTypes['AgentTemplate'], ParentType, ContextType>;
  tools?: Resolver<Array<ResolversTypes['AssembledTool']>, ParentType, ContextType>;
};

export type AgentTemplateResolvers<ContextType = any, ParentType extends ResolversParentTypes['AgentTemplate'] = ResolversParentTypes['AgentTemplate']> = {
  budgets?: Resolver<ResolversTypes['AgentTemplateBudgets'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  promptFragments?: Resolver<Array<ResolversTypes['PromptFragment']>, ParentType, ContextType>;
  retrievalProfile?: Resolver<Maybe<ResolversTypes['RetrievalProfile']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
};

export type AgentTemplateBudgetsResolvers<ContextType = any, ParentType extends ResolversParentTypes['AgentTemplateBudgets'] = ResolversParentTypes['AgentTemplateBudgets']> = {
  bootstrapKnowledgeTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxSkills?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxTools?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  promptTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type AssembledPromptFragmentResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssembledPromptFragment'] = ResolversParentTypes['AssembledPromptFragment']> = {
  estimatedTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  fragment?: Resolver<ResolversTypes['PromptFragment'], ParentType, ContextType>;
  inclusionReasons?: Resolver<Array<ResolversTypes['AssemblyReason']>, ParentType, ContextType>;
  renderedOrder?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  sources?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
};

export type AssembledSkillResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssembledSkill'] = ResolversParentTypes['AssembledSkill']> = {
  inclusionReasons?: Resolver<Array<ResolversTypes['AssemblyReason']>, ParentType, ContextType>;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  skill?: Resolver<ResolversTypes['Skill'], ParentType, ContextType>;
};

export type AssembledTaskResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssembledTask'] = ResolversParentTypes['AssembledTask']> = {
  hash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  resolvedConcepts?: Resolver<Array<ResolversTypes['ResolvedConcept']>, ParentType, ContextType>;
  text?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type AssembledToolResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssembledTool'] = ResolversParentTypes['AssembledTool']> = {
  inclusionReasons?: Resolver<Array<ResolversTypes['AssemblyReason']>, ParentType, ContextType>;
  requiredBy?: Resolver<Array<ResolversTypes['EntityRef']>, ParentType, ContextType>;
  sources?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  tool?: Resolver<ResolversTypes['Tool'], ParentType, ContextType>;
};

export type AssemblyCandidateDiagnosticResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssemblyCandidateDiagnostic'] = ResolversParentTypes['AssemblyCandidateDiagnostic']> = {
  causes?: Resolver<Array<ResolversTypes['DiagnosticCause']>, ParentType, ContextType>;
  code?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  entity?: Resolver<ResolversTypes['EntityRef'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  selected?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type AssemblyReasonResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssemblyReason'] = ResolversParentTypes['AssemblyReason']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  details?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ConceptResolvers<ContextType = any, ParentType extends ResolversParentTypes['Concept'] = ResolversParentTypes['Concept']> = {
  aliases?: Resolver<Array<ResolversTypes['ConceptAlias']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  domains?: Resolver<Array<ResolversTypes['Domain']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingRelations?: Resolver<ResolversTypes['ConceptRelationConnection'], ParentType, ContextType, RequireFields<ConceptIncomingRelationsArgs, 'first'>>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outgoingRelations?: Resolver<ResolversTypes['ConceptRelationConnection'], ParentType, ContextType, RequireFields<ConceptOutgoingRelationsArgs, 'first'>>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type ConceptAliasResolvers<ContextType = any, ParentType extends ResolversParentTypes['ConceptAlias'] = ResolversParentTypes['ConceptAlias']> = {
  alias?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type ConceptConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ConceptConnection'] = ResolversParentTypes['ConceptConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['Concept']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type ConceptRelationResolvers<ContextType = any, ParentType extends ResolversParentTypes['ConceptRelation'] = ResolversParentTypes['ConceptRelation']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  sourceConcept?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
  targetConcept?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['RelationType'], ParentType, ContextType>;
};

export type ConceptRelationConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ConceptRelationConnection'] = ResolversParentTypes['ConceptRelationConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['ConceptRelation']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type ConceptResolutionResultResolvers<ContextType = any, ParentType extends ResolversParentTypes['ConceptResolutionResult'] = ResolversParentTypes['ConceptResolutionResult']> = {
  matches?: Resolver<Array<ResolversTypes['ResolvedConcept']>, ParentType, ContextType>;
  warnings?: Resolver<Array<ResolversTypes['DiagnosticWarning']>, ParentType, ContextType>;
};

export interface DateTimeScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['DateTime'], any> {
  name: 'DateTime';
}

export type DiagnosticCauseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DiagnosticCause'] = ResolversParentTypes['DiagnosticCause']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  entityId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  entityType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type DiagnosticWarningResolvers<ContextType = any, ParentType extends ResolversParentTypes['DiagnosticWarning'] = ResolversParentTypes['DiagnosticWarning']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  details?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type DimensionDefinitionResolvers<ContextType = any, ParentType extends ResolversParentTypes['DimensionDefinition'] = ResolversParentTypes['DimensionDefinition']> = {
  allowedOperators?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  cardinality?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  category?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hierarchical?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  missingValueBehavior?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  required?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  trust?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  valueType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  values?: Resolver<ResolversTypes['DimensionValueConnection'], ParentType, ContextType, RequireFields<DimensionDefinitionValuesArgs, 'first'>>;
};

export type DimensionValueResolvers<ContextType = any, ParentType extends ResolversParentTypes['DimensionValue'] = ResolversParentTypes['DimensionValue']> = {
  children?: Resolver<Array<ResolversTypes['DimensionValue']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  parent?: Resolver<Maybe<ResolversTypes['DimensionValue']>, ParentType, ContextType>;
};

export type DimensionValueConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['DimensionValueConnection'] = ResolversParentTypes['DimensionValueConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['DimensionValue']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type DomainResolvers<ContextType = any, ParentType extends ResolversParentTypes['Domain'] = ResolversParentTypes['Domain']> = {
  concepts?: Resolver<ResolversTypes['ConceptConnection'], ParentType, ContextType, RequireFields<DomainConceptsArgs, 'first'>>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
};

export type DomainConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['DomainConnection'] = ResolversParentTypes['DomainConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['Domain']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type EntityRefResolvers<ContextType = any, ParentType extends ResolversParentTypes['EntityRef'] = ResolversParentTypes['EntityRef']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export interface JsonScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSON'], any> {
  name: 'JSON';
}

export type KnowledgeChunkResolvers<ContextType = any, ParentType extends ResolversParentTypes['KnowledgeChunk'] = ResolversParentTypes['KnowledgeChunk']> = {
  authorityScore?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  concepts?: Resolver<Array<ResolversTypes['Concept']>, ParentType, ContextType>;
  content?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  effectiveFrom?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  effectiveTo?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  heading?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  knowledgeItem?: Resolver<ResolversTypes['KnowledgeItem'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  ordinal?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  selectionGroup?: Resolver<Maybe<ResolversTypes['SelectionGroup']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
  tokenCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type KnowledgeChunkConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['KnowledgeChunkConnection'] = ResolversParentTypes['KnowledgeChunkConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['KnowledgeChunk']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type KnowledgeItemResolvers<ContextType = any, ParentType extends ResolversParentTypes['KnowledgeItem'] = ResolversParentTypes['KnowledgeItem']> = {
  authorityScore?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  chunks?: Resolver<ResolversTypes['KnowledgeChunkConnection'], ParentType, ContextType, RequireFields<KnowledgeItemChunksArgs, 'first'>>;
  effectiveFrom?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  effectiveTo?: Resolver<Maybe<ResolversTypes['DateTime']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  sourceReference?: Resolver<Maybe<ResolversTypes['KnowledgeSource']>, ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
  summary?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type KnowledgeItemConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['KnowledgeItemConnection'] = ResolversParentTypes['KnowledgeItemConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['KnowledgeItem']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type KnowledgeSourceResolvers<ContextType = any, ParentType extends ResolversParentTypes['KnowledgeSource'] = ResolversParentTypes['KnowledgeSource']> = {
  checksum?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  title?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  uri?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export interface LongScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['Long'], any> {
  name: 'Long';
}

export type NamespaceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Namespace'] = ResolversParentTypes['Namespace']> = {
  defaultRetrievalProfile?: Resolver<Maybe<ResolversTypes['RetrievalProfile']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type NamespaceRefResolvers<ContextType = any, ParentType extends ResolversParentTypes['NamespaceRef'] = ResolversParentTypes['NamespaceRef']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type OntologyNeighborhoodResolvers<ContextType = any, ParentType extends ResolversParentTypes['OntologyNeighborhood'] = ResolversParentTypes['OntologyNeighborhood']> = {
  center?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
  concepts?: Resolver<Array<ResolversTypes['Concept']>, ParentType, ContextType>;
  relations?: Resolver<Array<ResolversTypes['ConceptRelation']>, ParentType, ContextType>;
};

export type OntologyPathResolvers<ContextType = any, ParentType extends ResolversParentTypes['OntologyPath'] = ResolversParentTypes['OntologyPath']> = {
  depth?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  seedConcept?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
  steps?: Resolver<Array<ResolversTypes['OntologyPathStep']>, ParentType, ContextType>;
  targetConcept?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
};

export type OntologyPathStepResolvers<ContextType = any, ParentType extends ResolversParentTypes['OntologyPathStep'] = ResolversParentTypes['OntologyPathStep']> = {
  direction?: Resolver<ResolversTypes['RelationDirection'], ParentType, ContextType>;
  from?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
  relation?: Resolver<ResolversTypes['RelationType'], ParentType, ContextType>;
  to?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
};

export type PackedContextResolvers<ContextType = any, ParentType extends ResolversParentTypes['PackedContext'] = ResolversParentTypes['PackedContext']> = {
  chunks?: Resolver<Array<ResolversTypes['KnowledgeChunk']>, ParentType, ContextType>;
  estimatedTokens?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  maxChunks?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  maxTokens?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type PackingDiagnosticsResolvers<ContextType = any, ParentType extends ResolversParentTypes['PackingDiagnostics'] = ResolversParentTypes['PackingDiagnostics']> = {
  considered?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  packed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  skippedForBudget?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  skippedForItemCap?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type PromptFragmentResolvers<ContextType = any, ParentType extends ResolversParentTypes['PromptFragment'] = ResolversParentTypes['PromptFragment']> = {
  concepts?: Resolver<Array<ResolversTypes['Concept']>, ParentType, ContextType>;
  content?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inclusionMode?: Resolver<ResolversTypes['PromptFragmentInclusionMode'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  order?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  section?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  selectionGroup?: Resolver<Maybe<ResolversTypes['SelectionGroup']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PromptFragmentConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['PromptFragmentConnection'] = ResolversParentTypes['PromptFragmentConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['PromptFragment']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  agentTemplate?: Resolver<Maybe<ResolversTypes['AgentTemplate']>, ParentType, ContextType, RequireFields<QueryAgentTemplateArgs, 'ref'>>;
  agentTemplates?: Resolver<Array<ResolversTypes['AgentTemplate']>, ParentType, ContextType>;
  assembleAgent?: Resolver<ResolversTypes['AgentAssemblyResult'], ParentType, ContextType, RequireFields<QueryAssembleAgentArgs, 'input'>>;
  concept?: Resolver<Maybe<ResolversTypes['Concept']>, ParentType, ContextType, RequireFields<QueryConceptArgs, 'ref'>>;
  concepts?: Resolver<ResolversTypes['ConceptConnection'], ParentType, ContextType, Partial<QueryConceptsArgs>>;
  dimension?: Resolver<Maybe<ResolversTypes['DimensionDefinition']>, ParentType, ContextType, RequireFields<QueryDimensionArgs, 'ref'>>;
  dimensions?: Resolver<Array<ResolversTypes['DimensionDefinition']>, ParentType, ContextType>;
  domains?: Resolver<ResolversTypes['DomainConnection'], ParentType, ContextType, Partial<QueryDomainsArgs>>;
  knowledgeChunk?: Resolver<Maybe<ResolversTypes['KnowledgeChunk']>, ParentType, ContextType, RequireFields<QueryKnowledgeChunkArgs, 'ref'>>;
  knowledgeItem?: Resolver<Maybe<ResolversTypes['KnowledgeItem']>, ParentType, ContextType, RequireFields<QueryKnowledgeItemArgs, 'ref'>>;
  knowledgeItems?: Resolver<ResolversTypes['KnowledgeItemConnection'], ParentType, ContextType, Partial<QueryKnowledgeItemsArgs>>;
  namespace?: Resolver<Maybe<ResolversTypes['Namespace']>, ParentType, ContextType, Partial<QueryNamespaceArgs>>;
  ontologyNeighborhood?: Resolver<ResolversTypes['OntologyNeighborhood'], ParentType, ContextType, RequireFields<QueryOntologyNeighborhoodArgs, 'input'>>;
  promptFragment?: Resolver<Maybe<ResolversTypes['PromptFragment']>, ParentType, ContextType, RequireFields<QueryPromptFragmentArgs, 'ref'>>;
  promptFragments?: Resolver<ResolversTypes['PromptFragmentConnection'], ParentType, ContextType, Partial<QueryPromptFragmentsArgs>>;
  resolveConcepts?: Resolver<ResolversTypes['ConceptResolutionResult'], ParentType, ContextType, RequireFields<QueryResolveConceptsArgs, 'input'>>;
  retrievalProfiles?: Resolver<Array<ResolversTypes['RetrievalProfile']>, ParentType, ContextType>;
  retrieve?: Resolver<ResolversTypes['RetrievalResult'], ParentType, ContextType, RequireFields<QueryRetrieveArgs, 'input'>>;
  runtimeInfo?: Resolver<ResolversTypes['RuntimeInfo'], ParentType, ContextType>;
  selectionGroups?: Resolver<Array<ResolversTypes['SelectionGroup']>, ParentType, ContextType>;
  skill?: Resolver<Maybe<ResolversTypes['Skill']>, ParentType, ContextType, RequireFields<QuerySkillArgs, 'ref'>>;
  skills?: Resolver<ResolversTypes['SkillConnection'], ParentType, ContextType, Partial<QuerySkillsArgs>>;
  tool?: Resolver<Maybe<ResolversTypes['Tool']>, ParentType, ContextType, RequireFields<QueryToolArgs, 'ref'>>;
  tools?: Resolver<ResolversTypes['ToolConnection'], ParentType, ContextType, Partial<QueryToolsArgs>>;
};

export type RelationTypeResolvers<ContextType = any, ParentType extends ResolversParentTypes['RelationType'] = ResolversParentTypes['RelationType']> = {
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ResolvedConceptResolvers<ContextType = any, ParentType extends ResolversParentTypes['ResolvedConcept'] = ResolversParentTypes['ResolvedConcept']> = {
  concept?: Resolver<ResolversTypes['Concept'], ParentType, ContextType>;
  matchType?: Resolver<ResolversTypes['ConceptMatchType'], ParentType, ContextType>;
  matchedText?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  rank?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  score?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
};

export type RetrievalCandidateCountsResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalCandidateCounts'] = ResolversParentTypes['RetrievalCandidateCounts']> = {
  afterApplicability?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  afterAuthorization?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  afterLifecycle?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  afterSelectionGroups?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  conceptLinked?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  fullText?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  graphLinked?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  packed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  trigram?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  unique?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  vector?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
};

export type RetrievalDiagnosticsResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalDiagnostics'] = ResolversParentTypes['RetrievalDiagnostics']> = {
  candidateCounts?: Resolver<ResolversTypes['RetrievalCandidateCounts'], ParentType, ContextType>;
  exclusions?: Resolver<Array<ResolversTypes['RetrievalExclusion']>, ParentType, ContextType>;
  graphPaths?: Resolver<Array<ResolversTypes['OntologyPath']>, ParentType, ContextType>;
  packing?: Resolver<ResolversTypes['PackingDiagnostics'], ParentType, ContextType>;
  rankings?: Resolver<Array<ResolversTypes['RetrievalRankingDiagnostic']>, ParentType, ContextType>;
  timings?: Resolver<Array<ResolversTypes['StageTiming']>, ParentType, ContextType>;
  warnings?: Resolver<Array<ResolversTypes['DiagnosticWarning']>, ParentType, ContextType>;
};

export type RetrievalExclusionResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalExclusion'] = ResolversParentTypes['RetrievalExclusion']> = {
  chunk?: Resolver<Maybe<ResolversTypes['EntityRef']>, ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  details?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  redacted?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  stage?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type RetrievalProfileResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalProfile'] = ResolversParentTypes['RetrievalProfile']> = {
  config?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
};

export type RetrievalRankingDiagnosticResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalRankingDiagnostic'] = ResolversParentTypes['RetrievalRankingDiagnostic']> = {
  authorityScore?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  chunkId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  conceptRank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  finalRank?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  fullTextRank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  fullTextScore?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  graphRank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  rrfScore?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  trigramRank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  trigramScore?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  vectorRank?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  vectorScore?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
};

export type RetrievalReasonResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalReason'] = ResolversParentTypes['RetrievalReason']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  details?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type RetrievalResultResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalResult'] = ResolversParentTypes['RetrievalResult']> = {
  diagnostics?: Resolver<Maybe<ResolversTypes['RetrievalDiagnostics']>, ParentType, ContextType>;
  namespace?: Resolver<ResolversTypes['NamespaceRef'], ParentType, ContextType>;
  packedContext?: Resolver<Maybe<ResolversTypes['PackedContext']>, ParentType, ContextType>;
  query?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  resolvedConcepts?: Resolver<Array<ResolversTypes['ResolvedConcept']>, ParentType, ContextType>;
  results?: Resolver<Array<ResolversTypes['RetrievalResultItem']>, ParentType, ContextType>;
  runtimeRevision?: Resolver<ResolversTypes['Long'], ParentType, ContextType>;
};

export type RetrievalResultItemResolvers<ContextType = any, ParentType extends ResolversParentTypes['RetrievalResultItem'] = ResolversParentTypes['RetrievalResultItem']> = {
  chunk?: Resolver<ResolversTypes['KnowledgeChunk'], ParentType, ContextType>;
  rank?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  reasons?: Resolver<Maybe<Array<ResolversTypes['RetrievalReason']>>, ParentType, ContextType>;
  score?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
};

export type RuntimeInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['RuntimeInfo'] = ResolversParentTypes['RuntimeInfo']> = {
  compilerVersion?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  environment?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  gitCommit?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  namespace?: Resolver<ResolversTypes['NamespaceRef'], ParentType, ContextType>;
  runtimeRevision?: Resolver<ResolversTypes['Long'], ParentType, ContextType>;
  sourceHash?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type SelectionGroupResolvers<ContextType = any, ParentType extends ResolversParentTypes['SelectionGroup'] = ResolversParentTypes['SelectionGroup']> = {
  entityType?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  members?: Resolver<Array<ResolversTypes['SelectionGroupMember']>, ParentType, ContextType>;
  mode?: Resolver<ResolversTypes['SelectionGroupMode'], ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
};

export type SelectionGroupMemberResolvers<ContextType = any, ParentType extends ResolversParentTypes['SelectionGroupMember'] = ResolversParentTypes['SelectionGroupMember']> = {
  __resolveType: TypeResolveFn<'KnowledgeChunk' | 'PromptFragment' | 'Skill' | 'Tool', ParentType, ContextType>;
};

export type SkillResolvers<ContextType = any, ParentType extends ResolversParentTypes['Skill'] = ResolversParentTypes['Skill']> = {
  concepts?: Resolver<Array<ResolversTypes['Concept']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  promptFragments?: Resolver<Array<ResolversTypes['PromptFragment']>, ParentType, ContextType>;
  selectionGroup?: Resolver<Maybe<ResolversTypes['SelectionGroup']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
  tools?: Resolver<Array<ResolversTypes['Tool']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SkillConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['SkillConnection'] = ResolversParentTypes['SkillConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['Skill']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type SourceLocationResolvers<ContextType = any, ParentType extends ResolversParentTypes['SourceLocation'] = ResolversParentTypes['SourceLocation']> = {
  line?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  path?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  repositoryRef?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  repositoryUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  viewUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
};

export type StageTimingResolvers<ContextType = any, ParentType extends ResolversParentTypes['StageTiming'] = ResolversParentTypes['StageTiming']> = {
  milliseconds?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  stage?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type ToolResolvers<ContextType = any, ParentType extends ResolversParentTypes['Tool'] = ResolversParentTypes['Tool']> = {
  concepts?: Resolver<Array<ResolversTypes['Concept']>, ParentType, ContextType>;
  dependencies?: Resolver<Array<ResolversTypes['ToolDependency']>, ParentType, ContextType>;
  dependents?: Resolver<Array<ResolversTypes['ToolDependency']>, ParentType, ContextType>;
  description?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  inputSchema?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  latency?: Resolver<Maybe<ResolversTypes['ToolLatency']>, ParentType, ContextType>;
  metadata?: Resolver<ResolversTypes['JSON'], ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  outputSchema?: Resolver<Maybe<ResolversTypes['JSON']>, ParentType, ContextType>;
  priority?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  risk?: Resolver<Maybe<ResolversTypes['ToolRisk']>, ParentType, ContextType>;
  runtimeBinding?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  selectionGroup?: Resolver<Maybe<ResolversTypes['SelectionGroup']>, ParentType, ContextType>;
  source?: Resolver<ResolversTypes['SourceLocation'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['LifecycleStatus'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ToolConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ToolConnection'] = ResolversParentTypes['ToolConnection']> = {
  nodes?: Resolver<Array<ResolversTypes['Tool']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  totalCount?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
};

export type ToolDependencyResolvers<ContextType = any, ParentType extends ResolversParentTypes['ToolDependency'] = ResolversParentTypes['ToolDependency']> = {
  requirement?: Resolver<ResolversTypes['ToolDependencyRequirement'], ParentType, ContextType>;
  sourceTool?: Resolver<ResolversTypes['Tool'], ParentType, ContextType>;
  targetTool?: Resolver<ResolversTypes['Tool'], ParentType, ContextType>;
};

export type ToolDependencyResolutionResolvers<ContextType = any, ParentType extends ResolversParentTypes['ToolDependencyResolution'] = ResolversParentTypes['ToolDependencyResolution']> = {
  reason?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  requirement?: Resolver<ResolversTypes['ToolDependencyRequirement'], ParentType, ContextType>;
  sourceTool?: Resolver<ResolversTypes['Tool'], ParentType, ContextType>;
  status?: Resolver<ResolversTypes['DependencyResolutionStatus'], ParentType, ContextType>;
  targetTool?: Resolver<ResolversTypes['Tool'], ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  AgentAssemblyBudgetUsage?: AgentAssemblyBudgetUsageResolvers<ContextType>;
  AgentAssemblyDiagnostics?: AgentAssemblyDiagnosticsResolvers<ContextType>;
  AgentAssemblyResult?: AgentAssemblyResultResolvers<ContextType>;
  AgentTemplate?: AgentTemplateResolvers<ContextType>;
  AgentTemplateBudgets?: AgentTemplateBudgetsResolvers<ContextType>;
  AssembledPromptFragment?: AssembledPromptFragmentResolvers<ContextType>;
  AssembledSkill?: AssembledSkillResolvers<ContextType>;
  AssembledTask?: AssembledTaskResolvers<ContextType>;
  AssembledTool?: AssembledToolResolvers<ContextType>;
  AssemblyCandidateDiagnostic?: AssemblyCandidateDiagnosticResolvers<ContextType>;
  AssemblyReason?: AssemblyReasonResolvers<ContextType>;
  Concept?: ConceptResolvers<ContextType>;
  ConceptAlias?: ConceptAliasResolvers<ContextType>;
  ConceptConnection?: ConceptConnectionResolvers<ContextType>;
  ConceptRelation?: ConceptRelationResolvers<ContextType>;
  ConceptRelationConnection?: ConceptRelationConnectionResolvers<ContextType>;
  ConceptResolutionResult?: ConceptResolutionResultResolvers<ContextType>;
  DateTime?: GraphQLScalarType;
  DiagnosticCause?: DiagnosticCauseResolvers<ContextType>;
  DiagnosticWarning?: DiagnosticWarningResolvers<ContextType>;
  DimensionDefinition?: DimensionDefinitionResolvers<ContextType>;
  DimensionValue?: DimensionValueResolvers<ContextType>;
  DimensionValueConnection?: DimensionValueConnectionResolvers<ContextType>;
  Domain?: DomainResolvers<ContextType>;
  DomainConnection?: DomainConnectionResolvers<ContextType>;
  EntityRef?: EntityRefResolvers<ContextType>;
  JSON?: GraphQLScalarType;
  KnowledgeChunk?: KnowledgeChunkResolvers<ContextType>;
  KnowledgeChunkConnection?: KnowledgeChunkConnectionResolvers<ContextType>;
  KnowledgeItem?: KnowledgeItemResolvers<ContextType>;
  KnowledgeItemConnection?: KnowledgeItemConnectionResolvers<ContextType>;
  KnowledgeSource?: KnowledgeSourceResolvers<ContextType>;
  Long?: GraphQLScalarType;
  Namespace?: NamespaceResolvers<ContextType>;
  NamespaceRef?: NamespaceRefResolvers<ContextType>;
  OntologyNeighborhood?: OntologyNeighborhoodResolvers<ContextType>;
  OntologyPath?: OntologyPathResolvers<ContextType>;
  OntologyPathStep?: OntologyPathStepResolvers<ContextType>;
  PackedContext?: PackedContextResolvers<ContextType>;
  PackingDiagnostics?: PackingDiagnosticsResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PromptFragment?: PromptFragmentResolvers<ContextType>;
  PromptFragmentConnection?: PromptFragmentConnectionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RelationType?: RelationTypeResolvers<ContextType>;
  ResolvedConcept?: ResolvedConceptResolvers<ContextType>;
  RetrievalCandidateCounts?: RetrievalCandidateCountsResolvers<ContextType>;
  RetrievalDiagnostics?: RetrievalDiagnosticsResolvers<ContextType>;
  RetrievalExclusion?: RetrievalExclusionResolvers<ContextType>;
  RetrievalProfile?: RetrievalProfileResolvers<ContextType>;
  RetrievalRankingDiagnostic?: RetrievalRankingDiagnosticResolvers<ContextType>;
  RetrievalReason?: RetrievalReasonResolvers<ContextType>;
  RetrievalResult?: RetrievalResultResolvers<ContextType>;
  RetrievalResultItem?: RetrievalResultItemResolvers<ContextType>;
  RuntimeInfo?: RuntimeInfoResolvers<ContextType>;
  SelectionGroup?: SelectionGroupResolvers<ContextType>;
  SelectionGroupMember?: SelectionGroupMemberResolvers<ContextType>;
  Skill?: SkillResolvers<ContextType>;
  SkillConnection?: SkillConnectionResolvers<ContextType>;
  SourceLocation?: SourceLocationResolvers<ContextType>;
  StageTiming?: StageTimingResolvers<ContextType>;
  Tool?: ToolResolvers<ContextType>;
  ToolConnection?: ToolConnectionResolvers<ContextType>;
  ToolDependency?: ToolDependencyResolvers<ContextType>;
  ToolDependencyResolution?: ToolDependencyResolutionResolvers<ContextType>;
};

