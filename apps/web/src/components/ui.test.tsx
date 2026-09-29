import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";
import { MarkdownBlock, StatusBadge } from "./ui";

afterEach(cleanup);

describe("StatusBadge", () => {
  test("renders the lifecycle status label", () => {
    const { getByText } = render(<StatusBadge status="PUBLISHED" />);
    expect(getByText("published")).toBeTruthy();
  });
});

describe("MarkdownBlock", () => {
  test("renders markdown structure", () => {
    const { container } = render(<MarkdownBlock content={"# Title\n\nsome **bold** text"} />);
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelector("strong")?.textContent).toBe("bold");
  });

  test("does not render raw HTML (no rehype-raw, spec/15)", () => {
    const { container } = render(
      <MarkdownBlock content={'safe text <img src="x" onerror="alert(1)">'} />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("safe text");
  });
});
