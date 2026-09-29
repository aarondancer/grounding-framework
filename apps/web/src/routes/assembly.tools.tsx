import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, Pager, StatusBadge } from "../components/ui";
import { TOOLS } from "../lib/api";
import { browseSearch } from "../lib/list";

export const Route = createFileRoute("/assembly/tools")({
  validateSearch: browseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const input: Record<string, unknown> = { first: 50 };
    if (deps.search) input.search = deps.search;
    if (deps.status) input.status = deps.status;
    if (deps.concept) input.concept = deps.concept;
    if (deps.after) input.after = deps.after;
    const res = await context.urql.query(TOOLS, { input }).toPromise();
    if (res.error) throw res.error;
    return (
      res.data ?? {
        tools: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: null },
      }
    );
  },
  component: ToolsPage,
});

function ToolsPage() {
  const d = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Tools" subtitle="runtime-bound capabilities" />
      <DataTable
        rows={d.tools.nodes}
        keyOf={(t) => t.id}
        cols={[
          {
            key: "name",
            header: "name",
            cell: (t) => (
              <Link
                to="/assembly/tools/$key"
                search={{}}
                params={{ key: t.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {t.name}
              </Link>
            ),
          },
          { key: "key", header: "key", cell: (t) => <code className="text-xs">{t.key}</code> },
          {
            key: "binding",
            header: "binding",
            cell: (t) => <code className="text-xs">{t.runtimeBinding}</code>,
          },
          { key: "risk", header: "risk", cell: (t) => t.risk?.toLowerCase() ?? "—" },
          { key: "lat", header: "latency", cell: (t) => t.latency?.toLowerCase() ?? "—" },
          {
            key: "group",
            header: "selection group",
            cell: (t) =>
              t.selectionGroup ? <code className="text-xs">{t.selectionGroup.key}</code> : "—",
          },
          { key: "status", header: "status", cell: (t) => <StatusBadge status={t.status} /> },
        ]}
      />
      <Pager pageInfo={d.tools.pageInfo} total={d.tools.totalCount} />
    </>
  );
}
