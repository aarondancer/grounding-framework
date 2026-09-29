import type { Database } from "@grounding/db";
import { sql } from "drizzle-orm";
import type { Candidate, ConceptRow, OntologyPath } from "./types.ts";

/**
 * Candidate channels — spec/05. Each returns chunk ids in deterministic
 * rank order (rank = position+1). Channels are independent and run in
 * parallel; a channel failure degrades per the spec's degradation rules.
 */

export async function vectorCandidates(
  db: Database,
  namespaceId: string,
  queryVector: number[],
  limit: number,
): Promise<Candidate[]> {
  const vec = `[${queryVector.join(",")}]`;
  const rows = await db.execute(sql`
    select s.entity_id as chunk_id, (1 - (s.embedding <=> ${vec}::vector))::float8 as score
    from semantic_entities s
    where s.namespace_id = ${namespaceId} and s.entity_type = 'knowledge_chunk'
    order by s.embedding <=> ${vec}::vector, s.entity_id
    limit ${limit}
  `);
  return (rows.rows as { chunk_id: string; score: number }[]).map((r, i) => ({
    chunkId: r.chunk_id,
    channel: "vector",
    rank: i + 1,
    score: r.score,
  }));
}

export async function fullTextCandidates(
  db: Database,
  namespaceId: string,
  normalizedQuery: string,
  limit: number,
): Promise<Candidate[]> {
  // unaccent() on the query mirrors the materialized config's accent folding;
  // the lexeme normalization itself is PostgreSQL-authoritative (spec/13).
  const rows = await db.execute(sql`
    select kc.id as chunk_id,
           ts_rank_cd(kc.search_vector, plainto_tsquery('grounding_english', unaccent(${normalizedQuery})))::float8 as score
    from knowledge_chunks kc
    where kc.namespace_id = ${namespaceId}
      and kc.search_vector @@ plainto_tsquery('grounding_english', unaccent(${normalizedQuery}))
    order by score desc, kc.id
    limit ${limit}
  `);
  return (rows.rows as { chunk_id: string; score: number }[]).map((r, i) => ({
    chunkId: r.chunk_id,
    channel: "fullText",
    rank: i + 1,
    score: r.score,
  }));
}

/** Short-field trigram: chunk headings + item titles (spec/13 indexed fields). */
export async function trigramCandidates(
  db: Database,
  namespaceId: string,
  normalizedQuery: string,
  limit: number,
): Promise<Candidate[]> {
  const rows = await db.execute(sql`
    with q as (select unaccent(${normalizedQuery}) as t),
    head as (
      select kc.id as chunk_id, similarity(kc.normalized_heading, q.t) as score
      from knowledge_chunks kc, q
      where kc.namespace_id = ${namespaceId} and kc.normalized_heading is not null
        and kc.normalized_heading % q.t
    ),
    title as (
      select kc.id as chunk_id, similarity(ki.normalized_title, q.t) as score
      from knowledge_chunks kc join knowledge_items ki
        on ki.id = kc.knowledge_item_id and ki.namespace_id = kc.namespace_id, q
      where kc.namespace_id = ${namespaceId} and ki.normalized_title % q.t
    ),
    merged as (
      select chunk_id, max(score) as score
      from (select * from head union all select * from title) u
      group by chunk_id
    )
    select chunk_id, score::float8 from merged order by score desc, chunk_id limit ${limit}
  `);
  return (rows.rows as { chunk_id: string; score: number }[]).map((r, i) => ({
    chunkId: r.chunk_id,
    channel: "trigram",
    rank: i + 1,
    score: r.score,
  }));
}

/** Direct concept-linked: chunks tagged with any resolved seed concept. */
export async function conceptLinkedCandidates(
  db: Database,
  namespaceId: string,
  seedConceptIds: string[],
  limit: number,
): Promise<Candidate[]> {
  if (seedConceptIds.length === 0) return [];
  const rows = await db.execute(sql`
    select distinct cc.chunk_id
    from chunk_concepts cc
    where cc.namespace_id = ${namespaceId} and cc.concept_id in ${seedConceptIds}
    order by cc.chunk_id
    limit ${limit}
  `);
  return (rows.rows as { chunk_id: string }[]).map((r, i) => ({
    chunkId: r.chunk_id,
    channel: "conceptLinked",
    rank: i + 1,
    score: null,
  }));
}

export type OntologyResult = {
  candidates: Candidate[];
  paths: OntologyPath[];
};

type PathStep = {
  relation: { key: string; name: string | null };
  direction: "incoming" | "outgoing";
  from: ConceptRow;
  to: ConceptRow;
};

/**
 * Ontology-derived channel (spec/05): expand seed concepts through
 * concept_relations up to profile maxDepth (≤2), respecting direction and the
 * relation-type allowlist. Ordering: seed rank, hop depth, relation-type order
 * from the profile, concept key asc, chunk id asc. Deterministic and bounded.
 */
export async function ontologyCandidates(
  db: Database,
  namespaceId: string,
  seeds: ConceptRow[],
  graph: {
    maxDepth: number;
    direction: "incoming" | "outgoing" | "both";
    relationTypes: string[];
    candidateLimit: number;
  },
): Promise<OntologyResult> {
  if (seeds.length === 0 || graph.maxDepth < 1) return { candidates: [], paths: [] };

  const typeOrder = new Map(graph.relationTypes.map((t, i) => [t, i]));
  const seedRank = new Map(seeds.map((s, i) => [s.id, i]));
  const typeFilter =
    graph.relationTypes.length > 0 ? sql`and rt.key in ${graph.relationTypes}` : sql``;

  // BFS provenance: how each concept was first reached.
  const provenance = new Map<string, { seed: ConceptRow; steps: PathStep[]; typeIdx: number }>();
  for (const s of seeds) provenance.set(s.id, { seed: s, steps: [], typeIdx: 0 });

  let frontier = seeds.map((s) => s.id);
  const neighbors: ConceptRow[] = [];

  for (let depth = 1; depth <= graph.maxDepth && frontier.length > 0; depth++) {
    const edge =
      graph.direction === "outgoing"
        ? sql`cr.source_concept_id in ${frontier}`
        : graph.direction === "incoming"
          ? sql`cr.target_concept_id in ${frontier}`
          : sql`(cr.source_concept_id in ${frontier} or cr.target_concept_id in ${frontier})`;
    const rows = await db.execute(sql`
      select cr.source_concept_id, cr.target_concept_id, rt.key as relation_key, rt.name as relation_name,
             sc.id as sid, sc.key as skey, sc.name as sname, sc.status as sstatus, sc.description as sdesc,
             tc.id as tid, tc.key as tkey, tc.name as tname, tc.status as tstatus, tc.description as tdesc
      from concept_relations cr
      join relation_types rt on rt.id = cr.relation_type_id and rt.namespace_id = cr.namespace_id
      join concepts sc on sc.id = cr.source_concept_id and sc.namespace_id = cr.namespace_id
      join concepts tc on tc.id = cr.target_concept_id and tc.namespace_id = cr.namespace_id
      where cr.namespace_id = ${namespaceId}
        and ${edge} ${typeFilter}
        and sc.status = 'published' and tc.status = 'published'
      order by rt.key, cr.id
    `);
    const next: string[] = [];
    for (const r of rows.rows as {
      source_concept_id: string;
      target_concept_id: string;
      relation_key: string;
      relation_name: string | null;
      sid: string;
      skey: string;
      sname: string;
      sstatus: string;
      sdesc: string | null;
      tid: string;
      tkey: string;
      tname: string;
      tstatus: string;
      tdesc: string | null;
    }[]) {
      const fromNode: ConceptRow = {
        id: r.sid,
        key: r.skey,
        name: r.sname,
        status: r.sstatus,
        description: r.sdesc,
        namespaceId,
      };
      const toNode: ConceptRow = {
        id: r.tid,
        key: r.tkey,
        name: r.tname,
        status: r.tstatus,
        description: r.tdesc,
        namespaceId,
      };
      // For "both" an edge qualifies if either endpoint is on the frontier
      // (frontier ⊆ provenance always, so a frontier check suffices).
      const fromOnFrontier = frontier.includes(r.sid);
      const toOnFrontier = frontier.includes(r.tid);
      const walk =
        graph.direction === "outgoing"
          ? fromOnFrontier
          : graph.direction === "incoming"
            ? toOnFrontier
            : fromOnFrontier || toOnFrontier;
      if (!walk) continue;
      // Step endpoints stay in edge orientation; `direction` records how we
      // traversed it relative to the frontier.
      const outgoingWalk = graph.direction === "incoming" ? false : fromOnFrontier;
      const step: PathStep = {
        relation: { key: r.relation_key, name: r.relation_name },
        direction: outgoingWalk ? "outgoing" : "incoming",
        from: fromNode,
        to: toNode,
      };
      const neighborNode = outgoingWalk ? toNode : fromNode;
      if (provenance.has(neighborNode.id)) continue;
      const parent = provenance.get(outgoingWalk ? r.sid : r.tid);
      if (!parent) continue;
      const typeIdx = typeOrder.get(r.relation_key) ?? Number.MAX_SAFE_INTEGER;
      provenance.set(neighborNode.id, {
        seed: parent.seed,
        steps: [...parent.steps, step],
        typeIdx: parent.steps.length === 0 ? typeIdx : parent.typeIdx,
      });
      neighbors.push(neighborNode);
      next.push(neighborNode.id);
    }
    frontier = next;
  }

  const paths: OntologyPath[] = [];
  for (const n of neighbors) {
    const p = provenance.get(n.id);
    if (!p) continue; // unreachable — provenance is set when a neighbor is discovered
    paths.push({ seedConcept: p.seed, targetConcept: n, depth: p.steps.length, steps: p.steps });
  }

  if (neighbors.length === 0) return { candidates: [], paths };

  const neighborIds = neighbors.map((n) => n.id);
  const chunkRows = await db.execute(sql`
    select distinct cc.chunk_id, cc.concept_id
    from chunk_concepts cc
    where cc.namespace_id = ${namespaceId} and cc.concept_id in ${neighborIds}
  `);

  const conceptById = new Map(neighbors.map((n) => [n.id, n]));
  const ranked = (chunkRows.rows as { chunk_id: string; concept_id: string }[]).map((r) => {
    const prov = provenance.get(r.concept_id);
    const concept = conceptById.get(r.concept_id);
    return {
      chunkId: r.chunk_id,
      seedRank: seedRank.get(prov?.seed.id ?? "") ?? Number.MAX_SAFE_INTEGER,
      depth: prov?.steps.length ?? 0,
      typeIdx: prov?.typeIdx ?? Number.MAX_SAFE_INTEGER,
      conceptKey: concept?.key ?? "",
    };
  });
  ranked.sort(
    (a, b) =>
      a.seedRank - b.seedRank ||
      a.depth - b.depth ||
      a.typeIdx - b.typeIdx ||
      (a.conceptKey < b.conceptKey ? -1 : a.conceptKey > b.conceptKey ? 1 : 0) ||
      (a.chunkId < b.chunkId ? -1 : 1),
  );
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  for (const r of ranked) {
    if (seen.has(r.chunkId)) continue;
    seen.add(r.chunkId);
    candidates.push({
      chunkId: r.chunkId,
      channel: "graphLinked",
      rank: candidates.length + 1,
      score: null,
    });
    if (candidates.length >= graph.candidateLimit) break;
  }
  return { candidates, paths };
}
