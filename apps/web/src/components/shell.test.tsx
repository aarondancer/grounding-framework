import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent } from "@testing-library/react";
import { Provider as ReduxProvider } from "react-redux";
import { Provider as UrqlProvider } from "urql";
import { createAppStore } from "../lib/store";
import { renderWithRouter, stubUrql } from "../test-harness";
import { Shell } from "./shell";

afterEach(cleanup);

function mount() {
  const client = stubUrql({});
  return renderWithRouter(
    <UrqlProvider value={client}>
      <ReduxProvider store={createAppStore()}>
        <Shell>
          <div>page body</div>
        </Shell>
      </ReduxProvider>
    </UrqlProvider>,
  );
}

describe("Shell", () => {
  test("renders nav groups, breadcrumb root, context strip, and children", async () => {
    const { findByText, getByText } = await mount();
    expect(await findByText("Grounding Explorer")).toBeTruthy();
    expect(getByText("read-only")).toBeTruthy();
    // Root breadcrumb + section nav from lib/nav.ts.
    expect(getByText("grounding")).toBeTruthy();
    for (const label of [
      "Concepts & Ontology",
      "Knowledge",
      "Dimensions",
      "Prompt Fragments",
      "Runtime",
    ]) {
      expect(getByText(label)).toBeTruthy();
    }
    // Empty simulated context renders ∅.
    expect(getByText(/ctx:/).textContent).toContain("∅");
    expect(getByText("page body")).toBeTruthy();
  });

  test("Search button opens the command palette", async () => {
    const { findByText, findByPlaceholderText } = await mount();
    fireEvent.click(await findByText(/Search ⌘K/));
    expect(await findByPlaceholderText(/Search concepts/)).toBeTruthy();
  });
});
