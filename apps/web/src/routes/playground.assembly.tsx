import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useClient } from "urql";
import {
  CandidateFunnel,
  CandidateTable,
  DiagnosticsPanel,
  TimingsBar,
} from "../components/diagnostics";
import { Graph, type GraphEdge, type GraphNode } from "../components/graph";
import { DataTable } from "../components/table";
import { EntityLink, ErrorBanner, JsonBlock, PageHeader, Section } from "../components/ui";
import type { AgentAssemblyInput, AssembleQuery } from "../generated/operations";
import { ASSEMBLE, RETRIEVAL_PROFILES, TEMPLATES } from "../lib/api";
import { entityLinkKey } from "../lib/nav";
import { useSimulatedContext } from "../lib/sim-context";

type AssemblyResult = AssembleQuery["assembleAgent"];

export const Route = createFileRoute("/playground/assembly")({
  loader: async ({ context }) => {
    const [templates, profiles] = await Promise.all([
      context.urql.query(TEMPLATES, {}).toPromise(),
      context.urql.query(RETRIEVAL_PROFILES, {}).toPromise(),
    ]);
    if (templates.error) throw templates.error;
    if (profiles.error) throw profiles.error;
    return {
      templates: templates.data?.agentTemplates ?? [],
      profiles: profiles.data?.retrievalProfiles ?? [],
    };
  },
  component: AssemblyPlayground,
});

const inputCls = "rounded border border-zinc-300 px-2 py-1 text-sm";

/** Comma-separated bindings input → string[]; empty input means unset. */
function parseBindings(raw: string): string[] {
  return raw
    .split(",")
    .map((b) => b.trim())
    .filter(Boolean);
}

function AssemblyPlayground() {
  const { templates, profiles } = Route.useLoaderData();
  const client = useClient();
  const navigate = useNavigate();
  const { context } = useSimulatedContext();
  const [template, setTemplate] = useState("");
  const [task, setTask] = useState("");
  const [bindings, setBindings] = useState("");
  const [noBindings, setNoBindings] = useState(false);
  const [retrievalProfile, setRetrievalProfile] = useState("");
  const [maxSkills, setMaxSkills] = useState("");
  const [maxTools, setMaxTools] = useState("");
  const [promptTokens, setPromptTokens] = useState("");
  const [bootstrapTokens, setBootstrapTokens] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AssemblyResult | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const run = async () => {
    setRunning(true);
    setError(null);
    const budgets: NonNullable<AgentAssemblyInput["budgets"]> = {};
    if (maxSkills) budgets.maxSkills = Number(maxSkills);
    if (maxTools) budgets.maxTools = Number(maxTools);
    if (promptTokens) budgets.promptTokens = Number(promptTokens);
    if (bootstrapTokens) budgets.bootstrapKnowledgeTokens = Number(bootstrapTokens);
    const input: AgentAssemblyInput = {
      template,
      context,
      diagnostics: true,
      ...(task.trim() ? { task } : {}),
      // spec/09: explicit [] means *no* bindings — distinct from omitting the
      // field (all authored bindings available). The checkbox expresses it.
      ...(noBindings
        ? { runtime: { availableBindings: [] } }
        : bindings.trim()
          ? { runtime: { availableBindings: parseBindings(bindings) } }
          : {}),
      ...(retrievalProfile ? { retrievalProfile } : {}),
      ...(Object.keys(budgets).length > 0 ? { budgets } : {}),
    };
    const res = await client
      .query(ASSEMBLE, { input }, { requestPolicy: "network-only" })
      .toPromise();
    setRunning(false);
    if (res.error) {
      setError(res.error.message);
      setResult(null);
      return;
    }
    setResult(res.data?.assembleAgent ?? null);
  };

  const toolGraph = useMemo(() => {
    if (!result?.diagnostics) return null;
    const nodes: GraphNode[] = [];
    const edges: GraphEdge[] = [];
    const seen = new Map<string, string>();
    for (const t of result.tools) {
      seen.set(t.tool.key, t.tool.name);
    }
    for (const [key, name] of seen) {
      nodes.push({ id: key, label: name, sub: key });
    }
    for (const d of result.diagnostics.dependencyResolutions) {
      if (!d.sourceTool || !d.targetTool) continue;
      if (!seen.has(d.targetTool.key)) {
        seen.set(d.targetTool.key, d.targetTool.key);
        nodes.push({
          id: d.targetTool.key,
          label: d.targetTool.key,
          accent: d.status === "INCLUDED" ? undefined : "warn",
        });
      }
      edges.push({
        id: `${d.sourceTool.key}->${d.targetTool.key}:${d.requirement}`,
        source: d.sourceTool.key,
        target: d.targetTool.key,
        label: `${d.requirement.toLowerCase()} · ${d.status.toLowerCase()}`,
        dashed: d.requirement === "OPTIONAL",
      });
    }
    return edges.length > 0 || nodes.length > 0 ? { nodes, edges } : null;
  }, [result]);

  /** spec/10 composition tree: template → skills → their required tools,
   * fragments grouped by section, bootstrap knowledge. */
  const compositionTree = useMemo(() => {
    if (!result) return null;
    const toolsBySkill = new Map<string, typeof result.tools>();
    for (const t of result.tools) {
      for (const r of t.requiredBy) {
        if (r.type === "skill") {
          const list = toolsBySkill.get(r.key) ?? [];
          list.push(t);
          toolsBySkill.set(r.key, list);
        }
      }
    }
    const unownedTools = result.tools.filter((t) => !t.requiredBy.some((r) => r.type === "skill"));
    const fragmentsBySection = new Map<string, typeof result.promptFragments>();
    for (const f of result.promptFragments) {
      const list = fragmentsBySection.get(f.fragment.section) ?? [];
      list.push(f);
      fragmentsBySection.set(f.fragment.section, list);
    }
    return { toolsBySkill, unownedTools, fragmentsBySection };
  }, [result]);

  const exportDef = useMemo(
    () =>
      result
        ? {
            name: `explorer-${Date.now()}`,
            template: result.template.key,
            ...(result.task ? { task: result.task.text } : {}),
            context,
            ...(noBindings
              ? { runtime: { availableBindings: [] } }
              : bindings.trim()
                ? { runtime: { availableBindings: parseBindings(bindings) } }
                : {}),
            expect: {
              skills: result.skills.map((s) => s.skill.key),
              tools: result.tools.map((t) => t.tool.key),
              promptFragments: result.promptFragments.map((f) => f.fragment.key),
            },
          }
        : null,
    [result, context, bindings, noBindings],
  );

  const copyExport = () => {
    if (exportDef) void navigator.clipboard.writeText(JSON.stringify(exportDef, null, 2));
  };
  const downloadExport = () => {
    if (!exportDef) return;
    const blob = new Blob([JSON.stringify(exportDef, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${exportDef.name}.assembly-eval.jsonc`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <PageHeader title="Agent Assembly Playground" subtitle="assemble an agent with diagnostics" />
      <Section title="Inputs">
        <div className="flex flex-wrap items-center gap-2">
          <select
            className={inputCls}
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          >
            <option value="">select template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.key}>
                {t.name}
              </option>
            ))}
          </select>
          <input
            className={`${inputCls} w-96`}
            placeholder="task text (optional — skills rank on it)…"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          />
          <input
            className={`${inputCls} w-56`}
            placeholder="bindings: a,b,c (omit = all)"
            value={bindings}
            onChange={(e) => setBindings(e.target.value)}
            title="availableBindings — leave empty to offer every authored binding"
            disabled={noBindings}
          />
          <label
            className="flex items-center gap-1 text-xs text-zinc-500"
            title="send availableBindings: [] — no runtime bindings (spec/09)"
          >
            <input
              type="checkbox"
              checked={noBindings}
              onChange={(e) => setNoBindings(e.target.checked)}
            />
            none available
          </label>
          <select
            className={inputCls}
            value={retrievalProfile}
            onChange={(e) => setRetrievalProfile(e.target.value)}
            title="retrieval profile override (template default if empty)"
          >
            <option value="">profile: template default</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.key}>
                {p.name ?? p.key}
              </option>
            ))}
          </select>
          <input
            className={`${inputCls} w-20`}
            placeholder="maxSkills"
            inputMode="numeric"
            value={maxSkills}
            onChange={(e) => setMaxSkills(e.target.value)}
            title="budget: max skills"
          />
          <input
            className={`${inputCls} w-20`}
            placeholder="maxTools"
            inputMode="numeric"
            value={maxTools}
            onChange={(e) => setMaxTools(e.target.value)}
            title="budget: max tools"
          />
          <input
            className={`${inputCls} w-24`}
            placeholder="promptTokens"
            inputMode="numeric"
            value={promptTokens}
            onChange={(e) => setPromptTokens(e.target.value)}
            title="budget: prompt token cap"
          />
          <input
            className={`${inputCls} w-24`}
            placeholder="bootstrapToks"
            inputMode="numeric"
            value={bootstrapTokens}
            onChange={(e) => setBootstrapTokens(e.target.value)}
            title="budget: bootstrap knowledge token cap"
          />
          <button
            type="button"
            disabled={!template || running}
            onClick={() => void run()}
            className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? "Assembling…" : "Assemble"}
          </button>
        </div>
      </Section>
      {error ? <ErrorBanner message={error} /> : null}
      {result ? (
        <>
          <Section title="Composition">
            <p className="mb-2 text-xs text-zinc-500">
              template <code>{result.template.key}</code> · ns <code>{result.namespace.key}</code> ·
              rev <code>{result.runtimeRevision}</code> · ctx hash{" "}
              <code>{result.contextHash.slice(0, 16)}…</code>
              {result.task ? ` · task "${result.task.text}"` : " · no task (structure only)"}
            </p>
            <div className="grid gap-6 lg:grid-cols-3">
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-500">
                  skills ({result.skills.length})
                </h4>
                <DataTable
                  rows={result.skills}
                  keyOf={(s) => s.skill.id}
                  cols={[
                    { key: "rank", header: "#", cell: (s) => s.rank },
                    {
                      key: "skill",
                      header: "skill",
                      cell: (s) => (
                        <EntityLink type="skill" entityKey={s.skill.key}>
                          {s.skill.name}
                        </EntityLink>
                      ),
                    },
                    { key: "score", header: "score", cell: (s) => s.score?.toFixed(3) ?? "—" },
                    {
                      key: "why",
                      header: "why",
                      cell: (s) => (
                        <span className="text-[10px] text-zinc-500">
                          {s.inclusionReasons.map((r) => r.code).join(", ")}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-500">
                  tools ({result.tools.length})
                </h4>
                <DataTable
                  rows={result.tools}
                  keyOf={(t) => t.tool.id}
                  cols={[
                    {
                      key: "tool",
                      header: "tool",
                      cell: (t) => (
                        <EntityLink type="tool" entityKey={t.tool.key}>
                          {t.tool.name}
                        </EntityLink>
                      ),
                    },
                    {
                      key: "src",
                      header: "sources",
                      cell: (t) => <code className="text-xs">{t.sources.join(",")}</code>,
                    },
                    {
                      key: "bind",
                      header: "binding",
                      cell: (t) => <code className="text-xs">{t.tool.runtimeBinding}</code>,
                    },
                    {
                      key: "reqby",
                      header: "required by",
                      cell: (t) =>
                        t.requiredBy.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {t.requiredBy.map((r) => (
                              <EntityLink key={r.id} type={r.type} entityKey={entityLinkKey(r)}>
                                {r.key}
                              </EntityLink>
                            ))}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">—</span>
                        ),
                    },
                    {
                      key: "why",
                      header: "why",
                      cell: (t) => (
                        <span className="text-[10px] text-zinc-500">
                          {t.inclusionReasons.map((r) => r.code).join(", ")}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
              <div>
                <h4 className="mb-1 text-xs font-semibold text-zinc-500">
                  fragments ({result.promptFragments.length})
                </h4>
                <DataTable
                  rows={result.promptFragments}
                  keyOf={(f) => f.fragment.id}
                  cols={[
                    { key: "ord", header: "#", cell: (f) => f.renderedOrder },
                    {
                      key: "frag",
                      header: "fragment",
                      cell: (f) => (
                        <EntityLink type="prompt_fragment" entityKey={f.fragment.key}>
                          {f.fragment.name}
                        </EntityLink>
                      ),
                    },
                    {
                      key: "sec",
                      header: "section",
                      cell: (f) => <code className="text-xs">{f.fragment.section}</code>,
                    },
                    {
                      key: "src",
                      header: "sources",
                      cell: (f) => <code className="text-xs">{f.sources.join(",")}</code>,
                    },
                    {
                      key: "why",
                      header: "why",
                      cell: (f) => (
                        <span className="text-[10px] text-zinc-500">
                          {f.inclusionReasons.map((r) => r.code).join(", ")}
                        </span>
                      ),
                    },
                  ]}
                />
              </div>
            </div>
          </Section>
          {compositionTree ? (
            <Section title="Composition tree">
              <ul className="space-y-1 text-sm">
                <li>
                  <EntityLink type="agent_template" entityKey={result.template.key}>
                    {result.template.name}
                  </EntityLink>
                  <ul className="ml-4 space-y-1 border-l border-zinc-200 pl-3">
                    {result.skills.map((s) => (
                      <li key={s.skill.id}>
                        <EntityLink type="skill" entityKey={s.skill.key}>
                          {s.skill.name}
                        </EntityLink>
                        <span className="ml-2 text-[10px] text-zinc-400">
                          {s.inclusionReasons.map((r) => r.code).join(", ")}
                        </span>
                        {(compositionTree.toolsBySkill.get(s.skill.key) ?? []).length > 0 ? (
                          <ul className="ml-4 border-l border-zinc-200 pl-3">
                            {(compositionTree.toolsBySkill.get(s.skill.key) ?? []).map((t) => (
                              <li key={t.tool.id}>
                                <EntityLink type="tool" entityKey={t.tool.key}>
                                  {t.tool.name}
                                </EntityLink>
                                <span className="ml-2 text-[10px] text-zinc-400">
                                  {t.inclusionReasons.map((r) => r.code).join(", ")}
                                </span>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    ))}
                    {compositionTree.unownedTools.map((t) => (
                      <li key={t.tool.id}>
                        <EntityLink type="tool" entityKey={t.tool.key}>
                          {t.tool.name}
                        </EntityLink>
                        <span className="ml-2 text-[10px] text-zinc-400">
                          {t.inclusionReasons.map((r) => r.code).join(", ")}
                        </span>
                      </li>
                    ))}
                    {[...compositionTree.fragmentsBySection.entries()].map(([section, frags]) => (
                      <li key={section}>
                        <span className="text-xs text-zinc-500">section {section}</span>
                        <ul className="ml-4 border-l border-zinc-200 pl-3">
                          {frags.map((f) => (
                            <li key={f.fragment.id}>
                              <EntityLink type="prompt_fragment" entityKey={f.fragment.key}>
                                {f.fragment.name}
                              </EntityLink>
                              <span className="ml-2 text-[10px] text-zinc-400">
                                {f.inclusionReasons.map((r) => r.code).join(", ")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ))}
                    {result.bootstrapKnowledge.length > 0 ? (
                      <li>
                        <span className="text-xs text-zinc-500">bootstrap knowledge</span>
                        <ul className="ml-4 border-l border-zinc-200 pl-3">
                          {result.bootstrapKnowledge.map((b) => (
                            <li key={b.chunk.id}>
                              <EntityLink type="knowledge_chunk" entityKey={b.chunk.id}>
                                {b.chunk.heading ?? b.chunk.key}
                              </EntityLink>
                            </li>
                          ))}
                        </ul>
                      </li>
                    ) : null}
                  </ul>
                </li>
              </ul>
            </Section>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Budget usage">
              <dl className="grid grid-cols-2 gap-1 text-xs">
                {(
                  [
                    ["skills", result.budgetUsage.skills, result.budgetUsage.maxSkills],
                    ["tools", result.budgetUsage.tools, result.budgetUsage.maxTools],
                    [
                      "prompt tokens",
                      result.budgetUsage.promptTokens,
                      result.budgetUsage.maxPromptTokens,
                    ],
                    [
                      "bootstrap tokens",
                      result.budgetUsage.bootstrapKnowledgeTokens,
                      result.budgetUsage.maxBootstrapKnowledgeTokens,
                    ],
                  ] as [string, number, number | null][]
                ).map(([k, v, max]) => (
                  <div key={k} className="flex justify-between border-b border-zinc-100 py-0.5">
                    <dt className="font-mono text-zinc-500">{k}</dt>
                    <dd className="font-mono">
                      {v} / {max ?? "∞"}
                    </dd>
                  </div>
                ))}
              </dl>
            </Section>
            <Section title={`Bootstrap knowledge (${result.bootstrapKnowledge.length})`}>
              <ul className="space-y-1">
                {result.bootstrapKnowledge.map((b) => (
                  <li key={b.chunk.id} className="flex items-center gap-2 text-xs">
                    <EntityLink type="knowledge_chunk" entityKey={b.chunk.id}>
                      {b.chunk.heading ?? b.chunk.key}
                    </EntityLink>
                    <span className="text-zinc-400">
                      {b.chunk.knowledgeItem.key} · {b.score.toFixed(3)}
                    </span>
                  </li>
                ))}
                {result.bootstrapKnowledge.length === 0 ? (
                  <li className="text-zinc-400">none</li>
                ) : null}
              </ul>
            </Section>
          </div>
          {result.task && result.task.resolvedConcepts.length > 0 ? (
            <Section title="Task-resolved concepts">
              <span className="flex flex-wrap gap-1">
                {result.task.resolvedConcepts.map((c) => (
                  <EntityLink key={c.concept.key} type="concept" entityKey={c.concept.key}>
                    {c.concept.name}
                  </EntityLink>
                ))}
              </span>
            </Section>
          ) : null}
          {result.renderedPrompt !== null ? (
            <Section title="Rendered prompt">
              <button
                type="button"
                onClick={() => setShowPrompt((s) => !s)}
                className="mb-2 rounded border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-100"
              >
                {showPrompt ? "Hide" : "Show"} rendered prompt
              </button>
              {showPrompt ? (
                <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded border border-zinc-200 bg-white p-4 text-xs">
                  {result.renderedPrompt}
                </pre>
              ) : null}
            </Section>
          ) : null}
          {toolGraph && toolGraph.edges.length > 0 ? (
            <Section title="Tool dependency graph">
              <Graph
                nodes={toolGraph.nodes}
                edges={toolGraph.edges}
                onNodeClick={(key) =>
                  navigate({ to: "/assembly/tools/$key", params: { key }, search: {} })
                }
                height={320}
              />
            </Section>
          ) : null}
          {result.diagnostics ? (
            <>
              <DiagnosticsPanel
                title="Assembly diagnostics"
                timings={result.diagnostics.timings}
                warnings={result.diagnostics.warnings}
                errors={result.diagnostics.errors}
              />
              <div className="grid gap-6 lg:grid-cols-3">
                <Section title={`Skill candidates (${result.diagnostics.skillCandidates.length})`}>
                  <CandidateTable rows={result.diagnostics.skillCandidates} />
                </Section>
                <Section title={`Tool candidates (${result.diagnostics.toolCandidates.length})`}>
                  <CandidateTable rows={result.diagnostics.toolCandidates} />
                </Section>
                <Section
                  title={`Fragment candidates (${result.diagnostics.fragmentCandidates.length})`}
                >
                  <CandidateTable rows={result.diagnostics.fragmentCandidates} />
                </Section>
              </div>
              {result.diagnostics.dependencyResolutions.length > 0 ? (
                <Section title="Dependency resolutions">
                  <DataTable
                    rows={result.diagnostics.dependencyResolutions}
                    keyOf={(d) => `${d.sourceTool?.key}->${d.targetTool?.key}:${d.requirement}`}
                    cols={[
                      {
                        key: "src",
                        header: "source",
                        cell: (d) =>
                          d.sourceTool ? (
                            <EntityLink type="tool" entityKey={d.sourceTool.key} />
                          ) : (
                            "—"
                          ),
                      },
                      {
                        key: "tgt",
                        header: "target",
                        cell: (d) =>
                          d.targetTool ? (
                            <EntityLink type="tool" entityKey={d.targetTool.key} />
                          ) : (
                            "—"
                          ),
                      },
                      {
                        key: "req",
                        header: "requirement",
                        cell: (d) => <code className="text-xs">{d.requirement.toLowerCase()}</code>,
                      },
                      {
                        key: "status",
                        header: "status",
                        cell: (d) => <code className="text-xs">{d.status.toLowerCase()}</code>,
                      },
                      {
                        key: "reason",
                        header: "reason",
                        cell: (d) => <span className="text-xs">{d.reason}</span>,
                      },
                    ]}
                  />
                </Section>
              ) : null}
              {result.diagnostics.bootstrapRetrieval ? (
                <DiagnosticsPanel
                  title="Bootstrap retrieval (nested pipeline)"
                  errors={result.diagnostics.bootstrapRetrieval.errors}
                >
                  <div className="grid gap-4 lg:grid-cols-2">
                    <CandidateFunnel
                      counts={result.diagnostics.bootstrapRetrieval.candidateCounts}
                    />
                    <TimingsBar timings={result.diagnostics.bootstrapRetrieval.timings} />
                  </div>
                </DiagnosticsPanel>
              ) : null}
            </>
          ) : null}
          <Section title="Export eval definition">
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
