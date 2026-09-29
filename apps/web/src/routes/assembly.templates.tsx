import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { PageHeader, StatusBadge } from "../components/ui";
import { TEMPLATES } from "../lib/api";

export const Route = createFileRoute("/assembly/templates")({
  loader: async ({ context }) => {
    const res = await context.urql.query(TEMPLATES, {}).toPromise();
    if (res.error) throw res.error;
    return res.data?.agentTemplates ?? [];
  },
  component: TemplatesPage,
});

function TemplatesPage() {
  const templates = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Agent Templates" subtitle="assembly entry points" />
      <DataTable
        rows={templates}
        keyOf={(t) => t.id}
        cols={[
          {
            key: "name",
            header: "name",
            cell: (t) => (
              <Link
                to="/assembly/templates/$key"
                search={{}}
                params={{ key: t.key }}
                className="font-medium text-blue-700 hover:underline"
              >
                {t.name}
              </Link>
            ),
          },
          { key: "key", header: "key", cell: (t) => <code className="text-xs">{t.key}</code> },
          { key: "profile", header: "profile", cell: (t) => t.retrievalProfile?.key ?? "—" },
          {
            key: "frags",
            header: "fragments",
            cell: (t) => t.promptFragments.length,
          },
          {
            key: "budgets",
            header: "budgets",
            cell: (t) => (
              <code className="text-xs text-zinc-500">
                s:{t.budgets.maxSkills ?? "∞"} t:{t.budgets.maxTools ?? "∞"} tok:
                {t.budgets.promptTokens ?? "∞"}
              </code>
            ),
          },
          { key: "status", header: "status", cell: (t) => <StatusBadge status={t.status} /> },
        ]}
      />
    </>
  );
}
