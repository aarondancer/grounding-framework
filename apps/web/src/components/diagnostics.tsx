import type { ReactNode } from "react";
import type { AssembleQuery, RetrieveQuery } from "../generated/operations";
import { entityLinkKey } from "../lib/nav";
import { DataTable } from "./table";
import { EntityLink, Section } from "./ui";

type RetrievalDiag = NonNullable<RetrieveQuery["retrieve"]["diagnostics"]>;
type AssemblyDiag = NonNullable<NonNullable<AssembleQuery["assembleAgent"]>["diagnostics"]>;

/** Retrieval `candidateCounts` rendered as a stage funnel. */
/** Funnel over candidate counts; assembly bootstrap diagnostics omit the
 * per-channel keys, so all keys are optional here. */
export function CandidateFunnel({
  counts,
}: {
  counts: { [K in keyof RetrievalDiag["candidateCounts"]]?: number };
}) {
  const order = [
    "vector",
    "fullText",
    "trigram",
    "conceptLinked",
    "graphLinked",
    "unique",
    "afterLifecycle",
    "afterAuthorization",
    "afterApplicability",
    "afterSelectionGroups",
    "packed",
  ] as const satisfies readonly (keyof typeof counts)[];
  const max = Math.max(...order.map((k) => counts[k] ?? 0), 1);
  return (
    <div className="space-y-1">
      {order.map((k) => (
        <div key={k} className="flex items-center gap-2 text-xs">
          <span className="w-44 font-mono text-zinc-500">{k}</span>
          <div
            className="h-3 rounded bg-blue-200"
            style={{ width: `${((counts[k] ?? 0) / max) * 60}%` }}
          />
          <span className="font-mono">{counts[k] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

export function TimingsBar({ timings }: { timings: RetrievalDiag["timings"] }) {
  const total = timings.reduce((s, t) => s + t.milliseconds, 0);
  return (
    <div className="space-y-1">
      {timings.map((t) => (
        <div key={t.stage} className="flex items-center gap-2 text-xs">
          <span className="w-44 font-mono text-zinc-500">{t.stage}</span>
          <div
            className="h-3 rounded bg-violet-200"
            style={{ width: `${total > 0 ? (t.milliseconds / total) * 60 : 0}%` }}
          />
          <span className="font-mono">{t.milliseconds.toFixed(1)}ms</span>
        </div>
      ))}
      <div className="pt-1 text-xs font-semibold text-zinc-600">total {total.toFixed(1)}ms</div>
    </div>
  );
}

type Exclusion = RetrievalDiag["exclusions"][number];

/** Retrieval exclusions — redacted entries show stage/code only (spec/09). */
export function ExclusionsTable({ exclusions }: { exclusions: Exclusion[] }) {
  if (exclusions.length === 0) return <p className="text-xs text-zinc-400">No exclusions.</p>;
  return (
    <DataTable
      rows={exclusions}
      keyOf={(e) => `${e.stage}:${e.code}:${e.chunk?.id ?? "?"}`}
      cols={[
        {
          key: "chunk",
          header: "chunk",
          cell: (e) =>
            e.chunk ? (
              <EntityLink type={e.chunk.type} entityKey={e.chunk.id}>
                {e.chunk.key}
              </EntityLink>
            ) : (
              <span className="text-zinc-400">(redacted)</span>
            ),
        },
        { key: "stage", header: "stage", cell: (e) => <code className="text-xs">{e.stage}</code> },
        { key: "code", header: "code", cell: (e) => <code className="text-xs">{e.code}</code> },
        {
          key: "message",
          header: "message",
          cell: (e) => <span className="text-xs">{e.redacted ? "(redacted)" : e.message}</span>,
        },
      ]}
    />
  );
}

type Ranking = RetrievalDiag["rankings"][number];

/** RRF component table — why each result ranked where it did. */
export function RankingsTable({ rankings }: { rankings: Ranking[] }) {
  if (rankings.length === 0) return <p className="text-xs text-zinc-400">No ranking data.</p>;
  const num = (v: number | null) => (v === null ? "—" : v);
  return (
    <div className="overflow-x-auto">
      <DataTable
        rows={rankings}
        keyOf={(r) => r.chunkId}
        cols={[
          { key: "rank", header: "#", cell: (r) => r.finalRank },
          {
            key: "chunk",
            header: "chunk",
            cell: (r) => <EntityLink type="knowledge_chunk" entityKey={r.chunkId} />,
          },
          { key: "rrf", header: "rrf", cell: (r) => r.rrfScore.toFixed(4) },
          {
            key: "vec",
            header: "vec rank/score",
            cell: (r) =>
              `${num(r.vectorRank)}${r.vectorScore !== null ? ` (${r.vectorScore.toFixed(3)})` : ""}`,
          },
          {
            key: "fts",
            header: "fts rank/score",
            cell: (r) =>
              `${num(r.fullTextRank)}${r.fullTextScore !== null ? ` (${r.fullTextScore.toFixed(3)})` : ""}`,
          },
          {
            key: "trgm",
            header: "trgm rank/score",
            cell: (r) =>
              `${num(r.trigramRank)}${r.trigramScore !== null ? ` (${r.trigramScore.toFixed(3)})` : ""}`,
          },
          { key: "concept", header: "concept", cell: (r) => num(r.conceptRank) },
          { key: "graph", header: "graph", cell: (r) => num(r.graphRank) },
          { key: "auth", header: "authority", cell: (r) => r.authorityScore },
          { key: "prio", header: "priority", cell: (r) => r.priority },
        ]}
      />
    </div>
  );
}

/** Assembly candidate diagnostics ("why / why not" per entity). */
export function CandidateTable({ rows }: { rows: AssemblyDiag["skillCandidates"] }) {
  if (rows.length === 0) return <p className="text-xs text-zinc-400">No candidates.</p>;
  return (
    <DataTable
      rows={rows}
      keyOf={(r) => `${r.entity.type}:${r.entity.key}`}
      cols={[
        {
          key: "entity",
          header: "entity",
          cell: (r) => (
            <EntityLink
              type={r.entity.type}
              // Chunk detail resolves by id, not key — see entityPath/KNOWLEDGE_CHUNK.
              entityKey={entityLinkKey(r.entity)}
            />
          ),
        },
        {
          key: "sel",
          header: "selected",
          cell: (r) =>
            r.selected ? (
              <span className="text-emerald-700">✓</span>
            ) : (
              <span className="text-red-600">✗</span>
            ),
        },
        { key: "rank", header: "rank", cell: (r) => r.rank ?? "—" },
        {
          key: "score",
          header: "score",
          cell: (r) => (r.score !== null ? r.score.toFixed(3) : "—"),
        },
        {
          key: "why",
          header: "why / why-not",
          cell: (r) => (
            <div className="text-xs">
              {r.code ? <code>{r.code}</code> : null}
              {r.causes.map((c) => (
                <div key={`${c.code}:${c.entityId ?? ""}`} className="text-zinc-500">
                  {c.code}: {c.message}
                </div>
              ))}
            </div>
          ),
        },
      ]}
    />
  );
}

export function DiagnosticsPanel({
  title,
  timings,
  warnings,
  errors,
  children,
}: {
  title: string;
  timings?: { stage: string; milliseconds: number }[];
  warnings?: { code: string; message: string }[];
  errors?: { code: string; message: string }[];
  children?: ReactNode;
}) {
  return (
    <Section title={title}>
      {errors && errors.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {errors.map((e) => (
            <li key={`${e.code}:${e.message}`} className="text-xs text-red-600">
              <code>{e.code}</code> — {e.message}
            </li>
          ))}
        </ul>
      ) : null}
      {warnings && warnings.length > 0 ? (
        <ul className="mb-3 space-y-1">
          {warnings.map((w) => (
            <li key={`${w.code}:${w.message}`} className="text-xs text-amber-700">
              <code>{w.code}</code> — {w.message}
            </li>
          ))}
        </ul>
      ) : null}
      {children}
      {timings && timings.length > 0 ? (
        <div className="mt-3">
          <h4 className="mb-1 text-xs font-semibold text-zinc-500">stage timings</h4>
          <TimingsBar timings={timings} />
        </div>
      ) : null}
    </Section>
  );
}
