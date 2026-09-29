import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-semibold">Grounding Explorer</h1>
      <p className="mt-2 text-gray-600">
        Read-only explorer for the grounding platform. API at{" "}
        <code className="rounded bg-gray-100 px-1">/graphql</code>.
      </p>
    </main>
  );
}
