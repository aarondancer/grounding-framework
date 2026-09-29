# Assembly semantics for required fragments, skill concepts, and group re-resolution

Three spec/06 ambiguities resolved during M6, each choosing the smallest behavior compatible with the locked invariants.

## Required (`always`) prompt fragments

`ASSEMBLY_REQUIREMENT_UNSATISFIED` lives in the **RuntimeErrorCode** registry (spec/14), so an `always` fragment excluded by gating or selection-group resolution fails the assembly request — it is not a soft diagnostic. Authors who want conditional content should use `applicable`/`task_relevant`; an `always` fragment behind authorization/applicability is an authoring contradiction the runtime surfaces rather than silently dropping.

## Skill-attached fragments and selection groups

spec/06's pipeline orders selection-group resolution before "add skill fragments/tools/concepts," so a literal reading lets skill-attached fragments bypass group competition with template-listed members of the same group. That defeats the group's purpose and can double-render variants. Decision: fragment groups are re-resolved over the full eligible set once skill-attached fragments join — a second pass runs only for groups that gained eligible members, over members that still pass gating and were not already rejected.

## Skill concepts in bootstrap retrieval

spec/06 says bootstrap retrieval runs "with selected concepts" without defining the set. Decision: selected concepts = task-resolved concepts ∪ concepts attached to finally-selected skills (post viability fixpoint — dropped skills contribute nothing). Skill concept ids join the retrieval `filters.conceptIds` union; they do not appear in `task.resolvedConcepts`, which remains task-derived only.

Alternatives considered:

- Soft diagnostic for unsatisfied required content — rejected: the code's placement in the error registry signals request failure, and silently shipping a prompt missing required content is the worst failure mode for an assembly layer.
- Only task-resolved concepts for bootstrap — rejected: "add skill fragments/tools/concepts" in the pipeline exists precisely so selected skills contribute their concept surface to grounding.

## Asymmetry note

A selected skill whose required *tool* fails degrades softly (the skill drops with causal diagnostics), while a gated `always` *fragment* fails the whole request. This is deliberate: skills are ranked candidates — droppable by construction — whereas `always` fragments are the template's own required content. Tools attached to skills are required *of the skill*, not *of the request*.
