import { type AssemblyServices, assembleAgent } from "@grounding/assembly";
import { schema } from "@grounding/db";
import { type RetrievalServices, retrieve } from "@grounding/retrieval";
import { inArray } from "drizzle-orm";
import { checkAssemblyExpect, checkRetrievalExpect } from "./assertions.ts";
import type { EvalFile, EvalReport, EvalResult } from "./types.ts";

/** Union of the two service shapes (identical fields by design). */
export type EvalServices = RetrievalServices & AssemblyServices;

/** knowledge_items.id → key, for `itemKey#chunkKey` eval refs (spec/11). */
async function itemKeyMap(
  services: EvalServices,
  itemIds: Iterable<string>,
): Promise<Map<string, string>> {
  const ids = [...itemIds];
  if (ids.length === 0) return new Map();
  const rows = await services.db
    .select({ id: schema.knowledgeItems.id, key: schema.knowledgeItems.key })
    .from(schema.knowledgeItems)
    .where(inArray(schema.knowledgeItems.id, ids));
  return new Map(rows.map((r) => [r.id, r.key]));
}

function refFor(map: Map<string, string>, chunk: { knowledgeItemId: string; chunkKey: string }) {
  return `${map.get(chunk.knowledgeItemId) ?? chunk.knowledgeItemId}#${chunk.chunkKey}`;
}

/**
 * Deterministic eval runner (spec/11 layer 4). Requires the corpus to be
 * materialized — `grounding eval` builds first unless --no-build.
 */
export async function runEvalFiles(
  services: EvalServices,
  files: EvalFile[],
  opts: { namespace?: string } = {},
): Promise<EvalReport> {
  const results: EvalResult[] = [];
  for (const file of files) {
    const base = { name: file.def.name, path: file.path, kind: file.kind };
    try {
      if (file.kind === "retrieval-eval") {
        const r = await retrieve(services, {
          ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
          query: file.def.query,
          ...(file.def.context !== undefined ? { context: file.def.context } : {}),
          ...(file.def.profile !== undefined ? { profile: file.def.profile } : {}),
        });
        const itemIds = new Set<string>();
        for (const i of r.results) itemIds.add(i.chunk.knowledgeItemId);
        for (const c of r.packedContext?.chunks ?? []) itemIds.add(c.knowledgeItemId);
        const keys = await itemKeyMap(services, itemIds);
        const ordered = r.results.map((i) => refFor(keys, i.chunk));
        const present = new Set(
          (r.packedContext?.chunks ?? r.results.map((i) => i.chunk)).map((c) => refFor(keys, c)),
        );
        const failures = checkRetrievalExpect(file.def.expect, {
          ordered,
          present,
          resolvedConceptKeys: r.resolvedConcepts.map((c) => c.concept.key),
        });
        results.push({ ...base, ok: failures.length === 0, failures });
      } else {
        const r = await assembleAgent(services, {
          ...(opts.namespace !== undefined ? { namespace: opts.namespace } : {}),
          template: file.def.template,
          ...(file.def.task !== undefined ? { task: file.def.task } : {}),
          ...(file.def.context !== undefined ? { context: file.def.context } : {}),
          ...(file.def.retrievalProfile !== undefined
            ? { retrievalProfile: file.def.retrievalProfile }
            : {}),
          ...(file.def.runtime !== undefined ? { runtime: file.def.runtime } : {}),
        });
        const failures = checkAssemblyExpect(file.def.expect, {
          skills: new Set(r.skills.map((s) => s.skill.key)),
          tools: new Set(r.tools.map((t) => t.tool.key)),
          promptFragments: new Set(r.promptFragments.map((f) => f.fragment.key)),
        });
        results.push({ ...base, ok: failures.length === 0, failures });
      }
    } catch (err) {
      results.push({
        ...base,
        ok: false,
        failures: [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    results,
    passed: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
  };
}
