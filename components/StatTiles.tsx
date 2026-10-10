import { formatInt } from "@/lib/format";
import type { WardStats } from "@/lib/rank";
import { Rate, SignedUnits } from "./SignedNumber";

const tile = "rounded-md border border-zinc-200 px-3 py-2.5 dark:border-zinc-800";
const label = "text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400";
const value = "mt-1 text-2xl font-semibold tabular-nums";

export function StatTiles({ stats }: { stats: WardStats }) {
  return (
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      <div className={tile}>
        <dt className={label}>Net per 1,000</dt>
        <dd className={value}>
          <Rate value={stats.rate} />
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Net units</dt>
        <dd className={value}>
          <SignedUnits value={stats.net} />
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Gross</dt>
        <dd className={value}>{formatInt(stats.gross)}</dd>
      </div>
      <div className={tile}>
        <dt className={label}>Lost</dt>
        <dd className={value}>{formatInt(stats.lost)}</dd>
      </div>
      <div className={tile}>
        <dt className={label}>Projects</dt>
        <dd className={value}>
          {formatInt(stats.projects)}
          {stats.lowSample ? (
            <span
              className="ml-2 align-middle rounded border border-zinc-300 px-1 text-[10px] font-normal uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400"
              title="Fewer than 3 counted projects in this window; the rate is noisy."
            >
              low sample
            </span>
          ) : null}
        </dd>
      </div>
      <div className={tile}>
        <dt className={label}>Emergency demolitions</dt>
        <dd className={value}>
          {formatInt(stats.emergency_units)}
          <span className="ml-2 align-middle text-xs font-normal text-amber-700 dark:text-amber-400">not counted</span>
        </dd>
      </div>
    </dl>
  );
}
