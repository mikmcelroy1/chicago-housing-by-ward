import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { ProjectFeed } from "@/components/ProjectFeed";
import { ProjectFilters } from "@/components/ProjectFilters";
import { StatTiles } from "@/components/StatTiles";
import { WindowControls } from "@/components/WindowControls";
import { getSnapshot } from "@/lib/data";
import { todayInChicago } from "@/lib/dates";
import { formatInt, isProjectKind } from "@/lib/format";
import { buildHref, firstValue, parseQuery, type SearchParams } from "@/lib/query";
import { cityTotals, computeWardStats } from "@/lib/rank";
import { parseCounted, selectProjects } from "@/lib/select";

export const metadata: Metadata = { title: "Chicago" };

const FIRST_PAGE = 100;

export default function ChicagoPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading Chicago…</p>}>
      <CityDetail searchParams={searchParams} />
    </Suspense>
  );
}

async function CityDetail({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await connection(); // "today" comes from the clock, so this must render at request time
  const [sp, snapshot] = await Promise.all([searchParams, getSnapshot()]);
  const today = todayInChicago();
  const state = parseQuery(sp, today, snapshot.window_start);
  const window = { from: state.from, to: state.to };
  const opts = { completedOnly: state.completed };
  const path = "/chicago";

  const kindParam = firstValue(sp, "kind");
  const kind = isProjectKind(kindParam) ? kindParam : undefined;
  const counted = parseCounted(firstValue(sp, "counted"));
  const extra = { kind, counted: counted === "all" ? undefined : counted };

  const totals = cityTotals(computeWardStats(snapshot, window, opts), snapshot.wards);
  const unfiltered = selectProjects(snapshot, { window, opts, counted: "all" });
  const listed = kind || counted !== "all" ? selectProjects(snapshot, { window, opts, kind, counted }) : unfiltered;
  const kindsPresent = new Set(unfiltered.map((p) => p.kind));

  const query = new URLSearchParams({ from: state.from, to: state.to });
  if (state.completed) query.set("completed", "1");
  if (kind) query.set("kind", kind);
  if (counted !== "all") query.set("counted", counted);
  const queryString = query.toString();

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={buildHref("/", state)} className="text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
          ← Rankings
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Chicago</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">All 50 wards. Every project in the period, newest first; each row links to its ward.</p>
      </header>

      <WindowControls path={path} state={state} today={today} windowStart={snapshot.window_start} extra={extra} />

      <StatTiles stats={{ ...totals, lowSample: false }} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Projects <span className="font-normal text-zinc-500 dark:text-zinc-400">({formatInt(listed.length)})</span>
          </h2>
          <ProjectFilters path={path} state={state} kind={kind} counted={counted} kindsPresent={kindsPresent} />
        </div>
        <ProjectFeed key={queryString} initial={listed.slice(0, FIRST_PAGE)} total={listed.length} queryString={queryString} showWard />
      </section>
    </div>
  );
}
