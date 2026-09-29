import { describe, expect, test } from "bun:test";
import {
  buildSections,
  deriveChunks,
  extractHeadings,
  parseMarkdownSource,
  slugifyComponent,
} from "./markdown.ts";

const MD = `---
{"id":"019d0000-0000-7000-8000-000000000099","key":"k","title":"T","status":"published"}
---

# Doc Title

Intro text here.

## First {#first}

Body one.

## Second

Body two.

### Deep section {#deep}

Deep body.
`;

describe("frontmatter", () => {
  test("parses JSONC frontmatter and reports body offset", () => {
    const r = parseMarkdownSource(MD, "knowledge/x.md");
    expect(r.diagnostics).toEqual([]);
    expect((r.frontmatter.value as { key: string }).key).toBe("k");
    expect(r.body.startsWith("\n# Doc Title")).toBe(true);
  });

  test("missing closing fence is SOURCE_PARSE_ERROR", () => {
    const r = parseMarkdownSource('---\n{"a":1\n', "knowledge/x.md");
    expect(r.diagnostics.some((d) => d.code === "SOURCE_PARSE_ERROR")).toBe(true);
  });
});

describe("sections & chunking", () => {
  test("extracts headings with explicit IDs", () => {
    const events = extractHeadings("# T\n\n## A {#a}\n\n## B\n\n### C {#c}\n");
    expect(events.map((e) => [e.depth, e.rawText, e.explicitId])).toEqual([
      [1, "T", null],
      [2, "A", "a"],
      [2, "B", null],
      [3, "C", "c"],
    ]);
  });

  test("malformed {#ID} is INVALID_HEADING_ID", () => {
    const r = buildSections("## Bad {#BadID!}\n\ntext\n", "x.md");
    expect(r.diagnostics.some((d) => d.code === "INVALID_HEADING_ID")).toBe(true);
  });

  test("duplicate explicit ids → DUPLICATE_HEADING_ID", () => {
    const r = buildSections("## A {#dup}\n\nx\n\n## B {#dup}\n\ny\n", "x.md");
    expect(r.diagnostics.some((d) => d.code === "DUPLICATE_HEADING_ID")).toBe(true);
  });

  test("colliding derived keys → DUPLICATE_DERIVED_CHUNK_KEY", () => {
    // "Foo!" and "Foo?" both slug to "foo"
    const r = buildSections("## Foo!\n\nx\n\n## Foo?\n\ny\n", "x.md");
    expect(r.diagnostics.some((d) => d.code === "DUPLICATE_DERIVED_CHUNK_KEY")).toBe(true);
  });

  test("intro + per-H2 primary chunks", () => {
    const md = "# T\n\nintro\n\n## A {#a}\n\nbody a\n\n## B\n\nbody b\n";
    const s2 = buildSections(md, "x.md");
    const c2 = deriveChunks(md, s2.sections, 6000);
    expect(c2.map((c) => c.key)).toEqual(["intro", "a", "b"]);
  });

  test("slug algorithm: NFKC, lowercase, run-collapse, path join", () => {
    expect(slugifyComponent("Stage  Progression")).toBe("stage-progression");
    expect(slugifyComponent("C++ 3.0")).toBe("c-3.0");
  });

  test("overflow: paragraph split emits --part-NN keys", () => {
    const body = `## Big\n\n${"x".repeat(50)}\n\n${"y".repeat(50)}\n\n${"z".repeat(50)}\n`;
    const { sections } = buildSections(body, "x.md");
    const chunks = deriveChunks(body, sections, 80);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.key.startsWith("big--part-"))).toBe(true);
    expect(chunks.map((c) => c.key)).toEqual(["big--part-01", "big--part-02", "big--part-03"]);
  });

  test("overflow: oversized paragraph hard-splits at char limit", () => {
    const body = `## Big\n\n${"x".repeat(150)}\n`;
    const { sections } = buildSections(body, "x.md");
    const chunks = deriveChunks(body, sections, 100);
    expect(chunks.length).toBe(2);
    expect(chunks[0]?.key).toBe("big--part-01");
    expect(chunks[1]?.key).toBe("big--part-02");
  });
});
