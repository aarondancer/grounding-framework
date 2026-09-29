import "../test-setup";
import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { Graph, layout } from "./graph";

afterEach(cleanup);

describe("Graph (React Flow + Dagre)", () => {
  const nodes = [
    { id: "a", label: "Alpha", sub: "concept", accent: "center" as const },
    { id: "b", label: "Beta", accent: "warn" as const },
    { id: "c", label: "Gamma", accent: "selected" as const },
  ];
  const edges = [
    { id: "e1", source: "a", target: "b", label: "affects" },
    { id: "e2", source: "a", target: "c", dashed: true },
  ];

  test("renders every node label + sub; accent classes applied", () => {
    const { container, getByText } = render(<Graph nodes={nodes} edges={edges} />);
    expect(container.querySelectorAll(".react-flow__node").length).toBe(3);
    expect(getByText("Alpha")).toBeTruthy();
    expect(getByText("concept")).toBeTruthy();
    expect(container.querySelector(".gnode-center")).toBeTruthy();
    expect(container.querySelector(".gnode-warn")).toBeTruthy();
    expect(container.querySelector(".gnode-selected")).toBeTruthy();
  });

  test("layout assigns LR positions and maps edge labels + dash style", () => {
    // React Flow doesn't render edges until nodes are measured via
    // ResizeObserver — unavailable under happy-dom — so edge mapping is
    // asserted on the pure layout seam.
    const { nodes: ln, edges: le } = layout(nodes, edges);
    const a = ln.find((n) => n.id === "a");
    const b = ln.find((n) => n.id === "b");
    expect(a && b && a.position.x < b.position.x).toBe(true); // rankdir: LR
    expect(le[0]?.label).toBe("affects");
    expect(le[0]?.markerEnd).toBeTruthy();
    expect(le[1]?.style).toEqual({ strokeDasharray: "5 4" });
    expect(ln.find((n) => n.id === "a")?.className).toBe("gnode-center");
  });

  test("node click reports the node id", () => {
    const seen: string[] = [];
    const { container } = render(
      <Graph nodes={nodes} edges={edges} onNodeClick={(id) => seen.push(id)} />,
    );
    const nodeEl = container.querySelector('.react-flow__node[data-id="b"]');
    expect(nodeEl).toBeTruthy();
    fireEvent.click(nodeEl as Element);
    expect(seen).toEqual(["b"]);
  });
});
