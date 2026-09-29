// Public surface of the source package: discovery, loading, semantic
// validation, plus the jsonc/markdown/schema parse primitives needed by
// hosts that resolve config themselves (e.g. the web server resolving the
// embedding provider before compile).

export type { SourceFile, SourceKind } from "./discover.ts";
export {
  classifySourcePath,
  discoverSourceFiles,
  findGroundingRoot,
  GROUNDING_CONFIG_NAME,
} from "./discover.ts";
export type { JsoncParseResult } from "./jsonc.ts";
export { parseJsonc } from "./jsonc.ts";
export type { LoadResult } from "./load.ts";
export { loadSourceTree } from "./load.ts";
export type { DerivedChunk, MarkdownParseResult, MarkdownSection } from "./markdown.ts";
export { buildSections, deriveChunks, parseMarkdownSource } from "./markdown.ts";
export type { SchemaValidateOptions } from "./schemas.ts";
export { schemaValidate } from "./schemas.ts";
export type { EntityKind, KnowledgeDocument, SourceEntity, SourceTree } from "./tree.ts";
export { classifyRef, EntityIndex, entitiesFromDocument } from "./tree.ts";
export type { ValidateOptions, ValidateResult } from "./validate.ts";
export { validateTree } from "./validate.ts";
