import { json } from "@codemirror/lang-json";
import { createFileRoute } from "@tanstack/react-router";
import { graphql as cmGraphql } from "cm6-graphql";
import { buildClientSchema, type IntrospectionQuery } from "graphql";
import { useMemo, useState } from "react";
import { useClient } from "urql";
import { z } from "zod";
import { CodeEditor } from "../components/code-editor";
import { ErrorBanner, JsonBlock, PageHeader, Section } from "../components/ui";
import schemaJson from "../generated/schema.json";

export const Route = createFileRoute("/dev/graphql")({
  component: GraphqlDevPage,
});

const SAMPLE = `query {
  runtimeInfo {
    namespace { key }
    environment
    runtimeRevision
  }
}`;

/**
 * Raw GraphQL panel (spec/10): send any read-only document with variables,
 * see the raw result. The endpoint has no authored-content mutations, so an
 * arbitrary `mutation` document fails validation server-side.
 */
function GraphqlDevPage() {
  const client = useClient();
  const [doc, setDoc] = useState(SAMPLE);
  const [vars, setVars] = useState("{}");
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  // CodeMirror GraphQL mode gets the real introspected schema — completion
  // and linting run against the same SDL the endpoint serves.
  const gqlLanguage = useMemo(
    () => cmGraphql(buildClientSchema(schemaJson as unknown as IntrospectionQuery)),
    [],
  );

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    let parsedVars: Record<string, unknown> = {};
    try {
      const v: unknown = JSON.parse(vars || "{}");
      const record = z.record(z.string(), z.unknown()).safeParse(v);
      if (!record.success) {
        setRunning(false);
        setError("variables: must be a JSON object");
        return;
      }
      parsedVars = record.data;
    } catch {
      setRunning(false);
      setError("variables: invalid JSON");
      return;
    }
    const res = await client.query(doc, parsedVars, { requestPolicy: "network-only" }).toPromise();
    setRunning(false);
    if (res.error) {
      setError(res.error.message);
      if (res.data !== undefined && res.data !== null) setResult(res.data);
      return;
    }
    setResult(res.data);
  };

  return (
    <>
      <PageHeader title="GraphQL" subtitle="raw query panel — read-only endpoint at /graphql" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Query">
          <CodeEditor value={doc} onChange={setDoc} language={gqlLanguage} height={288} />
          <h4 className="mb-1 mt-3 text-xs font-semibold text-zinc-500">Variables (JSON)</h4>
          <CodeEditor value={vars} onChange={setVars} language={json()} height={96} />
          <button
            type="button"
            onClick={() => void run()}
            disabled={running}
            className="mt-2 rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? "Running…" : "Run query"}
          </button>
        </Section>
        <Section title="Result">
          {error ? <ErrorBanner message={error} /> : null}
          {result !== null ? (
            <JsonBlock value={result} />
          ) : (
            <p className="text-xs text-zinc-400">Run a query to see the result.</p>
          )}
        </Section>
      </div>
    </>
  );
}
