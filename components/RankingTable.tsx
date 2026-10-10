import Link from "next/link";
import type { WardFlag, WardRow } from "@/scripts/lib/types";
import { formatInt, formatSigned } from "@/lib/format";
import { buildHref, nextSort, type QueryState } from "@/lib/query";
import type { RankedWardWithChange, SortKey, TenureSplit } from "@/lib/rank";
import { Avatar } from "./Avatar";
import { FlagList } from "./FlagList";
import { InfoBadge } from "./InfoBadge";
import { Rate, SignedUnits } from "./SignedNumber";

export interface RankingRow extends RankedWardWithChange {
  wardRow: WardRow | undefined;
  splits: TenureSplit[];
  flags: WardFlag[];
}

export const COLUMNS: { key: SortKey; label: string; info: string; anchor: string }[] = [
  {
    key: "rate",
    label: "Net / 1,000",
    info: "Net new units divided by the ward's existing housing units, times 1,000. The default sort, so wards with very different housing stock compare fairly.",
    anchor: "the-rank",
  },
  { key: "net", label: "Net", info: "Gross units minus units lost in this period.", anchor: "the-rank" },
  { key: "gross", label: "Gross", info: "Units added by new construction, ADUs and conversions in this period.", anchor: "what-is-counted" },
  {
    key: "lost",
    label: "Lost",
    info: "Units removed by voluntary demolition and deconversion, including buildings torn down for a rebuild at the same address. Emergency demolitions are never counted.",
    anchor: "what-is-counted",
  },
  { key: "projects", label: "Projects", info: "Counted projects in this period. Fewer than 3 is marked low sample because the rate is noisy.", anchor: "the-rank" },
];

export function RankChange({ change }: { change: number | null }) {
  if (change === null || change === 0) {
    return (
      <span className="text-zinc-400 dark:text-zinc-500" aria-label={change === null ? "No prior period" : "No change"}>
        –
      </span>
    );
  }
  const up = change > 0;
  return (
    <span
      className={`tabular-nums ${up ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400"}`}
      aria-label={`${up ? "Up" : "Down"} ${Math.abs(change)} from the prior period`}
    >
      {up ? "▲" : "▼"}
      {Math.abs(change)}
    </span>
  );
}

function AlderCell({ row, href }: { row: RankingRow; href: string }) {
  if (row.splits.length === 0) {
    return (
      <Link href={href} className="text-zinc-600 hover:underline underline-offset-2 dark:text-zinc-400">
        {row.wardRow?.alder_current ?? "–"}
      </Link>
    );
  }
  if (row.splits.length === 1) {
    const t = row.splits[0].tenure;
    return (
      <Link href={href} className="flex items-center gap-2.5 hover:underline underline-offset-2">
        <Avatar name={t.name} photoUrl={t.photo_url} size={40} />
        <span>{t.name}</span>
      </Link>
    );
  }
  return (
    <ul className="flex flex-col gap-2">
      {row.splits.map((s) => (
        <li key={s.tenure.id}>
          <Link href={href} className="flex items-center gap-2.5 hover:underline underline-offset-2">
            <Avatar name={s.tenure.name} photoUrl={s.tenure.photo_url} size={40} />
            <span className="flex flex-col leading-tight">
              <span>{s.tenure.name}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                <SignedUnits value={s.net} /> units · {formatInt(s.projects)} {s.projects === 1 ? "project" : "projects"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const th = "px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const thNum = `${th} text-right`;
const td = "px-2 py-2 align-middle";
const tdNum = `${td} text-right tabular-nums`;

function SortHeader({ col, state, path }: { col: (typeof COLUMNS)[number]; state: QueryState; path: string }) {
  const active = state.sort === col.key;
  const next = nextSort(state, col.key);
  const arrow = active ? (state.dir === "desc" ? "▼" : "▲") : "";
  return (
    <th scope="col" className={thNum} aria-sort={active ? (state.dir === "desc" ? "descending" : "ascending") : "none"}>
      <span className="inline-flex items-center justify-end">
        <Link
          href={buildHref(path, { ...state, ...next })}
          className={`inline-flex items-center gap-1 hover:text-zinc-900 dark:hover:text-zinc-100 ${active ? "text-zinc-900 dark:text-zinc-100" : ""}`}
          title={active ? (state.dir === "desc" ? "Sorted high to low. Click for low to high." : "Sorted low to high. Click for high to low.") : "Sort by this column"}
        >
          {col.label}
          <span className="w-3 text-[10px]" aria-hidden="true">
            {arrow}
          </span>
        </Link>
        <InfoBadge label={col.label} anchor={col.anchor}>
          {col.info}
        </InfoBadge>
      </span>
    </th>
  );
}

export function RankingTable({ rows, state, showFlags, path = "/" }: { rows: RankingRow[]; state: QueryState; showFlags: boolean; path?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="border-b border-zinc-300 dark:border-zinc-700">
          <tr>
            <th scope="col" className={thNum}>
              <span className="inline-flex items-center">
                Rank
                <InfoBadge label="Rank" anchor="the-rank">
                  Position under the current sort, with 1 the highest. The arrow is the ward&apos;s movement against the equal-length period
                  just before this one.
                </InfoBadge>
              </span>
            </th>
            <th scope="col" className={thNum}>
              Ward
            </th>
            <th scope="col" className={th}>
              Alder
            </th>
            {COLUMNS.map((col) => (
              <SortHeader key={col.key} col={col} state={state} path={path} />
            ))}
            {showFlags ? (
              <th scope="col" className={th}>
                Flags
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const wardHref = buildHref(`/ward/${row.ward}`, state);
            return (
              <tr key={row.ward} className="border-b border-zinc-200 dark:border-zinc-800">
                <td className={tdNum}>
                  <span className="inline-flex items-baseline justify-end gap-1.5">
                    <span className="font-medium">{row.rank}</span>
                    <span className="w-7 text-left text-xs">
                      <RankChange change={row.rankChange} />
                    </span>
                  </span>
                </td>
                <td className={tdNum}>
                  <Link href={wardHref} className="font-medium underline underline-offset-2">
                    {row.ward}
                  </Link>
                </td>
                <td className={td}>
                  <AlderCell row={row} href={wardHref} />
                </td>
                <td className={tdNum}>
                  <Rate value={row.rate} />
                </td>
                <td className={tdNum}>
                  <SignedUnits value={row.net} />
                </td>
                <td className={tdNum}>{formatInt(row.gross)}</td>
                <td className={tdNum}>{row.lost > 0 ? formatSigned(-row.lost) : "0"}</td>
                <td className={tdNum}>
                  {formatInt(row.projects)}
                  {row.lowSample ? (
                    <span
                      className="ml-1.5 rounded border border-zinc-300 px-1 text-[10px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
                      title="Fewer than 3 counted projects in this period; the rate is noisy."
                    >
                      low sample
                    </span>
                  ) : null}
                </td>
                {showFlags ? (
                  <td className={td}>
                    <FlagList flags={row.flags} />
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
