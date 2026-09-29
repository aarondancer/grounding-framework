import { createFileRoute } from "@tanstack/react-router";
import { DataTable } from "../components/table";
import {
  EntityLink,
  JsonBlock,
  PageHeader,
  Section,
  SourceLink,
  StatusBadge,
} from "../components/ui";
import { CONCEPTS, DOMAINS } from "../lib/api";

export const Route = createFileRoute("/explore/domains/$key")({
  loader: async ({ context, params }) => {
    const [dRes, cRes] = await Promise.all([
      context.urql.query(DOMAINS, { input: { first: 200 } }).toPromise(),
      context.urql.query(CONCEPTS, { input: { domain: params.key, first: 200 } }).toPromise(),
    ]);
    if (dRes.error) throw dRes.error;
    const domain = (dRes.data?.domains.nodes ?? []).find((x) => x.key === params.key);
    if (!domain) throw new Response("not found", { status: 404 });
    return {
      domain,
      concepts: cRes.data?.concepts,
    };
  },
  component: DomainPage,
});

function DomainPage() {
  const { domain, concepts } = Route.useLoaderData();
  return (
    <>
      <PageHeader title={domain.name} subtitle={<code>{domain.key}</code>} />
      {domain.description ? (
        <p className="mb-4 max-w-3xl text-sm text-zinc-600">{domain.description}</p>
      ) : null}
      <div className="mb-4 text-xs text-zinc-500">
        file: <SourceLink source={domain.source} />
      </div>
      <Section
        title={`Concepts in this domain (${concepts?.totalCount ?? concepts?.nodes.length ?? 0})`}
      >
        <DataTable
          rows={concepts?.nodes ?? []}
          keyOf={(c) => c.id}
          cols={[
            {
              key: "name",
              header: "name",
              cell: (c) => (
                <EntityLink type="concept" entityKey={c.key}>
                  {c.name}
                </EntityLink>
              ),
            },
            { key: "key", header: "key", cell: (c) => <code className="text-xs">{c.key}</code> },
            { key: "type", header: "type", cell: (c) => c.type ?? "—" },
            { key: "status", header: "status", cell: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
      </Section>
      <Section title="Metadata">
        <JsonBlock value={domain.metadata} />
      </Section>
    </>
  );
}
