import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, Pager, StatusBadge } from "../components/ui";
import { FRAGMENTS } from "../lib/api";
import { browseSearch } from "../lib/list";

export const Route = createFileRoute("/assembly/fragments/")({
  validateSearch: browseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const input: Record<string, unknown> = { first: 50 };
    if (deps.search) input.search = deps.search;
    if (deps.status) input.status = deps.status;
    if (deps.concept) input.concept = deps.concept;
    if (deps.after) input.after = deps.after;
    const res = await context.urql.query(FRAGMENTS, { input }).toPromise();
    if (res.error) throw res.error;
    return (
      res.data ?? {
        promptFragments: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: null,
        },
      }
    );
  },
  component: FragmentsPage,
});

function FragmentsPage() {
  const d = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Prompt Fragments" subtitle="authored prompt sections" />
      <DataTable
        rows={d.promptFragments.nodes}
        keyOf={(f) => f.id}
        cols={[
          {
            key: "name",
            header: "name",
            cell: (f) => (
              <Link
                to="/assembly/fragments/$key"
                search={{}}
                params={{ key: f.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {f.name}
              </Link>
            ),
          },
          {
            key: "section",
            header: "section",
            cell: (f) => <code className="text-xs">{f.section}</code>,
          },
          { key: "order", header: "order", cell: (f) => f.order },
          {
            key: "mode",
            header: "inclusion",
            cell: (f) => <code className="text-xs">{f.inclusionMode.toLowerCase()}</code>,
          },
          { key: "prio", header: "priority", cell: (f) => f.priority },
          {
            key: "group",
            header: "group",
            cell: (f) =>
              f.selectionGroup ? <code className="text-xs">{f.selectionGroup.key}</code> : "—",
          },
          { key: "status", header: "status", cell: (f) => <StatusBadge status={f.status} /> },
        ]}
      />
      <Pager pageInfo={d.promptFragments.pageInfo} total={d.promptFragments.totalCount} />
    </>
  );
}
