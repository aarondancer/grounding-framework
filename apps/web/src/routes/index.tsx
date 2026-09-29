import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Section } from "../components/ui";
import { OVERVIEW } from "../lib/api";

export const Route = createFileRoute("/")({
  loader: async ({ context }) => {
    const res = await context.urql.query(OVERVIEW, {}).toPromise();
    if (res.error) throw res.error;
    if (!res.data) throw new Response("no data", { status: 500 });
    return res.data;
  },
  component: OverviewPage,
});

function OverviewPage() {
  const d = Route.useLoaderData();
  const ri = d.runtimeInfo;
  const stats: { label: string; count: number | null; to: string }[] = [
    { label: "concepts", count: d.concepts.totalCount, to: "/explore/concepts" },
    { label: "knowledge items", count: d.knowledgeItems.totalCount, to: "/explore/knowledge" },
    { label: "domains", count: d.domains.totalCount, to: "/explore/domains" },
    { label: "dimensions", count: d.dimensions.length, to: "/explore/dimensions" },
    {
      label: "selection groups",
      count: d.selectionGroups.length,
      to: "/explore/selection-groups",
    },
    { label: "agent templates", count: d.agentTemplates.length, to: "/assembly/templates" },
    { label: "skills", count: d.skills.totalCount, to: "/assembly/skills" },
    { label: "tools", count: d.tools.totalCount, to: "/assembly/tools" },
    { label: "prompt fragments", count: d.promptFragments.totalCount, to: "/assembly/fragments" },
  ];
  return (
    <>
      <PageHeader title="Overview" subtitle={`namespace ${ri.namespace.key} · ${ri.environment}`} />
      <Section title="Runtime">
        <dl className="grid max-w-xl grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {(
            [
              ["runtime revision", ri.runtimeRevision],
              ["git commit", ri.gitCommit ?? "—"],
              ["source hash", ri.sourceHash.slice(0, 12)],
              ["compiler", ri.compilerVersion ?? "—"],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-zinc-100 py-1">
              <dt className="text-zinc-500">{k}</dt>
              <dd className="font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      <Section title="Corpus">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {stats.map((s) => (
            <Link
              key={s.label}
              to={s.to}
              className="rounded border border-zinc-200 bg-white p-3 hover:border-zinc-400"
            >
              <div className="text-2xl font-semibold">{s.count ?? "—"}</div>
              <div className="text-xs text-zinc-500">{s.label}</div>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
