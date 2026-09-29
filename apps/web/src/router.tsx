import { createRouter } from "@tanstack/react-router";
import { createExplorerClient } from "./lib/client";
import { createAppStore } from "./lib/store";
import { routeTree } from "./routeTree.gen";

/**
 * Per-request router (TanStack Start calls getRouter() once per SSR request)
 * → a fresh urql client + ssrExchange + Redux store per request: normalized
 * Graphcache, in-flight query state, and app state can never leak between
 * requests (spec/15).
 */
export async function getRouter() {
  let origin: string | undefined;
  let headers: Record<string, string> | undefined;
  if (import.meta.env.SSR) {
    // Forward the caller's cookies so server-side fetches present the same
    // identity to the trusted-context host hook (spec/09/spec/11).
    const { getRequest } = await import("@tanstack/react-start/server");
    const req = getRequest();
    origin = new URL(req.url).origin;
    const cookie = req.headers.get("cookie");
    const authorization = req.headers.get("authorization");
    headers = {
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    };
  }
  const { client, ssr } = createExplorerClient(
    import.meta.env.SSR
      ? { ...(origin !== undefined ? { origin } : {}), ...(headers ? { headers } : {}) }
      : {},
  );
  const store = createAppStore();
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: "intent",
    context: { urql: client, store },
    dehydrate: () => ({
      // SSRData crosses the wire as JSON; GraphQLError internals are not
      // statically serializable under exactOptionalPropertyTypes but the
      // exchange only consumes the JSON form.
      urqlState: JSON.parse(JSON.stringify(ssr.extractData())),
    }),
    hydrate: (dehydrated) => {
      ssr.restoreData(dehydrated.urqlState);
    },
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: Awaited<ReturnType<typeof getRouter>>;
  }
}
