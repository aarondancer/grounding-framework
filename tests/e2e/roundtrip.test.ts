import { describe, expect } from "bun:test";
import { createServerApp } from "@grounding/server";
import {
  ensureBuilt,
  dbCacheTest as it,
  makeTestServices,
  resetNamespaces,
  writeCorpus,
} from "@grounding/test-support";

const NS = "019f5000-0000-7000-8000-000000000001";

/**
 * Full-system round trip (docs/testing layer 5 — local only, sparing): authored source
 * corpus → compiler materialization into real PostgreSQL → Elysia + Yoga
 * HTTP boundary → GraphQL response. Anything narrower can't express the
 * source→DB→API seam (spec/01 layers 2–8 in one shot).
 */
const CORPUS: Record<string, string> = {
  "grounding.config.jsonc": `{"version":1,"embedding":{"provider":"deterministic","model":"m","dimensions":1536}}`,
  "namespace.jsonc": `{"id":"${NS}","key":"e2e","name":"E2E","defaultRetrievalProfile":"default"}`,
  "concepts/pipeline.jsonc": `{"id":"019f5000-0000-7000-8000-000000000010","key":"pipeline","name":"Pipeline","status":"published","description":"sales pipeline"}`,
  "retrieval-profiles/default.jsonc": `{"id":"019f5000-0000-7000-8000-000000000020","key":"default"}`,
  "knowledge/base.md": `---\n{"id":"019f5000-0000-7000-8000-000000000030","key":"base","title":"Pipeline Guide","status":"published","concepts":["pipeline"]}\n---\n\n# Pipeline Guide\n\npipeline orchestration handbook\n`,
};

function gql(app: ReturnType<typeof createServerApp>, query: string, variables?: unknown) {
  return app.handle(
    new Request("http://test/graphql", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    }),
  );
}

describe("source → DB → GraphQL API round trip", () => {
  it("materializes a corpus and serves it over the HTTP boundary", async () => {
    const { conn, services } = await makeTestServices({ cache: true });
    const app = createServerApp(services);
    const dir = writeCorpus("grounding-e2e-", CORPUS);
    try {
      await resetNamespaces(conn.db);
      await ensureBuilt(conn.db, dir);

      // Browse: the authored concept is materialized and queryable.
      const list = await gql(
        app,
        `{ concepts(input: {status: PUBLISHED}) { nodes { key name description source { path } } totalCount } }`,
      );
      const listBody = (await list.json()) as {
        data?: { concepts: { nodes: { key: string; description: string }[]; totalCount: number } };
        errors?: { message: string }[];
      };
      expect(listBody.errors).toBeUndefined();
      const nodes = listBody.data?.concepts.nodes ?? [];
      expect(nodes.some((c) => c.key === "pipeline")).toBe(true);
      const pipeline = nodes.find((c) => c.key === "pipeline");
      expect(pipeline?.description).toBe("sales pipeline");
      expect((pipeline as unknown as { source: { path: string } } | undefined)?.source.path).toBe(
        "concepts/pipeline.jsonc",
      );

      // Retrieve: chunk returns through the seam with concept attribution.
      const query = `query($input: RetrievalInput!) { retrieve(input: $input) {
        namespace { key } query
        resolvedConcepts { concept { key } matchType }
        results { rank chunk { key knowledgeItem { key } } reasons { code } }
      } }`;
      const input = { namespace: "e2e", query: "pipeline" };
      const r1 = await gql(app, query, { input });
      const b1 = (await r1.json()) as {
        data?: {
          retrieve: {
            namespace: { key: string };
            results: { chunk: { knowledgeItem: { key: string } }; reasons: { code: string }[] }[];
            resolvedConcepts: { concept: { key: string }; matchType: string }[];
          };
        };
        errors?: { message: string }[];
      };
      expect(b1.errors).toBeUndefined();
      const ret = b1.data?.retrieve;
      expect(ret?.namespace.key).toBe("e2e");
      expect(ret?.resolvedConcepts[0]?.concept.key).toBe("pipeline");
      expect(ret?.results.length).toBeGreaterThan(0);
      const keys = (ret?.results ?? []).map((r) => r.chunk.knowledgeItem.key);
      expect(keys).toContain("base");

      // Second identical request exercises the Valkey cache path — the
      // result must be identical (cache never changes semantics, spec/16).
      const r2 = await gql(app, query, { input });
      const b2 = (await r2.json()) as { data?: unknown; errors?: { message: string }[] };
      expect(b2.errors).toBeUndefined();
      expect(b2.data).toEqual(b1.data);

      // Typed error mapping survives the HTTP boundary (spec/09/14):
      // a malformed id ref is a typed INVALID_INPUT, not a masked 500.
      const missing = await gql(app, `{ concept(ref: {id: "not-a-uuid"}) { key } }`);
      const missingBody = (await missing.json()) as {
        errors?: { message: string; extensions?: { code?: string } }[];
      };
      expect(missingBody.errors?.[0]?.extensions?.code).toBe("INVALID_INPUT");
    } finally {
      await conn.pool.end();
      await services.cache?.close();
    }
  });
});
