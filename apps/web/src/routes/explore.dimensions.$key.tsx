import { createFileRoute } from "@tanstack/react-router";
import { type ReactElement, useMemo } from "react";
import { DimensionControl } from "../components/dimension-control";
import { EntityLink, PageHeader, Section, SourceLink } from "../components/ui";
import type { DimensionQuery } from "../generated/operations";
import { DIMENSION } from "../lib/api";
import { entityLinkKey } from "../lib/nav";

type DimVal = NonNullable<DimensionQuery["dimension"]>["values"]["nodes"][number];

export const Route = createFileRoute("/explore/dimensions/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(DIMENSION, { ref: { key: params.key } }).toPromise();
    if (res.error) throw res.error;
    const dim = res.data?.dimension;
    if (!dim) throw new Response("not found", { status: 404 });
    // Values are authored vocabularies — follow the connection to the end so
    // the hierarchy tree is complete regardless of page size (spec/09).
    const nodes = [...dim.values.nodes];
    let { hasNextPage, endCursor } = dim.values.pageInfo;
    while (hasNextPage) {
      const more = await context.urql
        .query(DIMENSION, { ref: { key: params.key }, valuesAfter: endCursor })
        .toPromise();
      if (more.error) throw more.error;
      const page = more.data?.dimension?.values;
      if (!page) break;
      nodes.push(...page.nodes);
      hasNextPage = page.pageInfo.hasNextPage;
      endCursor = page.pageInfo.endCursor;
    }
    return { ...dim, values: { ...dim.values, nodes } };
  },
  component: DimensionPage,
});

/** Hierarchy tree built from parent links (spec/10: render as trees). */
function ValueTree({ values }: { values: DimVal[] }) {
  const tree = useMemo(() => {
    const roots = values.filter((v) => !v.parent || !values.some((p) => p.id === v.parent?.id));
    const kidsOf = (id: string) => values.filter((v) => v.parent?.id === id);
    const render = (v: DimVal, depth: number): ReactElement => (
      <li key={v.id}>
        <span className="font-mono text-xs" style={{ paddingLeft: depth * 14 }}>
          {"—".repeat(depth > 0 ? 1 : 0)} {v.key}{" "}
          {v.name ? <span className="text-zinc-400">{v.name}</span> : null}
        </span>
        {kidsOf(v.id).length > 0 ? <ul>{kidsOf(v.id).map((c) => render(c, depth + 1))}</ul> : null}
      </li>
    );
    return <ul className="space-y-0.5">{roots.map((r) => render(r, 0))}</ul>;
  }, [values]);
  if (values.length === 0) return <p className="text-sm text-zinc-400">No registered values.</p>;
  return tree;
}

function DimensionPage() {
  const d = Route.useLoaderData();
  return (
    <>
      <PageHeader title={d.name} subtitle={<code>{d.key}</code>} />
      {d.description ? (
        <p className="mb-4 max-w-3xl text-sm text-zinc-600">{d.description}</p>
      ) : null}
      <dl className="mb-4 grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-3">
        {(
          [
            ["value type", `${d.valueType} / ${d.cardinality}`],
            ["category", d.category],
            ["trust", d.trust],
            ["required", String(d.required)],
            ["hierarchical", String(d.hierarchical)],
            ["missing →", d.missingValueBehavior],
            ["operators", d.allowedOperators.join(", ")],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="border-b border-zinc-100 py-1">
            <dt className="text-xs text-zinc-500">{k}</dt>
            <dd className="font-mono text-xs">{v}</dd>
          </div>
        ))}
      </dl>
      <div className="mb-6 max-w-md">
        <h3 className="mb-1 text-xs font-semibold text-zinc-500">simulated context value</h3>
        <DimensionControl dim={d} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Values (${d.values.totalCount ?? d.values.nodes.length})`}>
          <ValueTree values={d.values.nodes} />
        </Section>
        <Section title={`Used by (${d.usedBy.length})`}>
          {d.usedBy.length === 0 ? (
            <p className="text-sm text-zinc-400">No gate expressions reference this dimension.</p>
          ) : (
            <ul className="space-y-1">
              {d.usedBy.map((u) => (
                <li key={`${u.entity.id}:${u.kind}`} className="flex items-center gap-2 text-sm">
                  <EntityLink type={u.entity.type} entityKey={entityLinkKey(u.entity)}>
                    {u.entity.key}
                  </EntityLink>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    {u.kind.toLowerCase()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
      <div className="mb-6 text-xs text-zinc-500">
        file: <SourceLink source={d.source} />
      </div>
    </>
  );
}
