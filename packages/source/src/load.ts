import { readFileSync } from "node:fs";
import type { Diagnostic } from "@grounding/core";
import { RuntimeErrorCode, SourceErrorCode } from "@grounding/core";
import { discoverSourceFiles, findGroundingRoot } from "./discover.ts";
import { parseJsonc } from "./jsonc.ts";
import { buildSections, deriveChunks, parseMarkdownSource } from "./markdown.ts";
import { schemaValidate } from "./schemas.ts";
import { entitiesFromDocument, type KnowledgeDocument, type SourceEntity } from "./tree.ts";

/**
 * Load the grounding source tree: discover → parse → schema-validate →
 * extract entities → derive sections/chunks. Semantic validation is a
 * separate pass over the tree (validate.ts).
 */
export type LoadResult = {
  root: string | null;
  entities: SourceEntity[];
  knowledge: KnowledgeDocument[];
  diagnostics: Diagnostic[];
  /** Parsed config value (grounding.config.jsonc). */
  config: Record<string, unknown> | null;
};

const DEFAULT_MAX_CHARS = 6000;

export function loadSourceTree(startDir: string): LoadResult {
  const root = findGroundingRoot(startDir);
  const diagnostics: Diagnostic[] = [];
  const entities: SourceEntity[] = [];
  const knowledge: KnowledgeDocument[] = [];

  if (!root) {
    diagnostics.push({
      severity: "error",
      code: RuntimeErrorCode.INVALID_INPUT,
      message: `no ${"grounding.config.jsonc"} found walking up from ${startDir}`,
      location: { path: startDir },
    });
    return { root: null, entities, knowledge, diagnostics, config: null };
  }

  // Always load the whole tree — reference resolution needs the full
  // registry; callers filter diagnostics by path for scoped reporting.
  const files = discoverSourceFiles(root);

  let config: Record<string, unknown> | null = null;
  // Config first — knowledge chunking depends on chunking.maxCharacters.
  files.sort((a, b) => (a.kind === "config" ? -1 : b.kind === "config" ? 1 : 0));
  for (const file of files) {
    let text: string;
    try {
      text = readFileSync(file.absolutePath, "utf8");
    } catch {
      diagnostics.push({
        severity: "error",
        code: SourceErrorCode.SOURCE_PARSE_ERROR,
        message: `cannot read ${file.path}`,
        location: { path: file.path },
      });
      continue;
    }

    if (file.kind === "knowledge" || file.kind === "prompt-fragment") {
      const md = parseMarkdownSource(text, file.path);
      diagnostics.push(...md.diagnostics);
      const schemaDiags = schemaValidate(file.kind, md.frontmatter.value, file.path, {
        tree: md.frontmatter.tree,
        text: md.frontmatter.text,
        lineOffset: md.bodyLine > 0 ? 1 : 0,
      });
      diagnostics.push(...schemaDiags);
      // Layered validation (spec/07): a doc that failed parse/schema produces
      // no entities — semantic checks would only cascade noise.
      const invalid =
        md.diagnostics.some((d) => d.severity === "error") ||
        schemaDiags.some((d) => d.severity === "error");
      if (invalid) continue;
      if (file.kind === "knowledge") {
        const secs = buildSections(md.body, file.path, md.bodyLine);
        diagnostics.push(...secs.diagnostics);
        const configMax = getChunkLimit(config);
        const chunks = deriveChunks(md.body, secs.sections, configMax);
        const { entities: ents, knowledge: kd } = entitiesFromDocument(file, md.frontmatter.value, {
          chunks,
          sections: secs.sections,
          flat: secs.flat,
          body: md.body,
        });
        entities.push(...ents);
        if (kd) knowledge.push(kd);
      } else {
        entities.push(...entitiesFromDocument(file, md.frontmatter.value).entities);
      }
      continue;
    }

    const parsed = parseJsonc(text, file.path);
    diagnostics.push(...parsed.diagnostics);
    const schemaDiags = schemaValidate(file.kind, parsed.value, file.path, {
      tree: parsed.tree,
      text,
    });
    diagnostics.push(...schemaDiags);
    const invalid =
      parsed.diagnostics.some((d) => d.severity === "error") ||
      schemaDiags.some((d) => d.severity === "error");
    if (invalid) continue;
    const { entities: ents } = entitiesFromDocument(file, parsed.value);
    entities.push(...ents);
    if (file.kind === "config" && parsed.value && typeof parsed.value === "object") {
      config = parsed.value as Record<string, unknown>;
    }
  }

  return { root, entities, knowledge, diagnostics, config };
}

function getChunkLimit(config: Record<string, unknown> | null): number {
  const chunking = config?.chunking;
  if (chunking && typeof chunking === "object") {
    const max = (chunking as Record<string, unknown>).maxCharacters;
    if (typeof max === "number" && max >= 256) return max;
  }
  return DEFAULT_MAX_CHARS;
}
