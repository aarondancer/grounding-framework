import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useClient } from "urql";
import { Graph, type GraphEdge, type GraphNode } from "../components/graph";
import { DataTable } from "../components/table";
import {
  EntityLink,
  JsonBlock,
  PageHeader,
  Section,
  SourceLink,
  StatusBadge,
} from "../components/ui";
import type {
  ConceptQuery,
  KnowledgeItemsQuery,
  PromptFragmentsQuery,
  SkillsQuery,
  ToolsQuery,
} from "../generated/operations";
import {
  CONCEPT,
  FRAGMENTS,
  KNOWLEDGE_ITEMS,
  NEIGHBORHOOD,
  type NeighborhoodT,
  SKILLS,
  TOOLS,
} from "../lib/api";

type ConceptDetail = NonNullable<ConceptQuery["concept"]>;

type Backlinks = {
  knowledgeItems: KnowledgeItemsQuery["knowledgeItems"] | undefined;
  skills: SkillsQuery["skills"] | undefined;
  tools: ToolsQuery["tools"] | undefined;
  promptFragments: PromptFragmentsQuery["promptFragments"] | undefined;
};

export const Route = createFileRoute("/explore/concepts/$key")({
  loader: async ({ context, params }) => {
    const [conceptRes, backRes] = await Promise.all([
      context.urql.query(CONCEPT, { ref: { key: params.key } }).toPromise(),
      Promise.all([
        context.urql
          .query(KNOWLEDGE_ITEMS, { input: { concept: params.key, first: 20 } })
          .toPromise(),
        context.urql.query(SKILLS, { input: { concept: params.key, first: 20 } }).toPromise(),
        context.urql.query(TOOLS, { input: { concept: params.key, first: 20 } }).toPromise(),
        context.urql.query(FRAGMENTS, { input: { concept: params.key, first: 20 } }).toPromise(),
      ]),
    ]);
    if (conceptRes.error) throw conceptRes.error;
    const concept = conceptRes.data?.concept;
    if (!concept) throw new Response("not found", { status: 404 });
    const [ki, sk, tl, pf] = backRes;
    return {
      concept,
      backlinkErrors: [ki, sk, tl, pf]
        .filter((r) => r.error)
        .map((r) => r.error?.message ?? "query failed"),
      backlinks: {
        knowledgeItems: ki.data?.knowledgeItems,
        skills: sk.data?.skills,
        tools: tl.data?.tools,
        promptFragments: pf.data?.promptFragments,
      } as Backlinks,
    };
  },
  component: ConceptPage,
});

function NeighborhoodPanel({ concept }: { concept: ConceptDetail }) {
  const conceptKey = concept.key;
  const client = useClient();
  const [direction, setDirection] = useState<"OUTGOING" | "INCOMING" | "BOTH">("BOTH");
  const [depth, setDepth] = useState(1);
  // spec/10 "relation filters" — multi-select; SDL takes relationTypes: [String!].
  const [relTypes, setRelTypes] = useState<string[]>([]);
  const [domain, setDomain] = useState("");
  // Center key tracked separately from the page concept — "recenter" re-runs
  // the neighborhood around a selected node without leaving the page
  // (spec/10: selecting a node must not lose graph state).
  const [centerKey, setCenterKey] = useState(conceptKey);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showChunks, setShowChunks] = useState(false);
  const [data, setData] = useState<NeighborhoodT | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Relation-type filter options come from the concept's own edges — the
  // loaded detail already enumerates them, and no list query exists in the SDL.
  const relTypeOptions = useMemo(() => {
    const s = new Set<string>();
    for (const r of concept.outgoingRelations.nodes) s.add(r.type.key);
    for (const r of concept.incomingRelations.nodes) s.add(r.type.key);
    return [...s].sort();
  }, [concept]);

  const load = useCallback(
    async (
      key: string,
      dir: "OUTGOING" | "INCOMING" | "BOTH",
      d: number,
      relTypes: string[],
      dom: string,
    ) => {
      setError(null);
      const res = await client
        .query(NEIGHBORHOOD, {
          input: {
            concept: { key },
            direction: dir,
            depth: d,
            ...(relTypes.length > 0 ? { relationTypes: relTypes } : {}),
            ...(dom ? { domain: dom } : {}),
          },
        })
        .toPromise();
      if (res.error) setError(res.error.message);
      else setData(res.data?.ontologyNeighborhood ?? null);
    },
    [client],
  );

  useEffect(() => {
    load(centerKey, direction, depth, relTypes, domain);
    setSelectedId(null);
  }, [centerKey, direction, depth, relTypes, domain, load]);

  /** spec/10 "expand node": merge the selected concept's neighborhood into
   * the current graph — same controls, no navigation, state preserved. */
  const expandSelected = async () => {
    if (!selected || !data) return;
    const res = await client
      .query(NEIGHBORHOOD, {
        input: {
          concept: { key: selected.key },
          direction,
          depth: 1,
          ...(relTypes.length > 0 ? { relationTypes: relTypes } : {}),
          ...(domain ? { domain } : {}),
        },
      })
      .toPromise();
    if (res.error) {
      setError(res.error.message);
      return;
    }
    const extra = res.data?.ontologyNeighborhood;
    if (!extra) return;
    const seenC = new Set(allConcepts.map((c) => c.id));
    const seenR = new Set(data.relations.map((r) => r.id));
    const seenCh = new Set(data.chunks.map((c) => c.id));
    setData({
      center: data.center,
      concepts: [...data.concepts, ...extra.concepts.filter((c) => !seenC.has(c.id))],
      relations: [...data.relations, ...extra.relations.filter((r) => !seenR.has(r.id))],
      chunks: [...data.chunks, ...extra.chunks.filter((c) => !seenCh.has(c.id))],
    });
  };

  const allConcepts = useMemo(() => {
    if (!data) return [];
    const seen = new Map<string, NeighborhoodT["concepts"][number]>();
    seen.set(data.center.id, data.center);
    for (const c of data.concepts) seen.set(c.id, c);
    return [...seen.values()];
  }, [data]);

  const selected = allConcepts.find((c) => c.id === selectedId) ?? null;

  const graph = useMemo(() => {
    if (!data) return { nodes: [] as GraphNode[], edges: [] as GraphEdge[] };
    return {
      nodes: allConcepts.map((c) => ({
        id: c.id,
        label: c.name,
        sub: c.key,
        accent: (c.id === selectedId
          ? "selected"
          : c.id === data.center.id
            ? "center"
            : undefined) as GraphNode["accent"],
      })),
      edges: data.relations.map((r) => ({
        id: r.id,
        source: r.sourceConcept.id,
        target: r.targetConcept.id,
        label: r.type.key,
      })),
    };
  }, [data, allConcepts, selectedId]);

  return (
    <Section title="Ontology neighborhood">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        {(["OUTGOING", "INCOMING", "BOTH"] as const).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDirection(d)}
            className={`rounded border px-2 py-1 ${direction === d ? "border-blue-500 bg-blue-50" : "border-zinc-300"}`}
          >
            {d.toLowerCase()}
          </button>
        ))}
        <span className="text-zinc-400">depth</span>
        {[1, 2].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDepth(d)}
            className={`rounded border px-2 py-1 ${depth === d ? "border-blue-500 bg-blue-50" : "border-zinc-300"}`}
          >
            {d}
          </button>
        ))}
        <span className="flex items-center gap-2" title="relation type filters (multi)">
          <span className="text-zinc-400">relations:</span>
          {relTypeOptions.map((t) => (
            <label key={t} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={relTypes.includes(t)}
                onChange={(e) =>
                  setRelTypes(e.target.checked ? [...relTypes, t] : relTypes.filter((r) => r !== t))
                }
              />
              <code>{t}</code>
            </label>
          ))}
        </span>
        <select
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          className="rounded border border-zinc-300 px-2 py-1"
          title="domain filter"
        >
          <option value="">domain: all</option>
          {concept.domains.map((d) => (
            <option key={d.id} value={d.key}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
      {data ? (
        <>
          <Graph
            nodes={graph.nodes}
            edges={graph.edges}
            onNodeClick={(id) => setSelectedId(id === selectedId ? null : id)}
          />
          {selected ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs">
              <span className="font-medium">{selected.name}</span>
              <code className="text-zinc-400">{selected.key}</code>
              <StatusBadge status={selected.status} />
              {selected.id !== data?.center.id ? (
                <button
                  type="button"
                  className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100"
                  onClick={() => void expandSelected()}
                >
                  expand
                </button>
              ) : null}
              <button
                type="button"
                className="rounded border border-zinc-300 px-2 py-0.5 hover:bg-zinc-100"
                onClick={() => {
                  setCenterKey(selected.key);
                  setSelectedId(null);
                }}
              >
                recenter
              </button>
              <Link
                to="/explore/concepts/$key"
                params={{ key: selected.key }}
                search={{}}
                className="text-blue-700 hover:underline"
              >
                open details →
              </Link>
            </div>
          ) : null}
          <label className="mt-3 flex items-center gap-1.5 text-xs text-zinc-600">
            <input
              type="checkbox"
              checked={showChunks}
              onChange={(e) => setShowChunks(e.target.checked)}
            />
            show linked chunks ({data.chunks.length})
          </label>
          {/* Tabular fallback (spec/10: every visualization has one) */}
          <div className="mt-3">
            <DataTable
              rows={data.relations}
              keyOf={(r) => r.id}
              cols={[
                {
                  key: "from",
                  header: "from",
                  cell: (r) => (
                    <EntityLink type="concept" entityKey={r.sourceConcept.key}>
                      {r.sourceConcept.name}
                    </EntityLink>
                  ),
                },
                {
                  key: "type",
                  header: "relation",
                  cell: (r) => <code className="text-xs">{r.type.key}</code>,
                },
                {
                  key: "to",
                  header: "to",
                  cell: (r) => (
                    <EntityLink type="concept" entityKey={r.targetConcept.key}>
                      {r.targetConcept.name}
                    </EntityLink>
                  ),
                },
              ]}
            />
          </div>
          {showChunks ? (
            <div className="mt-3">
              <h4 className="mb-1 text-xs font-semibold text-zinc-500">
                chunks linked to neighborhood concepts
              </h4>
              <DataTable
                rows={data.chunks}
                keyOf={(c) => c.id}
                cols={[
                  {
                    key: "chunk",
                    header: "chunk",
                    cell: (c) => (
                      <EntityLink type="knowledge_chunk" entityKey={c.id}>
                        {c.heading ?? c.key}
                      </EntityLink>
                    ),
                  },
                  {
                    key: "item",
                    header: "item",
                    cell: (c) => (
                      <EntityLink type="knowledge_item" entityKey={c.knowledgeItem.key}>
                        {c.knowledgeItem.title}
                      </EntityLink>
                    ),
                  },
                  {
                    key: "status",
                    header: "status",
                    cell: (c) => <StatusBadge status={c.status} />,
                  },
                ]}
              />
            </div>
          ) : null}
        </>
      ) : (
        <p className="text-sm text-zinc-400">Loading…</p>
      )}
    </Section>
  );
}

function ConceptPage() {
  const { concept: c, backlinks, backlinkErrors } = Route.useLoaderData();
  const relCols = (dir: "out" | "in") => [
    {
      key: "rel",
      header: dir === "out" ? "relation →" : "← relation",
      cell: (r: { type: { key: string } }) => <code className="text-xs">{r.type.key}</code>,
    },
  ];
  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {c.name} <StatusBadge status={c.status} />
          </span>
        }
        subtitle={
          <>
            <code>{c.key}</code>
            {c.type ? ` · ${c.type}` : ""} · {c.aliases.map((a) => a.alias).join(", ")}
          </>
        }
      />
      {c.description ? (
        <p className="mb-4 max-w-3xl text-sm text-zinc-600">{c.description}</p>
      ) : null}
      {c.domains.length > 0 ? (
        <div className="mb-4 flex items-center gap-1.5 text-xs">
          <span className="text-zinc-500">domains:</span>
          {c.domains.map((d) => (
            <EntityLink key={d.id} type="domain" entityKey={d.key}>
              {d.name}
            </EntityLink>
          ))}
        </div>
      ) : null}
      <Section title="Source">
        <SourceLink source={c.source} />
      </Section>
      <NeighborhoodPanel concept={c} />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Outgoing relations (${c.outgoingRelations.totalCount ?? 0})`}>
          <DataTable
            rows={c.outgoingRelations.nodes}
            keyOf={(r) => r.id}
            cols={[
              ...relCols("out"),
              {
                key: "target",
                header: "target",
                cell: (r) => (
                  <EntityLink type="concept" entityKey={r.targetConcept.key}>
                    {r.targetConcept.name}
                  </EntityLink>
                ),
              },
            ]}
          />
        </Section>
        <Section title={`Incoming relations (${c.incomingRelations.totalCount ?? 0})`}>
          <DataTable
            rows={c.incomingRelations.nodes}
            keyOf={(r) => r.id}
            cols={[
              {
                key: "source",
                header: "source",
                cell: (r) => (
                  <EntityLink type="concept" entityKey={r.sourceConcept.key}>
                    {r.sourceConcept.name}
                  </EntityLink>
                ),
              },
              ...relCols("in"),
            ]}
          />
        </Section>
      </div>
      <Section title="Used by">
        {backlinkErrors.length > 0 ? (
          <p className="mb-2 text-xs text-red-600">
            backlink query failed: {backlinkErrors.join("; ")}
          </p>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {(
            [
              ["knowledge", backlinks.knowledgeItems, "/explore/knowledge"],
              ["skills", backlinks.skills, "/assembly/skills"],
              ["tools", backlinks.tools, "/assembly/tools"],
              ["fragments", backlinks.promptFragments, "/assembly/fragments"],
            ] as const
          ).map(([label, conn, to]) => (
            <div key={label} className="rounded border border-zinc-200 bg-white p-3">
              <div className="mb-1 text-xs font-semibold text-zinc-500">
                {label} ({conn?.totalCount ?? 0})
              </div>
              <ul className="space-y-1">
                {(conn?.nodes ?? []).slice(0, 8).map((n) => (
                  <li key={n.key}>
                    <Link
                      to={`${to}/$key`}
                      params={{ key: n.key }}
                      className="font-mono text-xs text-blue-700 hover:underline"
                    >
                      {"title" in n ? n.title : n.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>
      <Section title="Metadata">
        <JsonBlock value={c.metadata} />
      </Section>
    </>
  );
}
