import { describe, expect, it } from "bun:test";
import { canonicalSerialize, deriveId, hashObject, isUuidV7, newId } from "./index.ts";

describe("ids", () => {
  it("generates UUIDv7", () => {
    expect(isUuidV7(newId())).toBe(true);
  });

  it("derives deterministic UUIDv5 from namespace + structural parts", () => {
    const ns = newId();
    const a = deriveId(ns, "knowledge_item", "item-1", "chunk", "intro");
    const b = deriveId(ns, "knowledge_item", "item-1", "chunk", "intro");
    const c = deriveId(ns, "knowledge_item", "item-1", "chunk", "other");
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(deriveId(newId(), "knowledge_item", "item-1", "chunk", "intro")).not.toBe(a);
  });
});

describe("hashing", () => {
  it("canonical serialization sorts object keys and preserves array order", () => {
    expect(canonicalSerialize({ b: 1, a: { d: [2, 1], c: 3 } })).toBe(
      canonicalSerialize({ a: { c: 3, d: [2, 1] }, b: 1 }),
    );
    expect(canonicalSerialize([2, 1])).not.toBe(canonicalSerialize([1, 2]));
  });

  it("distinguishes missing from empty", () => {
    expect(hashObject({ a: {} })).not.toBe(hashObject({}));
  });
});
