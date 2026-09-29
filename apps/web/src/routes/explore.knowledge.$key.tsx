import { createFileRoute, Link } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import { JsonBlock, PageHeader, Section, SourceLink, StatusBadge } from "../components/ui";
import { KNOWLEDGE_ITEM } from "../lib/api";

export const Route = createFileRoute("/explore/knowledge/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(KNOWLEDGE_ITEM, { ref: { key: params.key } }).toPromise();
    if (res.error) throw res.error;
    const item = res.data?.knowledgeItem;
    if (!item) throw new Response("not found", { status: 404 });
    return item;
  },
  component: KnowledgeItemPage,
});

function KnowledgeItemPage() {
  const item = Route.useLoaderData();
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {item.title} <StatusBadge status={item.status} />
          </span>
        }
        subtitle={<code>{item.key}</code>}
      />
      {item.summary ? <p className="mb-4 max-w-3xl text-sm text-zinc-600">{item.summary}</p> : null}
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
        <span>
          authority <b className="font-mono">{item.authorityScore ?? "—"}</b>
        </span>
        <span>
          effective {item.effectiveFrom ?? "—"} → {item.effectiveTo ?? "—"}
        </span>
        {item.sourceReference ? (
          <span>
            source ref: <b className="font-mono">{item.sourceReference.title}</b>
            {item.sourceReference.uri ? ` (${item.sourceReference.uri})` : ""}
          </span>
        ) : null}
        <span>
          file: <SourceLink source={item.source} />
        </span>
      </div>
      <Section title={`Chunks (${item.chunks.totalCount ?? item.chunks.nodes.length})`}>
        <DataTable
          rows={item.chunks.nodes}
          keyOf={(c) => c.id}
          cols={[
            { key: "ord", header: "#", cell: (c) => c.ordinal },
            {
              key: "key",
              header: "key",
              cell: (c) => (
                <Link
                  to="/explore/chunks/$id"
                  search={{}}
                  params={{ id: c.id }}
                  className="font-mono text-xs text-blue-700 hover:underline"
                >
                  {c.key}
                </Link>
              ),
            },
            { key: "heading", header: "heading", cell: (c) => c.heading ?? "—" },
            { key: "prio", header: "priority", cell: (c) => c.priority },
            { key: "tok", header: "tokens", cell: (c) => c.tokenCount ?? "—" },
            { key: "status", header: "status", cell: (c) => <StatusBadge status={c.status} /> },
            { key: "src", header: "source", cell: (c) => <SourceLink source={c.source} /> },
          ]}
        />
      </Section>
      <Section title="Metadata">
        <JsonBlock value={item.metadata} />
      </Section>
    </>
  );
}
