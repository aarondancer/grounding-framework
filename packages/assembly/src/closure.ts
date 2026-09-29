/**
 * Tool dependency closure (spec/06). Pure resolver: the orchestrator supplies
 * the tool rows, the reachable edge set, and a static-usability gate
 * (lifecycle/authorization/applicability/runtime binding/budget); this module
 * propagates required/optional failures to a fixpoint and produces per-edge
 * resolutions plus causal diagnostics. The compiler guarantees the dependency
 * graph is acyclic, so the fixpoint converges within |tools| passes.
 */

import { AssemblyCode } from "@grounding/core";
import type { ToolEdge } from "./candidates.ts";
import type { DependencyResolution, DiagnosticCause, ToolRow } from "./types.ts";

export type GateOutcome = { usable: boolean; code: string | null; message: string | null };

export type ClosureInput = {
  /** Tool ids pulled in directly (skill-required tools + direct task tools). */
  seeds: ReadonlySet<string>;
  /** Tools that are indivisible required seeds (skill direct tools). */
  requiredSeeds: ReadonlySet<string>;
  tools: ReadonlyMap<string, ToolRow>;
  /** All dependency edges reachable from the seeds. */
  edges: ToolEdge[];
  /** Tools force-excluded (e.g. budget drops) — treated as unavailable. */
  excluded?: ReadonlySet<string>;
  /**
   * Authorization-denied tools — their identity must not leak into
   * resolutions/causes (spec/14 restricted diagnostics).
   */
  redactedIds?: ReadonlySet<string>;
  gate: (tool: ToolRow) => GateOutcome;
};

export type ToolVerdict = {
  usable: boolean;
  /** Static gate failure (null when failure came from required dependencies). */
  gate: GateOutcome;
  /** Required-dependency failure causes (empty when gate failed outright). */
  causes: DiagnosticCause[];
};

export type ClosureResult = {
  /** Verdict per tool that entered the closure domain. */
  verdicts: Map<string, ToolVerdict>;
  /** Usable tools reachable from seeds via edges whose source is included. */
  included: Set<string>;
  /** Included tools on the required path (required seeds + required edges). */
  required: Set<string>;
  resolutions: DependencyResolution[];
};

export function resolveClosure(input: ClosureInput): ClosureResult {
  const { seeds, requiredSeeds, tools, edges, gate } = input;
  const excluded = input.excluded ?? new Set<string>();
  const edgesBySource = new Map<string, ToolEdge[]>();
  for (const e of edges) {
    const list = edgesBySource.get(e.sourceToolId) ?? [];
    list.push(e);
    edgesBySource.set(e.sourceToolId, list);
  }

  // Considered set: everything reachable from seeds, usable or not — edges
  // under unreachable sources are still reported as BLOCKED_BY_DEPENDENCY.
  const considered = new Set<string>(seeds);
  const queue = [...seeds];
  while (queue.length > 0) {
    const cur = queue.pop();
    if (cur === undefined) break;
    for (const e of edgesBySource.get(cur) ?? []) {
      if (!considered.has(e.targetToolId)) {
        considered.add(e.targetToolId);
        queue.push(e.targetToolId);
      }
    }
  }

  // Static gates.
  const verdicts = new Map<string, ToolVerdict>();
  for (const id of considered) {
    const tool = tools.get(id);
    if (!tool || excluded.has(id)) {
      verdicts.set(id, {
        usable: false,
        gate: {
          usable: false,
          code: null,
          message: tool ? "tool omitted by effective budget" : "tool not materialized",
        },
        causes: [],
      });
      continue;
    }
    const g = gate(tool);
    verdicts.set(id, { usable: g.usable, gate: g, causes: [] });
  }

  // Usability fixpoint: a tool is unusable when any required target is
  // unusable. Acyclic per the compiler, so this converges in <= |tools| passes.
  for (let pass = 0; pass <= considered.size; pass++) {
    let changed = false;
    for (const id of considered) {
      const v = verdicts.get(id);
      if (!v || !v.usable) continue;
      for (const e of edgesBySource.get(id) ?? []) {
        if (e.requirement === "required" && verdicts.get(e.targetToolId)?.usable === false) {
          v.usable = false;
          changed = true;
          break;
        }
      }
    }
    if (!changed) break;
  }

  // Collect required-dependency causes after the fixpoint.
  for (const [id, v] of verdicts) {
    if (v.usable || !v.gate.usable) continue;
    for (const e of edgesBySource.get(id) ?? []) {
      if (e.requirement !== "required") continue;
      const target = verdicts.get(e.targetToolId);
      if (target && !target.usable) {
        v.causes.push({
          entityType: "tool",
          entityId: input.redactedIds?.has(e.targetToolId) ? null : e.targetToolId,
          code: AssemblyCode.REQUIRED_DEPENDENCY_UNAVAILABLE,
          message: "required tool dependency is not usable",
        });
      }
    }
  }

  // Inclusion: reachable from usable seeds via edges whose source is included.
  const included = new Set<string>();
  const work = [...seeds].filter((id) => verdicts.get(id)?.usable === true);
  for (const id of work) included.add(id);
  while (work.length > 0) {
    const cur = work.pop();
    if (cur === undefined) break;
    for (const e of edgesBySource.get(cur) ?? []) {
      if (verdicts.get(e.targetToolId)?.usable === true && !included.has(e.targetToolId)) {
        included.add(e.targetToolId);
        work.push(e.targetToolId);
      }
    }
  }

  // Required set: required seeds that made it in, closed over required edges
  // whose source stays included.
  const required = new Set<string>();
  const reqWork = [...requiredSeeds].filter((id) => included.has(id));
  for (const id of reqWork) required.add(id);
  while (reqWork.length > 0) {
    const cur = reqWork.pop();
    if (cur === undefined) break;
    for (const e of edgesBySource.get(cur) ?? []) {
      if (
        e.requirement === "required" &&
        included.has(e.targetToolId) &&
        !required.has(e.targetToolId)
      ) {
        required.add(e.targetToolId);
        reqWork.push(e.targetToolId);
      }
    }
  }

  // Per-edge resolutions in deterministic edge order.
  const resolutions: DependencyResolution[] = [];
  for (const e of edges) {
    if (!considered.has(e.sourceToolId)) continue;
    const src = tools.get(e.sourceToolId);
    const tgt = tools.get(e.targetToolId);
    const ref = (t: ToolRow | undefined, id: string) =>
      input.redactedIds?.has(id) ? { id: "", key: "" } : { id, key: t?.key ?? id };
    const targetUsable = verdicts.get(e.targetToolId)?.usable === true;
    let status: DependencyResolution["status"];
    let reason: string | null = null;
    if (targetUsable && included.has(e.sourceToolId)) {
      status = "INCLUDED";
    } else if (!targetUsable && e.requirement === "required") {
      // The required target's failure is the causal story, whether or not the
      // source itself was already blocked.
      status = "UNAVAILABLE";
      reason = "required dependency is unavailable";
    } else if (!targetUsable) {
      status = "OPTIONAL_OMITTED";
      reason = "optional dependency is unavailable";
    } else {
      status = "BLOCKED_BY_DEPENDENCY";
      reason = "source tool is not in the resolved closure";
    }
    resolutions.push({
      sourceTool: ref(src, e.sourceToolId),
      targetTool: ref(tgt, e.targetToolId),
      requirement: e.requirement,
      status,
      reason,
    });
  }

  return { verdicts, included, required, resolutions };
}
