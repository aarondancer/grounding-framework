import type { TypedDocumentNode } from "@graphql-typed-document-node/core";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Client } from "urql";
import { createAppStore } from "./lib/store";

/**
 * Minimal TanStack Router harness for component tests: mounts `ui` as the
 * index route of a throwaway router so Link/useNavigate/useMatches resolve.
 * Link `to` targets don't need to be registered — hrefs build from the
 * literal path.
 */
export async function renderWithRouter(ui: ReactNode) {
  const root = createRootRoute();
  const index = createRoute({
    getParentRoute: () => root,
    path: "/",
    component: () => <>{ui}</>,
  });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  return { router, ...render(<RouterProvider router={router} />) };
}

/**
 * urql stub for component/page tests: dispatches canned responses by
 * GraphQL operation name. Unstubbed operations surface as errors rather
 * than silently succeeding.
 */
export function stubUrql(responses: Record<string, unknown>): Client {
  const calls: { name: string; variables: unknown }[] = [];
  const client = {
    calls,
    query: (doc: TypedDocumentNode, variables: unknown) => ({
      toPromise: async () => {
        const op = doc.definitions.find((d) => d.kind === "OperationDefinition");
        const name = op && "name" in op ? (op.name?.value ?? "") : "";
        calls.push({ name, variables });
        if (name in responses) return { data: responses[name], error: undefined };
        return {
          data: undefined,
          error: new Error(`stubUrql: no response for operation "${name}"`),
        };
      },
      toString: () => "[stub]",
    }),
  };
  return client as unknown as Client;
}

/** Calls recorded against a stubUrql client (assert query variables). */
export function stubCalls(client: Client): { name: string; variables: unknown }[] {
  return (client as unknown as { calls: { name: string; variables: unknown }[] }).calls;
}

/**
 * Mount the real generated route tree at `path` with a stubbed urql
 * context — exercises beforeLoad guards, loaders, and the rendered page.
 */
export async function renderRoute(path: string, client: Client) {
  const { routeTree } = await import("./routeTree.gen");
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { urql: client, store: createAppStore() },
  });
  await router.load();
  return { router, ...render(<RouterProvider router={router} />) };
}

/**
 * Workaround for a happy-dom/React pairing limitation: synthetic `onChange`
 * never fires for text inputs (selects/checkboxes work fine). Drives the
 * real React `onChange` prop directly inside `act()` so controlled-input
 * code paths are still exercised end to end.
 */
export async function setTextInput(el: HTMLElement, value: string) {
  const props = Object.keys(el).find((k) => k.startsWith("__reactProps"));
  const handler = props
    ? (
        el as unknown as Record<
          string,
          { onChange: (e: { target: { value: string } }) => void } | undefined
        >
      )[props]?.onChange
    : undefined;
  if (!handler) throw new Error("setTextInput: element has no React onChange prop");
  await act(async () => handler({ target: { value } }));
}
