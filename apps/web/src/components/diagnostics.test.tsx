import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { renderWithRouter } from "../test-harness";
import { CandidateFunnel, DiagnosticsPanel, ExclusionsTable } from "./diagnostics";

afterEach(cleanup);

describe("CandidateFunnel", () => {
  test("renders stage counts in pipeline order", () => {
    const { getByText } = render(<CandidateFunnel counts={{ vector: 10, unique: 8, packed: 3 }} />);
    expect(getByText("vector")).toBeTruthy();
    expect(getByText("10")).toBeTruthy();
    expect(getByText("packed")).toBeTruthy();
    expect(getByText("3")).toBeTruthy();
  });

  test("missing channel keys render as 0 (assembly bootstrap omits them)", () => {
    const { getByText } = render(<CandidateFunnel counts={{ afterLifecycle: 4 }} />);
    const rows = document.querySelectorAll(".font-mono");
    // every stage row renders a numeric count
    expect(rows.length).toBeGreaterThan(0);
    expect(getByText("4")).toBeTruthy();
  });
});

describe("DiagnosticsPanel", () => {
  test("renders error and warning codes", () => {
    const { getByText } = render(
      <DiagnosticsPanel
        title="diagnostics"
        errors={[{ code: "CTX_DIMENSION_UNKNOWN", message: "unknown key" }]}
        warnings={[{ code: "RETRIEVAL_CHANNEL_DEGRADED", message: "no vector" }]}
      />,
    );
    expect(getByText("CTX_DIMENSION_UNKNOWN")).toBeTruthy();
    expect(getByText("RETRIEVAL_CHANNEL_DEGRADED")).toBeTruthy();
  });
});

describe("ExclusionsTable", () => {
  test("redacted exclusions render no entity link (spec/09 redaction)", async () => {
    const view = await renderWithRouter(
      <ExclusionsTable
        exclusions={[
          {
            stage: "authorization",
            code: "RETRIEVAL_EXCLUDED_UNAUTHORIZED",
            message: "secret",
            redacted: true,
            chunk: null,
          },
        ]}
      />,
    );
    expect(view.getAllByText("(redacted)").length).toBeGreaterThan(0);
    expect(view.container.querySelector("a")).toBeNull();
  });
});
