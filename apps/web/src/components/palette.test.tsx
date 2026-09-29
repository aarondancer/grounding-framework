import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup } from "@testing-library/react";
import { Provider as UrqlProvider } from "urql";
import { renderWithRouter, setTextInput, stubUrql } from "../test-harness";
import { CommandPalette } from "./palette";

afterEach(cleanup);

const SEARCH_DATA = {
  concepts: { nodes: [{ key: "pipeline", name: "Pipeline" }] },
  knowledgeItems: { nodes: [{ key: "guide", title: "Pipefitting Guide" }] },
  domains: { nodes: [{ key: "sales", name: "Sales" }] },
  skills: { nodes: [] },
  tools: { nodes: [] },
  promptFragments: { nodes: [] },
  agentTemplates: [{ key: "pipe-auditor", name: "Pipe Auditor" }],
  selectionGroups: [{ key: "other-sg", name: "Other SG" }],
  dimensions: [{ key: "pipe-dim", name: "Pipe Dim" }],
  retrievalProfiles: [{ key: "default", name: "Default" }],
  namespace: { key: "m5", name: "M5" },
};

const EMPTY_DATA = {
  concepts: { nodes: [] },
  knowledgeItems: { nodes: [] },
  domains: { nodes: [] },
  skills: { nodes: [] },
  tools: { nodes: [] },
  promptFragments: { nodes: [] },
  agentTemplates: [],
  selectionGroups: [],
  dimensions: [],
  retrievalProfiles: [],
  namespace: null,
};

function mount(data: unknown = SEARCH_DATA) {
  const client = stubUrql({ GlobalSearch: data });
  return renderWithRouter(
    <UrqlProvider value={client}>
      <CommandPalette open={true} onClose={() => {}} />
    </UrqlProvider>,
  );
}

describe("CommandPalette", () => {
  test("searches all browse collections, filters keyed-only lists client-side", async () => {
    const { findByPlaceholderText, findByText, getByText, queryByText } = await mount();
    const input = await findByPlaceholderText(/Search concepts/);
    await setTextInput(input, "pipe");
    // findBy* polls past the 150ms debounce + stub query resolution.
    expect(await findByText("Pipeline")).toBeTruthy();
    expect(getByText("Pipefitting Guide")).toBeTruthy();
    expect(getByText("Pipe Auditor")).toBeTruthy();
    expect(getByText("Pipe Dim")).toBeTruthy();
    // Non-matching keyed-only rows are filtered out.
    expect(queryByText("Other SG")).toBeNull();
    // Namespace doesn't match "pipe" — not surfaced.
    expect(queryByText("M5")).toBeNull();
  });

  test("no matches shows the empty state", async () => {
    const { findByPlaceholderText, findByText } = await mount(EMPTY_DATA);
    const input = await findByPlaceholderText(/Search concepts/);
    await setTextInput(input, "zzz-no-match");
    expect(await findByText("No matches")).toBeTruthy();
  });
});
