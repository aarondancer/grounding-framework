import "./test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import { renderRoute, stubUrql } from "./test-harness";

afterEach(cleanup);

const CONCEPT_NODE = {
  id: "c1",
  key: "pipeline",
  name: "Pipeline",
  type: "entity",
  description: "sales pipeline",
  status: "PUBLISHED",
  domains: [{ id: "d1", key: "sales", name: "Sales" }],
  aliases: [{ id: "a1", alias: "Pipe" }],
  source: { path: "concepts/pipeline.jsonc", repositoryRef: "git:main", viewUrl: null },
  metadata: {},
  outgoingRelations: {
    nodes: [
      {
        id: "r1",
        type: { key: "affects", name: "Affects" },
        targetConcept: { id: "c2", key: "other", name: "Other" },
        source: { path: "relations/main.jsonc", repositoryRef: "git:main", viewUrl: null },
      },
    ],
    totalCount: 1,
  },
  incomingRelations: { nodes: [], totalCount: 0 },
};

describe("route pages (stub urql + real route tree)", () => {
  test("/ overview renders runtime info + corpus counts", async () => {
    const client = stubUrql({
      Overview: {
        runtimeInfo: {
          namespace: { id: "n1", key: "m5" },
          environment: "test",
          runtimeRevision: 3,
          gitCommit: "abc123",
          sourceHash: "deadbeefcafe0000",
          compilerVersion: null,
        },
        concepts: { totalCount: 2 },
        knowledgeItems: { totalCount: 1 },
        domains: { totalCount: 1 },
        skills: { totalCount: 0 },
        tools: { totalCount: 0 },
        promptFragments: { totalCount: 0 },
        dimensions: [],
        selectionGroups: [],
        agentTemplates: [],
        retrievalProfiles: [],
      },
    });
    const { findByText, findAllByText } = await renderRoute("/", client);
    expect((await findAllByText("Overview")).length).toBeGreaterThan(0); // nav + page header
    expect(await findByText(/namespace m5 · test/)).toBeTruthy();
    expect((await findByText("runtime revision")).parentElement?.textContent).toContain("3");
  });

  test("/explore/concepts lists rows with status badges and domain links", async () => {
    const client = stubUrql({
      Concepts: {
        concepts: {
          nodes: [CONCEPT_NODE],
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: 1,
        },
      },
    });
    const { findAllByText, getByText, getByRole } = await renderRoute("/explore/concepts", client);
    expect((await findAllByText("Concepts & Ontology")).length).toBeGreaterThan(0);
    const link = getByRole("link", { name: "Pipeline" });
    expect(link.getAttribute("href")).toBe("/explore/concepts/pipeline");
    expect(getByText("published", { selector: "span" })).toBeTruthy();
    expect(getByText("sales").getAttribute("href")).toBe("/explore/domains/sales");
  });

  test("/explore/concepts/:key detail renders relations, backlinks, neighborhood", async () => {
    const client = stubUrql({
      Concept: { concept: CONCEPT_NODE },
      KnowledgeItems: {
        knowledgeItems: {
          nodes: [{ key: "base", title: "Pipeline Guide" }],
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: 1,
        },
      },
      Skills: { skills: { nodes: [], totalCount: 0 } },
      Tools: { tools: { nodes: [], totalCount: 0 } },
      PromptFragments: { promptFragments: { nodes: [], totalCount: 0 } },
      Neighborhood: {
        ontologyNeighborhood: {
          center: {
            id: "c1",
            key: "pipeline",
            name: "Pipeline",
            type: "entity",
            status: "PUBLISHED",
          },
          concepts: [{ id: "c2", key: "other", name: "Other", type: null, status: "PUBLISHED" }],
          relations: [
            {
              id: "r1",
              type: { key: "affects", name: "Affects" },
              sourceConcept: { id: "c1", key: "pipeline", name: "Pipeline" },
              targetConcept: { id: "c2", key: "other", name: "Other" },
            },
          ],
          chunks: [],
        },
      },
    });
    const { findByText, findAllByText, getByText } = await renderRoute(
      "/explore/concepts/pipeline",
      client,
    );
    expect((await findAllByText("Pipeline")).length).toBeGreaterThan(0);
    expect(await findByText("Outgoing relations (1)")).toBeTruthy();
    expect(await findByText("sales pipeline")).toBeTruthy();
    // Backlink cards render counts + item links.
    expect(await findByText("knowledge (1)")).toBeTruthy();
    expect(await findByText("Pipeline Guide")).toBeTruthy();
    // Neighborhood panel resolves its own query and renders the fallback table.
    expect(await findByText("Ontology neighborhood")).toBeTruthy();
    expect(getByText("show linked chunks (0)")).toBeTruthy();
    // Relation-type filter options derive from the concept's edges.
    expect(getByText("affects", { selector: "label > code" })).toBeTruthy();
  });

  test("loader error propagates rather than rendering an empty page", async () => {
    const client = stubUrql({}); // unstubbed → error
    const { findAllByText } = await renderRoute("/explore/concepts", client);
    const errs = await findAllByText(/stubUrql: no response for operation "Concepts"/);
    expect(errs.length).toBeGreaterThan(0);
  });
});
