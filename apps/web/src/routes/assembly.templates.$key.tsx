import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { JsonBlock, PageHeader, Section, SourceLink, StatusBadge } from "../components/ui";
import { TEMPLATE } from "../lib/api";

export const Route = createFileRoute("/assembly/templates/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(TEMPLATE, { ref: { key: params.key } }).toPromise();
    if (res.error) throw res.error;
    const t = res.data?.agentTemplate;
    if (!t) throw new Response("not found", { status: 404 });
    return t;
  },
  component: TemplatePage,
});

function TemplatePage() {
  const t = Route.useLoaderData();
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
            <code>{t.key}</code> · profile <code>{t.retrievalProfile?.key ?? "default"}</code> ·{" "}
            file: <SourceLink source={t.source} />
          </>
        }
      />
      {t.description ? (
        <p className="mb-4 max-w-3xl text-sm text-zinc-600">{t.description}</p>
      ) : null}
      <Section title="Budgets">
        <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 text-sm md:grid-cols-4">
          {(
            [
              ["max skills", t.budgets.maxSkills],
              ["max tools", t.budgets.maxTools],
              ["prompt tokens", t.budgets.promptTokens],
              ["bootstrap tokens", t.budgets.bootstrapKnowledgeTokens],
            ] as [string, number | null][]
          ).map(([k, v]) => (
            <div key={k} className="border-b border-zinc-100 py-1">
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="font-mono text-xs">{v ?? "unbounded"}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title={`Prompt fragments (${t.promptFragments.length})`}>
        <DataTable
          rows={[...t.promptFragments].sort(
            (a, b) => a.section.localeCompare(b.section) || a.order - b.order,
          )}
          keyOf={(f) => f.id}
          cols={[
            {
              key: "section",
              header: "section",
              cell: (f) => <code className="text-xs">{f.section}</code>,
            },
            { key: "order", header: "order", cell: (f) => f.order },
            {
              key: "name",
              header: "fragment",
              cell: (f) => <EntityLinkFrag f={f} />,
            },
            {
              key: "mode",
              header: "inclusion",
              cell: (f) => <code className="text-xs">{f.inclusionMode.toLowerCase()}</code>,
            },
            { key: "status", header: "status", cell: (f) => <StatusBadge status={f.status} /> },
          ]}
        />
      </Section>
      <Section title="Metadata">
        <JsonBlock value={t.metadata} />
      </Section>
      <p className="mt-2 text-xs text-zinc-400">
        Run this template in the{" "}
        <Link to="/playground/assembly" search={{}} className="text-blue-700 hover:underline">
          assembly playground
        </Link>
        .
      </p>
    </>
  );
}

function EntityLinkFrag({ f }: { f: { key: string; name: string } }) {
  return (
    <Link
      to="/assembly/fragments/$key"
      search={{}}
      params={{ key: f.key }}
      className="font-medium text-blue-700 hover:underline"
    >
      {f.name}
    </Link>
  );
}
