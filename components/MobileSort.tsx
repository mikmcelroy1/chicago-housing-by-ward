"use client";

import { useRouter } from "next/navigation";
import { buildHref, type QueryState } from "@/lib/query";
import { SORT_KEYS, type SortKey } from "@/lib/rank";
import { InfoBadge } from "./InfoBadge";
import { COLUMNS } from "./RankingTable";

const LABELS: Record<SortKey, string> = {
  rate: "Net / 1,000 units",
  net: "Net units",
  gross: "Gross units",
  lost: "Units lost",
  projects: "Projects",
};

/** Replaces the sortable column headers on phones: a select for the column and a button for the direction. */
export function MobileSort({ path, state, extra = {} }: { path: string; state: QueryState; extra?: Record<string, string | undefined> }) {
  const router = useRouter();
  const col = COLUMNS.find((c) => c.key === state.sort) ?? COLUMNS[0];
  const control =
    "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <label className="flex items-center gap-2">
        <span className="text-zinc-600 dark:text-zinc-400">Sort by</span>
        <select
          value={state.sort}
          onChange={(e) => router.push(buildHref(path, { ...state, sort: e.target.value as SortKey, dir: "desc" }, extra))}
          className={control}
        >
          {SORT_KEYS.map((k) => (
            <option key={k} value={k}>
              {LABELS[k]}
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
