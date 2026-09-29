import { createFileRoute } from "@tanstack/react-router";
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
import { FRAGMENT } from "../lib/api";

export const Route = createFileRoute("/assembly/fragments/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(FRAGMENT, { ref: { key: params.key } }).toPromise();
    if (res.error) throw res.error;
    const f = res.data?.promptFragment;
    if (!f) throw new Response("not found", { status: 404 });
    return f;
  },
  component: FragmentPage,
});

function FragmentPage() {
  const f = Route.useLoaderData();
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {f.name} <StatusBadge status={f.status} />
          </span>
        }
        subtitle={
          <>
            <code>{f.key}</code> · <code>{f.section}</code> #{f.order} ·{" "}
            <code>{f.inclusionMode.toLowerCase()}</code> · priority {f.priority} · file:{" "}
            <SourceLink source={f.source} />
          </>
        }
      />
      <Section title="Content">
        <MarkdownBlock content={f.content} />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Concepts (${f.concepts.length})`}>
          <span className="flex flex-wrap gap-1">
            {f.concepts.map((c) => (
              <EntityLink key={c.id} type="concept" entityKey={c.key}>
                {c.name}
              </EntityLink>
            ))}
          </span>
        </Section>
        {f.selectionGroup ? (
          <Section title="Selection group">
            <EntityLink type="selection_group" entityKey={f.selectionGroup.key}>
              {f.selectionGroup.key}
            </EntityLink>{" "}
            <code className="text-xs text-zinc-500">{f.selectionGroup.mode.toLowerCase()}</code>
          </Section>
        ) : null}
      </div>
      <Section title={`Used by (${f.usedBy.length})`}>
        <span className="flex flex-wrap gap-1">
          {f.usedBy.map((u) => (
            <EntityLink key={`${u.type}:${u.id}`} type={u.type} entityKey={u.key}>
              {u.key}
            </EntityLink>
          ))}
          {f.usedBy.length === 0 ? (
            <span className="text-xs text-zinc-400">no referencing templates or skills</span>
          ) : null}
        </span>
      </Section>
      <GatesPanel entityId={f.id} authorization={f.authorization} applicability={f.applicability} />
      <Section title="Metadata">
        <JsonBlock value={f.metadata} />
      </Section>
    </>
  );
}
