/**
 * The Alder actions tab's math. Pure functions over a Snapshot, like lib/rank.ts; no Next.js or Node imports so
 * tests/actions.test.ts can load this directly. See docs/METHODOLOGY.md ("Alder actions") for the rules.
 */
import type { AlderTenure, KeyOrdinance, Project, Snapshot, WardFlag, ZoningAction } from "@/scripts/lib/types";
import { GROSS_KINDS, priorWindow, tenuresOverlapping, type DateWindow, type RankOptions } from "./rank";

export type ActionSortKey = "approved_rate" | "permitted" | "requested" | "approval_rate" | "allowed_added" | "stalled" | "adu" | "sponsorships";
export const ACTION_SORT_KEYS: readonly ActionSortKey[] = ["approved_rate", "permitted", "requested", "approval_rate", "allowed_added", "stalled", "adu", "sponsorships"];
export const DEFAULT_ACTION_SORT: ActionSortKey = "approved_rate";
/** Fewer settled applications than this in the period and the ward carries the low-sample marker. */
export const LOW_SAMPLE_APPLICATIONS = 5;

export type AduStatus = "yes" | "partial" | "none";

export interface WardActionStats {
  ward: number;
  /** Homes allowed by the rezonings and planned developments that passed in the period (by final-action date). */
  approved: number;
  /** approved / units_2020 × 1000, null when the denominator is missing. */
  approved_rate: number | null;
  /** Of the homes approved by the rezonings that passed in the period, those in a permit so far, whatever the permit's date. */
  permitted: number;
  /** Homes asked for in every settled application introduced in the period. */
  requested: number;
  /** Homes approved among those same applications (the raw rate's numerator). */
  approved_of_requested: number;
  /** Settled applications introduced in the period. */
  applications: number;
  raw_rate: number | null;
  /** Approval rate pulled toward the citywide rate by the median ward's volume. */
  approval_rate: number | null;
  /** Homes the passed rezonings added to or removed from what the rules allow; downzonings count against. */
  allowed_added: number;
  /** Passed actions where both the before and the after were known. */
  allowed_known: number;
  passed: number;
  stalled: number;
  undecided: number;
  adu: AduStatus;
  adu_source_url: string | null;
  /** Pro-housing key ordinances the alder sponsored or co-sponsored, dated in the period. */
  sponsorships: number;
  lowSample: boolean;
}

export interface RankedWardActions extends WardActionStats {
  rank: number;
  rankChange: number | null;
}

export interface ActionTenureSplit {
  tenure: AlderTenure;
  approved: number;
  actions: number;
}

export interface CityActionTotals {
  approved: number;
  approved_rate: number | null;
  permitted: number;
  requested: number;
  approval_rate: number | null;
  allowed_added: number;
  stalled: number;
  passed: number;
}

/** Settled matters select on their final-action date, pending ones on their introduction date. */
export function actionInWindow(a: ZoningAction, window: DateWindow): boolean {
  return a.stage_date >= window.from && a.stage_date <= window.to;
}

const STATED: ReadonlySet<ZoningAction["units_source"]> = new Set(["exhibit", "ordinance", "narrative", "override"]);

/**
 * Homes an action approved: the count the ordinance, its exhibits or a person stated, else the capacity the rezoning
 * added. A downzoning approves nothing unless a project count was stated (a Type 1 to a lower floor-area district
 * still approved that building).
 */
export function homesApproved(a: ZoningAction): number {
  if (a.stage !== "passed" || a.approved_units === null) return 0;
  if (a.direction === "down" && !STATED.has(a.units_source)) return 0;
  return a.approved_units;
}

/** Homes an application asked for, on the same terms. */
export function homesRequested(a: ZoningAction): number {
  if (a.requested_units === null) return 0;
  if (a.direction === "down" && !STATED.has(a.units_source)) return 0;
  return a.requested_units;
}

const settled = (a: ZoningAction) => a.stage !== "undecided";

/** Actions of a ward in the period, newest first: the list the ward page shows. */
export function selectActions(snapshot: Snapshot, window: DateWindow, ward?: number): ZoningAction[] {
  return snapshot.actions
    .filter((a) => (ward === undefined || a.ward === ward) && actionInWindow(a, window))
    .sort((a, b) => (a.stage_date > b.stage_date ? -1 : a.stage_date < b.stage_date ? 1 : a.record_number.localeCompare(b.record_number)));
}

/** Gross homes a project added, as the ranking counts them. */
function grossUnits(p: Project): number {
  if (!p.counted || !GROSS_KINDS.has(p.kind)) return 0;
  return Math.max(0, p.units_delta + p.replaced_units);
}

/** ADU opt-in status of a ward from its flags (hand-kept rows plus rows derived from the opt-in ordinances). */
export function aduStatus(flags: readonly WardFlag[], ward: number): { adu: AduStatus; source_url: string | null } {
  const f = flags.find((x) => x.ward === ward && x.flag === "adu_opt_in");
  if (!f) return { adu: "none", source_url: null };
  if (/^(yes|true|1|full)$/i.test(f.value)) return { adu: "yes", source_url: f.source_url };
  if (/partial|part|pilot|some/i.test(f.value)) return { adu: "partial", source_url: f.source_url };
  return { adu: "none", source_url: f.source_url };
}

export const councilmaticUrl = (record: string) => `https://chicago.councilmatic.org/legislation/${record.replace(/^S/i, "").toLowerCase()}/`;

/**
 * Ward flags filled from ordinances: a ward whose alder sponsored or co-sponsored an opt-in ordinance (a key
 * ordinance carrying a flag) gets that flag, with the ordinance as its source. These rows replace hand-kept rows
 * for the same ward and flag; other hand-kept rows (pilot areas, later opt-ins) stay.
 */
export function wardFlagsWithDerived(snapshot: Pick<Snapshot, "flags" | "key_ordinances" | "sponsorships">): WardFlag[] {
  const derived = new Map<string, WardFlag>();
  for (const k of snapshot.key_ordinances) {
    if (!k.flag) continue;
    for (const s of snapshot.sponsorships) {
      if (s.record_number !== k.record_number || s.role === "none") continue;
      const key = `${s.ward}:${k.flag}`;
      const as_of = k.final_action_date ?? k.introduction_date;
      const prev = derived.get(key);
      if (prev && prev.as_of && as_of && prev.as_of < as_of) continue; // keep the earliest ordinance that opted the ward in
      derived.set(key, { ward: s.ward, flag: k.flag, value: "yes", source_url: councilmaticUrl(k.record_number), as_of });
    }
  }
  const out = snapshot.flags.filter((f) => !derived.has(`${f.ward}:${f.flag}`));
  out.push(...derived.values());
  return out.sort((a, b) => a.ward - b.ward || a.flag.localeCompare(b.flag));
}

function keyInWindow(k: KeyOrdinance, window: DateWindow): boolean {
  const d = k.final_action_date ?? k.introduction_date;
  return d !== null && d >= window.from && d <= window.to;
}

/** Stats for every ward in `snapshot.wards`, in ward order. The adjusted rate needs every ward, so this is the unit of work. */
export function computeWardActionStats(snapshot: Snapshot, window: DateWindow, opts: RankOptions = {}): WardActionStats[] {
  const flags = wardFlagsWithDerived(snapshot);
  const byWard = new Map<number, ZoningAction[]>();
  for (const a of snapshot.actions) {
    if (a.ward === null) continue;
    const list = byWard.get(a.ward);
    if (list) list.push(a);
    else byWard.set(a.ward, [a]);
  }
  const actionById = new Map(snapshot.actions.map((a) => [a.matter_id, a]));
  // The links table is the source; the project's own action_matter_id stands in for a snapshot written before it existed.
  const linkOf = new Map(snapshot.action_projects.map((l) => [l.project_id, l.matter_id]));
  // Homes in permits so far, per action: the follow-through on an approval, whatever the permit's date.
  const permittedByAction = new Map<string, number>();
  for (const p of snapshot.projects) {
    const matterId = linkOf.get(p.id) ?? p.action_matter_id;
    if (!matterId) continue;
    if (opts.completedOnly && p.status !== "COMPLETE") continue;
    if (!actionById.has(matterId)) continue;
    permittedByAction.set(matterId, (permittedByAction.get(matterId) ?? 0) + grossUnits(p));
  }
  const proKeys = snapshot.key_ordinances.filter((k) => k.stance === "pro" && keyInWindow(k, window));
  const stats: WardActionStats[] = snapshot.wards.map((w) => {
    const mine = byWard.get(w.ward) ?? [];
    let approved = 0, permitted = 0, requested = 0, approvedOfRequested = 0, applications = 0, allowedAdded = 0, allowedKnown = 0, passed = 0, stalled = 0, undecided = 0;
    for (const a of mine) {
      if (a.stage === "passed" && actionInWindow(a, window)) {
        passed += 1;
        approved += homesApproved(a);
        if (a.direction !== "down") permitted += permittedByAction.get(a.matter_id) ?? 0;
        if (a.allowed_before !== null && a.allowed_after !== null) {
          allowedAdded += a.allowed_after - a.allowed_before;
          allowedKnown += 1;
        }
      }
      if (a.introduction_date >= window.from && a.introduction_date <= window.to) {
        if (settled(a)) {
          applications += 1;
          requested += homesRequested(a);
          approvedOfRequested += homesApproved(a);
        }
        if (a.stage === "stalled") stalled += 1;
        if (a.stage === "undecided") undecided += 1;
      }
    }
    const { adu, source_url } = aduStatus(flags, w.ward);
    const sponsorships = proKeys.filter((k) => snapshot.sponsorships.some((s) => s.record_number === k.record_number && s.ward === w.ward && s.role !== "none")).length;
    return {
      ward: w.ward,
      approved,
      approved_rate: w.units_2020 !== null && w.units_2020 > 0 ? (approved / w.units_2020) * 1000 : null,
      permitted,
      requested,
      approved_of_requested: approvedOfRequested,
      applications,
      raw_rate: requested > 0 ? approvedOfRequested / requested : null,
      approval_rate: null,
      allowed_added: allowedAdded,
      allowed_known: allowedKnown,
      passed,
      stalled,
      undecided,
      adu,
      adu_source_url: source_url,
      sponsorships,
      lowSample: applications < LOW_SAMPLE_APPLICATIONS,
    };
  });
  // The adjusted rate: add a typical ward's volume of homes at the citywide rate to both sides.
  const totalRequested = stats.reduce((s, x) => s + x.requested, 0);
  const totalApproved = stats.reduce((s, x) => s + x.approved_of_requested, 0);
  const cityRate = totalRequested > 0 ? totalApproved / totalRequested : null;
  const k = median(stats.map((x) => x.requested));
  for (const x of stats) {
    x.approval_rate = cityRate === null || x.requested + k <= 0 ? x.raw_rate : (x.approved_of_requested + k * cityRate) / (x.requested + k);
  }
  return stats;
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

const ADU_ORDER: Record<AduStatus, number> = { yes: 2, partial: 1, none: 0 };

function sortValue(s: WardActionStats, key: ActionSortKey): number | null {
  switch (key) {
    case "approved_rate":
      return s.approved_rate;
    case "permitted":
      return s.permitted;
    case "requested":
      return s.requested;
    case "approval_rate":
      return s.approval_rate;
    case "allowed_added":
      return s.allowed_added;
    case "stalled":
      return s.stalled;
    case "adu":
      return ADU_ORDER[s.adu];
    case "sponsorships":
      return s.sponsorships;
  }
}

/** Descending comparator; nulls last; ties fall through to homes approved, then ward number. */
export function compareWardActions(key: ActionSortKey): (a: WardActionStats, b: WardActionStats) => number {
  return (a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null && vb !== null) return 1;
    if (va !== null && vb === null) return -1;
    if (va !== null && vb !== null && va !== vb) return vb - va;
    if (key !== "approved_rate" && a.approved !== b.approved) return b.approved - a.approved;
    return a.ward - b.ward;
  };
}

export function rankWardActions(stats: readonly WardActionStats[], key: ActionSortKey): (WardActionStats & { rank: number })[] {
  return [...stats].sort(compareWardActions(key)).map((s, i) => ({ ...s, rank: i + 1 }));
}

/** Full ranking with rank change against the equal-length period before. */
export function rankActionsWithChange(snapshot: Snapshot, window: DateWindow, key: ActionSortKey, opts: RankOptions = {}): RankedWardActions[] {
  const current = rankWardActions(computeWardActionStats(snapshot, window, opts), key);
  const prior = priorWindow(window, snapshot.window_start);
  if (!prior) return current.map((r) => ({ ...r, rankChange: null }));
  const priorRank = new Map<number, number>();
  for (const r of rankWardActions(computeWardActionStats(snapshot, prior, opts), key)) priorRank.set(r.ward, r.rank);
  return current.map((r) => {
    const before = priorRank.get(r.ward);
    return { ...r, rankChange: before === undefined ? null : before - r.rank };
  });
}

/** Homes approved per alder of a ward over the period, by the alder in office on each action's date. */
export function actionTenureSplit(snapshot: Snapshot, ward: number, window: DateWindow): ActionTenureSplit[] {
  const tenures = tenuresOverlapping(snapshot.tenures, ward, window);
  const mine = snapshot.actions.filter((a) => a.ward === ward && a.stage === "passed" && actionInWindow(a, window));
  return tenures.map((tenure) => {
    const theirs = mine.filter((a) => a.alder_tenure_id === tenure.id);
    return { tenure, approved: theirs.reduce((s, a) => s + homesApproved(a), 0), actions: theirs.length };
  });
}

export function cityActionTotals(stats: readonly WardActionStats[], wards: readonly { ward: number; units_2020: number | null }[]): CityActionTotals {
  let approved = 0, permitted = 0, requested = 0, approvedOfRequested = 0, allowedAdded = 0, stalled = 0, passed = 0, units = 0;
  const denominator = new Map(wards.map((w) => [w.ward, w.units_2020]));
  for (const s of stats) {
    approved += s.approved;
    permitted += s.permitted;
    requested += s.requested;
    approvedOfRequested += s.approved_of_requested;
    allowedAdded += s.allowed_added;
    stalled += s.stalled;
    passed += s.passed;
    const u = denominator.get(s.ward);
    if (u !== null && u !== undefined && u > 0) units += u;
  }
  return { approved, approved_rate: units > 0 ? (approved / units) * 1000 : null, permitted, requested, approval_rate: requested > 0 ? approvedOfRequested / requested : null, allowed_added: allowedAdded, stalled, passed };
}

/** Number of wards with two or more tenures overlapping the window (the same rule as the permits tab). */
export { wardsChangedHands } from "./rank";
