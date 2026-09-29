import type { AssemblyExpect, AssertionFailure, RetrievalExpect } from "./types.ts";

/**
 * Robust assertion evaluation (spec/11): presence, top-K windows, and
 * pairwise outranks — never brittle exact-rank checks.
 *
 * `ordered` = ranked result refs in delivery order; `present` = refs actually
 * delivered (packed context when packing ran, else the ranked list).
 */
export function checkRetrievalExpect(
  expect: RetrievalExpect,
  actual: { ordered: string[]; present: Set<string>; resolvedConceptKeys: string[] },
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  const rankOf = (ref: string) => {
    const i = actual.ordered.indexOf(ref);
    return i === -1 ? null : i + 1;
  };

  for (const key of expect.resolvedConcepts ?? []) {
    if (!actual.resolvedConceptKeys.includes(key)) {
      failures.push({
        assertion: "resolvedConcepts",
        expected: key,
        actual: actual.resolvedConceptKeys,
      });
    }
  }
  for (const ref of expect.includeChunks ?? []) {
    if (!actual.present.has(ref)) {
      failures.push({ assertion: "includeChunks", expected: ref, actual: [...actual.present] });
    }
  }
  for (const ref of expect.excludeChunks ?? []) {
    if (actual.present.has(ref)) {
      failures.push({ assertion: "excludeChunks", expected: `absent: ${ref}`, actual: ref });
    }
  }
  for (const { chunk, within } of expect.topK ?? []) {
    const rank = rankOf(chunk);
    if (rank === null || rank > within) {
      failures.push({ assertion: "topK", expected: `${chunk} within ${within}`, actual: rank });
    }
  }
  for (const [a, b] of expect.outranks ?? []) {
    const ra = rankOf(a);
    const rb = rankOf(b);
    if (ra === null || rb === null || ra >= rb) {
      failures.push({
        assertion: "outranks",
        expected: `${a} outranks ${b}`,
        actual: { [a]: ra, [b]: rb },
      });
    }
  }
  return failures;
}

export function checkAssemblyExpect(
  expect: AssemblyExpect,
  actual: { skills: Set<string>; tools: Set<string>; promptFragments: Set<string> },
): AssertionFailure[] {
  const failures: AssertionFailure[] = [];
  const pairs: [keyof AssemblyExpect, Set<string>][] = [
    ["skills", actual.skills],
    ["tools", actual.tools],
    ["promptFragments", actual.promptFragments],
  ];
  for (const [field, set] of pairs) {
    const include = expect[field] ?? [];
    for (const key of include) {
      if (!set.has(key)) failures.push({ assertion: field, expected: key, actual: [...set] });
    }
  }
  const excludePairs: [keyof AssemblyExpect, Set<string>][] = [
    ["excludeSkills", actual.skills],
    ["excludeTools", actual.tools],
    ["excludePromptFragments", actual.promptFragments],
  ];
  for (const [field, set] of excludePairs) {
    for (const key of expect[field] ?? []) {
      if (set.has(key))
        failures.push({ assertion: field, expected: `absent: ${key}`, actual: key });
    }
  }
  return failures;
}
