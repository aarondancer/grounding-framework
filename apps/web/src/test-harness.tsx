import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import type { ReactNode } from "react";

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
