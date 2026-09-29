# Ontology channel ordering for multi-hop paths

spec/05 orders ontology-derived candidates by "seed rank, hop depth, relation-type ordering from the profile, concept key/ID, linked chunk ID." It does not specify which edge's relation type orders a candidate reached through a multi-hop path (depth 2 is the v1 maximum).

Decision: the **first hop's** relation-type position in the profile's `relationTypes` allowlist governs. A depth-2 concept inherits the relation-type index of the edge that left the seed; the second edge's type does not participate.

Rationale: the first edge is what makes the neighborhood reachable in spirit (the profile's type ordering expresses which seed-adjacent relation families matter); path-prefix ordering keeps the BFS deterministic without comparing whole paths, and is monotone under depth extension.

Alternatives considered:

- Lexicographic per-hop type ordering — rejected: mixes positions across hops (a depth-2 path starting with a disfavored type but ending with a favored one would outrank a favored-then-disfavored path), which misreads the tuple's intent that hop depth dominates type ordering.
- Last hop's type — rejected: arbitrary; the reaching edge least reflects the seed relationship that justified expansion.