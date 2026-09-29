import { Dialog } from "@base-ui/react/dialog";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useClient } from "urql";
import { GLOBAL_SEARCH } from "../lib/api";
import { entityPath } from "../lib/nav";

type Hit = { type: string; key: string; label: string; hint?: string };

/**
 * Global search / command palette (spec/10): one GraphQL round-trip over
 * every browse collection; results deep-link to detail pages.
 */
export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useClient();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!open || q.trim() === "") {
      setHits([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await client.query(GLOBAL_SEARCH, { q: q.trim() }).toPromise();
      if (cancelled || !res.data) return;
      const d = res.data;
      const needle = q.trim().toLowerCase();
      const match = (e: { key: string; name?: string | null; title?: string | null }) =>
        e.key.toLowerCase().includes(needle) ||
        (e.name ?? "").toLowerCase().includes(needle) ||
        (e.title ?? "").toLowerCase().includes(needle);
      const label = (e: { key: string; name?: string | null; title?: string | null }) =>
        e.name ?? e.title ?? e.key;
      // Server-side `search` narrows the six connections; keyed-only lists
      // filter client-side — one table drives both.
      type Row = { key: string; name?: string | null; title?: string | null };
      const groups: { type: string; rows: readonly Row[] }[] = [
        { type: "concept", rows: d.concepts.nodes },
        { type: "knowledge_item", rows: d.knowledgeItems.nodes },
        { type: "domain", rows: d.domains.nodes },
        { type: "skill", rows: d.skills.nodes },
        { type: "tool", rows: d.tools.nodes },
        { type: "prompt_fragment", rows: d.promptFragments.nodes },
        { type: "agent_template", rows: d.agentTemplates.filter(match).slice(0, 5) },
        { type: "selection_group", rows: d.selectionGroups.filter(match).slice(0, 5) },
        { type: "dimension", rows: d.dimensions.filter(match).slice(0, 5) },
        { type: "retrieval_profile", rows: d.retrievalProfiles.filter(match).slice(0, 5) },
      ];
      const out: Hit[] = groups.flatMap(({ type, rows }) =>
        rows.map((r) => ({ type, key: r.key, label: label(r) })),
      );
      if (d.namespace && match(d.namespace)) {
        out.push({
          type: "namespace",
          key: d.namespace.key,
          label: d.namespace.name ?? d.namespace.key,
        });
      }
      setHits(out);
      setActive(0);
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, open, client]);

  const go = (hit: Hit) => {
    const to = entityPath(hit.type, hit.key);
    if (to) {
      navigate({ to, search: {} });
      onClose();
      setQ("");
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 bg-black/30" />
        <Dialog.Popup className="fixed left-1/2 top-24 w-[34rem] -translate-x-1/2 rounded-lg border border-zinc-200 bg-white p-3 shadow-xl">
          <Dialog.Title className="sr-only">Search</Dialog.Title>
          <input
            // biome-ignore lint/a11y/noAutofocus: palette semantics
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hits[active]) go(hits[active]);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((a) => Math.min(a + 1, hits.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((a) => Math.max(a - 1, 0));
              }
            }}
            placeholder="Search concepts, knowledge, skills, tools, fragments…"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
          />
          <ul className="mt-2 max-h-80 overflow-auto">
            {hits.map((h, i) => (
              <li key={`${h.type}:${h.key}`}>
                <button
                  type="button"
                  onClick={() => go(h)}
                  className={`flex w-full items-center justify-between rounded px-2 py-1.5 text-left text-sm ${
                    i === active ? "bg-blue-50" : "hover:bg-zinc-100"
                  }`}
                >
                  <span>{h.label}</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-400">
                    {h.type.replace(/_/g, " ")}
                  </span>
                </button>
              </li>
            ))}
            {q.trim() !== "" && hits.length === 0 ? (
              <li className="px-2 py-3 text-sm text-zinc-400">No matches</li>
            ) : null}
          </ul>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
