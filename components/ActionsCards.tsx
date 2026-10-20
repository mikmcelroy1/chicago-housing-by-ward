import Link from "next/link";
import type { ReactNode } from "react";
import type { ActionSortKey } from "@/lib/actions";
import { DASH, formatInt, formatSigned } from "@/lib/format";
import { buildHref, type QueryState } from "@/lib/query";
import { ACTION_COLUMNS, AduCell, formatPercent, rawRateTitle, type ActionRow } from "./ActionsTable";
import { Avatar } from "./Avatar";
import { RankChange } from "./RankingTable";
import { Rate } from "./SignedNumber";

function metric(row: ActionRow, key: ActionSortKey): ReactNode {
  switch (key) {
    case "approved_rate":
      return <Rate value={row.approved_rate} />;
    case "permitted":
      return formatInt(row.permitted);
    case "requested":
      return formatInt(row.requested);
    case "approval_rate":
      return <span title={rawRateTitle(row)}>{formatPercent(row.approval_rate)}</span>;
    case "allowed_added":
      return row.allowed_known ? formatSigned(row.allowed_added) : DASH;
    case "stalled":
      return formatInt(row.stalled);
    case "adu":
      return <AduCell status={row.adu} href={row.adu_source_url} link={false} />;
    case "sponsorships":
      return formatInt(row.sponsorships);
  }
}

function Others({ row, except }: { row: ActionRow; except: ActionSortKey }) {
  const parts: ReactNode[] = [];
  for (const col of ACTION_COLUMNS) {
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

function Alders({ row }: { row: ActionRow }) {
  if (row.splits.length <= 1) {
    const t = row.splits[0]?.tenure;
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        {t ? <Avatar name={t.name} photoUrl={t.photo_url} size={40} /> : null}
        <span className="min-w-0">
          <span className="block font-medium leading-tight">{t?.name ?? row.wardRow?.alder_current ?? DASH}</span>
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
              {formatInt(s.approved)} homes approved · {formatInt(s.actions)} {s.actions === 1 ? "action" : "actions"}
            </span>
          </span>
        </span>
      ))}
    </span>
  );
}

/** Phone layout: one card per ward, the sorted metric big, the rest in a line. */
export function ActionsCards({ rows, state }: { rows: ActionRow[]; state: QueryState<ActionSortKey> }) {
  const col = ACTION_COLUMNS.find((c) => c.key === state.sort) ?? ACTION_COLUMNS[0];
  return (
    <ol className="border-t border-zinc-200 dark:border-zinc-800">
      {rows.map((row) => (
        <li key={row.ward} className="border-b border-zinc-200 dark:border-zinc-800">
          <Link href={buildHref(`/ward/${row.ward}`, { from: state.from, to: state.to, sort: "rate", dir: "desc", completed: state.completed })} className="flex gap-3 py-3">
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
                  <span className="block text-[11px] uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{col.menuLabel ?? col.label}</span>
                </span>
              </span>
              <Others row={row} except={state.sort} />
            </span>
          </Link>
        </li>
      ))}
    </ol>
  );
}
