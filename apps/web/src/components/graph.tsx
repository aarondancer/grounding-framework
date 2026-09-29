import Dagre from "@dagrejs/dagre";
import {
  Background,
  Controls,
  type Edge,
  MarkerType,
  type Node,
  type NodeMouseHandler,
  ReactFlow,
} from "@xyflow/react";
import { useMemo } from "react";

/**
 * React Flow + Dagre foundation (spec/10): deterministic left-to-right
 * layout for local neighborhoods and tool dependency graphs. Every graph
 * view is paired with a tabular fallback by the caller.
 */
export type GraphNode = {
  id: string;
  label: string;
  sub?: string | undefined;
  accent?: "center" | "warn" | "selected" | undefined;
};
export type GraphEdge = {
  id: string;
  source: string;
  target: string;
  label?: string | undefined;
  dashed?: boolean | undefined;
};

const W = 190;
const H = 56;

function layout(nodes: GraphNode[], edges: GraphEdge[]): { nodes: Node[]; edges: Edge[] } {
  const g = new Dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", nodesep: 30, ranksep: 90 });
  for (const n of nodes) g.setNode(n.id, { width: W, height: H });
  for (const e of edges) g.setEdge(e.source, e.target);
  Dagre.layout(g);
  return {
    nodes: nodes.map((n) => {
      const p = g.node(n.id);
      return {
        id: n.id,
        position: { x: p.x - W / 2, y: p.y - H / 2 },
        data: {
          label: (
            <>
              <div className="text-[11px] font-medium leading-tight">{n.label}</div>
              {n.sub ? (
                <div className="font-mono text-[9px] leading-tight text-zinc-400">{n.sub}</div>
              ) : null}
            </>
          ),
        },
        className:
          n.accent === "center"
            ? "gnode-center"
            : n.accent === "warn"
              ? "gnode-warn"
              : n.accent === "selected"
                ? "gnode-selected"
                : "gnode",
        type: "default",
      };
    }),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      animated: false,
      ...(e.dashed ? { style: { strokeDasharray: "5 4" } } : {}),
      markerEnd: { type: MarkerType.ArrowClosed },
    })),
  };
}

export function Graph({
  nodes,
  edges,
  onNodeClick,
  height = 420,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  onNodeClick?: (id: string) => void;
  height?: number;
}) {
  const positioned = useMemo(() => layout(nodes, edges), [nodes, edges]);
  return (
    <div style={{ height }} className="rounded border border-zinc-200 bg-white">
      <ReactFlow
        nodes={positioned.nodes}
        edges={positioned.edges}
        {...(onNodeClick
          ? { onNodeClick: ((_e: unknown, node: Node) => onNodeClick(node.id)) as NodeMouseHandler }
          : {})}
        fitView
        nodesConnectable={false}
        edgesFocusable={false}
      >
        <Background gap={16} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
