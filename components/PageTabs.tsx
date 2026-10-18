import Link from "next/link";
import { periodHref } from "@/lib/query";
import type { DateWindow } from "@/lib/rank";

/** The two rankings: what the market built (permits) and what the alder did about it (zoning actions). The period carries across. */
export function PageTabs({ current, state }: { current: "permits" | "actions"; state: DateWindow & { completed: boolean } }) {
  const tab = (active: boolean) =>
    `-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${active ? "border-zinc-900 text-zinc-900 dark:border-zinc-100 dark:text-zinc-100" : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:text-zinc-200"}`;
  return (
    <nav aria-label="Rankings" className="flex gap-6 border-b border-zinc-200 dark:border-zinc-800">
      <Link href={periodHref("/", state)} aria-current={current === "permits" ? "page" : undefined} className={tab(current === "permits")}>
        Permits
      </Link>
      <Link href={periodHref("/actions", state)} aria-current={current === "actions" ? "page" : undefined} className={tab(current === "actions")}>
        Alder actions
      </Link>
    </nav>
  );
}
