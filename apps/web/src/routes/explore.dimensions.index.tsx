import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { DimensionControl } from "../components/dimension-control";
import { DataTable } from "../components/table";
import { PageHeader, Section } from "../components/ui";
import type { DimensionsQuery } from "../generated/operations";
import { DIMENSIONS } from "../lib/api";
import { useSimulatedContext } from "../lib/sim-context";

export type Dim = DimensionsQuery["dimensions"][number];

export const Route = createFileRoute("/explore/dimensions/")({
  loader: async ({ context }) => {
    const res = await context.urql.query(DIMENSIONS, {}).toPromise();
    if (res.error) throw res.error;
    return res.data?.dimensions ?? [];
  },
  component: DimensionsPage,
});

function DimensionsPage() {
  const dims = Route.useLoaderData();
  const { context, clear } = useSimulatedContext();
  const byCategory = useMemo(() => {
    const m = new Map<string, Dim[]>();
    for (const d of dims) {
      const list = m.get(d.category) ?? [];
      list.push(d);
      m.set(d.category, list);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [dims]);
  return (
    <>
      <PageHeader
        title="Dimensions"
        subtitle="context dimensions and the persistent simulated context"
      >
        <button
          type="button"
          onClick={clear}
          className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-100"
        >
          clear simulated context ({Object.keys(context).length})
        </button>
      </PageHeader>
      {byCategory.map(([cat, list]) => (
        <Section key={cat} title={cat}>
          <DataTable
            rows={list}
            keyOf={(d) => d.id}
            cols={[
              {
                key: "name",
                header: "dimension",
                cell: (d) => (
                  <div>
                    <Link
                      to="/explore/dimensions/$key"
                      search={{}}
                      params={{ key: d.key }}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {d.name}
                    </Link>
                    <div className="font-mono text-[10px] text-zinc-400">
                      {d.key} · {d.valueType}/{d.cardinality}
                      {d.required ? " · required" : ""}
                      {d.trust === "server" ? " · server" : ""}
                    </div>
                  </div>
                ),
              },
              {
                key: "used",
                header: "used by",
                cell: (d) =>
                  d.usedBy.length > 0 ? (
                    <span className="font-mono text-xs">{d.usedBy.length} gates</span>
                  ) : (
                    <span className="text-xs text-zinc-400">—</span>
                  ),
              },
              {
                key: "sim",
                header: "simulated context value",
                cell: (d) => <DimensionControl dim={d} />,
              },
            ]}
          />
        </Section>
      ))}
    </>
  );
}
