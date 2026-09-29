import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/readyz")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const { forwardToServerApp } = await import("../server/app");
        return forwardToServerApp(request);
      },
    },
  },
});
