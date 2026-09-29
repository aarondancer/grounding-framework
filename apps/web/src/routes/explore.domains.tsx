import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, Pager, SourceLink } from "../components/ui";
import { DOMAINS } from "../lib/api";
import { browseSearch } from "../lib/list";

export const Route = createFileRoute("/explore/domains")({
  validateSearch: browseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const input: Record<string, unknown> = { first: 100 };
    if (deps.search) input.search = deps.search;
    if (deps.after) input.after = deps.after;
    const res = await context.urql.query(DOMAINS, { input }).toPromise();
    if (res.error) throw res.error;
    return (
      res.data ?? {
        domains: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: null },
      }
    );
  },
  component: DomainsPage,
});

function DomainsPage() {
  const d = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Domains" subtitle="concept grouping boundaries" />
      <DataTable
        rows={d.domains.nodes}
        keyOf={(x) => x.id}
        cols={[
          {
            key: "name",
            header: "name",
            cell: (x) => (
              <Link
                to="/explore/domains/$key"
                search={{}}
                params={{ key: x.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {x.name}
              </Link>
            ),
          },
          { key: "key", header: "key", cell: (x) => <code className="text-xs">{x.key}</code> },
          {
            key: "desc",
            header: "description",
            cell: (x) => <span className="text-xs text-zinc-500">{x.description ?? "—"}</span>,
          },
          { key: "src", header: "source", cell: (x) => <SourceLink source={x.source} /> },
        ]}
      />
      <Pager pageInfo={d.domains.pageInfo} total={d.domains.totalCount} />
    </>
  );
}
