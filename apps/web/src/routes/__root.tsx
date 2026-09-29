import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
// Includes start-client-core's module augmentation (route `server`
// handlers on file routes) in the typecheck program.
import "@tanstack/react-start";
import type { ReactNode } from "react";
import stylesUrl from "../styles.css?url";

export const Route = createRootRoute({
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
  return (
    <RootDocument>
      <Outlet />
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
