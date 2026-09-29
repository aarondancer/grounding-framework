import { validate as uuidValidate, version as uuidVersion, v5 as uuidv5, v7 as uuidv7 } from "uuid";

/**
 * Identity rules (spec/02):
 * - authored first-class entities: UUIDv7 persisted in source
 * - derived entities: deterministic UUIDv5 from namespace + parent + type + stable structural key
 * - `key` is human-readable and renameable; file path is provenance, not identity
 */

export function newId(): string {
  return uuidv7();
}

export function isUuidV7(value: string): boolean {
  return uuidValidate(value) && uuidVersion(value) === 7;
}

/**
 * Deterministic derived ID. `parts` identify the entity structurally; the
 * namespace UUID scopes the name so the same structural key in two namespaces
 * derives different IDs.
 */
export const DERIVED_ID_PART_SEP = ":";

export function deriveId(namespaceId: string, ...parts: string[]): string {
  return uuidv5(parts.join(DERIVED_ID_PART_SEP), namespaceId);
}
