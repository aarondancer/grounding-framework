import { describe, expect, it } from "bun:test";
import { join } from "node:path";
import { loadSourceTree } from "./load.ts";
import { validateTree } from "./validate.ts";

/**
 * Example repository verification (M10): the reference corpus under
 * implementation-reference/examples/grounding is documentation as code —
 * it must always validate with zero errors so docs stay honest.
 */
describe("reference example corpus", () => {
  const root = join(import.meta.dir, "../../../implementation-reference/examples/grounding");
  const loaded = loadSourceTree(root);
  const tree = {
    root,
    entities: loaded.entities,
    diagnostics: loaded.diagnostics,
    knowledge: loaded.knowledge,
  };

  it("loads and validates with zero errors", () => {
    const result = validateTree(tree);
    expect(result.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("covers every source kind the spec defines", () => {
    // The example must exercise all entity families so it functions as a
    // spec illustration, not a minimal stub.
    const paths = tree.entities.map((e) => e.path);
    for (const dir of [
      "concepts",
      "relations",
      "dimensions",
      "knowledge",
      "selection-groups",
      "retrieval-profiles",
      "agent-assembly",
      "evals",
    ]) {
      expect(paths.some((p) => p.startsWith(`${dir}/`))).toBe(true);
    }
  });
});
