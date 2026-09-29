import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { CodeEditor } from "./code-editor";

afterEach(cleanup);

describe("CodeEditor", () => {
  test("mounts a CodeMirror editor client-side with the initial doc", async () => {
    const { container } = render(
      <CodeEditor value={"query { runtimeInfo { environment } }"} onChange={() => {}} />,
    );
    // EditorView mounts in an effect — wait a tick for it to appear.
    await new Promise((r) => setTimeout(r, 0));
    const cm = container.querySelector(".cm-editor");
    expect(cm).toBeTruthy();
    expect(cm?.textContent).toContain("runtimeInfo");
  });
});
