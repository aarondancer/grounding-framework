CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- Deterministic default FTS configuration. Installations may replace this only
-- through an explicit migration + lexical rebuild.
DROP TEXT SEARCH CONFIGURATION IF EXISTS grounding_english;
CREATE TEXT SEARCH CONFIGURATION grounding_english (COPY = pg_catalog.english);
-- Prepend unaccent to every token type mapped by pg_catalog.english,
-- preserving the copied config's terminal dictionary. unaccent is a filtering
-- dictionary and is identity for unaffected ASCII tokens.
ALTER TEXT SEARCH CONFIGURATION grounding_english
  ALTER MAPPING FOR asciiword, asciihword, hword_asciipart,
                    word, hword, hword_part
  WITH unaccent, english_stem;
ALTER TEXT SEARCH CONFIGURATION grounding_english
  ALTER MAPPING FOR email, file, float, host, hword_numpart,
                    int, numhword, numword, sfloat, uint,
                    url, url_path, version
  WITH unaccent, simple;

CREATE TABLE "agent_templates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"retrieval_profile_id" uuid,
	"max_skills" integer,
	"max_tools" integer,
	"prompt_token_budget" integer,
	"bootstrap_knowledge_token_budget" integer,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "agent_templates_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "agent_templates_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "agent_templates_status_check" CHECK ("agent_templates"."status" in ('draft', 'published', 'deprecated'))
);
--> statement-breakpoint
CREATE TABLE "chunk_concepts" (
	"namespace_id" uuid NOT NULL,
	"chunk_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "chunk_concepts_chunk_id_concept_id_pk" PRIMARY KEY("chunk_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "concept_aliases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"alias" text NOT NULL,
	"normalized_alias" text NOT NULL,
	"source_path" text NOT NULL,
	CONSTRAINT "concept_aliases_namespace_id_concept_id_normalized_alias_unique" UNIQUE("namespace_id","concept_id","normalized_alias")
);
--> statement-breakpoint
CREATE TABLE "concept_domains" (
	"namespace_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	"domain_id" uuid NOT NULL,
	CONSTRAINT "concept_domains_concept_id_domain_id_pk" PRIMARY KEY("concept_id","domain_id")
);
--> statement-breakpoint
CREATE TABLE "concept_relations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"source_concept_id" uuid NOT NULL,
	"relation_type_id" uuid NOT NULL,
	"target_concept_id" uuid NOT NULL,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "concept_relations_no_self" CHECK ("concept_relations"."source_concept_id" <> "concept_relations"."target_concept_id")
);
--> statement-breakpoint
CREATE TABLE "concepts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"normalized_key" text NOT NULL,
	"name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"concept_type" text,
	"description" text,
	"status" text DEFAULT 'published' NOT NULL,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"semantic_hash" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "concepts_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "concepts_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "concepts_status_check" CHECK ("concepts"."status" in ('draft', 'published', 'deprecated'))
);
--> statement-breakpoint
CREATE TABLE "deployments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"git_commit" text,
	"source_hash" text NOT NULL,
	"compiler_version" text NOT NULL,
	"schema_version" text NOT NULL,
	"status" text NOT NULL,
	"initiated_by" text,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "deployments_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "deployments_status_check" CHECK ("deployments"."status" in ('pending','deploying','active','failed','superseded'))
);
--> statement-breakpoint
CREATE TABLE "dimension_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"value_type" text NOT NULL,
	"cardinality" text NOT NULL,
	"category" text NOT NULL,
	"allowed_operators" jsonb NOT NULL,
	"hierarchical" boolean DEFAULT false NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"missing_value_behavior" text DEFAULT 'no_match' NOT NULL,
	"trust" text DEFAULT 'request' NOT NULL,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "dimension_definitions_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "dimension_definitions_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "dimension_definitions_value_type_check" CHECK ("dimension_definitions"."value_type" in ('string','number','boolean','date','enum')),
	CONSTRAINT "dimension_definitions_cardinality_check" CHECK ("dimension_definitions"."cardinality" in ('single','multi')),
	CONSTRAINT "dimension_definitions_category_check" CHECK ("dimension_definitions"."category" in ('authorization','eligibility','applicability','ranking','descriptive')),
	CONSTRAINT "dimension_definitions_mvb_check" CHECK ("dimension_definitions"."missing_value_behavior" in ('no_match','unknown','ignore')),
	CONSTRAINT "dimension_definitions_trust_check" CHECK ("dimension_definitions"."trust" in ('server','request'))
);
--> statement-breakpoint
CREATE TABLE "dimension_value_closure" (
	"namespace_id" uuid NOT NULL,
	"dimension_id" uuid NOT NULL,
	"ancestor_value_id" uuid NOT NULL,
	"descendant_value_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	CONSTRAINT "dimension_value_closure_dimension_id_ancestor_value_id_descendant_value_id_pk" PRIMARY KEY("dimension_id","ancestor_value_id","descendant_value_id"),
	CONSTRAINT "dimension_value_closure_depth_check" CHECK ("dimension_value_closure"."depth" >= 0)
);
--> statement-breakpoint
CREATE TABLE "dimension_values" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"dimension_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"parent_value_id" uuid,
	"sort_order" integer,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "dimension_values_namespace_id_dimension_id_key_unique" UNIQUE("namespace_id","dimension_id","key"),
	CONSTRAINT "dimension_values_namespace_id_id_unique" UNIQUE("namespace_id","id")
);
--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "domains_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "domains_namespace_id_id_unique" UNIQUE("namespace_id","id")
);
--> statement-breakpoint
CREATE TABLE "knowledge_chunks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"knowledge_item_id" uuid NOT NULL,
	"chunk_key" text NOT NULL,
	"ordinal" integer NOT NULL,
	"heading" text,
	"normalized_heading" text,
	"content" text NOT NULL,
	"status" text NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"authority_score" real,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"selection_group_id" uuid,
	"authorization_expression" jsonb,
	"applicability_expression" jsonb,
	"token_count" integer,
	"search_text" text,
	"search_vector" "tsvector",
	"content_hash" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"semantic_hash" text NOT NULL,
	"lexical_hash" text,
	"source_path" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "knowledge_chunks_namespace_id_knowledge_item_id_chunk_key_unique" UNIQUE("namespace_id","knowledge_item_id","chunk_key"),
	CONSTRAINT "knowledge_chunks_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "knowledge_chunks_ordinal_check" CHECK ("knowledge_chunks"."ordinal" >= 0),
	CONSTRAINT "knowledge_chunks_status_check" CHECK ("knowledge_chunks"."status" in ('draft', 'published', 'deprecated')),
	CONSTRAINT "knowledge_chunks_window_check" CHECK ("knowledge_chunks"."effective_from" is null or "knowledge_chunks"."effective_to" is null or "knowledge_chunks"."effective_from" < "knowledge_chunks"."effective_to")
);
--> statement-breakpoint
CREATE TABLE "knowledge_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"normalized_title" text NOT NULL,
	"summary" text,
	"status" text NOT NULL,
	"authority_score" real,
	"effective_from" timestamp with time zone,
	"effective_to" timestamp with time zone,
	"source_id" uuid,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "knowledge_items_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "knowledge_items_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "knowledge_items_status_check" CHECK ("knowledge_items"."status" in ('draft', 'published', 'deprecated')),
	CONSTRAINT "knowledge_items_window_check" CHECK ("knowledge_items"."effective_from" is null or "knowledge_items"."effective_to" is null or "knowledge_items"."effective_from" < "knowledge_items"."effective_to")
);
--> statement-breakpoint
CREATE TABLE "knowledge_sources" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text,
	"title" text NOT NULL,
	"uri" text,
	"source_type" text,
	"checksum" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "knowledge_sources_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "knowledge_sources_namespace_id_id_unique" UNIQUE("namespace_id","id")
);
--> statement-breakpoint
CREATE TABLE "namespace_runtime_state" (
	"namespace_id" uuid NOT NULL,
	"environment" text NOT NULL,
	"runtime_revision" bigint DEFAULT 0 NOT NULL,
	"git_commit" text,
	"source_hash" text NOT NULL,
	"embedding_config_hash" text,
	"active_deployment_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "namespace_runtime_state_namespace_id_environment_pk" PRIMARY KEY("namespace_id","environment")
);
--> statement-breakpoint
CREATE TABLE "namespaces" (
	"id" uuid PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"default_retrieval_profile_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "namespaces_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "prompt_fragment_concepts" (
	"namespace_id" uuid NOT NULL,
	"prompt_fragment_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "prompt_fragment_concepts_prompt_fragment_id_concept_id_pk" PRIMARY KEY("prompt_fragment_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "prompt_fragments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"inclusion_mode" text NOT NULL,
	"section" text NOT NULL,
	"order_hint" integer DEFAULT 0 NOT NULL,
	"content" text NOT NULL,
	"selection_group_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"authorization_expression" jsonb,
	"applicability_expression" jsonb,
	"compiled_hash" text NOT NULL,
	"semantic_hash" text,
	"source_path" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "prompt_fragments_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "prompt_fragments_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "prompt_fragments_status_check" CHECK ("prompt_fragments"."status" in ('draft', 'published', 'deprecated')),
	CONSTRAINT "prompt_fragments_inclusion_check" CHECK ("prompt_fragments"."inclusion_mode" in ('always','applicable','task_relevant'))
);
--> statement-breakpoint
CREATE TABLE "relation_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "relation_types_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "relation_types_namespace_id_id_unique" UNIQUE("namespace_id","id")
);
--> statement-breakpoint
CREATE TABLE "retrieval_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"config" jsonb NOT NULL,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	CONSTRAINT "retrieval_profiles_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "retrieval_profiles_namespace_id_id_unique" UNIQUE("namespace_id","id")
);
--> statement-breakpoint
CREATE TABLE "selection_groups" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text,
	"entity_type" text NOT NULL,
	"mode" text NOT NULL,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "selection_groups_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "selection_groups_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "selection_groups_entity_type_check" CHECK ("selection_groups"."entity_type" in ('knowledge_chunk','prompt_fragment','skill','tool')),
	CONSTRAINT "selection_groups_mode_check" CHECK ("selection_groups"."mode" in ('highest_priority','most_specific','all'))
);
--> statement-breakpoint
CREATE TABLE "semantic_entities" (
	"namespace_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" uuid NOT NULL,
	"semantic_text" text NOT NULL,
	"semantic_hash" text NOT NULL,
	"embedding" vector(1536) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "semantic_entities_namespace_id_entity_type_entity_id_pk" PRIMARY KEY("namespace_id","entity_type","entity_id")
);
--> statement-breakpoint
CREATE TABLE "skill_concepts" (
	"namespace_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "skill_concepts_skill_id_concept_id_pk" PRIMARY KEY("skill_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "skill_prompt_fragments" (
	"namespace_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"prompt_fragment_id" uuid NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "skill_prompt_fragments_skill_id_prompt_fragment_id_pk" PRIMARY KEY("skill_id","prompt_fragment_id")
);
--> statement-breakpoint
CREATE TABLE "skill_tools" (
	"namespace_id" uuid NOT NULL,
	"skill_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	CONSTRAINT "skill_tools_skill_id_tool_id_pk" PRIMARY KEY("skill_id","tool_id")
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"selection_group_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"authorization_expression" jsonb,
	"applicability_expression" jsonb,
	"semantic_text" text NOT NULL,
	"semantic_hash" text NOT NULL,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "skills_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "skills_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "skills_status_check" CHECK ("skills"."status" in ('draft', 'published', 'deprecated'))
);
--> statement-breakpoint
CREATE TABLE "template_prompt_fragments" (
	"namespace_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"prompt_fragment_id" uuid NOT NULL,
	"ordinal" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "template_prompt_fragments_template_id_prompt_fragment_id_pk" PRIMARY KEY("template_id","prompt_fragment_id")
);
--> statement-breakpoint
CREATE TABLE "tool_concepts" (
	"namespace_id" uuid NOT NULL,
	"tool_id" uuid NOT NULL,
	"concept_id" uuid NOT NULL,
	CONSTRAINT "tool_concepts_tool_id_concept_id_pk" PRIMARY KEY("tool_id","concept_id")
);
--> statement-breakpoint
CREATE TABLE "tool_dependencies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"source_tool_id" uuid NOT NULL,
	"target_tool_id" uuid NOT NULL,
	"requirement" text NOT NULL,
	"source_path" text NOT NULL,
	CONSTRAINT "tool_dependencies_namespace_id_source_tool_id_target_tool_id_unique" UNIQUE("namespace_id","source_tool_id","target_tool_id"),
	CONSTRAINT "tool_dependencies_requirement_check" CHECK ("tool_dependencies"."requirement" in ('required','optional')),
	CONSTRAINT "tool_dependencies_no_self" CHECK ("tool_dependencies"."source_tool_id" <> "tool_dependencies"."target_tool_id")
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"id" uuid PRIMARY KEY NOT NULL,
	"namespace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"status" text NOT NULL,
	"runtime_binding" text NOT NULL,
	"risk" text,
	"latency" text,
	"selection_group_id" uuid,
	"priority" integer DEFAULT 0 NOT NULL,
	"authorization_expression" jsonb,
	"applicability_expression" jsonb,
	"semantic_text" text NOT NULL,
	"semantic_hash" text NOT NULL,
	"input_schema" jsonb,
	"output_schema" jsonb,
	"source_path" text NOT NULL,
	"compiled_hash" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "tools_namespace_id_key_unique" UNIQUE("namespace_id","key"),
	CONSTRAINT "tools_namespace_id_id_unique" UNIQUE("namespace_id","id"),
	CONSTRAINT "tools_status_check" CHECK ("tools"."status" in ('draft', 'published', 'deprecated')),
	CONSTRAINT "tools_risk_check" CHECK ("tools"."risk" is null or "tools"."risk" in ('read','write','destructive','privileged')),
	CONSTRAINT "tools_latency_check" CHECK ("tools"."latency" is null or "tools"."latency" in ('local','fast_remote','slow_remote'))
);
--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_templates" ADD CONSTRAINT "agent_templates_namespace_id_retrieval_profile_id_retrieval_profiles_namespace_id_id_fk" FOREIGN KEY ("namespace_id","retrieval_profile_id") REFERENCES "public"."retrieval_profiles"("namespace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_concepts" ADD CONSTRAINT "chunk_concepts_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_concepts" ADD CONSTRAINT "chunk_concepts_namespace_id_chunk_id_knowledge_chunks_namespace_id_id_fk" FOREIGN KEY ("namespace_id","chunk_id") REFERENCES "public"."knowledge_chunks"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chunk_concepts" ADD CONSTRAINT "chunk_concepts_namespace_id_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_aliases" ADD CONSTRAINT "concept_aliases_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_aliases" ADD CONSTRAINT "concept_aliases_namespace_id_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_domains" ADD CONSTRAINT "concept_domains_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_domains" ADD CONSTRAINT "concept_domains_namespace_id_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_domains" ADD CONSTRAINT "concept_domains_namespace_id_domain_id_domains_namespace_id_id_fk" FOREIGN KEY ("namespace_id","domain_id") REFERENCES "public"."domains"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_relations" ADD CONSTRAINT "concept_relations_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_relations" ADD CONSTRAINT "concept_relations_namespace_id_source_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","source_concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_relations" ADD CONSTRAINT "concept_relations_namespace_id_target_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","target_concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concept_relations" ADD CONSTRAINT "concept_relations_namespace_id_relation_type_id_relation_types_namespace_id_id_fk" FOREIGN KEY ("namespace_id","relation_type_id") REFERENCES "public"."relation_types"("namespace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concepts" ADD CONSTRAINT "concepts_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deployments" ADD CONSTRAINT "deployments_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_definitions" ADD CONSTRAINT "dimension_definitions_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value_closure" ADD CONSTRAINT "dimension_value_closure_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value_closure" ADD CONSTRAINT "dimension_value_closure_namespace_id_dimension_id_dimension_definitions_namespace_id_id_fk" FOREIGN KEY ("namespace_id","dimension_id") REFERENCES "public"."dimension_definitions"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value_closure" ADD CONSTRAINT "dimension_value_closure_namespace_id_ancestor_value_id_dimension_values_namespace_id_id_fk" FOREIGN KEY ("namespace_id","ancestor_value_id") REFERENCES "public"."dimension_values"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value_closure" ADD CONSTRAINT "dimension_value_closure_namespace_id_descendant_value_id_dimension_values_namespace_id_id_fk" FOREIGN KEY ("namespace_id","descendant_value_id") REFERENCES "public"."dimension_values"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_values" ADD CONSTRAINT "dimension_values_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_values" ADD CONSTRAINT "dimension_values_namespace_id_dimension_id_dimension_definitions_namespace_id_id_fk" FOREIGN KEY ("namespace_id","dimension_id") REFERENCES "public"."dimension_definitions"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_values" ADD CONSTRAINT "dimension_values_namespace_id_parent_value_id_dimension_values_namespace_id_id_fk" FOREIGN KEY ("namespace_id","parent_value_id") REFERENCES "public"."dimension_values"("namespace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_namespace_id_knowledge_item_id_knowledge_items_namespace_id_id_fk" FOREIGN KEY ("namespace_id","knowledge_item_id") REFERENCES "public"."knowledge_items"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_chunks" ADD CONSTRAINT "knowledge_chunks_namespace_id_selection_group_id_selection_groups_namespace_id_id_fk" FOREIGN KEY ("namespace_id","selection_group_id") REFERENCES "public"."selection_groups"("namespace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_items" ADD CONSTRAINT "knowledge_items_namespace_id_source_id_knowledge_sources_namespace_id_id_fk" FOREIGN KEY ("namespace_id","source_id") REFERENCES "public"."knowledge_sources"("namespace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "knowledge_sources" ADD CONSTRAINT "knowledge_sources_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "namespace_runtime_state" ADD CONSTRAINT "namespace_runtime_state_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "namespace_runtime_state" ADD CONSTRAINT "namespace_runtime_state_active_deployment_id_deployments_id_fk" FOREIGN KEY ("active_deployment_id") REFERENCES "public"."deployments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_fragment_concepts" ADD CONSTRAINT "prompt_fragment_concepts_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_fragment_concepts" ADD CONSTRAINT "prompt_fragment_concepts_namespace_id_prompt_fragment_id_prompt_fragments_namespace_id_id_fk" FOREIGN KEY ("namespace_id","prompt_fragment_id") REFERENCES "public"."prompt_fragments"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_fragment_concepts" ADD CONSTRAINT "prompt_fragment_concepts_namespace_id_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_fragments" ADD CONSTRAINT "prompt_fragments_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prompt_fragments" ADD CONSTRAINT "prompt_fragments_namespace_id_selection_group_id_selection_groups_namespace_id_id_fk" FOREIGN KEY ("namespace_id","selection_group_id") REFERENCES "public"."selection_groups"("namespace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relation_types" ADD CONSTRAINT "relation_types_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "retrieval_profiles" ADD CONSTRAINT "retrieval_profiles_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "selection_groups" ADD CONSTRAINT "selection_groups_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semantic_entities" ADD CONSTRAINT "semantic_entities_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_concepts" ADD CONSTRAINT "skill_concepts_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_concepts" ADD CONSTRAINT "skill_concepts_namespace_id_skill_id_skills_namespace_id_id_fk" FOREIGN KEY ("namespace_id","skill_id") REFERENCES "public"."skills"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_concepts" ADD CONSTRAINT "skill_concepts_namespace_id_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prompt_fragments" ADD CONSTRAINT "skill_prompt_fragments_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prompt_fragments" ADD CONSTRAINT "skill_prompt_fragments_namespace_id_skill_id_skills_namespace_id_id_fk" FOREIGN KEY ("namespace_id","skill_id") REFERENCES "public"."skills"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_prompt_fragments" ADD CONSTRAINT "skill_prompt_fragments_namespace_id_prompt_fragment_id_prompt_fragments_namespace_id_id_fk" FOREIGN KEY ("namespace_id","prompt_fragment_id") REFERENCES "public"."prompt_fragments"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_namespace_id_skill_id_skills_namespace_id_id_fk" FOREIGN KEY ("namespace_id","skill_id") REFERENCES "public"."skills"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skill_tools" ADD CONSTRAINT "skill_tools_namespace_id_tool_id_tools_namespace_id_id_fk" FOREIGN KEY ("namespace_id","tool_id") REFERENCES "public"."tools"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "skills" ADD CONSTRAINT "skills_namespace_id_selection_group_id_selection_groups_namespace_id_id_fk" FOREIGN KEY ("namespace_id","selection_group_id") REFERENCES "public"."selection_groups"("namespace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_prompt_fragments" ADD CONSTRAINT "template_prompt_fragments_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_prompt_fragments" ADD CONSTRAINT "template_prompt_fragments_namespace_id_template_id_agent_templates_namespace_id_id_fk" FOREIGN KEY ("namespace_id","template_id") REFERENCES "public"."agent_templates"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "template_prompt_fragments" ADD CONSTRAINT "template_prompt_fragments_namespace_id_prompt_fragment_id_prompt_fragments_namespace_id_id_fk" FOREIGN KEY ("namespace_id","prompt_fragment_id") REFERENCES "public"."prompt_fragments"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_concepts" ADD CONSTRAINT "tool_concepts_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_concepts" ADD CONSTRAINT "tool_concepts_namespace_id_tool_id_tools_namespace_id_id_fk" FOREIGN KEY ("namespace_id","tool_id") REFERENCES "public"."tools"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_concepts" ADD CONSTRAINT "tool_concepts_namespace_id_concept_id_concepts_namespace_id_id_fk" FOREIGN KEY ("namespace_id","concept_id") REFERENCES "public"."concepts"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_dependencies" ADD CONSTRAINT "tool_dependencies_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_dependencies" ADD CONSTRAINT "tool_dependencies_namespace_id_source_tool_id_tools_namespace_id_id_fk" FOREIGN KEY ("namespace_id","source_tool_id") REFERENCES "public"."tools"("namespace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_dependencies" ADD CONSTRAINT "tool_dependencies_namespace_id_target_tool_id_tools_namespace_id_id_fk" FOREIGN KEY ("namespace_id","target_tool_id") REFERENCES "public"."tools"("namespace_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_namespace_id_namespaces_id_fk" FOREIGN KEY ("namespace_id") REFERENCES "public"."namespaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_namespace_id_selection_group_id_selection_groups_namespace_id_id_fk" FOREIGN KEY ("namespace_id","selection_group_id") REFERENCES "public"."selection_groups"("namespace_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunk_concepts_concept_idx" ON "chunk_concepts" USING btree ("namespace_id","concept_id","chunk_id");--> statement-breakpoint
CREATE INDEX "concept_aliases_normalized_idx" ON "concept_aliases" USING btree ("namespace_id","normalized_alias");--> statement-breakpoint
CREATE INDEX "concept_aliases_trgm_idx" ON "concept_aliases" USING gin ("normalized_alias" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "concept_domains_namespace_domain_idx" ON "concept_domains" USING btree ("namespace_id","domain_id");--> statement-breakpoint
CREATE INDEX "concept_relations_outgoing_idx" ON "concept_relations" USING btree ("namespace_id","source_concept_id","relation_type_id");--> statement-breakpoint
CREATE INDEX "concept_relations_incoming_idx" ON "concept_relations" USING btree ("namespace_id","target_concept_id","relation_type_id");--> statement-breakpoint
CREATE INDEX "concepts_namespace_status_idx" ON "concepts" USING btree ("namespace_id","status");--> statement-breakpoint
CREATE INDEX "concepts_name_trgm_idx" ON "concepts" USING gin ("normalized_name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "concepts_key_trgm_idx" ON "concepts" USING gin ("normalized_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "deployments_namespace_environment_idx" ON "deployments" USING btree ("namespace_id","environment","started_at" desc);--> statement-breakpoint
CREATE INDEX "dimension_value_closure_descendant_idx" ON "dimension_value_closure" USING btree ("namespace_id","dimension_id","descendant_value_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_item_idx" ON "knowledge_chunks" USING btree ("namespace_id","knowledge_item_id","ordinal");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_status_idx" ON "knowledge_chunks" USING btree ("namespace_id","status");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_selection_group_idx" ON "knowledge_chunks" USING btree ("namespace_id","selection_group_id");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_search_vector_idx" ON "knowledge_chunks" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "knowledge_chunks_heading_trgm_idx" ON "knowledge_chunks" USING gin ("normalized_heading" gin_trgm_ops) WHERE "knowledge_chunks"."normalized_heading" is not null;--> statement-breakpoint
CREATE INDEX "knowledge_chunks_published_idx" ON "knowledge_chunks" USING btree ("namespace_id","id") WHERE "knowledge_chunks"."status" = 'published';--> statement-breakpoint
CREATE INDEX "knowledge_items_title_trgm_idx" ON "knowledge_items" USING gin ("normalized_title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "semantic_entities_type_idx" ON "semantic_entities" USING btree ("namespace_id","entity_type");--> statement-breakpoint
CREATE INDEX "semantic_entities_embedding_hnsw_idx" ON "semantic_entities" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "tool_dependencies_source_idx" ON "tool_dependencies" USING btree ("namespace_id","source_tool_id");--> statement-breakpoint
CREATE INDEX "tool_dependencies_target_idx" ON "tool_dependencies" USING btree ("namespace_id","target_tool_id");