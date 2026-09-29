import { normalizeForLexical, WarningCode } from "@grounding/core";
import type { Database } from "@grounding/db";
import { sql } from "drizzle-orm";
import type {
  ConceptMatchType,
  ConceptResolutionResult,
  ConceptRow,
  ResolvedConcept,
} from "./types.ts";

/**
 * Concept resolution — spec/05.
 *
 * Candidates gather across channels; each published concept is retained once
 * with its strongest match class:
 *   exact raw key → exact normalized name → exact normalized alias
 *   → lexical/trigram → semantic
 * Exact normalized classes are set-valued (homonyms stay in); ties order by
 * concept key asc, then stable UUID asc.
 */

type Hit = {
  concept: ConceptRow;
  matchType: ConceptMatchType;
  matchedText: string | null;
  score: number | null;
};

export async function resolveConcepts(
  db: Database,
  namespaceId: string,
  text: string,
  options: { limit?: number; queryVector?: number[] | null },
): Promise<ConceptResolutionResult> {
  const limit = options.limit ?? 10;
  const normalized = normalizeForLexical(text);
  if (normalized === "") return { matches: [], warnings: [] };

  const lexical = await db.execute(sql`
    with params as (select unaccent(${normalized}) as q),
    hits as (
      select c.id, 'EXACT_KEY'::text as match_type, c.key as matched_text, null::float8 as score
        from concepts c
        where c.namespace_id = ${namespaceId} and c.status = 'published' and c.key = ${text}
      union all
      select c.id, 'EXACT_NAME', c.name, null::float8
        from concepts c, params
        where c.namespace_id = ${namespaceId} and c.status = 'published'
          and c.normalized_name = params.q
      union all
      select a.concept_id, 'EXACT_ALIAS', a.alias, null::float8
        from concept_aliases a
        join concepts c on c.id = a.concept_id and c.namespace_id = a.namespace_id, params
        where a.namespace_id = ${namespaceId} and c.status = 'published'
          and a.normalized_alias = params.q
      union all
      select c.id,
          case when position(params.q in c.normalized_key) > 0 then 'LEXICAL' else 'TRIGRAM' end,
          c.key, similarity(c.normalized_key, params.q)::float8
        from concepts c, params
        where c.namespace_id = ${namespaceId} and c.status = 'published'
          and (c.normalized_key % params.q or position(params.q in c.normalized_key) > 0)
      union all
      select c.id,
          case when position(params.q in c.normalized_name) > 0 then 'LEXICAL' else 'TRIGRAM' end,
          c.name, similarity(c.normalized_name, params.q)::float8
        from concepts c, params
        where c.namespace_id = ${namespaceId} and c.status = 'published'
          and (c.normalized_name % params.q or position(params.q in c.normalized_name) > 0)
      union all
      select a.concept_id,
          case when position(params.q in a.normalized_alias) > 0 then 'LEXICAL' else 'TRIGRAM' end,
          a.alias, similarity(a.normalized_alias, params.q)::float8
        from concept_aliases a
        join concepts c on c.id = a.concept_id and c.namespace_id = a.namespace_id, params
        where a.namespace_id = ${namespaceId} and c.status = 'published'
          and (a.normalized_alias % params.q or position(params.q in a.normalized_alias) > 0)
    )
    select c.id, c.key, c.name, c.status, c.description,
           h.match_type, h.matched_text, h.score
    from hits h join concepts c on c.id = h.id
  `);

  const hits: Hit[] = (
    lexical.rows as {
      id: string;
      key: string;
      name: string;
      status: string;
      description: string | null;
      match_type: ConceptMatchType;
      matched_text: string | null;
      score: number | null;
    }[]
  ).map((r) => ({
    concept: {
      id: r.id,
      key: r.key,
      name: r.name,
      status: r.status,
      description: r.description,
      namespaceId,
    },
    matchType: r.match_type,
    matchedText: r.matched_text,
    score: r.score,
  }));

  if (options.queryVector && options.queryVector.length > 0) {
    const vec = `[${options.queryVector.join(",")}]`;
    const sem = await db.execute(sql`
      select c.id, c.key, c.name, c.status, c.description,
             (1 - (s.embedding <=> ${vec}::vector))::float8 as score
      from semantic_entities s
      join concepts c on c.id = s.entity_id and c.namespace_id = s.namespace_id
      where s.namespace_id = ${namespaceId} and s.entity_type = 'concept' and c.status = 'published'
      order by s.embedding <=> ${vec}::vector, c.id
      limit ${limit}
    `);
    for (const r of sem.rows as {
      id: string;
      key: string;
      name: string;
      status: string;
      description: string | null;
      score: number;
    }[]) {
      hits.push({
        concept: {
          id: r.id,
          key: r.key,
          name: r.name,
          status: r.status,
          description: r.description,
          namespaceId,
        },
        matchType: "SEMANTIC",
        matchedText: r.name,
        score: r.score,
      });
    }
  }

  // Retain strongest class per concept.
  const precedence: ConceptMatchType[] = [
    "EXACT_KEY",
    "EXACT_NAME",
    "EXACT_ALIAS",
    "LEXICAL",
    "TRIGRAM",
    "SEMANTIC",
  ];
  const rankOf = (t: ConceptMatchType) => precedence.indexOf(t);
  const byId = new Map<string, Hit>();
  for (const h of hits) {
    const cur = byId.get(h.concept.id);
    if (!cur) {
      byId.set(h.concept.id, h);
      continue;
    }
    const cls = rankOf(h.matchType) - rankOf(cur.matchType);
    if (
      cls < 0 ||
      // Same class: keep the higher score, then lexically smaller matched text
      // — UNION ALL emits no guaranteed order, so fold deterministically.
      (cls === 0 &&
        ((h.score ?? 0) > (cur.score ?? 0) ||
          ((h.score ?? 0) === (cur.score ?? 0) && (h.matchedText ?? "") < (cur.matchedText ?? ""))))
    ) {
      byId.set(h.concept.id, h);
    }
  }

  const matched = [...byId.values()];
  matched.sort((a, b) => {
    const d = rankOf(a.matchType) - rankOf(b.matchType);
    if (d !== 0) return d;
    if (rankOf(a.matchType) <= 2) {
      // exact classes: key asc, then uuid asc
      return a.concept.key === b.concept.key
        ? a.concept.id < b.concept.id
          ? -1
          : 1
        : a.concept.key < b.concept.key
          ? -1
          : 1;
    }
    const s = (b.score ?? 0) - (a.score ?? 0);
    return s !== 0 ? s : a.concept.id < b.concept.id ? -1 : 1;
  });

  const warnings: ConceptResolutionResult["warnings"] = [];
  const exactNorm = matched.filter(
    (m) => m.matchType === "EXACT_NAME" || m.matchType === "EXACT_ALIAS",
  );
  if (exactNorm.length > 1) {
    warnings.push({
      code: WarningCode.AMBIGUOUS_EXACT_LEXICAL_MATCH,
      message: `exact normalized term "${normalized}" matches ${exactNorm.length} published concepts`,
      details: { conceptIds: exactNorm.map((m) => m.concept.id) },
    });
  }

  const matches: ResolvedConcept[] = matched.slice(0, limit).map((m, i) => ({
    concept: m.concept,
    matchType: m.matchType,
    matchedText: m.matchedText,
    score: m.score,
    rank: i + 1,
  }));
  return { matches, warnings };
}
