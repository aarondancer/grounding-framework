import { createFileRoute } from "@tanstack/react-router";

async function forward(request: Request): Promise<Response> {
  const { forwardToServerApp } = await import("../server/app");
  return forwardToServerApp(request);
}

export const Route = createFileRoute("/graphql")({
  server: {
    handlers: {
      GET: ({ request }) => forward(request),
      POST: ({ request }) => forward(request),
      OPTIONS: ({ request }) => forward(request),
    },
  },
});
