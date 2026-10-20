import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { ActionsBand } from "@/components/ActionsBand";
import { ActionsCards } from "@/components/ActionsCards";
import { ACTION_COLUMNS, ActionsTable, type ActionRow } from "@/components/ActionsTable";
import { MobileSort } from "@/components/MobileSort";
import { PageTabs } from "@/components/PageTabs";
import { WindowControls } from "@/components/WindowControls";
import { ACTION_SORT_KEYS, DEFAULT_ACTION_SORT, actionTenureSplit, cityActionTotals, rankActionsWithChange, type ActionSortKey } from "@/lib/actions";
import { getSnapshot } from "@/lib/data";
import { todayInChicago } from "@/lib/dates";
import { formatInt } from "@/lib/format";
import { parseQuery, type SearchParams } from "@/lib/query";
import { wardsChangedHands } from "@/lib/rank";

export const metadata: Metadata = { title: "Alder actions" };

export default function ActionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Rankings</h1>
      <p className="mt-1 text-zinc-600 dark:text-zinc-400">What each alder did about housing: the rezonings they let through, the ones that stalled, and their votes</p>
      <Suspense fallback={<p className="mt-6 text-sm text-zinc-500">Loading alder actions…</p>}>
        <Actions searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Actions({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection(); // "today" comes from the clock, so this must render at request time
  const [sp, snapshot] = await Promise.all([searchParams, getSnapshot()]);
  const today = todayInChicago();
  const state = parseQuery<ActionSortKey>(sp, today, snapshot.window_start, { sortKeys: ACTION_SORT_KEYS, defaultSort: DEFAULT_ACTION_SORT });
  const window = { from: state.from, to: state.to };
  const opts = { completedOnly: state.completed };

  const wardRows = new Map(snapshot.wards.map((w) => [w.ward, w]));
  const ranked = rankActionsWithChange(snapshot, window, state.sort, opts);
  const ordered = state.dir === "asc" ? [...ranked].reverse() : ranked;
  const rows: ActionRow[] = ordered.map((r) => ({ ...r, wardRow: wardRows.get(r.ward), splits: actionTenureSplit(snapshot, r.ward, window) }));
  const changedHands = wardsChangedHands(snapshot, window);
  const totals = cityActionTotals(ranked, snapshot.wards);
  const unplaced = snapshot.actions.filter((a) => a.ward === null).length;
  const pending = snapshot.actions.filter((a) => a.exhibits_pending).length;

  return (
    <div className="mt-6 flex flex-col gap-5">
      <PageTabs current="actions" state={state} />
      <WindowControls path="/actions" state={state} today={today} windowStart={snapshot.window_start} subject="Council actions dated" />
      {snapshot.actions.length === 0 ? (
        <p className="rounded-md border border-amber-500/50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/40 dark:text-amber-200">
          No zoning actions have been loaded yet. The nightly zoning stage fills this tab.
        </p>
      ) : null}
      {changedHands > 0 ? (
        <p className="rounded-md border border-zinc-200 px-3 py-2 text-sm text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
          {changedHands === 1 ? "1 ward changed hands" : `${changedHands} wards changed hands`} in this period. Those rows show each alder with the homes
          approved during their tenure.
        </p>
      ) : null}
      <ActionsBand totals={totals} state={state} />
      <div className="hidden sm:block">
        <ActionsTable rows={rows} state={state} />
      </div>
      <div className="flex flex-col gap-3 sm:hidden">
        <MobileSort path="/actions" state={state} columns={ACTION_COLUMNS} />
        <ActionsCards rows={rows} state={state} />
      </div>
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        A passed zoning map amendment or planned development is the alder&apos;s yes; under aldermanic prerogative the Zoning Committee does not
        pass one the local alder opposes. Homes approved are the homes the ordinance or its exhibits state, else the homes the new zoning allows
        on the lot. An application pending under 180 days is undecided and left out of every count; 180 days or more is stalled. Rank change
        compares this period to the equal-length period before it.
        {unplaced ? ` ${formatInt(unplaced)} actions could not be placed in a ward and are left out.` : ""}
        {pending ? ` ${formatInt(pending)} actions still wait for their scanned exhibits to be read; their counts may be capacity figures for now.` : ""}
      </p>
    </div>
  );
}
