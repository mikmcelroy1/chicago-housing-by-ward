/**
 * Ranking math. Pure functions over a Snapshot; no Next.js or Node imports so tests can load this directly.
 * See docs/METHODOLOGY.md ("The rank") for the rules these implement.
 */
import type { AlderTenure, Project, ProjectKind, Snapshot } from "@/scripts/lib/types";
import { addDays, daysBetween } from "./dates";

/** A sortable column of the ranking table. Ranking always runs descending: rank 1 has the highest value. */
export type SortKey = "rate" | "net" | "gross" | "lost" | "projects";
export type SortDir = "asc" | "desc";
/** @deprecated alias kept for older call sites */
export type RankBy = SortKey;
export const SORT_KEYS: readonly SortKey[] = ["rate", "net", "gross", "lost", "projects"];

/** Inclusive window on `first_issue_date`. */
export interface DateWindow {
  from: string;
  to: string;
}

export interface RankOptions {
  /** Only projects whose primary permit the city has marked COMPLETE. */
  completedOnly?: boolean;
}

export interface WardStats {
  ward: number;
  /** Units added by counted new construction, ADUs and conversions. */
  gross: number;
  /** Units removed by counted demolitions and deconversions. */
  lost: number;
  net: number;
  /** Units in emergency demolitions in the window. Shown, never counted. */
  emergency_units: number;
  /** Number of counted projects in the window. */
  projects: number;
  /** net / units_2020 × 1000, or null when the denominator is missing or zero. */
  rate: number | null;
  /** Fewer than 3 counted projects. */
  lowSample: boolean;
}

export interface RankedWard extends WardStats {
  rank: number;
}

export interface RankedWardWithChange extends RankedWard {
  /**
   * Positions moved since the equal-length window ending the day before `from`
   * (prior rank − current rank, so positive means the ward moved up). Null when the
   * prior window would start before the snapshot's window_start.
   */
  rankChange: number | null;
}

export interface TenureSplit {
  tenure: AlderTenure;
  net: number;
  projects: number;
}

export const GROSS_KINDS: ReadonlySet<ProjectKind> = new Set<ProjectKind>(["new_construction", "adu", "conversion"]);
export const LOST_KINDS: ReadonlySet<ProjectKind> = new Set<ProjectKind>(["deconversion", "demolition"]);
export const LOW_SAMPLE_THRESHOLD = 3;

export function inWindow(project: Project, window: DateWindow): boolean {
  return project.first_issue_date >= window.from && project.first_issue_date <= window.to;
}

/** Projects inside the window, optionally restricted to COMPLETE permits. Does not filter on `counted`. */
export function projectsInWindow(projects: readonly Project[], window: DateWindow, opts: RankOptions = {}): Project[] {
  return projects.filter((p) => inWindow(p, window) && (!opts.completedOnly || p.status === "COMPLETE"));
}

/** Stats for one ward from projects that are already filtered to the window and to this ward. */
export function wardStats(ward: number, units2020: number | null, projects: readonly Project[]): WardStats {
  let gross = 0;
  let lost = 0;
  let emergency = 0;
  let counted = 0;
  for (const p of projects) {
    if (p.kind === "emergency_demolition") {
      emergency += Math.abs(p.units_delta);
      continue;
    }
    if (!p.counted) continue;
    counted += 1;
    if (GROSS_KINDS.has(p.kind)) {
      // units_delta is already net of any building demolished for this project; put both sides back.
      const built = p.units_delta + p.replaced_units;
      if (built > 0) gross += built;
      else if (built < 0) lost += -built;
      lost += p.replaced_units;
    } else if (LOST_KINDS.has(p.kind)) lost += Math.abs(p.units_delta);
  }
  const net = gross - lost;
  const rate = units2020 !== null && units2020 > 0 ? (net / units2020) * 1000 : null;
  return { ward, gross, lost, net, emergency_units: emergency, projects: counted, rate, lowSample: counted < LOW_SAMPLE_THRESHOLD };
}

/** One WardStats per ward in `snapshot.wards`, in ward order. */
export function computeWardStats(snapshot: Snapshot, window: DateWindow, opts: RankOptions = {}): WardStats[] {
  const byWard = new Map<number, Project[]>();
  for (const p of projectsInWindow(snapshot.projects, window, opts)) {
    const list = byWard.get(p.ward);
    if (list) list.push(p);
    else byWard.set(p.ward, [p]);
  }
  return snapshot.wards.map((w) => wardStats(w.ward, w.units_2020, byWard.get(w.ward) ?? []));
}

function desc(a: number, b: number): number {
  return b - a;
}

function sortValue(s: WardStats, key: SortKey): number | null {
  return key === "rate" ? s.rate : s[key];
}

/** Descending comparator for a sort key; nulls last. Ties fall through to net, gross, then ward number for stability. */
export function compareWards(key: SortKey): (a: WardStats, b: WardStats) => number {
  return (a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb !== null) return 1;
    if (va !== null && vb === null) return -1;
    if (va !== null && vb !== null && va !== vb) return desc(va, vb);
    if (key !== "net" && a.net !== b.net) return desc(a.net, b.net);
    if (key !== "gross" && a.gross !== b.gross) return desc(a.gross, b.gross);
    return a.ward - b.ward;
  };
}

/** Rank 1 is the highest value of the sort key. */
export function rankWards(stats: readonly WardStats[], key: SortKey): RankedWard[] {
  return [...stats].sort(compareWards(key)).map((s, i) => ({ ...s, rank: i + 1 }));
}

/** The equal-length window ending the day before `window.from`, or null if it would start before `windowStart`. */
export function priorWindow(window: DateWindow, windowStart: string): DateWindow | null {
  const length = daysBetween(window.from, window.to) + 1;
  const prior = { from: addDays(window.from, -length), to: addDays(window.from, -1) };
  return prior.from < windowStart ? null : prior;
}

/** Full ranking for the window with rank change against the prior window. */
export function rankWithChange(
  snapshot: Snapshot,
  window: DateWindow,
  key: SortKey,
  opts: RankOptions = {},
): RankedWardWithChange[] {
  const current = rankWards(computeWardStats(snapshot, window, opts), key);
  const prior = priorWindow(window, snapshot.window_start);
  if (!prior) return current.map((r) => ({ ...r, rankChange: null }));
  const priorRank = new Map<number, number>();
  for (const r of rankWards(computeWardStats(snapshot, prior, opts), key)) priorRank.set(r.ward, r.rank);
  return current.map((r) => {
    const before = priorRank.get(r.ward);
    return { ...r, rankChange: before === undefined ? null : before - r.rank };
  });
}

export function tenureOverlaps(tenure: AlderTenure, window: DateWindow): boolean {
  return tenure.start_date <= window.to && (tenure.end_date === null || tenure.end_date >= window.from);
}

/** Tenures of a ward that overlap the window, oldest first. */
export function tenuresOverlapping(tenures: readonly AlderTenure[], ward: number, window: DateWindow): AlderTenure[] {
  return tenures
    .filter((t) => t.ward === ward && tenureOverlaps(t, window))
    .sort((a, b) => (a.start_date < b.start_date ? -1 : a.start_date > b.start_date ? 1 : 0));
}

/** Per-tenure net units for a ward over the window. A tenure with no projects still appears. */
export function tenureSplit(snapshot: Snapshot, ward: number, window: DateWindow, opts: RankOptions = {}): TenureSplit[] {
  const tenures = tenuresOverlapping(snapshot.tenures, ward, window);
  const projects = projectsInWindow(snapshot.projects, window, opts).filter((p) => p.ward === ward && p.counted);
  return tenures.map((tenure) => {
    const mine = projects.filter((p) => p.alder_tenure_id === tenure.id);
    return { tenure, net: wardStats(ward, null, mine).net, projects: mine.length };
  });
}

/** Number of wards with two or more tenures overlapping the window. */
export function wardsChangedHands(snapshot: Snapshot, window: DateWindow): number {
  const count = new Map<number, number>();
  for (const t of snapshot.tenures) {
    if (tenureOverlaps(t, window)) count.set(t.ward, (count.get(t.ward) ?? 0) + 1);
  }
  let n = 0;
  for (const c of count.values()) if (c >= 2) n += 1;
  return n;
}

export interface CityTotals {
  gross: number;
  lost: number;
  net: number;
  emergency_units: number;
  projects: number;
  /** net / sum of every ward's units_2020 x 1000, or null when no ward has a denominator. */
  rate: number | null;
  wardsWithDenominator: number;
}

/** Citywide totals over a set of ward stats, for the "Chicago" row above the ranking. */
export function cityTotals(stats: readonly WardStats[], wards: readonly { ward: number; units_2020: number | null }[]): CityTotals {
  let gross = 0, lost = 0, emergency_units = 0, projects = 0, units = 0, withDenominator = 0;
  const denominator = new Map(wards.map((w) => [w.ward, w.units_2020]));
  for (const s of stats) {
    gross += s.gross;
    lost += s.lost;
    emergency_units += s.emergency_units;
    projects += s.projects;
    const u = denominator.get(s.ward);
    if (u !== null && u !== undefined && u > 0) {
      units += u;
      withDenominator += 1;
    }
  }
  const net = gross - lost;
  return { gross, lost, net, emergency_units, projects, rate: units > 0 ? (net / units) * 1000 : null, wardsWithDenominator: withDenominator };
}
