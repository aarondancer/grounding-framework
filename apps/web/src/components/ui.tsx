import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import Markdown from "react-markdown";
import { entityPath } from "../lib/nav";

/** Lifecycle status chip. */
export function StatusBadge({ status }: { status: string }) {
  const color =
    status === "PUBLISHED"
      ? "bg-emerald-100 text-emerald-800"
      : status === "DRAFT"
        ? "bg-amber-100 text-amber-800"
        : "bg-zinc-200 text-zinc-600";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${color}`}>
      {status.toLowerCase()}
    </span>
  );
}

/** Link to an entity detail page by (type, key); falls back to plain text. */
export function EntityLink({
  type,
  entityKey,
  children,
}: {
  type: string;
  entityKey: string;
  children?: ReactNode;
}) {
  const to = entityPath(type, entityKey);
  if (!to) return <span className="font-mono text-xs">{children ?? entityKey}</span>;
  return (
    <Link to={to} search={{}} className="font-mono text-xs text-blue-700 hover:underline">
      {children ?? entityKey}
    </Link>
  );
}

/** GitHub source link (spec/10): viewUrl when repository metadata permits. */
export function SourceLink({ source }: { source: { path: string; viewUrl: string | null } }) {
  const inner = <code className="text-xs">{source.path}</code>;
  if (!source.viewUrl) {
    return <span className="text-zinc-500">{inner}</span>;
  }
  return (
    <a
      href={source.viewUrl}
      target="_blank"
      rel="noreferrer"
      className="text-blue-700 hover:underline"
    >
      {inner}
    </a>
  );
}

export function JsonBlock({ value, title }: { value: unknown; title?: string }) {
  return (
    <div>
      {title ? <h4 className="mb-1 text-xs font-semibold text-zinc-500">{title}</h4> : null}
      <pre className="max-h-96 overflow-auto rounded bg-zinc-900 p-3 text-xs text-zinc-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
        {subtitle ? <p className="mt-0.5 text-sm text-zinc-500">{subtitle}</p> : null}
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}

export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-zinc-700">{title}</h2>
      {children}
    </section>
  );
}

/** Cursor pager driven by PageInfo + ?after= search param. */
export function Pager({
  pageInfo,
  total,
}: {
  pageInfo: { hasNextPage: boolean; endCursor: string | null };
  total: number | null | undefined;
}) {
  return (
    <div className="mt-3 flex items-center gap-3 text-sm text-zinc-600">
      {total !== null && total !== undefined ? <span>{total} total</span> : null}
      {pageInfo.hasNextPage && pageInfo.endCursor ? (
        <Link
          to="."
          search={(prev: Record<string, unknown>) => ({
            ...prev,
            ...(pageInfo.endCursor ? { after: pageInfo.endCursor } : {}),
          })}
          className="rounded border border-zinc-300 px-3 py-1 hover:bg-zinc-100"
        >
          Next page →
        </Link>
      ) : null}
    </div>
  );
}

/**
 * Authored Markdown (chunk content). Locked renderer per spec/15 —
 * react-markdown, no rehype-raw (no HTML injection from source files).
 */
export function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="md max-h-96 overflow-auto rounded border border-zinc-200 bg-white p-4 text-sm">
      <Markdown>{content}</Markdown>
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
      {children}
    </p>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{message}</p>
  );
}
