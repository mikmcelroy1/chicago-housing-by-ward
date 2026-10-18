import type { ReactNode } from "react";
import type { CityActionTotals } from "@/lib/actions";
import { formatDate, formatInt, formatSigned } from "@/lib/format";
import type { Preset, QueryState } from "@/lib/query";
import { formatPercent } from "./ActionsTable";
import { Rate } from "./SignedNumber";

const PERIOD: Record<Exclude<Preset, "custom">, string> = {
  last12: "last 12 months",
  ytd: "year to date",
  term: "current council term",
};

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:items-end">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums sm:text-[22px]">{children}</dd>
    </div>
  );
}

/** Citywide totals of the alder actions for the selected period. */
export function ActionsBand({ totals, state }: { totals: CityActionTotals; state: QueryState<string> }) {
  const period = state.preset === "custom" ? `${formatDate(state.from)} – ${formatDate(state.to)}` : PERIOD[state.preset];
  return (
    <section
      aria-label="Citywide totals"
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold leading-tight">Chicago</h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          All 50 wards · {period} · {formatInt(totals.passed)} rezonings passed
        </p>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-3 sm:flex sm:gap-9">
        <Stat label="Approved / 1,000">
          <Rate value={totals.approved_rate} />
        </Stat>
        <Stat label="Approved">{formatInt(totals.approved)}</Stat>
        <Stat label="Discretionary">{formatInt(totals.discretionary)}</Stat>
        <Stat label="Requested">{formatInt(totals.requested)}</Stat>
        <Stat label="Approval rate">{formatPercent(totals.approval_rate)}</Stat>
        <Stat label="Allowed added">{formatSigned(totals.allowed_added)}</Stat>
      </dl>
    </section>
  );
}
