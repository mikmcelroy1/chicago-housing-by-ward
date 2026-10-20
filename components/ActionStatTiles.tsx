import type { WardActionStats } from "@/lib/actions";
import { formatInt } from "@/lib/format";
import { formatPercent, LowSample, rawRateTitle } from "./ActionsTable";
import { Rate } from "./SignedNumber";

const tile = "rounded-md border border-zinc-200 px-3 py-2.5 dark:border-zinc-800";
const label = "text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const value = "mt-1 text-2xl font-semibold tabular-nums";

/** A ward's alder-actions numbers for the period, the same figures as its row on the Matters ranking. */
export function ActionStatTiles({ stats }: { stats: WardActionStats }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <div className={tile}>
        <dt className={label}>Approved per 1,000</dt>
        <dd className={value}>
          <Rate value={stats.approved_rate} />
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Homes approved</dt>
        <dd className={value}>{formatInt(stats.approved)}</dd>
      </div>
      <div className={tile}>
        <dt className={label}>Permitted so far</dt>
        <dd className={value}>{formatInt(stats.permitted)}</dd>
      </div>
      <div className={tile}>
        <dt className={label}>Homes requested</dt>
        <dd className={value}>{formatInt(stats.requested)}</dd>
      </div>
      <div className={tile}>
        <dt className={label}>Approval rate</dt>
        <dd className={value} title={rawRateTitle(stats)}>
          {formatPercent(stats.approval_rate)}
          {stats.lowSample ? <LowSample applications={stats.applications} /> : null}
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Stalled</dt>
        <dd className={value}>
          {formatInt(stats.stalled)}
          {stats.undecided ? <span className="ml-2 align-middle text-xs font-normal text-zinc-500 dark:text-zinc-400">{formatInt(stats.undecided)} undecided</span> : null}
        </dd>
      </div>
    </dl>
  );
}
