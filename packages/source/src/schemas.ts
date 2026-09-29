import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Diagnostic } from "@grounding/core";
import { SourceErrorCode } from "@grounding/core";
import Ajv2020, { type ErrorObject, type ValidateFunction } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { Node } from "jsonc-parser";
import type { SourceKind } from "./discover.ts";
import { lineColumnAtPointer } from "./jsonc.ts";

/**
 * JSON Schema 2020-12 validation (spec/02). Canonical schemas live in the
 * implementation-reference pack; they are the formal file contract.
 */

const SCHEMA_FILE_BY_KIND: Record<SourceKind, string> = {
  config: "grounding-config.schema.json",
  namespace: "namespace.schema.json",
  "domains-file": "domains.schema.json",
  concept: "concept.schema.json",
  "relation-types": "relation-types.schema.json",
  relations: "relations.schema.json",
  knowledge: "knowledge-frontmatter.schema.json",
  dimension: "dimension.schema.json",
  "selection-group": "selection-group.schema.json",
  "retrieval-profile": "retrieval-profile.schema.json",
  "agent-template": "agent-template.schema.json",
  skill: "skill.schema.json",
  tool: "tool.schema.json",
  "prompt-fragment": "prompt-fragment-frontmatter.schema.json",
  "retrieval-eval": "retrieval-eval.schema.json",
  "assembly-eval": "agent-assembly-eval.schema.json",
};

const here = dirname(fileURLToPath(import.meta.url));

/** Locate the schemas dir; GROUNDING_SCHEMAS_DIR overrides for standalone use. */
export function schemasDir(): string {
  const override = process.env.GROUNDING_SCHEMAS_DIR;
  if (override) return override;
  let dir = here;
  for (;;) {
    const candidate = resolve(dir, "implementation-reference/schemas");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) {
      throw new Error("implementation-reference/schemas not found above module path");
    }
    dir = parent;
  }
}

let cachedAjv: Ajv2020 | null = null;
const validators = new Map<string, ValidateFunction>();

function ajv(): Ajv2020 {
  if (cachedAjv) return cachedAjv;
  const instance = new Ajv2020({
    allErrors: true,
    strict: false,
    coerceTypes: false,
  });
  addFormats(instance);
  const dir = schemasDir();
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".schema.json"))) {
    instance.addSchema(JSON.parse(readFileSync(join(dir, file), "utf8")), file);
  }
  cachedAjv = instance;
  return instance;
}

function validatorFor(kind: SourceKind): ValidateFunction | null {
  let v = validators.get(kind);
  if (!v) {
    v = ajv().getSchema(SCHEMA_FILE_BY_KIND[kind]);
    if (v) validators.set(kind, v);
  }
  return v ?? null;
}

/** Map an Ajv keyword to the stable diagnostic code (spec/14). */
function codeFor(error: ErrorObject, kind: SourceKind): Diagnostic["code"] {
  if (kind === "retrieval-eval" || kind === "assembly-eval") {
    return SourceErrorCode.EVAL_SCHEMA_INVALID;
  }
  switch (error.keyword) {
    case "additionalProperties":
      return SourceErrorCode.UNKNOWN_FIELD;
    case "required":
      return SourceErrorCode.MISSING_REQUIRED_FIELD;
    case "type":
      return SourceErrorCode.INVALID_FIELD_TYPE;
    default:
      return SourceErrorCode.SCHEMA_VALIDATION_FAILED;
  }
}

export type SchemaValidateOptions = {
  /** Parsed document tree + source text for precise line/column mapping. */
  tree?: Node | undefined;
  text?: string | undefined;
  /** 0-based line offset (Markdown frontmatter lives at file line ≥ 2). */
  lineOffset?: number;
};

/** Schema-validate one parsed document; emits stable diagnostics. */
export function schemaValidate(
  kind: SourceKind,
  value: unknown,
  path: string,
  options: SchemaValidateOptions = {},
): Diagnostic[] {
  const validate = validatorFor(kind);
  if (!validate) return [];
  if (validate(value)) return [];
  const { tree, text, lineOffset = 0 } = options;
  const diagnostics: Diagnostic[] = [];
  for (const error of validate.errors ?? []) {
    const pointer = error.instancePath || "/";
    const at = tree && text ? lineColumnAtPointer(tree, text, pointer) : null;
    diagnostics.push({
      severity: "error",
      code: codeFor(error, kind),
      message: `${pointer} ${error.message ?? "schema violation"}`.trim(),
      location: {
        path,
        line: at ? at.line + lineOffset : undefined,
        column: at?.column,
        pointer,
      },
      details: {
        keyword: error.keyword,
        expected: error.params ? (error.params as Record<string, unknown>).type : undefined,
        ...(error.params ? { params: error.params } : {}),
      },
    });
  }
  return diagnostics;
}
