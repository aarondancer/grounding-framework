import { createHash } from "node:crypto";

/**
 * Canonical serialization for hashing: object keys sorted, array order
 * preserved (callers sort set-like arrays before hashing), missing vs empty
 * distinguished naturally by JSON structure. Used by compiler hashes and
 * Valkey cache keys (spec/16).
 */
export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(sortForSerialization(value));
}

function sortForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForSerialization);
  }
  if (value !== null && typeof value === "object") {
    const input = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(input).sort()) {
      const v = input[key];
      if (v !== undefined) out[key] = sortForSerialization(v);
    }
    return out;
  }
  return value;
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hashObject(value: unknown): string {
  return sha256(canonicalSerialize(value));
}
