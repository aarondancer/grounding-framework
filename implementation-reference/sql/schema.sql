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

CREATE TABLE namespaces (
  id uuid PRIMARY KEY,
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  default_retrieval_profile_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE namespace_runtime_state (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  environment text NOT NULL,
  runtime_revision bigint NOT NULL DEFAULT 0,
  git_commit text,
  source_hash text NOT NULL,
  embedding_config_hash text,
  active_deployment_id uuid,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (namespace_id, environment)
);

CREATE TABLE deployments (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  environment text NOT NULL,
  git_commit text,
  source_hash text NOT NULL,
  compiler_version text NOT NULL,
  schema_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('pending','deploying','active','failed','superseded')),
  initiated_by text,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,id)
);
CREATE INDEX deployments_namespace_environment_idx ON deployments(namespace_id, environment, started_at DESC);
ALTER TABLE namespace_runtime_state ADD CONSTRAINT namespace_runtime_state_active_deployment_fk
  FOREIGN KEY (active_deployment_id) REFERENCES deployments(id) ON DELETE SET NULL;

CREATE TABLE domains (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

-- normalized_* columns below are lexical-normalized materialized values.
-- The application performs NFKC/whitespace/lowercase pre-normalization, then
-- PostgreSQL unaccent() is authoritative for the final stored value.
CREATE TABLE concepts (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  normalized_key text NOT NULL,
  name text NOT NULL,
  normalized_name text NOT NULL,
  concept_type text,
  description text,
  status text NOT NULL DEFAULT 'published' CHECK (status IN ('draft','published','deprecated')),
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  semantic_hash text,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);
CREATE INDEX concepts_namespace_status_idx ON concepts(namespace_id,status);
CREATE INDEX concepts_name_trgm_idx ON concepts USING gin (normalized_name gin_trgm_ops);
CREATE INDEX concepts_key_trgm_idx ON concepts USING gin (normalized_key gin_trgm_ops);

CREATE TABLE concept_aliases (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL,
  alias text NOT NULL,
  normalized_alias text NOT NULL,
  source_path text NOT NULL,
  FOREIGN KEY(namespace_id,concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  UNIQUE(namespace_id,concept_id,normalized_alias)
);
CREATE INDEX concept_aliases_normalized_idx ON concept_aliases(namespace_id,normalized_alias);
CREATE INDEX concept_aliases_trgm_idx ON concept_aliases USING gin (normalized_alias gin_trgm_ops);

CREATE TABLE concept_domains (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  concept_id uuid NOT NULL,
  domain_id uuid NOT NULL,
  FOREIGN KEY(namespace_id,concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,domain_id) REFERENCES domains(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(concept_id,domain_id)
);
CREATE INDEX concept_domains_namespace_domain_idx ON concept_domains(namespace_id,domain_id);

CREATE TABLE relation_types (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE concept_relations (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  source_concept_id uuid NOT NULL,
  relation_type_id uuid NOT NULL,
  target_concept_id uuid NOT NULL,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,source_concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,target_concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,relation_type_id) REFERENCES relation_types(namespace_id,id) ON DELETE RESTRICT,
  CHECK(source_concept_id <> target_concept_id)
);
CREATE INDEX concept_relations_outgoing_idx ON concept_relations(namespace_id,source_concept_id,relation_type_id);
CREATE INDEX concept_relations_incoming_idx ON concept_relations(namespace_id,target_concept_id,relation_type_id);

CREATE TABLE knowledge_sources (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text,
  title text NOT NULL,
  uri text,
  source_type text,
  checksum text,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE knowledge_items (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  title text NOT NULL,
  normalized_title text NOT NULL,
  summary text,
  status text NOT NULL CHECK(status IN ('draft','published','deprecated')),
  authority_score real,
  effective_from timestamptz,
  effective_to timestamptz,
  source_id uuid,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,source_id) REFERENCES knowledge_sources(namespace_id,id) ON DELETE SET NULL,
  CHECK(effective_from IS NULL OR effective_to IS NULL OR effective_from < effective_to),
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);
CREATE INDEX knowledge_items_title_trgm_idx ON knowledge_items USING gin (normalized_title gin_trgm_ops);

CREATE TABLE selection_groups (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text,
  entity_type text NOT NULL,
  mode text NOT NULL CHECK(mode IN ('highest_priority','most_specific','all')),
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  knowledge_item_id uuid NOT NULL,
  chunk_key text NOT NULL,
  ordinal integer NOT NULL CHECK(ordinal >= 0),
  heading text,
  normalized_heading text,
  content text NOT NULL,
  status text NOT NULL CHECK(status IN ('draft','published','deprecated')),
  priority integer NOT NULL DEFAULT 0,
  authority_score real,
  effective_from timestamptz,
  effective_to timestamptz,
  selection_group_id uuid,
  authorization_expression jsonb,
  applicability_expression jsonb,
  token_count integer,
  search_text text,
  search_vector tsvector,
  content_hash text NOT NULL,
  compiled_hash text NOT NULL,
  semantic_hash text NOT NULL,
  lexical_hash text,
  source_path text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,knowledge_item_id) REFERENCES knowledge_items(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,selection_group_id) REFERENCES selection_groups(namespace_id,id) ON DELETE SET NULL,
  CHECK(effective_from IS NULL OR effective_to IS NULL OR effective_from < effective_to),
  UNIQUE(namespace_id,knowledge_item_id,chunk_key), UNIQUE(namespace_id,id)
);
CREATE INDEX knowledge_chunks_item_idx ON knowledge_chunks(namespace_id,knowledge_item_id,ordinal);
CREATE INDEX knowledge_chunks_status_idx ON knowledge_chunks(namespace_id,status);
CREATE INDEX knowledge_chunks_selection_group_idx ON knowledge_chunks(namespace_id,selection_group_id);
CREATE INDEX knowledge_chunks_search_vector_idx ON knowledge_chunks USING gin(search_vector);
CREATE INDEX knowledge_chunks_heading_trgm_idx ON knowledge_chunks USING gin (normalized_heading gin_trgm_ops) WHERE normalized_heading IS NOT NULL;
CREATE INDEX knowledge_chunks_published_idx ON knowledge_chunks(namespace_id,id) WHERE status='published';

CREATE TABLE chunk_concepts (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  chunk_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  FOREIGN KEY(namespace_id,chunk_id) REFERENCES knowledge_chunks(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(chunk_id,concept_id)
);
CREATE INDEX chunk_concepts_concept_idx ON chunk_concepts(namespace_id,concept_id,chunk_id);

CREATE TABLE dimension_definitions (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  value_type text NOT NULL CHECK(value_type IN ('string','number','boolean','date','enum')),
  cardinality text NOT NULL CHECK(cardinality IN ('single','multi')),
  category text NOT NULL CHECK(category IN ('authorization','eligibility','applicability','ranking','descriptive')),
  allowed_operators jsonb NOT NULL,
  hierarchical boolean NOT NULL DEFAULT false,
  required boolean NOT NULL DEFAULT false,
  missing_value_behavior text NOT NULL DEFAULT 'no_match' CHECK(missing_value_behavior IN ('no_match','unknown','ignore')),
  trust text NOT NULL DEFAULT 'request' CHECK(trust IN ('server','request')),
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE dimension_values (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  dimension_id uuid NOT NULL,
  key text NOT NULL,
  name text,
  parent_value_id uuid,
  sort_order integer,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,dimension_id) REFERENCES dimension_definitions(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,parent_value_id) REFERENCES dimension_values(namespace_id,id) ON DELETE RESTRICT,
  UNIQUE(namespace_id,dimension_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE dimension_value_closure (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  dimension_id uuid NOT NULL,
  ancestor_value_id uuid NOT NULL,
  descendant_value_id uuid NOT NULL,
  depth integer NOT NULL CHECK(depth >= 0),
  FOREIGN KEY(namespace_id,dimension_id) REFERENCES dimension_definitions(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,ancestor_value_id) REFERENCES dimension_values(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,descendant_value_id) REFERENCES dimension_values(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(dimension_id,ancestor_value_id,descendant_value_id)
);
CREATE INDEX dimension_value_closure_descendant_idx ON dimension_value_closure(namespace_id,dimension_id,descendant_value_id);

CREATE TABLE retrieval_profiles (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text,
  config jsonb NOT NULL,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

-- Replace 1536 with installation EMBEDDING_DIMENSION in migration generation.
CREATE TABLE semantic_entities (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  semantic_text text NOT NULL,
  semantic_hash text NOT NULL,
  embedding vector(1536) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(namespace_id,entity_type,entity_id)
);
CREATE INDEX semantic_entities_type_idx ON semantic_entities(namespace_id,entity_type);
CREATE INDEX semantic_entities_embedding_hnsw_idx ON semantic_entities USING hnsw (embedding vector_cosine_ops);

CREATE TABLE agent_templates (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK(status IN ('draft','published','deprecated')),
  retrieval_profile_id uuid,
  max_skills integer,
  max_tools integer,
  prompt_token_budget integer,
  bootstrap_knowledge_token_budget integer,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,retrieval_profile_id) REFERENCES retrieval_profiles(namespace_id,id) ON DELETE SET NULL,
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE prompt_fragments (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  status text NOT NULL CHECK(status IN ('draft','published','deprecated')),
  inclusion_mode text NOT NULL CHECK(inclusion_mode IN ('always','applicable','task_relevant')),
  section text NOT NULL,
  order_hint integer NOT NULL DEFAULT 0,
  content text NOT NULL,
  selection_group_id uuid,
  priority integer NOT NULL DEFAULT 0,
  authorization_expression jsonb,
  applicability_expression jsonb,
  compiled_hash text NOT NULL,
  semantic_hash text,
  source_path text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,selection_group_id) REFERENCES selection_groups(namespace_id,id) ON DELETE SET NULL,
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE skills (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL CHECK(status IN ('draft','published','deprecated')),
  selection_group_id uuid,
  priority integer NOT NULL DEFAULT 0,
  authorization_expression jsonb,
  applicability_expression jsonb,
  semantic_text text NOT NULL,
  semantic_hash text NOT NULL,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,selection_group_id) REFERENCES selection_groups(namespace_id,id) ON DELETE SET NULL,
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE tools (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  key text NOT NULL,
  name text NOT NULL,
  description text NOT NULL,
  status text NOT NULL CHECK(status IN ('draft','published','deprecated')),
  runtime_binding text NOT NULL,
  risk text CHECK(risk IS NULL OR risk IN ('read','write','destructive','privileged')),
  latency text CHECK(latency IS NULL OR latency IN ('local','fast_remote','slow_remote')),
  selection_group_id uuid,
  priority integer NOT NULL DEFAULT 0,
  authorization_expression jsonb,
  applicability_expression jsonb,
  semantic_text text NOT NULL,
  semantic_hash text NOT NULL,
  input_schema jsonb,
  output_schema jsonb,
  source_path text NOT NULL,
  compiled_hash text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  FOREIGN KEY(namespace_id,selection_group_id) REFERENCES selection_groups(namespace_id,id) ON DELETE SET NULL,
  UNIQUE(namespace_id,key), UNIQUE(namespace_id,id)
);

CREATE TABLE template_prompt_fragments (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  template_id uuid NOT NULL,
  prompt_fragment_id uuid NOT NULL,
  ordinal integer NOT NULL DEFAULT 0,
  FOREIGN KEY(namespace_id,template_id) REFERENCES agent_templates(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,prompt_fragment_id) REFERENCES prompt_fragments(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(template_id,prompt_fragment_id)
);
CREATE TABLE skill_prompt_fragments (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  prompt_fragment_id uuid NOT NULL,
  ordinal integer NOT NULL DEFAULT 0,
  FOREIGN KEY(namespace_id,skill_id) REFERENCES skills(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,prompt_fragment_id) REFERENCES prompt_fragments(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(skill_id,prompt_fragment_id)
);
CREATE TABLE skill_concepts (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  FOREIGN KEY(namespace_id,skill_id) REFERENCES skills(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(skill_id,concept_id)
);
CREATE TABLE skill_tools (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  skill_id uuid NOT NULL,
  tool_id uuid NOT NULL,
  FOREIGN KEY(namespace_id,skill_id) REFERENCES skills(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,tool_id) REFERENCES tools(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(skill_id,tool_id)
);
CREATE TABLE tool_concepts (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  tool_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  FOREIGN KEY(namespace_id,tool_id) REFERENCES tools(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(tool_id,concept_id)
);
CREATE TABLE prompt_fragment_concepts (
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  prompt_fragment_id uuid NOT NULL,
  concept_id uuid NOT NULL,
  FOREIGN KEY(namespace_id,prompt_fragment_id) REFERENCES prompt_fragments(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,concept_id) REFERENCES concepts(namespace_id,id) ON DELETE CASCADE,
  PRIMARY KEY(prompt_fragment_id,concept_id)
);
CREATE TABLE tool_dependencies (
  id uuid PRIMARY KEY,
  namespace_id uuid NOT NULL REFERENCES namespaces(id) ON DELETE CASCADE,
  source_tool_id uuid NOT NULL,
  target_tool_id uuid NOT NULL,
  requirement text NOT NULL CHECK(requirement IN ('required','optional')),
  source_path text NOT NULL,
  FOREIGN KEY(namespace_id,source_tool_id) REFERENCES tools(namespace_id,id) ON DELETE CASCADE,
  FOREIGN KEY(namespace_id,target_tool_id) REFERENCES tools(namespace_id,id) ON DELETE RESTRICT,
  CHECK(source_tool_id <> target_tool_id),
  UNIQUE(namespace_id,source_tool_id,target_tool_id)
);
CREATE INDEX tool_dependencies_source_idx ON tool_dependencies(namespace_id,source_tool_id);
CREATE INDEX tool_dependencies_target_idx ON tool_dependencies(namespace_id,target_tool_id);

ALTER TABLE namespaces ADD CONSTRAINT namespaces_default_profile_fk
  FOREIGN KEY (id, default_retrieval_profile_id) REFERENCES retrieval_profiles(namespace_id,id) ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;
