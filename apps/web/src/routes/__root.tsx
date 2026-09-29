import { createRootRouteWithContext, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
// Includes start-client-core's module augmentation (route `server`
// handlers on file routes) in the typecheck program.
import "@tanstack/react-start";
import { type ReactNode, useEffect } from "react";
import { Provider as ReduxProvider } from "react-redux";
import { type Client, Provider as UrqlProvider } from "urql";
import { Shell } from "../components/shell";
import { type AppStore, hydrateStoredContext } from "../lib/store";
import stylesUrl from "../styles.css?url";

export interface RouterCtx {
  urql: Client;
  store: AppStore;
}

export const Route = createRootRouteWithContext<RouterCtx>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Grounding Explorer" },
    ],
    links: [{ rel: "stylesheet", href: stylesUrl }],
  }),
  component: RootComponent,
});

function RootComponent() {
  const { urql, store } = Route.useRouteContext();
  // Post-mount: restore the persisted simulated context (hydration-safe —
  // the server and the client's first render both start empty).
  useEffect(() => hydrateStoredContext(store), [store]);
  return (
    <RootDocument>
      <ReduxProvider store={store}>
        <UrqlProvider value={urql}>
          <Shell>
            <Outlet />
          </Shell>
        </UrqlProvider>
      </ReduxProvider>
    </RootDocument>
  );
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
