"use client";

import { useState } from "react";
import type { Project } from "@/scripts/lib/types";
import { formatInt } from "@/lib/format";
import { ProjectList } from "./ProjectList";

/**
 * A project list that renders its first page from the server and lazy-loads the rest
 * in batches from /api/projects. Remount it (via `key`) whenever the query changes.
 */
export function ProjectFeed({ initial, total, queryString, pageSize = 200, showWard = false }: { initial: Project[]; total: number; queryString: string; pageSize?: number; showWard?: boolean }) {
  const [rows, setRows] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remaining = total - rows.length;

  async function loadMore() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects?${queryString}&offset=${rows.length}&limit=${pageSize}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { projects: Project[] };
      setRows((r) => [...r, ...data.projects]);
    } catch {
      setError("Could not load more. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <ProjectList projects={rows} showWard={showWard} />
      {remaining > 0 ? (
        <div className="flex flex-wrap items-center gap-3 py-4">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            {loading ? "Loading…" : `Show ${formatInt(Math.min(pageSize, remaining))} more`}
          </button>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            Showing {formatInt(rows.length)} of {formatInt(total)}
          </span>
          {error ? <span className="text-xs text-red-700 dark:text-red-400">{error}</span> : null}
        </div>
      ) : null}
    </>
  );
}
