import type { AgentBackend, BackendCapabilities, BackendRequest, BackendResult } from "./types.ts";

/**
 * OpenAI-compatible HTTP backend — single-turn chat completions. Covers
 * LiteLLM proxies, Ollama, vLLM, and any /chat/completions-compatible API.
 * No workspace or tools; use for judge steps and direct-answer evals.
 */
export type OpenAiCompatibleConfig = {
  /** e.g. http://localhost:4000 (LiteLLM default) or https://api.openai.com/v1 */
  baseUrl: string;
  /** Env var holding the API key (default "OPENAI_API_KEY"). */
  apiKeyEnv?: string;
  model: string;
};

export function buildChatBody(
  cfg: OpenAiCompatibleConfig,
  req: BackendRequest,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model ?? cfg.model,
    messages: [{ role: "user", content: req.prompt }],
  };
  if (req.effort) body.reasoning_effort = req.effort;
  if (req.outputSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: { name: "eval_result", schema: req.outputSchema },
    };
  }
  return body;
}

export function openAiCompatibleBackend(cfg: OpenAiCompatibleConfig): AgentBackend {
  const capabilities: BackendCapabilities = {
    structuredOutput: true,
    effort: true,
    workspace: false,
  };
  return {
    id: "openai-compatible",
    capabilities,
    async doctor() {
      const keyEnv = cfg.apiKeyEnv ?? "OPENAI_API_KEY";
      return process.env[keyEnv]
        ? { ok: true, detail: `key via ${keyEnv}` }
        : { ok: false, detail: `${keyEnv} not set` };
    },
    async run(req): Promise<BackendResult> {
      const keyEnv = cfg.apiKeyEnv ?? "OPENAI_API_KEY";
      const headers: Record<string, string> = { "content-type": "application/json" };
      const key = process.env[keyEnv];
      if (key) headers.authorization = `Bearer ${key}`;
      try {
        const res = await fetch(`${cfg.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
          method: "POST",
          headers,
          body: JSON.stringify(buildChatBody(cfg, req)),
          signal: AbortSignal.timeout(req.timeoutMs ?? 120_000),
        });
        const raw = await res.text();
        if (!res.ok) {
          return { ok: false, exitCode: null, response: "", error: `${res.status}: ${raw}` };
        }
        const data = JSON.parse(raw) as {
          choices?: { message?: { content?: string } }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        return {
          ok: true,
          exitCode: 0,
          response: data.choices?.[0]?.message?.content ?? "",
          transcript: raw,
          usage: {
            inputTokens: data.usage?.prompt_tokens,
            outputTokens: data.usage?.completion_tokens,
          },
        };
      } catch (err) {
        return { ok: false, exitCode: null, response: "", error: String(err) };
      }
    },
  };
}
