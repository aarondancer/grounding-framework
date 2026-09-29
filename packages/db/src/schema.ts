/**
 * Drizzle schema matching the v1 data model (implementation-reference/sql/schema.sql).
 * Extensions, the grounding_english FTS configuration, and special indexes are
 * managed by migrations; this file owns typed table definitions.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  unique,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});

export const lifecycleStatus = ["draft", "published", "deprecated"] as const;
export type LifecycleStatus = (typeof lifecycleStatus)[number];

const lifecycleList = sql.join(
  lifecycleStatus.map((s) => sql.raw(`'${s}'`)),
  sql`, `,
);

export const namespaces = pgTable("namespaces", {
  id: uuid("id").primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  defaultRetrievalProfileId: uuid("default_retrieval_profile_id"),
  metadata: jsonb("metadata").notNull().default({}),
});

export const namespaceRuntimeState = pgTable(
  "namespace_runtime_state",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    runtimeRevision: bigint("runtime_revision", { mode: "number" }).notNull().default(0),
    gitCommit: text("git_commit"),
    sourceHash: text("source_hash").notNull(),
    embeddingConfigHash: text("embedding_config_hash"),
    activeDeploymentId: uuid("active_deployment_id"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.namespaceId, t.environment] }),
    foreignKey({
      columns: [t.activeDeploymentId],
      foreignColumns: [deployments.id],
    }).onDelete("set null"),
  ],
);

export const deployments = pgTable(
  "deployments",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    environment: text("environment").notNull(),
    gitCommit: text("git_commit"),
    sourceHash: text("source_hash").notNull(),
    compilerVersion: text("compiler_version").notNull(),
    schemaVersion: text("schema_version").notNull(),
    status: text("status").notNull(),
    initiatedBy: text("initiated_by"),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.id),
    check(
      "deployments_status_check",
      sql`${t.status} in ('pending','deploying','active','failed','superseded')`,
    ),
    index("deployments_namespace_environment_idx").on(
      t.namespaceId,
      t.environment,
      sql`${t.startedAt} desc`,
    ),
  ],
);

export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [unique().on(t.namespaceId, t.key), unique().on(t.namespaceId, t.id)],
);

export const concepts = pgTable(
  "concepts",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    normalizedKey: text("normalized_key").notNull(),
    name: text("name").notNull(),
    normalizedName: text("normalized_name").notNull(),
    conceptType: text("concept_type"),
    description: text("description"),
    status: text("status").notNull().default("published"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    semanticHash: text("semantic_hash"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    check("concepts_status_check", sql`${t.status} in (${lifecycleList})`),
    index("concepts_namespace_status_idx").on(t.namespaceId, t.status),
    index("concepts_name_trgm_idx").using("gin", sql`${t.normalizedName} gin_trgm_ops`),
    index("concepts_key_trgm_idx").using("gin", sql`${t.normalizedKey} gin_trgm_ops`),
  ],
);

export const conceptAliases = pgTable(
  "concept_aliases",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").notNull(),
    alias: text("alias").notNull(),
    normalizedAlias: text("normalized_alias").notNull(),
    sourcePath: text("source_path").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.namespaceId, t.conceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
    unique().on(t.namespaceId, t.conceptId, t.normalizedAlias),
    index("concept_aliases_normalized_idx").on(t.namespaceId, t.normalizedAlias),
    index("concept_aliases_trgm_idx").using("gin", sql`${t.normalizedAlias} gin_trgm_ops`),
  ],
);

export const conceptDomains = pgTable(
  "concept_domains",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    conceptId: uuid("concept_id").notNull(),
    domainId: uuid("domain_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conceptId, t.domainId] }),
    foreignKey({
      columns: [t.namespaceId, t.conceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.domainId],
      foreignColumns: [domains.namespaceId, domains.id],
    }).onDelete("cascade"),
    index("concept_domains_namespace_domain_idx").on(t.namespaceId, t.domainId),
  ],
);

export const relationTypes = pgTable(
  "relation_types",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [unique().on(t.namespaceId, t.key), unique().on(t.namespaceId, t.id)],
);

export const conceptRelations = pgTable(
  "concept_relations",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    sourceConceptId: uuid("source_concept_id").notNull(),
    relationTypeId: uuid("relation_type_id").notNull(),
    targetConceptId: uuid("target_concept_id").notNull(),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    foreignKey({
      columns: [t.namespaceId, t.sourceConceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.targetConceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.relationTypeId],
      foreignColumns: [relationTypes.namespaceId, relationTypes.id],
    }).onDelete("restrict"),
    check("concept_relations_no_self", sql`${t.sourceConceptId} <> ${t.targetConceptId}`),
    index("concept_relations_outgoing_idx").on(t.namespaceId, t.sourceConceptId, t.relationTypeId),
    index("concept_relations_incoming_idx").on(t.namespaceId, t.targetConceptId, t.relationTypeId),
  ],
);

export const knowledgeSources = pgTable(
  "knowledge_sources",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key"),
    title: text("title").notNull(),
    uri: text("uri"),
    sourceType: text("source_type"),
    checksum: text("checksum"),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [unique().on(t.namespaceId, t.key), unique().on(t.namespaceId, t.id)],
);

export const knowledgeItems = pgTable(
  "knowledge_items",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    title: text("title").notNull(),
    normalizedTitle: text("normalized_title").notNull(),
    summary: text("summary"),
    status: text("status").notNull(),
    authorityScore: real("authority_score"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    sourceId: uuid("source_id"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.sourceId],
      foreignColumns: [knowledgeSources.namespaceId, knowledgeSources.id],
    }).onDelete("set null"),
    check("knowledge_items_status_check", sql`${t.status} in (${lifecycleList})`),
    check(
      "knowledge_items_window_check",
      sql`${t.effectiveFrom} is null or ${t.effectiveTo} is null or ${t.effectiveFrom} < ${t.effectiveTo}`,
    ),
    index("knowledge_items_title_trgm_idx").using("gin", sql`${t.normalizedTitle} gin_trgm_ops`),
  ],
);

export const selectionGroups = pgTable(
  "selection_groups",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name"),
    entityType: text("entity_type").notNull(),
    mode: text("mode").notNull(),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    check(
      "selection_groups_entity_type_check",
      sql`${t.entityType} in ('knowledge_chunk','prompt_fragment','skill','tool')`,
    ),
    check(
      "selection_groups_mode_check",
      sql`${t.mode} in ('highest_priority','most_specific','all')`,
    ),
  ],
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    knowledgeItemId: uuid("knowledge_item_id").notNull(),
    chunkKey: text("chunk_key").notNull(),
    ordinal: integer("ordinal").notNull(),
    heading: text("heading"),
    normalizedHeading: text("normalized_heading"),
    content: text("content").notNull(),
    status: text("status").notNull(),
    priority: integer("priority").notNull().default(0),
    authorityScore: real("authority_score"),
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    selectionGroupId: uuid("selection_group_id"),
    authorizationExpression: jsonb("authorization_expression"),
    applicabilityExpression: jsonb("applicability_expression"),
    tokenCount: integer("token_count"),
    searchText: text("search_text"),
    searchVector: tsvector("search_vector"),
    contentHash: text("content_hash").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    semanticHash: text("semantic_hash").notNull(),
    lexicalHash: text("lexical_hash"),
    sourcePath: text("source_path").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.knowledgeItemId, t.chunkKey),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.knowledgeItemId],
      foreignColumns: [knowledgeItems.namespaceId, knowledgeItems.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.selectionGroupId],
      foreignColumns: [selectionGroups.namespaceId, selectionGroups.id],
    }).onDelete("set null"),
    check("knowledge_chunks_ordinal_check", sql`${t.ordinal} >= 0`),
    check("knowledge_chunks_status_check", sql`${t.status} in (${lifecycleList})`),
    check(
      "knowledge_chunks_window_check",
      sql`${t.effectiveFrom} is null or ${t.effectiveTo} is null or ${t.effectiveFrom} < ${t.effectiveTo}`,
    ),
    index("knowledge_chunks_item_idx").on(t.namespaceId, t.knowledgeItemId, t.ordinal),
    index("knowledge_chunks_status_idx").on(t.namespaceId, t.status),
    index("knowledge_chunks_selection_group_idx").on(t.namespaceId, t.selectionGroupId),
    index("knowledge_chunks_search_vector_idx").using("gin", t.searchVector),
    index("knowledge_chunks_heading_trgm_idx")
      .using("gin", sql`${t.normalizedHeading} gin_trgm_ops`)
      .where(sql`${t.normalizedHeading} is not null`),
    index("knowledge_chunks_published_idx")
      .on(t.namespaceId, t.id)
      .where(sql`${t.status} = 'published'`),
  ],
);

export const chunkConcepts = pgTable(
  "chunk_concepts",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    chunkId: uuid("chunk_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.chunkId, t.conceptId] }),
    foreignKey({
      columns: [t.namespaceId, t.chunkId],
      foreignColumns: [knowledgeChunks.namespaceId, knowledgeChunks.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.conceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
    index("chunk_concepts_concept_idx").on(t.namespaceId, t.conceptId, t.chunkId),
  ],
);

export const dimensionDefinitions = pgTable(
  "dimension_definitions",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    valueType: text("value_type").notNull(),
    cardinality: text("cardinality").notNull(),
    category: text("category").notNull(),
    allowedOperators: jsonb("allowed_operators").notNull(),
    hierarchical: boolean("hierarchical").notNull().default(false),
    required: boolean("required").notNull().default(false),
    missingValueBehavior: text("missing_value_behavior").notNull().default("no_match"),
    trust: text("trust").notNull().default("request"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    check(
      "dimension_definitions_value_type_check",
      sql`${t.valueType} in ('string','number','boolean','date','enum')`,
    ),
    check("dimension_definitions_cardinality_check", sql`${t.cardinality} in ('single','multi')`),
    check(
      "dimension_definitions_category_check",
      sql`${t.category} in ('authorization','eligibility','applicability','ranking','descriptive')`,
    ),
    check(
      "dimension_definitions_mvb_check",
      sql`${t.missingValueBehavior} in ('no_match','unknown','ignore')`,
    ),
    check("dimension_definitions_trust_check", sql`${t.trust} in ('server','request')`),
  ],
);

export const dimensionValues = pgTable(
  "dimension_values",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    dimensionId: uuid("dimension_id").notNull(),
    key: text("key").notNull(),
    name: text("name"),
    parentValueId: uuid("parent_value_id"),
    sortOrder: integer("sort_order"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.dimensionId, t.key),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.dimensionId],
      foreignColumns: [dimensionDefinitions.namespaceId, dimensionDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.parentValueId],
      foreignColumns: [t.namespaceId, t.id],
    }).onDelete("restrict"),
  ],
);

export const dimensionValueClosure = pgTable(
  "dimension_value_closure",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    dimensionId: uuid("dimension_id").notNull(),
    ancestorValueId: uuid("ancestor_value_id").notNull(),
    descendantValueId: uuid("descendant_value_id").notNull(),
    depth: integer("depth").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.dimensionId, t.ancestorValueId, t.descendantValueId] }),
    foreignKey({
      columns: [t.namespaceId, t.dimensionId],
      foreignColumns: [dimensionDefinitions.namespaceId, dimensionDefinitions.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.ancestorValueId],
      foreignColumns: [dimensionValues.namespaceId, dimensionValues.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.descendantValueId],
      foreignColumns: [dimensionValues.namespaceId, dimensionValues.id],
    }).onDelete("cascade"),
    check("dimension_value_closure_depth_check", sql`${t.depth} >= 0`),
    index("dimension_value_closure_descendant_idx").on(
      t.namespaceId,
      t.dimensionId,
      t.descendantValueId,
    ),
  ],
);

export const retrievalProfiles = pgTable(
  "retrieval_profiles",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name"),
    config: jsonb("config").notNull(),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
  },
  (t) => [unique().on(t.namespaceId, t.key), unique().on(t.namespaceId, t.id)],
);

/**
 * The vector dimension is substituted at migration-generation time from the
 * installation's configured embedding dimension via GROUNDING_EMBEDDING_
 * DIMENSIONS (spec/08); the runtime build verifies atttypmod against the
 * authored config and refuses mismatches.
 */
const EMBEDDING_DIMENSIONS = Number(process.env.GROUNDING_EMBEDDING_DIMENSIONS ?? "1536");

export const semanticEntities = pgTable(
  "semantic_entities",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    semanticText: text("semantic_text").notNull(),
    semanticHash: text("semantic_hash").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMENSIONS }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.namespaceId, t.entityType, t.entityId] }),
    index("semantic_entities_type_idx").on(t.namespaceId, t.entityType),
    index("semantic_entities_embedding_hnsw_idx").using(
      "hnsw",
      sql`${t.embedding} vector_cosine_ops`,
    ),
  ],
);

export const agentTemplates = pgTable(
  "agent_templates",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    retrievalProfileId: uuid("retrieval_profile_id"),
    maxSkills: integer("max_skills"),
    maxTools: integer("max_tools"),
    promptTokenBudget: integer("prompt_token_budget"),
    bootstrapKnowledgeTokenBudget: integer("bootstrap_knowledge_token_budget"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.retrievalProfileId],
      foreignColumns: [retrievalProfiles.namespaceId, retrievalProfiles.id],
    }).onDelete("set null"),
    check("agent_templates_status_check", sql`${t.status} in (${lifecycleList})`),
  ],
);

export const promptFragments = pgTable(
  "prompt_fragments",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    status: text("status").notNull(),
    inclusionMode: text("inclusion_mode").notNull(),
    section: text("section").notNull(),
    orderHint: integer("order_hint").notNull().default(0),
    content: text("content").notNull(),
    selectionGroupId: uuid("selection_group_id"),
    priority: integer("priority").notNull().default(0),
    authorizationExpression: jsonb("authorization_expression"),
    applicabilityExpression: jsonb("applicability_expression"),
    compiledHash: text("compiled_hash").notNull(),
    semanticHash: text("semantic_hash"),
    sourcePath: text("source_path").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.selectionGroupId],
      foreignColumns: [selectionGroups.namespaceId, selectionGroups.id],
    }).onDelete("set null"),
    check("prompt_fragments_status_check", sql`${t.status} in (${lifecycleList})`),
    check(
      "prompt_fragments_inclusion_check",
      sql`${t.inclusionMode} in ('always','applicable','task_relevant')`,
    ),
  ],
);

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status").notNull(),
    selectionGroupId: uuid("selection_group_id"),
    priority: integer("priority").notNull().default(0),
    authorizationExpression: jsonb("authorization_expression"),
    applicabilityExpression: jsonb("applicability_expression"),
    semanticText: text("semantic_text").notNull(),
    semanticHash: text("semantic_hash").notNull(),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.selectionGroupId],
      foreignColumns: [selectionGroups.namespaceId, selectionGroups.id],
    }).onDelete("set null"),
    check("skills_status_check", sql`${t.status} in (${lifecycleList})`),
  ],
);

export const tools = pgTable(
  "tools",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull(),
    status: text("status").notNull(),
    runtimeBinding: text("runtime_binding").notNull(),
    risk: text("risk"),
    latency: text("latency"),
    selectionGroupId: uuid("selection_group_id"),
    priority: integer("priority").notNull().default(0),
    authorizationExpression: jsonb("authorization_expression"),
    applicabilityExpression: jsonb("applicability_expression"),
    semanticText: text("semantic_text").notNull(),
    semanticHash: text("semantic_hash").notNull(),
    inputSchema: jsonb("input_schema"),
    outputSchema: jsonb("output_schema"),
    sourcePath: text("source_path").notNull(),
    compiledHash: text("compiled_hash").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
  },
  (t) => [
    unique().on(t.namespaceId, t.key),
    unique().on(t.namespaceId, t.id),
    foreignKey({
      columns: [t.namespaceId, t.selectionGroupId],
      foreignColumns: [selectionGroups.namespaceId, selectionGroups.id],
    }).onDelete("set null"),
    check("tools_status_check", sql`${t.status} in (${lifecycleList})`),
    check(
      "tools_risk_check",
      sql`${t.risk} is null or ${t.risk} in ('read','write','destructive','privileged')`,
    ),
    check(
      "tools_latency_check",
      sql`${t.latency} is null or ${t.latency} in ('local','fast_remote','slow_remote')`,
    ),
  ],
);

export const templatePromptFragments = pgTable(
  "template_prompt_fragments",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    templateId: uuid("template_id").notNull(),
    promptFragmentId: uuid("prompt_fragment_id").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.promptFragmentId] }),
    foreignKey({
      columns: [t.namespaceId, t.templateId],
      foreignColumns: [agentTemplates.namespaceId, agentTemplates.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.promptFragmentId],
      foreignColumns: [promptFragments.namespaceId, promptFragments.id],
    }).onDelete("cascade"),
  ],
);

export const skillPromptFragments = pgTable(
  "skill_prompt_fragments",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull(),
    promptFragmentId: uuid("prompt_fragment_id").notNull(),
    ordinal: integer("ordinal").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.promptFragmentId] }),
    foreignKey({
      columns: [t.namespaceId, t.skillId],
      foreignColumns: [skills.namespaceId, skills.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.promptFragmentId],
      foreignColumns: [promptFragments.namespaceId, promptFragments.id],
    }).onDelete("cascade"),
  ],
);

export const skillConcepts = pgTable(
  "skill_concepts",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.conceptId] }),
    foreignKey({
      columns: [t.namespaceId, t.skillId],
      foreignColumns: [skills.namespaceId, skills.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.conceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
  ],
);

export const skillTools = pgTable(
  "skill_tools",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    skillId: uuid("skill_id").notNull(),
    toolId: uuid("tool_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.skillId, t.toolId] }),
    foreignKey({
      columns: [t.namespaceId, t.skillId],
      foreignColumns: [skills.namespaceId, skills.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.toolId],
      foreignColumns: [tools.namespaceId, tools.id],
    }).onDelete("cascade"),
  ],
);

export const toolConcepts = pgTable(
  "tool_concepts",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    toolId: uuid("tool_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.toolId, t.conceptId] }),
    foreignKey({
      columns: [t.namespaceId, t.toolId],
      foreignColumns: [tools.namespaceId, tools.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.conceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
  ],
);

export const promptFragmentConcepts = pgTable(
  "prompt_fragment_concepts",
  {
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    promptFragmentId: uuid("prompt_fragment_id").notNull(),
    conceptId: uuid("concept_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.promptFragmentId, t.conceptId] }),
    foreignKey({
      columns: [t.namespaceId, t.promptFragmentId],
      foreignColumns: [promptFragments.namespaceId, promptFragments.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.conceptId],
      foreignColumns: [concepts.namespaceId, concepts.id],
    }).onDelete("cascade"),
  ],
);

export const toolDependencies = pgTable(
  "tool_dependencies",
  {
    id: uuid("id").primaryKey(),
    namespaceId: uuid("namespace_id")
      .notNull()
      .references(() => namespaces.id, { onDelete: "cascade" }),
    sourceToolId: uuid("source_tool_id").notNull(),
    targetToolId: uuid("target_tool_id").notNull(),
    requirement: text("requirement").notNull(),
    sourcePath: text("source_path").notNull(),
  },
  (t) => [
    unique().on(t.namespaceId, t.sourceToolId, t.targetToolId),
    foreignKey({
      columns: [t.namespaceId, t.sourceToolId],
      foreignColumns: [tools.namespaceId, tools.id],
    }).onDelete("cascade"),
    foreignKey({
      columns: [t.namespaceId, t.targetToolId],
      foreignColumns: [tools.namespaceId, tools.id],
    }).onDelete("restrict"),
    check("tool_dependencies_requirement_check", sql`${t.requirement} in ('required','optional')`),
    check("tool_dependencies_no_self", sql`${t.sourceToolId} <> ${t.targetToolId}`),
    index("tool_dependencies_source_idx").on(t.namespaceId, t.sourceToolId),
    index("tool_dependencies_target_idx").on(t.namespaceId, t.targetToolId),
  ],
);
