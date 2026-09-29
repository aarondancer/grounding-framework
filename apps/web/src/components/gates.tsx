import { useEffect, useState } from "react";
import { useClient } from "urql";
import type { SimulateGatesQuery } from "../generated/operations";
import { SIMULATE_GATES } from "../lib/api";
import { useSimulatedContext } from "../lib/sim-context";
import { JsonBlock } from "./ui";

type GateOutcomeT = NonNullable<SimulateGatesQuery["simulateGates"]["authorization"]>;

/**
 * Gate panel for gated entities (spec/10 simulator): shows the raw
 * authorization/applicability expressions and evaluates them live under the
 * persistent simulated context via `simulateGates` — the same normative
 * engine the pipeline uses, never a client-side reimplementation.
 */
export function GatesPanel({
  entityId,
  authorization,
  applicability,
}: {
  entityId: string;
  authorization: unknown;
  applicability: unknown;
}) {
  const client = useClient();
  const { context } = useSimulatedContext();
  const [sim, setSim] = useState<SimulateGatesQuery["simulateGates"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasGates = authorization != null || applicability != null;

  useEffect(() => {
    if (!hasGates) return;
    let cancelled = false;
    setError(null);
    client
      .query(SIMULATE_GATES, { input: { entity: { id: entityId }, context } })
      .toPromise()
      .then((res) => {
        if (cancelled) return;
        if (res.error) {
          setError(res.error.message);
          setSim(null);
        } else {
          setSim(res.data?.simulateGates ?? null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, entityId, context, hasGates]);

  if (!hasGates) return null;

  const outcome = (o: GateOutcomeT | null | undefined) =>
    o ? (
      <span className="ml-2 inline-flex flex-wrap items-center gap-1 align-middle">
        <span
          className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
            o.eligible ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
          }`}
        >
          {o.eligible ? "passes under ctx" : `fails under ctx (${o.state})`}
        </span>
        {o.diagnostics.map((d) => (
          <code
            key={d.code}
            title={d.message}
            className="rounded bg-zinc-100 px-1 py-0.5 text-[10px] text-zinc-600"
          >
            {d.code}
          </code>
        ))}
      </span>
    ) : null;

  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-700">Gates</h2>
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      <div className="grid gap-3 md:grid-cols-2">
        {authorization != null ? (
          <div>
            <h3 className="mb-1 text-xs font-medium text-zinc-500">
              authorization {outcome(sim?.authorization)}
            </h3>
            <JsonBlock value={authorization} />
          </div>
        ) : null}
        {applicability != null ? (
          <div>
            <h3 className="mb-1 text-xs font-medium text-zinc-500">
              applicability {outcome(sim?.applicability)}
            </h3>
            <JsonBlock value={applicability} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
