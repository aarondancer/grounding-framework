import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { Provider as ReduxProvider } from "react-redux";
import type { Client } from "urql";
import { Provider as UrqlProvider } from "urql";
import { createAppStore } from "../lib/store";
import { GatesPanel } from "./gates";

afterEach(cleanup);

function mount(ui: React.ReactElement, gateResult?: unknown) {
  const store = createAppStore();
  // Stub client — GatesPanel only uses client.query().toPromise().
  const client = {
    query: () => ({
      toPromise: async () => ({ data: { simulateGates: gateResult }, error: undefined }),
    }),
  } as unknown as Client;
  return render(
    <UrqlProvider value={client}>
      <ReduxProvider store={store}>{ui}</ReduxProvider>
    </UrqlProvider>,
  );
}

describe("GatesPanel", () => {
  test("renders nothing for ungated entities (no wasted simulateGates query)", () => {
    const { container } = mount(
      <GatesPanel entityId="e1" authorization={null} applicability={null} />,
    );
    expect(container.querySelector("section")).toBeNull();
  });

  test("renders gate expression + simulated outcome under context", async () => {
    const { findByText } = mount(
      <GatesPanel
        entityId="e1"
        authorization={{ dimension: "roles", operator: "includes", value: "manager" }}
        applicability={null}
      />,
      {
        entity: { type: "knowledge_item", id: "e1", key: "doc" },
        authorization: { state: "TRUE", eligible: true, specificity: null, diagnostics: [] },
        applicability: null,
      },
    );
    expect(await findByText(/passes under ctx/)).toBeTruthy();
  });
});
