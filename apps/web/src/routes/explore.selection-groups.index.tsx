import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader } from "../components/ui";
import { SELECTION_GROUPS } from "../lib/api";

export const Route = createFileRoute("/explore/selection-groups/")({
  loader: async ({ context }) => {
    const res = await context.urql.query(SELECTION_GROUPS, {}).toPromise();
    if (res.error) throw res.error;
    return res.data?.selectionGroups ?? [];
  },
  component: SelectionGroupsPage,
});

function SelectionGroupsPage() {
  const groups = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Selection Groups" subtitle="competing variants per entity type" />
      <DataTable
        rows={groups}
        keyOf={(g) => g.id}
        cols={[
          {
            key: "key",
            header: "key",
            cell: (g) => (
              <Link
                to="/explore/selection-groups/$key"
                search={{}}
                params={{ key: g.key }}
                className="font-mono text-xs text-blue-700 hover:underline"
              >
                {g.key}
              </Link>
            ),
          },
          { key: "name", header: "name", cell: (g) => g.name ?? "—" },
          {
            key: "type",
            header: "entity type",
            cell: (g) => <code className="text-xs">{g.entityType}</code>,
          },
          {
            key: "mode",
            header: "mode",
            cell: (g) => <code className="text-xs">{g.mode.toLowerCase()}</code>,
          },
          { key: "members", header: "members", cell: (g) => g.members.length },
        ]}
      />
    </>
  );
}
