import Link from "next/link";
import type { ReactNode } from "react";
import { formatDate, formatInt, formatSigned } from "@/lib/format";
import { buildHref, type Preset, type QueryState } from "@/lib/query";
import type { CityTotals } from "@/lib/rank";
import { Rate, SignedUnits } from "./SignedNumber";

const PERIOD: Record<Exclude<Preset, "custom">, string> = {
  last12: "last 12 months",
  ytd: "year to date",
  term: "current council term",
};

function periodLabel(state: QueryState): string {
  const base = state.preset === "custom" ? `${formatDate(state.from)} – ${formatDate(state.to)}` : PERIOD[state.preset];
  return state.completed ? `${base} · completed only` : base;
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:items-end">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">{label}</dt>
      <dd className="text-xl font-semibold tabular-nums sm:text-[22px]">{children}</dd>
    </div>
  );
}

/** Citywide totals for the selected period: a band above the table on desktop, a card above the list on phones. */
export function CityBand({ totals, state }: { totals: CityTotals; state: QueryState }) {
  return (
    <section
      aria-label="Citywide totals"
      className="flex flex-col gap-4 rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800 dark:bg-zinc-900"
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-lg font-semibold leading-tight">
          <Link href={buildHref("/chicago", state)} className="group inline-flex items-center gap-1.5 hover:underline underline-offset-4">
            Chicago
            <span aria-hidden="true" className="text-zinc-400 transition-transform group-hover:translate-x-0.5 dark:text-zinc-500">
              →
            </span>
          </Link>
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">All 50 wards · {periodLabel(state)}</p>
      </div>
      <dl className="grid grid-cols-3 gap-x-6 gap-y-3 sm:flex sm:gap-9">
        <Stat label="Net / 1,000">
          <Rate value={totals.rate} />
        </Stat>
        <Stat label="Net">
          <SignedUnits value={totals.net} />
        </Stat>
        <Stat label="Gross">{formatInt(totals.gross)}</Stat>
        <Stat label="Lost">{totals.lost > 0 ? formatSigned(-totals.lost) : "0"}</Stat>
        <Stat label="Projects">{formatInt(totals.projects)}</Stat>
      </dl>
    </section>
  );
}
