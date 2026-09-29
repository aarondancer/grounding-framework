import { resolveSelectionGroup, type SelectionGroupMode } from "@grounding/core";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useClient } from "urql";
import { DataTable } from "../components/table";
import { EntityLink, PageHeader, Section, SourceLink } from "../components/ui";
import type { SelectionGroupsQuery, SimulateGatesQuery } from "../generated/operations";
import { SELECTION_GROUPS, SIMULATE_GATES } from "../lib/api";
import { useSimulatedContext } from "../lib/sim-context";

type Member = Group["members"][number];
type Group = SelectionGroupsQuery["selectionGroups"][number];

const TYPE_MAP: Record<string, string> = {
  Skill: "skill",
  Tool: "tool",
  PromptFragment: "prompt_fragment",
  KnowledgeChunk: "knowledge_chunk",
};

export const Route = createFileRoute("/explore/selection-groups/$key")({
  loader: async ({ context, params }) => {
    const res = await context.urql.query(SELECTION_GROUPS, {}).toPromise();
    if (res.error) throw res.error;
    const group = (res.data?.selectionGroups ?? []).find((g) => g.key === params.key);
    if (!group) throw new Response("not found", { status: 404 });
    return group;
  },
  component: SelectionGroupPage,
});

type GateSim = SimulateGatesQuery["simulateGates"];
type Row = { member: Member; sim: GateSim | "error" | null };

/**
 * Which members win under the simulated context. Gate evaluation is
 * server-side via `simulateGates`; ordering delegates to the normative
 * `resolveSelectionGroup` (spec/12: mode primary, secondary key, UUID ASC
 * tiebreak). Members whose simulation errored count as ineligible — display
 * must never disagree with what the real pipeline would pick.
 */
function memberWinner(mode: string, rows: Row[]): Set<string> {
  const eligible = rows
    .filter(
      (r): r is Row & { sim: GateSim } =>
        r.sim !== null &&
        r.sim !== "error" &&
        (r.sim.authorization?.eligible ?? true) &&
        (r.sim.applicability?.eligible ?? true),
    )
    .map((r) => ({
      member: r.member,
      id: r.member.id,
      priority: r.member.priority ?? 0,
      specificity: [
        r.sim.applicability?.specificity?.[0] ?? 0,
        r.sim.applicability?.specificity?.[1] ?? 0,
      ] as const,
    }));
  const m: SelectionGroupMode =
    mode === "MOST_SPECIFIC" ? "most_specific" : mode === "ALL" ? "all" : "highest_priority";
  return new Set(resolveSelectionGroup(eligible, m).selected.map((g) => g.member.id));
}

function SelectionGroupPage() {
  const g = Route.useLoaderData();
  const client = useClient();
  const { context } = useSimulatedContext();
  const [sims, setSims] = useState<Record<string, GateSim | "error">>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        g.members.map(async (m) => {
          const res = await client
            .query(SIMULATE_GATES, { input: { entity: { id: m.id }, context } })
            .toPromise();
          const sim = res.data ? res.data.simulateGates : null;
          return [m.id, sim ?? "error"] as const;
        }),
      );
      if (!cancelled) setSims(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [client, g.members, context]);

  const rows = useMemo(
    () => g.members.map((m) => ({ member: m, sim: sims[m.id] ?? null })),
    [g.members, sims],
  );
  const winners = useMemo(() => memberWinner(g.mode, rows), [g.mode, rows]);

  return (
    <>
      <PageHeader
        title={g.name ?? g.key}
        subtitle={
          <>
            <code>{g.key}</code> · {g.entityType} · <code>{g.mode.toLowerCase()}</code>
          </>
        }
      />
      <div className="mb-4 text-xs text-zinc-500">
        file: <SourceLink source={g.source} />
      </div>
      <Section title={`Members (${g.members.length}) — winner under simulated context`}>
        <DataTable
          rows={rows}
          keyOf={(r) => r.member.id}
          cols={[
            {
              key: "member",
              header: "member",
              cell: (r) => (
                <EntityLink
                  type={TYPE_MAP[r.member.__typename] ?? r.member.__typename.toLowerCase()}
                  entityKey={r.member.__typename === "KnowledgeChunk" ? r.member.id : r.member.key}
                >
                  {("name" in r.member ? r.member.name : null) ?? r.member.key}
                </EntityLink>
              ),
            },
            {
              key: "type",
              header: "type",
              cell: (r) => <code className="text-xs">{r.member.__typename}</code>,
            },
            { key: "prio", header: "priority", cell: (r) => r.member.priority ?? "—" },
            {
              key: "sim",
              header: "under simulated ctx",
              cell: (r) => {
                if (r.sim === null) return <span className="text-xs text-zinc-400">—</span>;
                if (r.sim === "error")
                  return <span className="text-xs text-red-600">sim error</span>;
                const a = r.sim.authorization;
                const p = r.sim.applicability;
                if (!a && !p) return <span className="text-xs text-zinc-400">ungated</span>;
                return (
                  <span className="space-y-0.5 text-xs">
                    {a ? (
                      <span className={`block ${a.eligible ? "text-emerald-700" : "text-red-600"}`}>
                        authz {a.eligible ? "pass" : `fail (${a.state})`}
                        {a.diagnostics.length > 0
                          ? ` · ${a.diagnostics.map((d) => d.code).join(",")}`
                          : ""}
                      </span>
                    ) : null}
                    {p ? (
                      <span className={`block ${p.eligible ? "text-emerald-700" : "text-red-600"}`}>
                        {p.eligible ? "applicable" : `not applicable (${p.state})`}
                        {p.specificity ? ` · spec [${p.specificity.join(",")}]` : ""}
                        {p.diagnostics.length > 0
                          ? ` · ${p.diagnostics.map((d) => d.code).join(",")}`
                          : ""}
                      </span>
                    ) : null}
                  </span>
                );
              },
            },
            {
              key: "win",
              header: "wins?",
              cell: (r) =>
                winners.has(r.member.id) ? (
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800">
                    winner
                  </span>
                ) : (
                  <span className="text-xs text-zinc-400">—</span>
                ),
            },
          ]}
        />
      </Section>
    </>
  );
}
