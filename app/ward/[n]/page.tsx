import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import type { AlderTenure, Project } from "@/scripts/lib/types";
import { Avatar } from "@/components/Avatar";
import { FlagList } from "@/components/FlagList";
import { ProjectList } from "@/components/ProjectList";
import { SignedUnits } from "@/components/SignedNumber";
import { StatTiles } from "@/components/StatTiles";
import { WindowControls } from "@/components/WindowControls";
import { getSnapshot } from "@/lib/data";
import { todayInChicago } from "@/lib/dates";
import { formatDate, formatInt, isProjectKind, KIND_LABELS, KINDS } from "@/lib/format";
import { buildHref, firstValue, parseQuery, type QueryState, type SearchParams } from "@/lib/query";
import { projectsInWindow, tenuresOverlapping, wardStats } from "@/lib/rank";

type Params = Promise<{ n: string }>;
type CountedFilter = "all" | "yes" | "no";

function parseWard(n: string): number | null {
  if (!/^\d{1,2}$/.test(n)) return null;
  const ward = Number(n);
  return ward >= 1 && ward <= 50 ? ward : null;
}


export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { n } = await params;
  const ward = parseWard(n);
  return { title: ward ? `Ward ${ward}` : "Not found" };
}

/**
 * Invalid ward numbers are rejected with a 404 status in proxy.ts before the static shell streams;
 * the notFound() inside WardDetail is a backstop that renders the not-found UI if the proxy is bypassed.
 */
export default function WardPage({ params, searchParams }: { params: Params; searchParams: Promise<SearchParams> }) {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading ward…</p>}>
      <WardDetail params={params} searchParams={searchParams} />
    </Suspense>
  );
}

interface Group {
  key: string;
  title: string;
  tenure: AlderTenure | null;
  projects: Project[];
}

function groupByTenure(projects: Project[], overlapping: AlderTenure[], all: AlderTenure[]): Group[] {
  const newestFirst = [...overlapping].sort((a, b) => (a.start_date > b.start_date ? -1 : a.start_date < b.start_date ? 1 : 0));
  const groups = new Map<string, Group>();
  for (const t of newestFirst) groups.set(t.id, { key: t.id, title: t.name, tenure: t, projects: [] });
  const vacant: Group = { key: "vacant", title: "Vacant seat", tenure: null, projects: [] };
  for (const p of projects) {
    const known = p.alder_tenure_id ? groups.get(p.alder_tenure_id) : undefined;
    if (known) {
      known.projects.push(p);
      continue;
    }
    const other = p.alder_tenure_id ? all.find((t) => t.id === p.alder_tenure_id) : undefined;
    if (other) {
      const g: Group = { key: other.id, title: other.name, tenure: other, projects: [p] };
      groups.set(other.id, g);
    } else {
      vacant.projects.push(p);
    }
  }
  const result = [...groups.values()];
  if (vacant.projects.length > 0) result.push(vacant);
  return result;
}

function tenureDates(t: AlderTenure): string {
  return t.end_date ? `${formatDate(t.start_date)} – ${formatDate(t.end_date)}` : `since ${formatDate(t.start_date)}`;
}

const chip = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-xs ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
  }`;

function Filters({ path, state, kind, counted, kindsPresent }: { path: string; state: QueryState; kind?: string; counted: CountedFilter; kindsPresent: Set<string> }) {
  const href = (next: { kind?: string; counted?: CountedFilter }) =>
    buildHref(path, state, {
      kind: "kind" in next ? next.kind : kind,
      counted: ("counted" in next ? next.counted : counted) === "all" ? undefined : "counted" in next ? next.counted : counted,
    });
  const kinds = KINDS.filter((k) => kindsPresent.has(k) || k === kind);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Kind</span>
        <Link href={href({ kind: undefined })} aria-current={!kind ? "page" : undefined} className={chip(!kind)}>
          All
        </Link>
        {kinds.map((k) => (
          <Link key={k} href={href({ kind: k })} aria-current={kind === k ? "page" : undefined} className={chip(kind === k)}>
            {KIND_LABELS[k]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Counted</span>
        {(
          [
            ["all", "All"],
            ["yes", "Counted"],
            ["no", "Not counted"],
          ] as const
        ).map(([value, label]) => (
          <Link key={value} href={href({ counted: value })} aria-current={counted === value ? "page" : undefined} className={chip(counted === value)}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}

async function WardDetail({ params, searchParams }: { params: Params; searchParams: Promise<SearchParams> }) {
  await connection(); // "today" comes from the clock, so this must render at request time
  const [{ n }, sp, snapshot] = await Promise.all([params, searchParams, getSnapshot()]);
  const ward = parseWard(n);
  if (ward === null) notFound();

  const today = todayInChicago();
  const state = parseQuery(sp, today, snapshot.window_start);
  const window = { from: state.from, to: state.to };
  const opts = { completedOnly: state.completed };
  const path = `/ward/${ward}`;

  const kindParam = firstValue(sp, "kind");
  const kind = isProjectKind(kindParam) ? kindParam : undefined;
  const countedParam = firstValue(sp, "counted");
  const counted: CountedFilter = countedParam === "yes" || countedParam === "no" ? countedParam : "all";
  const extra = { kind, counted: counted === "all" ? undefined : counted };

  const wardRow = snapshot.wards.find((w) => w.ward === ward);
  const inWindow = projectsInWindow(snapshot.projects, window, opts).filter((p) => p.ward === ward);
  const stats = wardStats(ward, wardRow?.units_2020 ?? null, inWindow);
  const tenures = tenuresOverlapping(snapshot.tenures, ward, window);
  const flags = snapshot.flags.filter((f) => f.ward === ward);

  const listed = inWindow
    .filter((p) => (!kind || p.kind === kind) && (counted === "all" || (counted === "yes") === p.counted))
    .sort((a, b) => (a.first_issue_date > b.first_issue_date ? -1 : a.first_issue_date < b.first_issue_date ? 1 : a.id.localeCompare(b.id)));
  const groups = groupByTenure(listed, tenures, snapshot.tenures);
  const grouped = tenures.length > 1 || groups.length > 1;
  const kindsPresent = new Set(inWindow.map((p) => p.kind));

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href={buildHref("/", state)} className="text-zinc-600 underline underline-offset-2 dark:text-zinc-400">
          ← Rankings
        </Link>
      </nav>

      <header className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Ward {ward}</h1>
        {tenures.length > 0 ? (
          <ul className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:gap-8">
            {tenures.map((t) => (
              <li key={t.id} className="flex items-center gap-3">
                <Avatar name={t.name} photoUrl={t.photo_url} size={72} />
                <div className="flex flex-col leading-snug">
                  <span className="text-lg font-medium">{t.name}</span>
                  <span className="text-sm text-zinc-600 dark:text-zinc-400">{tenureDates(t)}</span>
                  <span className="flex gap-3 text-sm">
                    {wardRow?.website ? (
                      <a href={wardRow.website} className="underline underline-offset-2" rel="noreferrer">
                        Ward website
                      </a>
                    ) : null}
                    {t.source_url ? (
                      <a href={t.source_url} className="text-zinc-500 underline underline-offset-2 dark:text-zinc-400" rel="noreferrer">
                        Tenure source
                      </a>
                    ) : null}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            No alder on record for this window.
            {wardRow?.alder_current ? ` Current alder: ${wardRow.alder_current}.` : ""}
            {wardRow?.website ? (
              <>
                {" "}
                <a href={wardRow.website} className="underline underline-offset-2" rel="noreferrer">
                  Ward website
                </a>
              </>
            ) : null}
          </p>
        )}
        <FlagList flags={flags} withSource />
      </header>

      <WindowControls path={path} state={state} today={today} windowStart={snapshot.window_start} extra={extra} />

      <StatTiles stats={stats} />

      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 className="text-lg font-semibold">
            Projects <span className="font-normal text-zinc-500 dark:text-zinc-400">({formatInt(listed.length)})</span>
          </h2>
          <Filters path={path} state={state} kind={kind} counted={counted} kindsPresent={kindsPresent} />
        </div>
        {grouped ? (
          groups.map((g) => {
            const net = wardStats(ward, null, g.projects).net;
            return (
              <section key={g.key} className="mt-2">
                <h3 className="flex flex-wrap items-baseline gap-x-3 border-b border-zinc-300 pb-1 dark:border-zinc-700">
                  <span className="font-medium">{g.title}</span>
                  {g.tenure ? <span className="text-sm text-zinc-500 dark:text-zinc-400">{tenureDates(g.tenure)}</span> : null}
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    {formatInt(g.projects.length)} {g.projects.length === 1 ? "project" : "projects"}, <SignedUnits value={net} /> counted units
                  </span>
                </h3>
                <ProjectList projects={g.projects} />
              </section>
            );
          })
        ) : (
          <ProjectList projects={listed} />
        )}
      </section>
    </div>
  );
}
