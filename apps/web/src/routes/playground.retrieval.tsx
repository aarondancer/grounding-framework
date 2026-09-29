import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClient } from "urql";
import {
  CandidateFunnel,
  DiagnosticsPanel,
  ExclusionsTable,
  RankingsTable,
} from "../components/diagnostics";
import { DataTable } from "../components/table";
import { EntityLink, ErrorBanner, JsonBlock, PageHeader, Section } from "../components/ui";
import type { RetrievalInput, RetrieveQuery } from "../generated/operations";
import { RETRIEVAL_PROFILES, RETRIEVE } from "../lib/api";
import { useSimulatedContext } from "../lib/sim-context";

type RetrievalResult = RetrieveQuery["retrieve"];

export const Route = createFileRoute("/playground/retrieval")({
  loader: async ({ context }) => {
    const res = await context.urql.query(RETRIEVAL_PROFILES, {}).toPromise();
    if (res.error) throw res.error;
    return res.data?.retrievalProfiles ?? [];
  },
  component: RetrievalPlayground,
});

const inputCls = "rounded border border-zinc-300 px-2 py-1 text-sm";

function RetrievalPlayground() {
  const profiles = Route.useLoaderData();
  const client = useClient();
  const { context } = useSimulatedContext();
  const [query, setQuery] = useState("");
  const [profile, setProfile] = useState("");
  const [maxChunks, setMaxChunks] = useState("");
  const [maxTokens, setMaxTokens] = useState("");
  const [includeDraft, setIncludeDraft] = useState(false);
  const [includeDeprecated, setIncludeDeprecated] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RetrievalResult | null>(null);

  const run = async () => {
    setRunning(true);
    setError(null);
    const input: RetrievalInput = {
      query,
      context,
      diagnostics: true,
      filters: { includeDraft, includeDeprecated },
      ...(profile ? { profile } : {}),
    };
    const limits: NonNullable<RetrievalInput["limits"]> = {};
    if (maxChunks) limits.maxChunks = Number(maxChunks);
    if (maxTokens) limits.maxTokens = Number(maxTokens);
    if (Object.keys(limits).length > 0) input.limits = limits;
    const res = await client
      .query(RETRIEVE, { input }, { requestPolicy: "network-only" })
      .toPromise();
    setRunning(false);
    if (res.error) {
      setError(res.error.message);
      setResult(null);
      return;
    }
    setResult(res.data?.retrieve ?? null);
  };

  const exportDef = useMemo(
    () =>
      result
        ? {
            // retrieval-eval seed (packages/evals RetrievalEvalDef) — copy into evals/
            name: `explorer-${Date.now()}`,
            query: result.query,
            context,
            ...(profile ? { profile } : {}),
            expect: {
              resolvedConcepts: result.resolvedConcepts.map((c) => c.concept.key),
              includeChunks: result.results.slice(0, 5).map((r) => r.chunk.key),
            },
          }
        : null,
    [result, context, profile],
  );

  const copyExport = () => {
    if (exportDef) void navigator.clipboard.writeText(JSON.stringify(exportDef, null, 2));
  };
  const downloadExport = () => {
    if (!exportDef) return;
    const blob = new Blob([JSON.stringify(exportDef, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportDef.name}.retrieval-eval.jsonc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader
        title="Retrieval Playground"
        subtitle="run retrieval with diagnostics against the live namespace"
      />
      <Section title="Query">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className={`${inputCls} w-96`}
            placeholder="query text…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && query.trim()) void run();
            }}
          />
          <select className={inputCls} value={profile} onChange={(e) => setProfile(e.target.value)}>
            <option value="">default profile</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.key}>
                {p.name ?? p.key}
              </option>
            ))}
          </select>
          <input
            className={`${inputCls} w-24`}
            placeholder="chunks"
            value={maxChunks}
            onChange={(e) => setMaxChunks(e.target.value)}
            inputMode="numeric"
          />
          <input
            className={`${inputCls} w-24`}
            placeholder="tokens"
            value={maxTokens}
            onChange={(e) => setMaxTokens(e.target.value)}
            inputMode="numeric"
          />
          {/* spec/10: lifecycle toggles are privileged debug controls — v1 has
              no auth model, so they live behind an explicit debug disclosure
              rather than inline in the query row. */}
          <details className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600">
            <summary className="cursor-pointer select-none">lifecycle debug (privileged)</summary>
            <span className="ml-2 inline-flex gap-3">
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={includeDraft}
                  onChange={(e) => setIncludeDraft(e.target.checked)}
                />{" "}
                drafts
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={includeDeprecated}
                  onChange={(e) => setIncludeDeprecated(e.target.checked)}
                />{" "}
                deprecated
              </label>
            </span>
          </details>
          <button
            type="button"
            disabled={!query.trim() || running}
            onClick={() => void run()}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? "Running…" : "Retrieve"}
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-400">
          Uses the persistent simulated context from the header strip.
        </p>
      </Section>
      {error ? <ErrorBanner message={error} /> : null}
      {result ? (
        <>
          <Section title={`Results (${result.results.length})`}>
            <p className="mb-2 text-xs text-zinc-500">
              ns <code>{result.namespace.key}</code> · rev <code>{result.runtimeRevision}</code>
              {result.packedContext
                ? ` · packed ${result.packedContext.chunks.length} chunks / ~${result.packedContext.estimatedTokens} tokens`
                : ""}
            </p>
            <DataTable
              rows={result.results}
              keyOf={(r) => r.chunk.id}
              cols={[
                { key: "rank", header: "#", cell: (r) => r.rank },
                {
                  key: "chunk",
                  header: "chunk",
                  cell: (r) => (
                    <EntityLink type="knowledge_chunk" entityKey={r.chunk.id}>
                      {r.chunk.heading ?? r.chunk.key}
                    </EntityLink>
                  ),
                },
                {
                  key: "item",
                  header: "item",
                  cell: (r) => (
                    <EntityLink type="knowledge_item" entityKey={r.chunk.knowledgeItem.key}>
                      {r.chunk.knowledgeItem.title}
                    </EntityLink>
                  ),
                },
                { key: "score", header: "score", cell: (r) => r.score.toFixed(4) },
                {
                  key: "why",
                  header: "why",
                  cell: (r) => (
                    <div className="space-y-0.5 text-xs text-zinc-500">
                      {(r.reasons ?? []).map((w) => (
                        <div key={w.code}>
                          <code>{w.code}</code> {w.message}
                        </div>
                      ))}
                    </div>
                  ),
                },
              ]}
            />
          </Section>
          <Section title={`Resolved concepts (${result.resolvedConcepts.length})`}>
            <DataTable
              rows={result.resolvedConcepts}
              keyOf={(c) => c.concept.id}
              cols={[
                { key: "rank", header: "#", cell: (c) => c.rank },
                {
                  key: "concept",
                  header: "concept",
                  cell: (c) => (
                    <EntityLink type="concept" entityKey={c.concept.key}>
                      {c.concept.name}
                    </EntityLink>
                  ),
                },
                {
                  key: "match",
                  header: "match",
                  cell: (c) => <code className="text-xs">{c.matchType.toLowerCase()}</code>,
                },
                {
                  key: "text",
                  header: "matched text",
                  cell: (c) => <code className="text-xs">{c.matchedText}</code>,
                },
                { key: "score", header: "score", cell: (c) => c.score?.toFixed(3) ?? "—" },
              ]}
            />
          </Section>
          {result.diagnostics ? (
            <>
              <div className="grid gap-6 lg:grid-cols-2">
                <DiagnosticsPanel
                  title="Candidate funnel"
                  timings={result.diagnostics.timings}
                  errors={result.diagnostics.errors}
                >
                  <CandidateFunnel counts={result.diagnostics.candidateCounts} />
                </DiagnosticsPanel>
                <Section title="Packing">
                  {result.diagnostics.packing ? (
                    <dl className="grid grid-cols-2 gap-1 text-xs">
                      {Object.entries(result.diagnostics.packing).map(([k, v]) => (
                        <div
                          key={k}
                          className="flex justify-between border-b border-zinc-100 py-0.5"
                        >
                          <dt className="font-mono text-zinc-500">{k}</dt>
                          <dd className="font-mono">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-xs text-zinc-400">No packing diagnostics.</p>
                  )}
                  {result.diagnostics.warnings.length > 0 ? (
                    <ul className="mt-2 space-y-1">
                      {result.diagnostics.warnings.map((w) => (
                        <li key={`${w.code}:${w.message}`} className="text-xs text-amber-700">
                          <code>{w.code}</code> — {w.message}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Section>
              </div>
              <Section title={`Exclusions (${result.diagnostics.exclusions.length})`}>
                <ExclusionsTable exclusions={result.diagnostics.exclusions} />
              </Section>
              <Section title="Rankings (why each result placed where it did)">
                <RankingsTable rankings={result.diagnostics.rankings} />
              </Section>
              {result.diagnostics.graphPaths.length > 0 ? (
                <Section title={`Graph expansion paths (${result.diagnostics.graphPaths.length})`}>
                  <ul className="space-y-1 text-xs">
                    {result.diagnostics.graphPaths.map((p) => (
                      <li
                        key={`${p.seedConcept.key}-${p.targetConcept.key}-${p.depth}-${p.steps.length}`}
                        className="font-mono text-zinc-600"
                      >
                        d{p.depth} {p.seedConcept.key} → {p.targetConcept.key}:{" "}
                        {p.steps
                          .map(
                            (s) =>
                              `${s.from.key} -[${s.relation.key} ${s.direction}]-> ${s.to.key}`,
                          )
                          .join(" ")}
                      </li>
                    ))}
                  </ul>
                </Section>
              ) : null}
            </>
          ) : null}
          <Section title="Export eval definition">
            <p className="mb-2 text-xs text-zinc-500">
              Copy/download a retrieval-eval JSONC seeded from this run — save it under
              <code> evals/</code> in a grounding repo to make the scenario repeatable.
            </p>
            <div className="mb-2 flex gap-2">
              <button
                type="button"
                onClick={copyExport}
                className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              >
                Copy JSONC
              </button>
              <button
                type="button"
                onClick={downloadExport}
                className="rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              >
                Download .jsonc
              </button>
            </div>
            <JsonBlock value={exportDef} />
          </Section>
        </>
      ) : null}
    </>
  );
}
