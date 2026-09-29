import type { Diagnostic } from "@grounding/core";
import { SourceErrorCode } from "@grounding/core";
import type { Node } from "jsonc-parser";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parseJsonc } from "./jsonc.ts";

/**
 * Markdown + JSONC frontmatter (spec/02): `---` fences, JSONC between them,
 * Markdown body after. No YAML, no raw HTML enforcement beyond remark-parse
 * (raw HTML nodes are rejected semantically by the caller if present).
 */
export type MarkdownParseResult = {
  frontmatter: {
    value: unknown;
    /** Frontmatter text and parsed tree (for schema-error line/column). */
    text: string;
    tree: Node | undefined;
  };
  /** Markdown body after the closing fence (offsets are file-relative). */
  body: string;
  /** 0-based line where the body starts. */
  bodyLine: number;
  diagnostics: Diagnostic[];
};

const FENCE = "---";

export function parseMarkdownSource(text: string, path: string): MarkdownParseResult {
  const diagnostics: Diagnostic[] = [];
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");

  const fail = (message: string): MarkdownParseResult => {
    diagnostics.push({
      severity: "error",
      code: SourceErrorCode.SOURCE_PARSE_ERROR,
      message,
      location: { path, line: 1, column: 1 },
    });
    return {
      frontmatter: { value: undefined, text: "", tree: undefined },
      body: "",
      bodyLine: 0,
      diagnostics,
    };
  };

  if (lines[0]?.trim() !== FENCE) {
    return fail("missing opening frontmatter fence '---'");
  }

  let close = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i]?.trim() === FENCE) {
      close = i;
      break;
    }
  }
  if (close === -1) {
    return fail("missing closing frontmatter fence '---'");
  }

  const frontmatterText = lines.slice(1, close).join("\n");
  // Frontmatter occupies file lines 2..close (1-based); its first line is line 2,
  // so lineOffset = 1 makes parseJsonc line numbers file-relative.
  const front = parseJsonc(frontmatterText, path, 1);
  diagnostics.push(...front.diagnostics);

  const bodyLines = lines.slice(close + 1);
  return {
    frontmatter: { value: front.value, text: frontmatterText, tree: front.tree },
    body: bodyLines.join("\n"),
    bodyLine: close + 1,
    diagnostics,
  };
}

/* ------------------------------------------------------------------ */
/* Sections, heading IDs, and deterministic chunk derivation (spec/13) */
/* ------------------------------------------------------------------ */

export const HEADING_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;
const HEADING_ID_SUFFIX = /\{#([^}]*)\}\s*$/;

export type MarkdownSection = {
  /** Heading depth (1..6). Intro has depth 0 and no heading text. */
  depth: number;
  /** Heading text with the {#id} suffix removed (rendered form). */
  heading: string | null;
  /** Explicit {#id} when present and valid. */
  explicitId: string | null;
  /** Stable structural key: explicit ID or derived heading-path slug; intro is "intro". */
  key: string;
  /** Rendered heading texts from the root down to this section (excl. H1). */
  path: string[];
  /** File offsets into the normalized body, covering the whole section subtree. */
  start: number;
  end: number;
  /** Offset where this section's own content ends and deeper headings begin. */
  childrenStart: number;
  children: MarkdownSection[];
};

type MdNode = {
  type: string;
  depth?: number;
  position?: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
  children?: MdNode[];
};

function nodeText(body: string, node: MdNode): string {
  if (!node.position) return "";
  return body.slice(node.position.start.offset, node.position.end.offset);
}

/** Extract literal text of a heading node (raw source slice, suffix included). */
function headingRaw(body: string, node: MdNode): string {
  const raw = nodeText(body, node);
  return raw.replace(/^#+\s*/, "").trimEnd();
}

/** Deterministic per-component slug (spec/13). Does NOT use unaccent. */
export function slugifyComponent(text: string): string {
  const nfkc = text.normalize("NFKC").toLowerCase();
  let out = "";
  let inRun = false;
  for (const ch of nfkc) {
    if (/[a-z0-9._-]/.test(ch)) {
      out += ch;
      inRun = false;
    } else if (!inRun) {
      out += "-";
      inRun = true;
    }
  }
  return out.replace(/-+/g, "-").replace(/^-+|-+$/g, "");
}

/** Join non-empty heading-path slugs with "--" (spec/13). */
export function headingPathSlug(path: string[]): string {
  return path
    .map(slugifyComponent)
    .filter((s) => s.length > 0)
    .join("--");
}

type HeadingEvent = {
  depth: number;
  rawText: string;
  explicitId: string | null;
  malformedId: boolean;
  start: number; // body-relative offset
  end: number;
  line: number;
  column: number;
};

/** All headings in document order with rendered text + explicit IDs extracted. */
export function extractHeadings(body: string): HeadingEvent[] {
  const tree = unified().use(remarkParse).parse(body) as MdNode;
  const events: HeadingEvent[] = [];
  const walk = (node: MdNode) => {
    if (node.type === "heading" && node.position) {
      const raw = headingRaw(body, node);
      const match = HEADING_ID_SUFFIX.exec(raw);
      const rendered = match ? raw.slice(0, match.index).trimEnd() : raw;
      events.push({
        depth: node.depth ?? 1,
        rawText: rendered,
        explicitId: match?.[1] !== undefined && HEADING_ID_PATTERN.test(match[1]) ? match[1] : null,
        malformedId: match !== null && !HEADING_ID_PATTERN.test(match[1] ?? ""),
        start: node.position.start.offset,
        end: node.position.end.offset,
        line: node.position.start.line,
        column: node.position.start.column,
      });
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return events;
}

export type SectionBuildResult = {
  sections: MarkdownSection[];
  /** Flat list of every section (including intro) with final keys. */
  flat: MarkdownSection[];
  diagnostics: Diagnostic[];
};

/**
 * Build the section tree and assign stable keys (spec/13):
 * intro chunk for pre-H2 content; H2+ sections keyed by explicit {#id} or the
 * heading-path slug joined with "--".
 */
export function buildSections(body: string, path: string, bodyLine = 0): SectionBuildResult {
  const diagnostics: Diagnostic[] = [];
  const events = extractHeadings(body);
  const docEnd = body.length;

  const at = (e: HeadingEvent) => ({ path, line: e.line + bodyLine, column: e.column });
  for (const e of events) {
    if (e.malformedId) {
      diagnostics.push({
        severity: "error",
        code: SourceErrorCode.INVALID_HEADING_ID,
        message: "heading ID does not match ^[a-z0-9][a-z0-9._-]*$",
        location: at(e),
      });
    }
  }

  // Intro section: content before the first H2 (H1 is document structure).
  const firstH2 = events.find((e) => e.depth === 2);
  const introEnd = firstH2 ? firstH2.start : docEnd;
  const sections: MarkdownSection[] = [];
  const flat: MarkdownSection[] = [];

  const introText = body.slice(0, introEnd);
  if (introText.trim().length > 0) {
    const intro: MarkdownSection = {
      depth: 0,
      heading: null,
      explicitId: null,
      key: "intro",
      path: [],
      start: 0,
      end: introEnd,
      childrenStart: introEnd,
      children: [],
    };
    sections.push(intro);
    flat.push(intro);
  }

  // Section extent: from heading start to the next heading of depth <= own.
  const stack: MarkdownSection[] = [];
  const pathForKey: string[] = [];
  for (let i = 0; i < events.length; i++) {
    const e = events[i];
    if (!e || e.depth < 2) continue; // H1 is not a chunk boundary (spec/13)
    let extentEnd = docEnd;
    for (let j = i + 1; j < events.length; j++) {
      const next = events[j];
      if (next && next.depth <= e.depth) {
        extentEnd = next.start;
        break;
      }
    }
    // heading-path stack
    while (stack.length > 0 && (stack.at(-1)?.depth ?? 0) >= e.depth) {
      stack.pop();
      pathForKey.pop();
    }
    const key = e.explicitId ?? headingPathSlug([...pathForKey, e.rawText]);
    if (key.length === 0) {
      diagnostics.push({
        severity: "error",
        code: SourceErrorCode.INVALID_HEADING_ID,
        message: "heading produces an empty derived key; add an explicit {#id}",
        location: at(e),
      });
    }
    const sec: MarkdownSection = {
      depth: e.depth,
      heading: e.rawText,
      explicitId: e.explicitId,
      key,
      path: [...pathForKey, e.rawText],
      start: e.start,
      end: extentEnd,
      childrenStart: extentEnd,
      children: [],
    };
    const parent = stack.at(-1);
    if (parent) {
      parent.children.push(sec);
      if (parent.children.length === 1) parent.childrenStart = sec.start;
    } else {
      sections.push(sec);
    }
    stack.push(sec);
    pathForKey.push(e.rawText);
    flat.push(sec);
  }

  // Key uniqueness: explicit duplicates → DUPLICATE_HEADING_ID; derived
  // collisions → DUPLICATE_DERIVED_CHUNK_KEY (spec/13: never auto-ordinal).
  const byKey = new Map<string, MarkdownSection>();
  for (const sec of flat) {
    if (sec.key === "") continue;
    const prior = byKey.get(sec.key);
    if (prior) {
      const derived = sec.explicitId === null;
      diagnostics.push({
        severity: "error",
        code: derived
          ? SourceErrorCode.DUPLICATE_DERIVED_CHUNK_KEY
          : SourceErrorCode.DUPLICATE_HEADING_ID,
        message: derived
          ? `derived chunk key "${sec.key}" collides; add explicit heading IDs`
          : `duplicate explicit heading ID "${sec.key}"`,
        location: { path },
        details: { key: sec.key },
      });
    } else {
      byKey.set(sec.key, sec);
    }
  }

  return { sections, flat, diagnostics };
}

export type DerivedChunk = {
  /** Stable chunk key (`intro`, heading key, or key + --part-NN). */
  key: string;
  /** Normalized chunk Markdown content (heading-ID suffix removed). */
  content: string;
  /** Section key this chunk was derived from (pre-part split). */
  sectionKey: string;
};

function partKey(base: string, n: number): string {
  const padded = n < 100 ? String(n).padStart(2, "0") : String(n);
  return `${base}--part-${padded}`;
}

/** Unicode-scalar length per spec/13 (maxCharacters counts scalar values). */
export function charLength(text: string): number {
  return [...text].length;
}

/**
 * Strip the {#id} suffix only from real heading lines inside a section
 * range — a `# x {#id}` line inside a fenced code block is content, not a
 * heading, and must not be rewritten. `headingOffsets` are slice-relative
 * line starts known to be AST headings.
 */
function stripHeadingIds(text: string, headingOffsets: ReadonlySet<number>): string {
  const out: string[] = [];
  let lineStart = 0;
  while (lineStart <= text.length) {
    const nl = text.indexOf("\n", lineStart);
    const lineEnd = nl === -1 ? text.length : nl;
    const line = text.slice(lineStart, lineEnd);
    out.push(headingOffsets.has(lineStart) ? line.replace(/\s*\{#[^}]*\}\s*$/, "") : line);
    if (nl === -1) break;
    lineStart = nl + 1;
  }
  return out.join("\n").replace(/[ \t]+$/gm, "");
}

/** Slice-relative offsets of every heading line in a section subtree. */
function headingLineOffsets(sec: MarkdownSection, base: number, into: Set<number>): void {
  into.add(sec.start - base);
  for (const child of sec.children) headingLineOffsets(child, base, into);
}

/** Section text for chunk content, with {#id} stripped on real heading lines. */
function renderSectionText(body: string, sec: MarkdownSection, end: number): string {
  const text = body.slice(sec.start, end);
  const offsets = new Set<number>();
  headingLineOffsets(sec, sec.start, offsets);
  return stripHeadingIds(text, offsets).trim();
}

/** Split normalized section text on blank-line paragraph boundaries. */
function paragraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/** Emit leaf fragments; >1 fragment of a section is keyed --part-NN. */
function emitFragments(fragments: string[], baseKey: string, out: DerivedChunk[]): void {
  const [only] = fragments;
  if (fragments.length === 1 && only !== undefined) {
    out.push({ key: baseKey, content: only, sectionKey: baseKey });
    return;
  }
  fragments.forEach((content, i) => {
    out.push({ key: partKey(baseKey, i + 1), content, sectionKey: baseKey });
  });
}

/** Split an oversized leaf section: paragraph packs, then hard char splits. */
function splitLeafText(text: string, baseKey: string, max: number, out: DerivedChunk[]): void {
  const paras = paragraphs(text);
  // A heading-only leading block stays attached to the following paragraph —
  // a chunk that is just a heading line is useless.
  while (paras.length > 1 && /^#{1,6}\s/.test(paras[0] ?? "")) {
    const heading = paras[0];
    const body = paras[1];
    if (heading === undefined || body === undefined) break;
    paras.splice(0, 2, `${heading}\n\n${body}`);
  }
  const fragments: string[] = [];
  let current = "";
  for (const p of paras) {
    const next = current.length === 0 ? p : `${current}\n\n${p}`;
    if (charLength(next) <= max || current.length === 0) {
      current = next;
    } else {
      fragments.push(current);
      current = p;
    }
  }
  if (current.length > 0) fragments.push(current);

  const final: string[] = [];
  for (const fragment of fragments) {
    if (charLength(fragment) <= max) {
      final.push(fragment);
    } else {
      const chars = [...fragment];
      for (let i = 0; i < chars.length; i += max) {
        final.push(chars.slice(i, i + max).join(""));
      }
    }
  }
  emitFragments(final, baseKey, out);
}

function chunkSection(body: string, sec: MarkdownSection, max: number, out: DerivedChunk[]): void {
  const text = renderSectionText(body, sec, sec.end);
  if (text.length === 0) return;

  if (charLength(text) <= max) {
    out.push({ key: sec.key, content: text, sectionKey: sec.key });
    return;
  }

  // Heading-children split stage (skipped for intro per spec/13).
  if (sec.depth > 0 && sec.children.length > 0) {
    const prologue = renderSectionText(body, sec, sec.childrenStart);
    if (prologue.length > 0) {
      if (charLength(prologue) <= max) {
        out.push({ key: sec.key, content: prologue, sectionKey: sec.key });
      } else {
        splitLeafText(prologue, sec.key, max, out);
      }
    }
    for (const child of sec.children) chunkSection(body, child, max, out);
    return;
  }

  // Leaf overflow: paragraph splitting, then hard character splitting.
  splitLeafText(text, sec.key, max, out);
}

/**
 * Derive deterministic chunks for one Markdown body (spec/13).
 * Primary chunks: `intro` plus one per H2 section; recursive overflow
 * splitting on deeper headings, paragraphs, then hard character splits.
 */
export function deriveChunks(
  body: string,
  sections: MarkdownSection[],
  maxCharacters: number,
): DerivedChunk[] {
  const normalized = body.replace(/\r\n?/g, "\n");
  const out: DerivedChunk[] = [];
  for (const sec of sections) {
    if (sec.depth <= 2) chunkSection(normalized, sec, maxCharacters, out);
  }
  return out;
}
