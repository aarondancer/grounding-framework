/** Eval definition types mirroring the locked schemas (implementation-reference/schemas). */

export type RetrievalExpect = {
  resolvedConcepts?: string[];
  includeChunks?: string[];
  excludeChunks?: string[];
  topK?: { chunk: string; within: number }[];
  outranks?: [string, string][];
};

export type RetrievalEvalDef = {
  name: string;
  query: string;
  context?: Record<string, unknown>;
  profile?: string;
  expect: RetrievalExpect;
};

export type AssemblyExpect = {
  skills?: string[];
  excludeSkills?: string[];
  tools?: string[];
  excludeTools?: string[];
  promptFragments?: string[];
  excludePromptFragments?: string[];
};

export type AssemblyEvalDef = {
  name: string;
  template: string;
  task?: string;
  context?: Record<string, unknown>;
  retrievalProfile?: string;
  runtime?: { availableBindings?: string[] };
  expect: AssemblyExpect;
};

export type EvalKind = "retrieval-eval" | "assembly-eval";

export type EvalFile =
  | { path: string; kind: "retrieval-eval"; def: RetrievalEvalDef }
  | { path: string; kind: "assembly-eval"; def: AssemblyEvalDef };

export type AssertionFailure = {
  assertion: string;
  expected: unknown;
  actual: unknown;
};

export type EvalResult = {
  name: string;
  path: string;
  kind: EvalKind;
  ok: boolean;
  failures: AssertionFailure[];
  error?: string;
};

export type EvalReport = {
  results: EvalResult[];
  passed: number;
  failed: number;
};
