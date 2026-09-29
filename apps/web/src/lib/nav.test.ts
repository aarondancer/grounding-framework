import { describe, expect, test } from "bun:test";
import { entityLinkKey, entityPath } from "./nav";

describe("entityPath / entityLinkKey", () => {
  test("chunks are addressed by id — keys are only unique per item", () => {
    const chunk = { type: "knowledge_chunk", id: "uuid-1", key: "intro" };
    expect(entityLinkKey(chunk)).toBe("uuid-1");
    expect(entityPath("knowledge_chunk", entityLinkKey(chunk))).toBe("/explore/chunks/uuid-1");
  });

  test("other entity types link by key", () => {
    expect(entityLinkKey({ type: "concept", id: "u", key: "deploy" })).toBe("deploy");
    expect(entityPath("concept", "deploy")).toBe("/explore/concepts/deploy");
    expect(entityPath("namespace", "main")).toBe("/dev/runtime");
    expect(entityPath("unknown_type", "x")).toBeNull();
  });
});
