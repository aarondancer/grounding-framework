import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { print } from "graphql";
import * as api from "./lib/api.ts";
import { createExplorerClient } from "./lib/client.ts";
import { browseSearch } from "./lib/list.ts";
import { createAppStore, simulatedContext } from "./lib/store.ts";

/**
 * spec/10 + spec/15 guards for the Explorer:
 * - per-request SSR isolation (fresh urql ssrExchange + Redux store per
 *   getRouter() call — exercised here via the factories directly)
 * - locked client stack: no forbidden GraphQL/table/UI deps
 * - read-only: no mutation documents in the operation map
 */

describe("SSR isolation", () => {
  test("two SSR clients have independent ssrExchange state", () => {
    const a = createExplorerClient({ origin: "http://x" });
    const b = createExplorerClient({ origin: "http://x" });
    expect(a.client).not.toBe(b.client);
    a.ssr.restoreData({ k1: { data: '{"v":1}' } });
    expect(b.ssr.extractData()).toEqual({});
    expect(a.ssr.extractData()).toHaveProperty("k1");
  });

  test("two app stores have independent simulated context", () => {
    const a = createAppStore();
    const b = createAppStore();
    a.dispatch(simulatedContext.setValue({ key: "roles", value: ["manager"] }));
    expect(a.getState().simulatedContext.values.roles).toEqual(["manager"]);
    expect(b.getState().simulatedContext.values).toEqual({});
  });
});

describe("locked stack + read-only guards", () => {
  test("no forbidden client dependencies", () => {
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, "../package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const banned of [
      "@tanstack/react-query",
      "@apollo/client",
      "graphql-request",
      "relay-runtime",
      "react-relay",
    ]) {
      expect(deps).not.toContain(banned);
    }
    expect(deps.some((d) => d.startsWith("@radix-ui"))).toBe(false);
    expect(deps).not.toContain("shadcn");
  });

  test("operation map contains no mutations", () => {
    for (const [name, doc] of Object.entries(api)) {
      if (doc && typeof doc === "object" && "kind" in doc) {
        expect(print(doc as never), name).not.toMatch(/(^|\W)mutation\b/);
      }
    }
  });

  test("browseSearch parses leniently and strips unknowns", () => {
    expect(browseSearch({ search: "x", status: "published", bogus: 1 })).toEqual({
      search: "x",
      status: "published",
    });
    expect(browseSearch({ search: 42 })).toEqual({});
  });
});
