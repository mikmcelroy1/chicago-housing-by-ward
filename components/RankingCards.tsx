import Link from "next/link";
import type { ReactNode } from "react";
import { formatInt, formatSigned } from "@/lib/format";
import { buildHref, type QueryState } from "@/lib/query";
import type { SortKey } from "@/lib/rank";
import { Avatar } from "./Avatar";
import { FlagList } from "./FlagList";
import { COLUMNS, RankChange, type RankingRow } from "./RankingTable";
import { Rate, SignedUnits } from "./SignedNumber";

export const SORT_LABELS: Record<SortKey, string> = {
  rate: "net / 1,000 units",
  net: "net units",
  gross: "gross units",
  lost: "units lost",
  projects: "projects",
};

function metric(row: Pick<RankingRow, "rate" | "net" | "gross" | "lost" | "projects">, key: SortKey): ReactNode {
  switch (key) {
    case "rate":
      return <Rate value={row.rate} />;
    case "net":
      return <SignedUnits value={row.net} />;
    case "gross":
      return formatInt(row.gross);
    case "lost":
      return row.lost > 0 ? formatSigned(-row.lost) : "0";
    case "projects":
      return formatInt(row.projects);
  }
}

/** The other four metrics in one quiet line under the card. */
function Others({ row, except }: { row: Pick<RankingRow, "rate" | "net" | "gross" | "lost" | "projects" | "lowSample">; except: SortKey }) {
  const parts: ReactNode[] = [];
  for (const col of COLUMNS) {
    if (col.key === except) continue;
    parts.push(
      <span key={col.key} className="whitespace-nowrap">
        {col.label} <span className="text-zinc-700 dark:text-zinc-300">{metric(row, col.key)}</span>
      </span>,
    );
  }
  if (row.lowSample) parts.push(<span key="low" className="whitespace-nowrap">low sample</span>);
  return (
    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
      {parts}
    </p>
  );
}

function Alders({ row }: { row: RankingRow }) {
  if (row.splits.length <= 1) {
    const t = row.splits[0]?.tenure;
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        {t ? <Avatar name={t.name} photoUrl={t.photo_url} size={40} /> : null}
        <span className="min-w-0">
          <span className="block font-medium leading-tight">{t?.name ?? row.wardRow?.alder_current ?? "–"}</span>
          <span className="block text-xs text-zinc-500 dark:text-zinc-400">Ward {row.ward}</span>
        </span>
      </span>
    );
  }
  return (
    <span className="flex min-w-0 flex-col gap-1.5">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">Ward {row.ward}, two alders in this period</span>
      {row.splits.map((s) => (
        <span key={s.tenure.id} className="flex min-w-0 items-center gap-2">
          <Avatar name={s.tenure.name} photoUrl={s.tenure.photo_url} size={40} />
          <span className="min-w-0 leading-tight">
            <span className="block font-medium">{s.tenure.name}</span>
            <span className="block text-xs text-zinc-500 dark:text-zinc-400">
              <SignedUnits value={s.net} /> units · {formatInt(s.projects)} {s.projects === 1 ? "project" : "projects"}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Phone layout: one card per ward, the sorted metric big, the rest in a line. */
export function RankingCards({ rows, state, showFlags }: { rows: RankingRow[]; state: QueryState; showFlags: boolean }) {
  return (
    <ol className="border-t border-zinc-200 dark:border-zinc-800">
      {rows.map((row) => (
        <li key={row.ward} className="border-b border-zinc-200 dark:border-zinc-800">
          <Link href={buildHref(`/ward/${row.ward}`, state)} className="flex gap-3 py-3">
            <span className="w-9 shrink-0 text-right">
              <span className="block text-lg font-semibold tabular-nums">{row.rank}</span>
              <span className="block text-xs">
                <RankChange change={row.rankChange} />
              </span>
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-start justify-between gap-3">
                <Alders row={row} />
                <span className="shrink-0 text-right">
                  <span className="block text-xl font-semibold tabular-nums">{metric(row, state.sort)}</span>
                  <span className="block text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{SORT_LABELS[state.sort]}</span>
                </span>
              </span>
              <Others row={row} except={state.sort} />
            </span>
          </Link>
          {showFlags && row.flags.length > 0 ? (
            <div className="-mt-1 pb-3 pl-12">
              <FlagList flags={row.flags} />
            </div>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
