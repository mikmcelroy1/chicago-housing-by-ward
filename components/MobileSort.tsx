"use client";

import { useRouter } from "next/navigation";
import { buildHref, type QueryState, type SortColumn } from "@/lib/query";
import { InfoBadge } from "./InfoBadge";
import { COLUMNS } from "./RankingTable";

/** Replaces the sortable column headers on phones: a select for the column and a button for the direction. */
export function MobileSort<K extends string>({ path, state, extra = {}, columns = COLUMNS as unknown as SortColumn<K>[] }: { path: string; state: QueryState<K>; extra?: Record<string, string | undefined>; columns?: SortColumn<K>[] }) {
  const router = useRouter();
  const col = columns.find((c) => c.key === state.sort) ?? columns[0];
  const control =
    "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-zinc-600 dark:text-zinc-400">Sort by</span>
        <select
          value={state.sort}
          onChange={(e) => router.push(buildHref(path, { ...state, sort: e.target.value as K, dir: "desc" }, extra))}
          className={control}
        >
          {columns.map((c) => (
            <option key={c.key} value={c.key}>
              {c.menuLabel ?? c.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        onClick={() => router.push(buildHref(path, { ...state, dir: state.dir === "desc" ? "asc" : "desc" }, extra))}
        className={control}
        aria-label={state.dir === "desc" ? "Sorted high to low; switch to low to high" : "Sorted low to high; switch to high to low"}
      >
        {state.dir === "desc" ? "High to low ▼" : "Low to high ▲"}
      </button>
      <InfoBadge label={col.label} anchor={col.anchor}>
        {col.info}
      </InfoBadge>
    </div>
  );
}
