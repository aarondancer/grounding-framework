import { createFileRoute } from "@tanstack/react-router";
import { JsonBlock, PageHeader, Section, SourceLink } from "../components/ui";
import { NAMESPACE, RETRIEVAL_PROFILES, RUNTIME_INFO } from "../lib/api";

export const Route = createFileRoute("/dev/runtime")({
  loader: async ({ context }) => {
    const [info, ns, profiles] = await Promise.all([
      context.urql.query(RUNTIME_INFO, {}).toPromise(),
      context.urql.query(NAMESPACE, {}).toPromise(),
      context.urql.query(RETRIEVAL_PROFILES, {}).toPromise(),
    ]);
    if (info.error) throw info.error;
    if (ns.error) throw ns.error;
    if (profiles.error) throw profiles.error;
    if (!info.data) throw new Response("no data", { status: 500 });
    return {
      runtimeInfo: info.data.runtimeInfo,
      namespace: ns.data?.namespace ?? null,
      retrievalProfiles: profiles.data?.retrievalProfiles ?? [],
    };
  },
  component: RuntimePage,
});

function RuntimePage() {
  const { runtimeInfo, namespace, retrievalProfiles } = Route.useLoaderData();
  return (
    <>
      <PageHeader title="Runtime" subtitle="materialized deployment state" />
      <Section title="Runtime info">
        <dl className="grid max-w-2xl grid-cols-2 gap-x-6 gap-y-1 text-sm">
          {(
            [
              ["namespace", `${runtimeInfo.namespace.key} (${runtimeInfo.namespace.id})`],
              ["environment", runtimeInfo.environment],
              ["runtime revision", runtimeInfo.runtimeRevision],
              ["git commit", runtimeInfo.gitCommit ?? "—"],
              ["source hash", runtimeInfo.sourceHash],
              ["compiler", runtimeInfo.compilerVersion ?? "—"],
            ] as [string, string][]
          ).map(([k, v]) => (
            <div key={k} className="border-b border-zinc-100 py-1">
              <dt className="text-xs text-zinc-500">{k}</dt>
              <dd className="break-all font-mono text-xs">{v}</dd>
            </div>
          ))}
        </dl>
      </Section>
      {namespace ? (
        <Section title={`Namespace — ${namespace.name}`}>
          {namespace.description ? (
            <p className="mb-2 text-sm text-zinc-600">{namespace.description}</p>
          ) : null}
          <p className="mb-2 text-xs text-zinc-500">
            default profile: <code>{namespace.defaultRetrievalProfile?.key ?? "—"}</code>
          </p>
          <JsonBlock value={namespace.metadata} title="metadata" />
        </Section>
      ) : null}
      <Section title={`Retrieval profiles (${retrievalProfiles.length})`}>
        <div className="grid gap-4 lg:grid-cols-2">
          {retrievalProfiles.map((p) => (
            <div key={p.id} className="rounded border border-zinc-200 bg-white p-3">
              <div className="mb-1 flex items-baseline justify-between">
                <code className="text-sm font-medium">{p.key}</code>
                <SourceLink source={p.source} />
              </div>
              {p.name ? <p className="mb-1 text-xs text-zinc-500">{p.name}</p> : null}
              <JsonBlock value={p.config} title="config" />
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}
