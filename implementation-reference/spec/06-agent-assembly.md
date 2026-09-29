# 06 — Agent Assembly

## Purpose

Given namespace, explicit template, normalized context, and optional task, select/package initial instructions, skills, tools, dependencies, and bootstrap knowledge. The platform does not execute agents or tools.

## Input

- namespace (optional if deployment has one)
- template key (required)
- context
- optional task
- optional retrieval profile
- optional budgets
- optional `runtime.availableBindings`
- diagnostics flag

If `runtime.availableBindings` is absent, all authored runtime bindings are assumed available; runtime availability is a host constraint, not authorization. If it is explicitly `[]`, no runtime bindings are available.

## Pipeline

```text
resolve explicit published template
-> validate context
-> template fragments
-> resolve task concepts if task present
-> parallel candidates: skills, task-relevant fragments, direct tools
-> authorization/applicability
-> selection groups
-> semantic + concept ranking
-> select skills
-> add skill fragments/tools/concepts
-> recursively resolve tool dependency closure
-> recheck dependency authorization/applicability/runtime availability
-> remove unavailable dependent tools/skills
-> bootstrap knowledge retrieval
-> apply effective budgets
-> deterministic fragment ordering
-> structured AgentAssemblyResult
```

## Tool dependency semantics

- `required`: target must be selected and usable; otherwise source tool unavailable.
- `optional`: include when usable; source remains usable if target is not.
- dependencies resolve transitively.
- **all dependency cycles are compiler errors, including optional-only cycles**.
- self-dependencies and unresolved targets are compiler errors.
- failure causes propagate and diagnostics retain the causal chain.

## Skill semantics

Skills' directly referenced tools are required in v1. A skill becomes unavailable if any required direct tool or required transitive dependency is unavailable.

Published skills may not require non-published tools. More generally, a published Agent Assembly entity may not have a required lifecycle dependency on a draft/deprecated entity.

## Task embedding availability

In v1, a non-empty `task` requires one task embedding because task-driven discovery of skills, tools, and `task_relevant` prompt fragments shares that embedding. If the task embedding cannot be produced, `assembleAgent` fails with `EMBEDDING_UNAVAILABLE`; v1 does not silently produce a partial lexical-only task assembly. An assembly request with no task does not require a task embedding and can proceed from template/context rules. Bootstrap knowledge retrieval retains the core retrieval engine's normal vector-channel degradation semantics.

## Direct tool selection

Tools may also be selected semantically from task even without a matching skill.

## Prompt fragments

Modes: `always`, `applicable`, `task_relevant`. Deterministic section/order/key rendering. No prompt scripting DSL.

A `task_relevant` fragment is not considered when no task is supplied. It MUST have `semanticText` in source. `always`/`applicable` fragments need semantic text only if they explicitly opt into semantic indexing.

## Bootstrap knowledge

Uses the normal retrieval engine with selected concepts and task. Small initial context only; ongoing retrieval is a separate runtime concern.

## Budgets

Template budgets provide the normal maximums. Request budgets may only tighten them. Installation hard ceilings always apply.

For each budget dimension:

```text
effective = min(templateLimit if present, requestLimit if present, installationHardLimit)
```

Absent values are ignored from the minimum. Required dependency closure and required prompt content are indivisible. If required content alone exceeds an effective budget, assembly fails with `ASSEMBLY_BUDGET_EXCEEDED`; required dependencies are never silently dropped.

## Structured output

Canonical output includes template, runtime revision, context/task hashes, resolved concepts, prompt fragments, skills, tools, dependency provenance, bootstrap knowledge, budget usage, diagnostics. `renderedPrompt` is optional convenience output.

## Runtime availability

Host may supply available logical runtime bindings. Runtime availability is distinct from user authorization. Missing list means all bindings available; explicit empty list means none.

## V1 exclusions

No capabilities/policies as first-class entities, no execution loop, no workflow engine, no subagents, no memory, no template auto-routing, no per-turn auto-refresh.
