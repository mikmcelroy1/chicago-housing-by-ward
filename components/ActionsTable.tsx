import Link from "next/link";
import type { WardRow } from "@/scripts/lib/types";
import type { ActionSortKey, ActionTenureSplit, AduStatus, RankedWardActions } from "@/lib/actions";
import { DASH, formatInt, formatSigned } from "@/lib/format";
import { buildHref, type QueryState, type SortColumn } from "@/lib/query";
import { Avatar } from "./Avatar";
import { InfoBadge } from "./InfoBadge";
import { RankChange, SortHeader, td, tdNum, th, thNum } from "./RankingTable";
import { Rate } from "./SignedNumber";

export interface ActionRow extends RankedWardActions {
  wardRow: WardRow | undefined;
  splits: ActionTenureSplit[];
}

export const ACTION_COLUMNS: SortColumn<ActionSortKey>[] = [
  {
    key: "approved_rate",
    label: "Approved / 1,000",
    menuLabel: "Homes approved / 1,000",
    info: "Homes allowed by the rezonings and planned developments that passed in this period, divided by the ward's existing homes, times 1,000. The default sort.",
    anchor: "the-alder-actions-rank",
  },
  {
    key: "discretionary",
    label: "Discretionary",
    menuLabel: "Discretionary units",
    info: "Homes permitted in this period in projects whose site needed a rezoning or planned development the alder approved. Housing that exists because the alder said yes.",
    anchor: "linking-approvals-to-permits",
  },
  {
    key: "requested",
    label: "Requested",
    menuLabel: "Homes requested",
    info: "Homes asked for in every settled application introduced in this period: passed, stalled or withdrawn. Applications pending under 180 days are not settled and not counted.",
    anchor: "the-alder-actions-rank",
  },
  {
    key: "approval_rate",
    label: "Approval rate",
    info: "Homes approved divided by homes requested, after adding a typical ward's volume of homes at the citywide rate to both sides, so one approved project in a quiet ward lands near the citywide rate instead of at 100%. Hover a cell for the raw rate and the number of applications.",
    anchor: "the-alder-actions-rank",
  },
  {
    key: "allowed_added",
    label: "Allowed added",
    menuLabel: "Allowed homes added",
    info: "Homes the passed rezonings added to, or removed from, what the zoning rules allow on their lots. Downzonings count against. Only rezonings whose lot size and districts are known are summed.",
    anchor: "reading-a-zoning-ordinance",
  },
  { key: "stalled", label: "Stalled", menuLabel: "Stalled applications", info: "Applications introduced in this period that have been pending 180 days or more. Most rejections never reach a vote; they sit.", anchor: "what-counts-as-an-alder-action" },
  { key: "adu", label: "ADU", menuLabel: "ADU opt-in", info: "Whether the alder opted the ward into the 2025 accessory dwelling unit ordinance: yes, partial or none, with the ordinance linked.", anchor: "what-counts-as-an-alder-action" },
  { key: "sponsorships", label: "Sponsorships", menuLabel: "Pro-housing sponsorships", info: "Citywide pro-housing ordinances from a short curated list that the alder sponsored or co-sponsored, dated in this period.", anchor: "what-counts-as-an-alder-action" },
];

export function formatPercent(v: number | null): string {
  return v === null ? DASH : `${Math.round(v * 100)}%`;
}

const ADU_LABEL: Record<AduStatus, string> = { yes: "Opted in", partial: "Partial", none: "None" };

/** `link` is false inside a card that is itself a link: an <a> cannot nest in an <a>. */
export function AduCell({ status, href, link = true }: { status: AduStatus; href: string | null; link?: boolean }) {
  const cls = status === "yes" ? "text-emerald-700 dark:text-emerald-400" : status === "partial" ? "text-amber-700 dark:text-amber-400" : "text-zinc-400 dark:text-zinc-500";
  return href && link ? (
    <a href={href} className={`${cls} underline underline-offset-2`} rel="noreferrer">
      {ADU_LABEL[status]}
    </a>
  ) : (
    <span className={cls}>{ADU_LABEL[status]}</span>
  );
}

export function LowSample({ applications }: { applications: number }) {
  return (
    <span
      className="ml-1.5 rounded border border-zinc-300 px-1 text-[10px] uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
      title={`${applications} settled application${applications === 1 ? "" : "s"} in this period; fewer than 5 makes the rate noisy.`}
    >
      low sample
    </span>
  );
}

export function rawRateTitle(row: Pick<RankedWardActions, "raw_rate" | "applications" | "approved_of_requested" | "requested">): string {
  return `Raw rate ${formatPercent(row.raw_rate)}: ${formatInt(row.approved_of_requested)} of ${formatInt(row.requested)} homes requested in ${formatInt(row.applications)} settled application${row.applications === 1 ? "" : "s"}.`;
}

function AlderCell({ row, href }: { row: ActionRow; href: string }) {
  if (row.splits.length === 0) {
    return (
      <Link href={href} className="text-zinc-600 hover:underline underline-offset-2 dark:text-zinc-400">
        {row.wardRow?.alder_current ?? DASH}
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
                {formatInt(s.approved)} homes approved · {formatInt(s.actions)} {s.actions === 1 ? "action" : "actions"}
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ActionsTable({ rows, state, path = "/actions" }: { rows: ActionRow[]; state: QueryState<ActionSortKey>; path?: string }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <table className="w-full min-w-[900px] border-collapse text-sm">
        <thead className="border-b border-zinc-300 dark:border-zinc-700">
          <tr>
            <th scope="col" className={thNum}>
              <span className="inline-flex items-center">
                Rank
                <InfoBadge label="Rank" anchor="the-alder-actions-rank">
                  Position under the current sort, with 1 the highest. The arrow is the ward&apos;s movement against the equal-length period just
                  before this one.
                </InfoBadge>
              </span>
            </th>
            <th scope="col" className={thNum}>
              Ward
            </th>
            <th scope="col" className={th}>
              Alder
            </th>
            {ACTION_COLUMNS.map((col) => (
              <SortHeader key={col.key} col={col} state={state} path={path} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const wardHref = buildHref(`/ward/${row.ward}`, { from: state.from, to: state.to, sort: "rate", dir: "desc", completed: state.completed });
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
                <td className={tdNum} title={`${formatInt(row.approved)} homes approved in ${formatInt(row.passed)} passed ${row.passed === 1 ? "action" : "actions"}`}>
                  <Rate value={row.approved_rate} />
                </td>
                <td className={tdNum}>{formatInt(row.discretionary)}</td>
                <td className={tdNum}>{formatInt(row.requested)}</td>
                <td className={tdNum} title={rawRateTitle(row)}>
                  {formatPercent(row.approval_rate)}
                  {row.lowSample ? <LowSample applications={row.applications} /> : null}
                </td>
                <td className={tdNum} title={row.allowed_known ? `From ${formatInt(row.allowed_known)} passed ${row.allowed_known === 1 ? "rezoning" : "rezonings"} with a known lot size` : "No passed rezoning with a known lot size"}>
                  {row.allowed_known ? formatSigned(row.allowed_added) : DASH}
                </td>
                <td className={tdNum}>{formatInt(row.stalled)}</td>
                <td className={td}>
                  <AduCell status={row.adu} href={row.adu_source_url} />
                </td>
                <td className={tdNum}>{formatInt(row.sponsorships)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
