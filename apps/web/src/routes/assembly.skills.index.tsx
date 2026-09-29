import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, Pager, StatusBadge } from "../components/ui";
import { SKILLS } from "../lib/api";
import { browseSearch } from "../lib/list";

export const Route = createFileRoute("/assembly/skills/")({
  validateSearch: browseSearch,
  loaderDeps: ({ search }) => search,
  loader: async ({ context, deps }) => {
    const input: Record<string, unknown> = { first: 50 };
    if (deps.search) input.search = deps.search;
    if (deps.status) input.status = deps.status;
    if (deps.concept) input.concept = deps.concept;
    if (deps.after) input.after = deps.after;
    const res = await context.urql.query(SKILLS, { input }).toPromise();
    if (res.error) throw res.error;
    return (
      res.data ?? {
        skills: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null }, totalCount: null },
      }
    );
  },
  component: SkillsPage,
});

function SkillsPage() {
  const d = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Skills" subtitle="task-relevant capability bundles" />
      <DataTable
        rows={d.skills.nodes}
        keyOf={(s) => s.id}
        cols={[
          {
            key: "name",
            header: "name",
            cell: (s) => (
              <Link
                to="/assembly/skills/$key"
                search={{}}
                params={{ key: s.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {s.name}
              </Link>
            ),
          },
          { key: "key", header: "key", cell: (s) => <code className="text-xs">{s.key}</code> },
          { key: "prio", header: "priority", cell: (s) => s.priority },
          {
            key: "group",
            header: "selection group",
            cell: (s) =>
              s.selectionGroup ? (
                <Link
                  to="/explore/selection-groups/$key"
                  search={{}}
                  params={{ key: s.selectionGroup.key }}
                  className="font-mono text-xs text-blue-700 hover:underline"
                >
                  {s.selectionGroup.key}
                </Link>
              ) : (
                "—"
              ),
          },
          {
            key: "concepts",
            header: "concepts",
            cell: (s) => s.concepts.map((c) => c.key).join(", ") || "—",
          },
          { key: "tools", header: "tools", cell: (s) => s.tools.length },
          { key: "status", header: "status", cell: (s) => <StatusBadge status={s.status} /> },
        ]}
      />
      <Pager pageInfo={d.skills.pageInfo} total={d.skills.totalCount} />
    </>
  );
}
