import { createFileRoute, Link } from "@tanstack/react-router";
import { GatesPanel } from "../components/gates";
import {
  EntityLink,
  JsonBlock,
  PageHeader,
  Section,
  SourceLink,
  StatusBadge,
} from "../components/ui";
import { SKILL } from "../lib/api";

export const Route = createFileRoute("/assembly/skills/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(SKILL, { ref: { key: params.key } }).toPromise();
    if (res.error) throw res.error;
    const s = res.data?.skill;
    if (!s) throw new Response("not found", { status: 404 });
    return s;
  },
  component: SkillPage,
});

function SkillPage() {
  const s = Route.useLoaderData();
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {s.name} <StatusBadge status={s.status} />
          </span>
        }
        subtitle={
          <>
            <code>{s.key}</code> · priority {s.priority} · file: <SourceLink source={s.source} />
          </>
        }
      />
      {s.description ? (
        <p className="mb-4 max-w-3xl text-sm text-zinc-600">{s.description}</p>
      ) : null}
      {s.selectionGroup ? (
        <Section title="Selection group">
          <Link
            to="/explore/selection-groups/$key"
            search={{}}
            params={{ key: s.selectionGroup.key }}
            className="font-mono text-xs text-blue-700 hover:underline"
          >
            {s.selectionGroup.key}
          </Link>{" "}
          <code className="text-xs text-zinc-500">{s.selectionGroup.mode.toLowerCase()}</code>
        </Section>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-3">
        <Section title={`Concepts (${s.concepts.length})`}>
          <ul className="space-y-1">
            {s.concepts.map((c) => (
              <li key={c.id}>
                <EntityLink type="concept" entityKey={c.key}>
                  {c.name}
                </EntityLink>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={`Tools (${s.tools.length})`}>
          <ul className="space-y-1">
            {s.tools.map((t) => (
              <li key={t.id}>
                <EntityLink type="tool" entityKey={t.key}>
                  {t.name}
                </EntityLink>
              </li>
            ))}
          </ul>
        </Section>
        <Section title={`Fragments (${s.promptFragments.length})`}>
          <ul className="space-y-1">
            {s.promptFragments.map((f) => (
              <li key={f.id}>
                <EntityLink type="prompt_fragment" entityKey={f.key}>
                  {f.name}
                </EntityLink>{" "}
                <code className="text-[10px] text-zinc-400">{f.section}</code>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <GatesPanel entityId={s.id} authorization={s.authorization} applicability={s.applicability} />
      <Section title="Metadata">
        <JsonBlock value={s.metadata} />
      </Section>
    </>
  );
}
