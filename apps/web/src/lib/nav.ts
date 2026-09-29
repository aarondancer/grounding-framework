/** Navigation tree — mirrors spec/10. */
export const NAV: { label: string; items: { label: string; to: string }[] }[] = [
  { label: "Overview", items: [{ label: "Overview", to: "/" }] },
  {
    label: "Explore",
    items: [
      { label: "Concepts & Ontology", to: "/explore/concepts" },
      { label: "Knowledge", to: "/explore/knowledge" },
      { label: "Domains", to: "/explore/domains" },
      { label: "Dimensions", to: "/explore/dimensions" },
      { label: "Selection Groups", to: "/explore/selection-groups" },
    ],
  },
  {
    label: "Agent Assembly",
    items: [
      { label: "Templates", to: "/assembly/templates" },
      { label: "Skills", to: "/assembly/skills" },
      { label: "Tools", to: "/assembly/tools" },
      { label: "Prompt Fragments", to: "/assembly/fragments" },
    ],
  },
  {
    label: "Playgrounds",
    items: [
      { label: "Retrieval", to: "/playground/retrieval" },
      { label: "Agent Assembly", to: "/playground/assembly" },
    ],
  },
  {
    label: "Developer",
    items: [
      { label: "GraphQL", to: "/dev/graphql" },
      { label: "Runtime", to: "/dev/runtime" },
    ],
  },
];

/** Entity type string → Explorer detail path (key-scoped). */
export function entityPath(type: string, key: string): string | null {
  switch (type) {
    case "concept":
      return `/explore/concepts/${key}`;
    case "knowledge_item":
      return `/explore/knowledge/${key}`;
    case "knowledge_chunk":
      return `/explore/chunks/${key}`;
    case "domain":
      return `/explore/domains/${key}`;
    case "dimension":
      return `/explore/dimensions/${key}`;
    case "selection_group":
      return `/explore/selection-groups/${key}`;
    case "agent_template":
      return `/assembly/templates/${key}`;
    case "skill":
      return `/assembly/skills/${key}`;
    case "tool":
      return `/assembly/tools/${key}`;
    case "prompt_fragment":
      return `/assembly/fragments/${key}`;
    case "retrieval_profile":
    case "namespace":
      return `/dev/runtime`;
    default:
      return null;
  }
}

/**
 * Address key for an entity row in a link. Chunk keys are only unique per
 * knowledge item — chunk detail routes are addressed by id.
 */
export function entityLinkKey(e: { type: string; id: string; key: string }): string {
  return e.type === "knowledge_chunk" ? e.id : e.key;
}
