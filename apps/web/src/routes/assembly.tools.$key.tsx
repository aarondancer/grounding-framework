import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { GatesPanel } from "../components/gates";
import { Graph, type GraphEdge, type GraphNode } from "../components/graph";
import { DataTable } from "../components/table";
import {
  EntityLink,
  JsonBlock,
  PageHeader,
  Section,
  SourceLink,
  StatusBadge,
} from "../components/ui";
import { TOOL } from "../lib/api";

export const Route = createFileRoute("/assembly/tools/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(TOOL, { ref: { key: params.key } }).toPromise();
    if (res.error) throw res.error;
    const t = res.data?.tool;
    if (!t) throw new Response("not found", { status: 404 });
    return t;
  },
  component: ToolPage,
});

function ToolPage() {
  const t = Route.useLoaderData();
  const navigate = useNavigate();

  const graph = useMemo(() => {
    const nodes: GraphNode[] = [{ id: t.id, label: t.name, sub: t.key, accent: "center" }];
    const edges: GraphEdge[] = [];
    const seen = new Set([t.id]);
    for (const d of t.dependencies) {
      const o = d.targetTool;
      if (!seen.has(o.id)) {
        seen.add(o.id);
        nodes.push({ id: o.id, label: o.name, sub: o.key });
      }
      edges.push({
        id: `dep-${t.id}-${o.id}`,
        source: t.id,
        target: o.id,
        label: d.requirement.toLowerCase(),
        dashed: d.requirement === "OPTIONAL",
      });
    }
    for (const d of t.dependents) {
      const o = d.sourceTool;
      if (!seen.has(o.id)) {
        seen.add(o.id);
        nodes.push({ id: o.id, label: o.name, sub: o.key });
      }
      edges.push({
        id: `rev-${o.id}-${t.id}`,
        source: o.id,
        target: t.id,
        label: `${d.requirement.toLowerCase()} (reverse)`,
        dashed: d.requirement === "OPTIONAL",
      });
    }
    return { nodes, edges };
  }, [t]);

  const toolById = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of t.dependencies) m.set(d.targetTool.id, d.targetTool.key);
    for (const d of t.dependents) m.set(d.sourceTool.id, d.sourceTool.key);
    return m;
  }, [t]);

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {t.name} <StatusBadge status={t.status} />
          </span>
        }
        subtitle={
          <>
            <code>{t.key}</code> · binding <code>{t.runtimeBinding}</code>
            {t.risk ? ` · ${t.risk.toLowerCase()} risk` : ""}
            {t.latency ? ` · ${t.latency.toLowerCase()}` : ""} · file:{" "}
            <SourceLink source={t.source} />
          </>
        }
      />
      <p className="mb-4 max-w-3xl text-sm text-zinc-600">{t.description}</p>
      <Section title="Dependency graph (local)">
        {t.dependencies.length + t.dependents.length === 0 ? (
          <p className="text-sm text-zinc-400">No dependencies or dependents.</p>
        ) : (
          <>
            <Graph
              nodes={graph.nodes}
              edges={graph.edges}
              onNodeClick={(id) => {
                const key = toolById.get(id);
                if (key) navigate({ to: "/assembly/tools/$key", params: { key }, search: {} });
              }}
              height={300}
            />
            <div className="mt-3 grid gap-4 lg:grid-cols-2">
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-500">requires</h4>
                <DataTable
                  rows={t.dependencies}
                  keyOf={(d) => d.targetTool.id}
                  cols={[
                    {
                      key: "t",
                      header: "tool",
                      cell: (d) => (
                        <EntityLink type="tool" entityKey={d.targetTool.key}>
                          {d.targetTool.name}
                        </EntityLink>
                      ),
                    },
                    {
                      key: "r",
                      header: "requirement",
                      cell: (d) => <code className="text-xs">{d.requirement.toLowerCase()}</code>,
                    },
                    {
                      key: "s",
                      header: "status",
                      cell: (d) => <StatusBadge status={d.targetTool.status} />,
                    },
                  ]}
                />
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-500">required by</h4>
                <DataTable
                  rows={t.dependents}
                  keyOf={(d) => d.sourceTool.id}
                  cols={[
                    {
                      key: "t",
                      header: "tool",
                      cell: (d) => (
                        <EntityLink type="tool" entityKey={d.sourceTool.key}>
                          {d.sourceTool.name}
                        </EntityLink>
                      ),
                    },
                    {
                      key: "r",
                      header: "requirement",
                      cell: (d) => <code className="text-xs">{d.requirement.toLowerCase()}</code>,
                    },
                    {
                      key: "s",
                      header: "status",
                      cell: (d) => <StatusBadge status={d.sourceTool.status} />,
                    },
                  ]}
                />
              </div>
            </div>
          </>
        )}
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Concepts (${t.concepts.length})`}>
          <span className="flex flex-wrap gap-1">
            {t.concepts.map((c) => (
              <EntityLink key={c.id} type="concept" entityKey={c.key}>
                {c.name}
              </EntityLink>
            ))}
          </span>
        </Section>
        {t.selectionGroup ? (
          <Section title="Selection group">
            <EntityLink type="selection_group" entityKey={t.selectionGroup.key}>
              {t.selectionGroup.key}
            </EntityLink>
          </Section>
        ) : null}
      </div>
      <Section title={`Used by skills (${t.usedBy.length})`}>
        <span className="flex flex-wrap gap-1">
          {t.usedBy.map((u) => (
            <EntityLink key={u.id} type={u.type} entityKey={u.key}>
              {u.key}
            </EntityLink>
          ))}
          {t.usedBy.length === 0 ? (
            <span className="text-xs text-zinc-400">no skills declare this tool</span>
          ) : null}
        </span>
      </Section>
      <GatesPanel entityId={t.id} authorization={t.authorization} applicability={t.applicability} />
      <div className="grid gap-6 lg:grid-cols-2">
        {t.inputSchema != null ? <JsonBlock value={t.inputSchema} title="input schema" /> : null}
        {t.outputSchema != null ? <JsonBlock value={t.outputSchema} title="output schema" /> : null}
      </div>
      <Section title="Metadata">
        <JsonBlock value={t.metadata} />
      </Section>
    </>
  );
}
