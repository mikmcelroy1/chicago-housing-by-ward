import { connection } from "next/server";
import { Suspense } from "react";
import { CityBand } from "@/components/CityBand";
import { PageTabs } from "@/components/PageTabs";
import { RankingCards } from "@/components/RankingCards";
import { MobileSort } from "@/components/MobileSort";
import { RankingTable, type RankingRow } from "@/components/RankingTable";
import { WindowControls } from "@/components/WindowControls";
import { getSnapshot } from "@/lib/data";
import { todayInChicago } from "@/lib/dates";
import { parseQuery, type SearchParams } from "@/lib/query";
import { wardFlagsWithDerived } from "@/lib/actions";
import { cityTotals, rankWithChange, tenureSplit, wardsChangedHands } from "@/lib/rank";

export default function Home({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Rankings</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">Which Chicago wards are actually adding housing</p>
      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading rankings…</p>}>
        <Rankings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Rankings({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection(); // "today" comes from the clock, so this must render at request time
  const [sp, snapshot] = await Promise.all([searchParams, getSnapshot()]);
  const today = todayInChicago();
  const state = parseQuery(sp, today, snapshot.window_start);
  const window = { from: state.from, to: state.to };
  const opts = { completedOnly: state.completed };

  const wardRows = new Map(snapshot.wards.map((w) => [w.ward, w]));
  const flags = wardFlagsWithDerived(snapshot);
  const ranked = rankWithChange(snapshot, window, state.sort, opts);
  const ordered = state.dir === "asc" ? [...ranked].reverse() : ranked;
  const rows: RankingRow[] = ordered.map((r) => ({
    ...r,
    wardRow: wardRows.get(r.ward),
    splits: tenureSplit(snapshot, r.ward, window, opts),
    flags: flags.filter((f) => f.ward === r.ward),
  }));
  const changedHands = wardsChangedHands(snapshot, window);
  const totals = cityTotals(ranked, snapshot.wards);

  return (
    <div className="mt-6 flex flex-col gap-5">
      <PageTabs current="permits" state={state} />
      <WindowControls path="/" state={state} today={today} windowStart={snapshot.window_start} />
      {changedHands > 0 ? (
        <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          {changedHands === 1 ? "1 ward changed hands" : `${changedHands} wards changed hands`} in this period. Those rows show each alder with
          the units permitted during their tenure.
        </p>
      ) : null}
      <CityBand totals={totals} state={state} />
      <div className="hidden sm:block">
        <RankingTable rows={rows} state={state} showFlags={flags.length > 0} />
      </div>
      <div className="flex flex-col gap-3 sm:hidden">
        <MobileSort path="/" state={state} />
        <RankingCards rows={rows} state={state} showFlags={flags.length > 0} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        Net = gross units permitted minus units lost to demolition and deconversion. A building torn down for a rebuild at the same address
        counts once, net of what it replaced. Rank change compares this period to the equal-length period before it. Emergency demolitions
        are never counted.
        {snapshot.counts.unplaced_permits ? ` ${snapshot.counts.unplaced_permits} permits since May 2023 carry no ward and are excluded.` : ""}
      </p>
    </div>
  );
}
