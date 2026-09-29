import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, Pager, StatusBadge } from "../components/ui";
import { KNOWLEDGE_ITEMS } from "../lib/api";
import { browseSearch } from "../lib/list";

export const Route = createFileRoute("/explore/knowledge/")({
  validateSearch: browseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const input: Record<string, unknown> = { first: 50 };
    if (deps.search) input.search = deps.search;
    if (deps.status) input.status = deps.status;
    if (deps.concept) input.concept = deps.concept;
    if (deps.after) input.after = deps.after;
    const res = await context.urql.query(KNOWLEDGE_ITEMS, { input }).toPromise();
    if (res.error) throw res.error;
    return (
      res.data ?? {
        knowledgeItems: {
          nodes: [],
          pageInfo: { hasNextPage: false, endCursor: null },
          totalCount: null,
        },
      }
    );
  },
  component: KnowledgePage,
});

function KnowledgePage() {
  const d = Route.useLoaderData();
  const { search, concept } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <>
      <PageHeader
        title="Knowledge"
        subtitle={concept ? `items linked to concept ${concept}` : "knowledge items"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            navigate({
              search: {
                search: (e.target as HTMLFormElement).q.value,
                ...(concept ? { concept } : {}),
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
      </PageHeader>
      <DataTable
        rows={d.knowledgeItems.nodes}
        keyOf={(i) => i.id}
        cols={[
          {
            key: "title",
            header: "title",
            cell: (i) => (
              <Link
                to="/explore/knowledge/$key"
                search={{}}
                params={{ key: i.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {i.title}
              </Link>
            ),
          },
          { key: "key", header: "key", cell: (i) => <code className="text-xs">{i.key}</code> },
          {
            key: "summary",
            header: "summary",
            cell: (i) => (
              <span className="line-clamp-2 max-w-md text-xs text-zinc-500">
                {i.summary ?? "—"}
              </span>
            ),
          },
          { key: "auth", header: "authority", cell: (i) => i.authorityScore?.toFixed(2) ?? "—" },
          { key: "status", header: "status", cell: (i) => <StatusBadge status={i.status} /> },
        ]}
      />
      <Pager pageInfo={d.knowledgeItems.pageInfo} total={d.knowledgeItems.totalCount} />
    </>
  );
}
