import type { Diagnostic, DiagnosticLocation } from "@grounding/core";
import { SourceErrorCode } from "@grounding/core";
import {
  findNodeAtLocation,
  type Node,
  type ParseError,
  parse as parseJsoncText,
  parseTree,
} from "jsonc-parser";

export type JsoncParseResult = {
  /** undefined when the document produced no value (e.g. unrecoverable parse). */
  value: unknown;
  tree: Node | undefined;
  diagnostics: Diagnostic[];
};

/** jsonc-parser ParseErrorCode → message (codes are a stable numeric enum). */
const PARSE_ERROR_MESSAGES: Record<number, string> = {
  1: "invalid symbol",
  2: "invalid number format",
  3: "property name expected",
  4: "value expected",
  5: "colon expected",
  6: "comma expected",
  7: "closing brace expected",
  8: "closing bracket expected",
  9: "unexpected trailing content",
  10: "invalid comment token",
  11: "unterminated comment",
  12: "unterminated string",
  13: "unterminated number",
  14: "invalid unicode escape",
  15: "invalid escape character",
  16: "invalid character",
};

/** Offset (0-based UTF-16 units) → 1-based line/column. */
export function offsetToLineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** JSON Pointer (e.g. "/a/0/b") → 1-based line/column in `text`, when resolvable. */
export function lineColumnAtPointer(
  tree: Node,
  text: string,
  pointer: string,
): { line: number; column: number } | null {
  if (pointer === "" || pointer === "/") return offsetToLineColumn(text, tree.offset);
  const segments = pointer
    .slice(1)
    .split("/")
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"))
    .map((s) => (/^\d+$/.test(s) ? Number(s) : s));
  const node = findNodeAtLocation(tree, segments);
  if (!node) return null;
  return offsetToLineColumn(text, node.offset);
}

function pointerOf(node: Node): string {
  const parts: string[] = [];
  let current: Node | undefined = node;
  while (current?.parent) {
    const parent: Node = current.parent;
    if (parent.type === "property") {
      const keyNode = parent.children?.[0];
      if (keyNode?.value !== undefined) parts.unshift(String(keyNode.value));
    } else if (parent.type === "array") {
      const idx = parent.children?.indexOf(current) ?? -1;
      if (idx >= 0) parts.unshift(String(idx));
    }
    current = parent;
  }
  return parts.length ? `/${parts.join("/")}` : "";
}

/**
 * Parse JSONC source (comments + trailing commas allowed per spec/02).
 * Duplicate keys are DUPLICATE_KEY errors; malformed content is
 * SOURCE_PARSE_ERROR. `lineOffset` shifts reported lines so Markdown
 * frontmatter diagnostics map to file positions.
 */
export function parseJsonc(text: string, path: string, lineOffset = 0): JsoncParseResult {
  const diagnostics: Diagnostic[] = [];
  const errors: ParseError[] = [];
  const value = parseJsoncText(text, errors, {
    allowTrailingComma: true,
    allowEmptyContent: false,
  });
  // Fresh array — sharing `errors` would double-report every parse error.
  const tree = parseTree(text, [], { allowTrailingComma: true });

  const loc = (offset: number): DiagnosticLocation => {
    const at = offsetToLineColumn(text, offset);
    return { path, line: at.line + lineOffset, column: at.column };
  };

  for (const error of errors) {
    diagnostics.push({
      severity: "error",
      code: SourceErrorCode.SOURCE_PARSE_ERROR,
      message: PARSE_ERROR_MESSAGES[error.error] ?? "parse error",
      location: loc(error.offset),
    });
  }

  // Duplicate object keys (spec/02: duplicate keys are errors).
  if (tree) {
    const walk = (node: Node) => {
      if (node.type === "object" && node.children) {
        const seen = new Set<string>();
        for (const prop of node.children) {
          const keyNode = prop.children?.[0];
          if (!keyNode || keyNode.value === undefined) continue;
          const key = String(keyNode.value);
          if (seen.has(key)) {
            diagnostics.push({
              severity: "error",
              code: SourceErrorCode.DUPLICATE_KEY,
              message: `duplicate key "${key}"`,
              location: { ...loc(keyNode.offset), pointer: pointerOf(keyNode) },
            });
          } else {
            seen.add(key);
          }
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(tree);
  }

  return { value, tree, diagnostics };
}
