/**
 * Vendor-agnostic agent backend contract for eval execution (docs/testing).
 * Backends run an assembled agent prompt in a workspace and return the final
 * response plus a transcript. Adding a backend = implementing this interface
 * and registering it in `registry.ts` — nothing downstream changes.
 */

/** Reasoning-effort hint; backends without effort support ignore it. */
export type Effort = "low" | "medium" | "high";

export type BackendCapabilities = {
  /** Can return schema-constrained output (codex --output-schema, OpenAI response_format). */
  structuredOutput: boolean;
  /** Understands the `effort` hint. */
  effort: boolean;
  /** Runs in a writable workspace directory. */
  workspace: boolean;
};

export type BackendRequest = {
  /** Rendered instructions/task text. */
  prompt: string;
  /** Working directory for workspace-capable backends. */
  cwd: string;
  model?: string;
  effort?: Effort;
  /** JSON Schema for the final response when supported. */
  outputSchema?: Record<string, unknown>;
  timeoutMs?: number;
};

export type BackendUsage = {
  inputTokens?: number | undefined;
  outputTokens?: number | undefined;
  costUsd?: number | undefined;
};

export type BackendResult = {
  ok: boolean;
  exitCode: number | null;
  /** Final assistant message (or last-message file contents). */
  response: string;
  /** Raw event log / exported conversation for postmortems. */
  transcript?: string;
  usage?: BackendUsage;
  error?: string;
};

export interface AgentBackend {
  readonly id: string;
  readonly capabilities: BackendCapabilities;
  /** Binary present + authenticated; never throws. */
  doctor(): Promise<{ ok: boolean; detail: string }>;
  run(req: BackendRequest): Promise<BackendResult>;
}
