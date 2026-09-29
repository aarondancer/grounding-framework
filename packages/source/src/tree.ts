import type { Diagnostic } from "@grounding/core";
import { SourceErrorCode } from "@grounding/core";
import type { SourceFile } from "./discover.ts";
import type { DerivedChunk, MarkdownSection } from "./markdown.ts";

/**
 * Entity model (spec/03). File kind ≠ entity kind: grouped files (domains,
 * relation-types, relations) emit one entity per array member.
 */
export type EntityKind =
  | "config"
  | "namespace"
  | "domain"
  | "concept"
  | "relation-type"
  | "relation"
  | "dimension"
  | "selection-group"
  | "retrieval-profile"
  | "knowledge-item"
  | "agent-template"
  | "skill"
  | "prompt-fragment"
  | "tool"
  | "retrieval-eval"
  | "assembly-eval";

export type SourceEntity = {
  kind: EntityKind;
  /** Authored UUIDv7 when the entity carries one. */
  id?: string | undefined;
  /** Human-readable, renameable key. */
  key?: string | undefined;
  /** Parsed authored data (post-JSONC, pre-normalization). */
  data: Record<string, unknown>;
  /** Root-relative source path (provenance). */
  path: string;
  /** JSON Pointer into the containing document. */
  pointer: string;
};

export type KnowledgeDocument = {
  entity: SourceEntity;
  sections: MarkdownSection[];
  flat: MarkdownSection[];
  chunks: DerivedChunk[];
  body: string;
};

export type SourceTree = {
  root: string;
  entities: SourceEntity[];
  /** All diagnostics accumulated while building the tree. */
  diagnostics: Diagnostic[];
  knowledge: KnowledgeDocument[];
};

export type Ref = { kind: "id" | "key"; value: string };

/** A string ref is a UUID iff it parses as one; otherwise it's an exact key. */
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
export function classifyRef(value: string): Ref["kind"] {
  return UUID_RE.test(value) ? "id" : "key";
}

export class EntityIndex {
  readonly byId = new Map<string, SourceEntity>();
  private readonly byKey = new Map<EntityKind, Map<string, SourceEntity>>();
  readonly diagnostics: Diagnostic[] = [];

  add(entity: SourceEntity): void {
    if (entity.id !== undefined) {
      const prior = this.byId.get(entity.id);
      if (prior) {
        this.diagnostics.push({
          severity: "error",
          code: SourceErrorCode.DUPLICATE_ID,
          message: `duplicate id ${entity.id} (${prior.kind} at ${prior.path}, ${entity.kind} at ${entity.path})`,
          location: { path: entity.path },
        });
      } else {
        this.byId.set(entity.id, entity);
      }
    }
    if (entity.key !== undefined) {
      let kindMap = this.byKey.get(entity.kind);
      if (!kindMap) {
        kindMap = new Map();
        this.byKey.set(entity.kind, kindMap);
      }
      const prior = kindMap.get(entity.key);
      if (prior) {
        this.diagnostics.push({
          severity: "error",
          code: SourceErrorCode.DUPLICATE_KEY,
          message: `duplicate ${entity.kind} key "${entity.key}" (${prior.path} and ${entity.path})`,
          location: { path: entity.path },
        });
      } else {
        kindMap.set(entity.key, entity);
      }
    }
  }

  /**
   * Exact reference resolution (spec/02): explicit UUID → any entity;
   * otherwise exact case-sensitive key within the expected kind.
   */
  resolve(
    value: string,
    expectedKind: EntityKind,
  ): { entity?: SourceEntity; typeMismatch?: boolean } {
    if (classifyRef(value) === "id") {
      const hit = this.byId.get(value);
      if (!hit) return {};
      return hit.kind === expectedKind ? { entity: hit } : { typeMismatch: true };
    }
    const hit = this.byKey.get(expectedKind)?.get(value);
    return hit ? { entity: hit } : {};
  }

  /** All registered keys of a kind (sorted for deterministic suggestions). */
  keysOf(kind: EntityKind): string[] {
    return [...(this.byKey.get(kind)?.keys() ?? [])].sort();
  }
}

/** Extract entities from a parsed+schema-validated document. */
export function entitiesFromDocument(
  file: SourceFile,
  value: unknown,
  body?: {
    chunks: DerivedChunk[];
    sections: MarkdownSection[];
    flat: MarkdownSection[];
    body: string;
  },
): { entities: SourceEntity[]; knowledge?: KnowledgeDocument } {
  const entities: SourceEntity[] = [];
  const obj = (v: unknown): Record<string, unknown> =>
    typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const root = obj(value);
  const push = (kind: EntityKind, data: Record<string, unknown>, pointer: string) => {
    entities.push({
      kind,
      id: typeof data.id === "string" ? data.id : undefined,
      key: typeof data.key === "string" ? data.key : undefined,
      data,
      path: file.path,
      pointer,
    });
  };

  switch (file.kind) {
    case "config":
      push("config", root, "");
      break;
    case "namespace":
      push("namespace", root, "");
      break;
    case "domains-file":
      for (const [i, d] of arr(root.domains).entries()) {
        push("domain", obj(d), `/domains/${i}`);
      }
      break;
    case "concept":
      push("concept", root, "");
      break;
    case "relation-types":
      for (const [i, r] of arr(root.relationTypes).entries()) {
        push("relation-type", obj(r), `/relationTypes/${i}`);
      }
      break;
    case "relations":
      for (const [i, r] of arr(root.relations).entries()) {
        push("relation", obj(r), `/relations/${i}`);
      }
      break;
    case "knowledge": {
      const entity: SourceEntity = {
        kind: "knowledge-item",
        id: typeof root.id === "string" ? root.id : undefined,
        key: typeof root.key === "string" ? root.key : undefined,
        data: root,
        path: file.path,
        pointer: "",
      };
      entities.push(entity);
      if (body) {
        return {
          entities,
          knowledge: {
            entity,
            sections: body.sections,
            flat: body.flat,
            chunks: body.chunks,
            body: body.body,
          },
        };
      }
      break;
    }
    case "dimension":
      push("dimension", root, "");
      break;
    case "selection-group":
      push("selection-group", root, "");
      break;
    case "retrieval-profile":
      push("retrieval-profile", root, "");
      break;
    case "agent-template":
      push("agent-template", root, "");
      break;
    case "skill":
      push("skill", root, "");
      break;
    case "tool":
      push("tool", root, "");
      break;
    case "prompt-fragment":
      push("prompt-fragment", root, "");
      break;
    case "retrieval-eval":
      push("retrieval-eval", root, "");
      break;
    case "assembly-eval":
      push("assembly-eval", root, "");
      break;
  }
  return { entities };
}
