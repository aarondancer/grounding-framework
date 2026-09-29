import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/healthz")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { forwardToServerApp } = await import("../server/app");
        return forwardToServerApp(request);
      },
    },
  },
});
