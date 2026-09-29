import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, Pager, StatusBadge } from "../components/ui";
import { CONCEPTS } from "../lib/api";
import { browseSearch } from "../lib/list";

export const Route = createFileRoute("/explore/concepts")({
  validateSearch: browseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const input: Record<string, unknown> = { first: 50 };
    if (deps.search) input.search = deps.search;
    if (deps.status) input.status = deps.status;
    if (deps.domain) input.domain = deps.domain;
    if (deps.after) input.after = deps.after;
    const res = await context.urql.query(CONCEPTS, { input }).toPromise();
    if (res.error) throw res.error;
    return (
      res.data ?? {
        concepts: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: null,
        },
      }
    );
  },
  component: ConceptsPage,
});

function ConceptsPage() {
  const d = Route.useLoaderData();
  const { search, status } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader title="Concepts & Ontology" subtitle="authored concepts across domains">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({
              search: {
                search: (e.target as HTMLFormElement).q.value,
                ...(status ? { status } : {}),
              },
            });
          }}
        >
          <input
            name="q"
            defaultValue={search}
            placeholder="search…"
            className="rounded border border-zinc-300 px-2 py-1 text-sm"
          />
        </form>
        <select
          value={status ?? ""}
          onChange={(e) =>
            navigate({
              search: {
                search,
                ...(e.target.value ? { status: e.target.value } : {}),
              },
            })
          }
          className="rounded border border-zinc-300 px-2 py-1 text-sm"
        >
          <option value="">all statuses</option>
          <option value="PUBLISHED">published</option>
          <option value="DRAFT">draft</option>
          <option value="DEPRECATED">deprecated</option>
        </select>
      </PageHeader>
      <DataTable
        rows={d.concepts.nodes}
        keyOf={(c) => c.id}
        cols={[
          {
            key: "name",
            header: "name",
            cell: (c) => (
              <Link
                to="/explore/concepts/$key"
                search={{}}
                params={{ key: c.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {c.name}
              </Link>
            ),
          },
          { key: "key", header: "key", cell: (c) => <code className="text-xs">{c.key}</code> },
          { key: "type", header: "type", cell: (c) => c.type ?? "—" },
          {
            key: "domains",
            header: "domains",
            cell: (c) => (
              <span className="flex flex-wrap gap-1">
                {c.domains.map((dm) => (
                  <Link
                    key={dm.id}
                    to="/explore/domains/$key"
                    params={{ key: dm.key }}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs hover:bg-zinc-200"
                  >
                    {dm.key}
                  </Link>
                ))}
              </span>
            ),
          },
          { key: "status", header: "status", cell: (c) => <StatusBadge status={c.status} /> },
          {
            key: "aliases",
            header: "aliases",
            cell: (c) => (
              <span className="text-xs text-zinc-500">
                {c.aliases.map((a) => a.alias).join(", ") || "—"}
              </span>
            ),
          },
        ]}
      />
      <Pager pageInfo={d.concepts.pageInfo} total={d.concepts.totalCount} />
    </>
  );
}
