import Link from "next/link";
import { DIRECTION_FILTERS, STAGE_FILTERS, type DirectionFilter, type StageFilter } from "@/lib/actions";
import { buildHref, type QueryState } from "@/lib/query";

const chip = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-xs ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
  }`;

const STAGE_LABELS: Record<StageFilter, string> = { all: "All", passed: "Passed", undecided: "Undecided", stalled: "Stalled", rejected: "Withdrawn or failed" };
const DIRECTION_LABELS: Record<DirectionFilter, string> = { all: "All", up: "Upzonings", down: "Downzonings", pd: "Planned developments", other: "Lateral and other" };

/** Stage and direction filters for a ward's matters; state lives in the URL beside the period. */
export function MatterFilters({ path, state, stage, direction }: { path: string; state: QueryState; stage: StageFilter; direction: DirectionFilter }) {
  const href = (next: { stage?: StageFilter; direction?: DirectionFilter }) => {
    const s = next.stage ?? stage;
    const d = next.direction ?? direction;
    return buildHref(path, state, { view: "matters", stage: s === "all" ? undefined : s, direction: d === "all" ? undefined : d });
  };
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Stage</span>
        {STAGE_FILTERS.map((s) => (
          <Link key={s} href={href({ stage: s })} aria-current={stage === s ? "page" : undefined} className={chip(stage === s)}>
            {STAGE_LABELS[s]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Change</span>
        {DIRECTION_FILTERS.map((d) => (
          <Link key={d} href={href({ direction: d })} aria-current={direction === d ? "page" : undefined} className={chip(direction === d)}>
            {DIRECTION_LABELS[d]}
          </Link>
        ))}
      </div>
    </div>
  );
}
