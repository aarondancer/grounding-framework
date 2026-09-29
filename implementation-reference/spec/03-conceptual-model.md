# 03 — Conceptual Model

## Core entities

### Concept
Canonical semantic entity with stable ID, key, name, plain-string type, description, aliases, domains, lifecycle, metadata.

### Alias
Alternate name/acronym/legacy term/misspelling. Used for concept resolution; never for compiler reference resolution.

### Domain
Lightweight organizational/semantic grouping. Useful for browse and explicit filtering. Not automatically a ranking or authorization mechanism.

### Relation type / relation
Directed `source concept -> relation type -> target concept`. Shallow recursive traversal powers ontology expansion.

### Knowledge item
Logical authored/imported unit with title, summary, primary provenance, lifecycle, authority score, effective dates.

### Knowledge chunk
Smallest independently retrievable semantic unit. Carries content, linked concepts, lifecycle, priority, authority, dates, selection group, authorization/applicability, token count, lexical/semantic hashes.

### Dimension
Defines a request-context axis. Dynamic per namespace; no migration required for custom dimensions.

### Selection group
Competing variants of one logical slot. Modes: `highest_priority` (default), `most_specific`, `all`.

### Retrieval profile
Simple named validated configuration controlling candidate limits, graph expansion, and packing.

## Agent Assembly entities

### Agent template
Explicit stable shell. Caller selects the template; v1 does not auto-route templates.

### Skill
Context/task-selectable bundle of concepts, prompt fragments, and required tools. Skills do not own duplicated domain knowledge.

### Prompt fragment
Reusable instruction block with inclusion mode: `always`, `applicable`, or `task_relevant`.

### Tool
Concrete external executable interface described/selected by the platform but executed by host runtime. Has logical `runtimeBinding`.

### Tool dependency
Directed `sourceTool -> targetTool`, requirement `required|optional`. The entire dependency graph must be acyclic, including optional-only edges.
