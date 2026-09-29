import { describe, expect, it } from "bun:test";
import { createServerApp } from "./app.ts";

const app = createServerApp({ db: null, cache: null, environment: "local" });

describe("server app", () => {
  it("GET /healthz responds ok", async () => {
    const res = await app.handle(new Request("http://test/healthz"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok).toBe(true);
  });

  it("GET /readyz responds with check state", async () => {
    const res = await app.handle(new Request("http://test/readyz"));
    expect([200, 503]).toContain(res.status);
    const body = (await res.json()) as { ready: boolean; checks: Record<string, unknown> };
    expect(body.checks).toBeDefined();
  });

  it("POST /graphql serves GraphQL", async () => {
    const res = await app.handle(
      new Request("http://test/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: "{ runtimeInfo { environment runtimeRevision } }" }),
      }),
    );
    // db is null in this test app, so runtimeInfo errors — but GraphQL itself responds.
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      errors?: { message: string; extensions?: { code?: string } }[];
    };
    // Assert the stable spec/14 code, not the (free-form) message text.
    expect(body.errors?.[0]?.extensions?.code).toBe("INTERNAL_ERROR");
  });
});
