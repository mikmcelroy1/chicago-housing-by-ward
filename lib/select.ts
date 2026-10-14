/** Shared project selection for the ward page, the citywide page, and the JSON route: one filter, one order. */
import type { Project, ProjectKind, Snapshot } from "@/scripts/lib/types";
import { projectsInWindow, type DateWindow, type RankOptions } from "./rank";

export type CountedFilter = "all" | "yes" | "no";

export interface ProjectQuery {
  window: DateWindow;
  opts: RankOptions;
  ward?: number;
  kind?: ProjectKind;
  counted: CountedFilter;
}

export function parseCounted(value: string | undefined): CountedFilter {
  return value === "yes" || value === "no" ? value : "all";
}

/** Newest first, then by id so the order is stable across pages. */
export function newestFirst(a: Project, b: Project): number {
  return a.first_issue_date > b.first_issue_date ? -1 : a.first_issue_date < b.first_issue_date ? 1 : a.id.localeCompare(b.id);
}

export function selectProjects(snapshot: Snapshot, q: ProjectQuery): Project[] {
  return projectsInWindow(snapshot.projects, q.window, q.opts)
    .filter((p) => (q.ward === undefined || p.ward === q.ward) && (!q.kind || p.kind === q.kind) && (q.counted === "all" || (q.counted === "yes") === p.counted))
    .sort(newestFirst);
}
