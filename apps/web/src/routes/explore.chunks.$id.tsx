import { createFileRoute, Link } from "@tanstack/react-router";
import { GatesPanel } from "../components/gates";
import {
  EntityLink,
  JsonBlock,
  MarkdownBlock,
  PageHeader,
  Section,
  SourceLink,
  StatusBadge,
} from "../components/ui";
import { KNOWLEDGE_CHUNK } from "../lib/api";

export const Route = createFileRoute("/explore/chunks/$id")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(KNOWLEDGE_CHUNK, { ref: { id: params.id } }).toPromise();
    if (res.error) throw res.error;
    const chunk = res.data?.knowledgeChunk;
    if (!chunk) throw new Response("not found", { status: 404 });
    return chunk;
  },
  component: ChunkPage,
});

function ChunkPage() {
  const c = Route.useLoaderData();
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2 font-mono text-base">
            {c.key} <StatusBadge status={c.status} />
          </span>
        }
        subtitle={
          <>
            chunk {c.ordinal} of{" "}
            <Link
              to="/explore/knowledge/$key"
              search={{}}
              params={{ key: c.knowledgeItem.key }}
              className="text-blue-700 hover:underline"
            >
              {c.knowledgeItem.title}
            </Link>
            {" · "}
            {c.tokenCount ?? "?"} tokens · priority {c.priority} · authority{" "}
            {c.authorityScore ?? "—"}
          </>
        }
      />
      {c.heading ? <p className="mb-3 text-sm font-medium text-zinc-600">§ {c.heading}</p> : null}
      <Section title="Content">
        <MarkdownBlock content={c.content} />
      </Section>
      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-zinc-500">
        <span>
          effective {c.effectiveFrom ?? "—"} → {c.effectiveTo ?? "—"}
        </span>
        <span>
          file: <SourceLink source={c.source} />
        </span>
      </div>
      {c.concepts.length > 0 ? (
        <Section title="Linked concepts">
          <span className="flex flex-wrap gap-1">
            {c.concepts.map((con) => (
              <EntityLink key={con.id} type="concept" entityKey={con.key}>
                {con.name}
              </EntityLink>
            ))}
          </span>
        </Section>
      ) : null}
      {c.selectionGroup ? (
        <Section title="Selection group">
          <Link
            to="/explore/selection-groups/$key"
            search={{}}
            params={{ key: c.selectionGroup.key }}
            className="font-mono text-xs text-blue-700 hover:underline"
          >
            {c.selectionGroup.key}
          </Link>
        </Section>
      ) : null}
      <GatesPanel entityId={c.id} authorization={c.authorization} applicability={c.applicability} />
      <Section title="Metadata">
        <JsonBlock value={c.metadata} />
      </Section>
    </>
  );
}
