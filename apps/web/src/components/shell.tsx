import { Link, useMatches, useNavigate } from "@tanstack/react-router";
import { type ReactNode, useEffect, useState } from "react";
import { NAV } from "../lib/nav";
import { useSimulatedContext } from "../lib/sim-context";
import { CommandPalette } from "./palette";

/** Section prefixes have no index route — link each to its first page. */
const SECTION_LANDINGS: Record<string, string> = {
  "/explore": "/explore/concepts",
  // No chunks index route — chunks are reached via their knowledge item.
  "/explore/chunks": "/explore/knowledge",
  "/assembly": "/assembly/templates",
  "/playground": "/playground/retrieval",
  "/dev": "/dev/graphql",
};

function Breadcrumbs() {
  const matches = useMatches();
  const crumbs = matches
    .map((m) => m.pathname)
    .filter((p) => p !== "/")
    .flatMap((p) => p.split("/").filter(Boolean));
  const acc: string[] = [];
  return (
    <nav className="flex items-center gap-1 text-xs text-zinc-500">
      <Link to="/" search={{}} className="hover:text-zinc-900">
        grounding
      </Link>
      {crumbs.map((c) => {
        acc.push(`/${c}`);
        const path = acc.join("/");
        const to = SECTION_LANDINGS[path] ?? path;
        return (
          <span key={path} className="flex items-center gap-1">
            <span>/</span>
            <Link to={to} search={{}} className="hover:text-zinc-900">
              {c}
            </Link>
          </span>
        );
      })}
    </nav>
  );
}

/** Compact readout of the persistent simulated context. */
function SimContextStrip() {
  const { context } = useSimulatedContext();
  const keys = Object.keys(context);
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate({ to: "/explore/dimensions", search: {} })}
      title="Simulated context — edit under Dimensions"
      className="rounded border border-zinc-300 px-2 py-1 font-mono text-[11px] text-zinc-600 hover:bg-zinc-100"
    >
      ctx:{" "}
      {keys.length === 0 ? "∅" : keys.map((k) => `${k}=${JSON.stringify(context[k])}`).join(" ")}
    </button>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const nav = NAV;
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <aside className="w-56 shrink-0 border-r border-zinc-200 bg-white px-3 py-4">
        <div className="mb-4 px-2">
          <Link to="/" search={{}} className="text-sm font-semibold">
            Grounding Explorer
          </Link>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-zinc-400">read-only</div>
        </div>
        {nav.map((group) => (
          <div key={group.label} className="mb-4">
            <div className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              {group.label}
            </div>
            {group.items.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="block rounded px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-100 [&.active]:bg-zinc-200 [&.active]:font-medium"
              >
                {item.label}
              </Link>
            ))}
          </div>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-2">
          <Breadcrumbs />
          <div className="flex items-center gap-2">
            <SimContextStrip />
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100"
            >
              Search ⌘K
            </button>
          </div>
        </header>
        <main className="min-w-0 flex-1 p-5">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
