import { RuntimeErrorCode } from "@grounding/core";
import { GraphQLError } from "graphql";

/** Stable GraphQL error with a registry code (spec/14) in extensions. */
export function gqlError(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): GraphQLError {
  return new GraphQLError(message, {
    extensions: { code, ...(details ? { details } : {}) },
  });
}

export function invalidInput(message: string): GraphQLError {
  return gqlError(RuntimeErrorCode.INVALID_INPUT, message);
}

const PREFIX = "cursor:";

export function encodeCursor(id: string): string {
  return Buffer.from(`${PREFIX}${id}`, "utf8").toString("base64");
}

/** UUID shape check — rejects malformed ids before they reach pg casts. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function decodeCursor(after: string): string {
  let raw: string;
  try {
    raw = Buffer.from(after, "base64").toString("utf8");
  } catch {
    throw invalidInput("invalid pagination cursor");
  }
  const id = raw.startsWith(PREFIX) ? raw.slice(PREFIX.length) : "";
  // Cursors carry a uuid; reject malformed payloads at the seam so callers
  // get INVALID_INPUT rather than a Postgres cast error → INTERNAL_ERROR.
  if (!UUID_RE.test(id)) {
    throw invalidInput("invalid pagination cursor");
  }
  return id;
}

export type PageArgs = { first?: number | null; after?: string | null };

/**
 * Validate `first`/`after` against the hard page-size cap (spec/09). Invalid
 * values fail INVALID_INPUT — never silently clamped.
 */
export function pageArgs(input: PageArgs | null | undefined, maxPageSize: number) {
  const first = input?.first ?? null;
  if (first !== null && (!Number.isInteger(first) || first < 1 || first > maxPageSize)) {
    throw invalidInput(`first must be an integer between 1 and ${maxPageSize}`);
  }
  return {
    /** SDL defaults `first` to 50; explicit null falls back the same way. */
    limit: first ?? 50,
    afterId: input?.after ? decodeCursor(input.after) : null,
  };
}

export type Connection<T> = {
  nodes: T[];
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  totalCount: number | null;
};

/**
 * Keyset-paginate rows ordered by id: callers fetch `limit + 1` rows; the
 * extra row determines `hasNextPage`. Cursor carries the row id.
 */
export function toConnection<T extends { id: string }>(
  rows: T[],
  limit: number,
  totalCount: number | null = null,
): Connection<T> {
  const nodes = rows.slice(0, limit);
  const last = nodes[nodes.length - 1];
  return {
    nodes,
    pageInfo: {
      hasNextPage: rows.length > limit,
      endCursor: last ? encodeCursor(last.id) : null,
    },
    totalCount,
  };
}
