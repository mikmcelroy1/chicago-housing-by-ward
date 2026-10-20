import Link from "next/link";
import { periodHref } from "@/lib/query";
import type { DateWindow } from "@/lib/rank";

export type WardView = "permits" | "matters";

export function parseWardView(value: string | undefined): WardView {
  return value === "matters" ? "matters" : "permits";
}

/** The two sides of a ward: what was permitted, and what the alder did about zoning. The period carries across. */
export function WardViewTabs({ ward, view, state }: { ward: number; view: WardView; state: DateWindow & { completed: boolean } }) {
  const tab = (active: boolean) =>
    `-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${active ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"}`;
  const base = periodHref(`/ward/${ward}`, state);
  return (
    <nav aria-label="Ward views" className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800">
      <Link href={base} aria-current={view === "permits" ? "page" : undefined} className={tab(view === "permits")}>
        Permits
      </Link>
      <Link href={`${base}&view=matters`} aria-current={view === "matters" ? "page" : undefined} className={tab(view === "matters")}>
        Matters
      </Link>
    </nav>
  );
}
