/**
 * Turns classified permits into projects: deduped new-construction groups, renovation deltas, grouped demolitions.
 * Spec: "Classification and parsing rules", Step G.
 */
import type { AlderTenure, Classification, FlagKey, Permit, Project, ProjectKind } from "./types";
import { demoFallbackUnits, fromToDelta, isMixedUse, normalize } from "./rules";
import { flagsFor } from "./flags";

export interface ClassifiedPermit {
  permit: Permit;
  cls: Classification;
}

export interface BuildOptions {
  tenures: AlderTenure[];
  wardAt: (lon: number, lat: number) => number | null;
  subsidizedAt: (lat: number, lon: number) => boolean;
  /** Incremented for every countable permit that could not be placed in a ward. */
  unplaced?: { count: number };
}

const CLUSTER_DAYS = 36 * 30.5;
/** Demolition permits at one address or parcel within this many days are one demolition. */
export const DEMO_GROUP_DAYS = 180;
/** An assessor-sourced demolition of this many units or more is held: shown and flagged, not counted until a correction confirms it. */
export const HOLD_UNITS = 7;
/** A demolition within this many days of new construction at the same address or parcel is part of that project. */
export const REPLACEMENT_DAYS = 730;

export function normalizedAddress(address: string): string {
  return address.toUpperCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** Union-find over permits sharing a key, then each group split into clusters no wider than `clusterDays`, oldest first. */
function groupByKeys(items: ClassifiedPermit[], keysOf: (permit: Permit) => string[], clusterDays: number): ClassifiedPermit[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const byKey = new Map<string, number>();
  items.forEach(({ permit }, i) => {
    for (const k of keysOf(permit)) {
      const seen = byKey.get(k);
      if (seen === undefined) byKey.set(k, i);
      else union(i, seen);
    }
  });
  const groups = new Map<number, ClassifiedPermit[]>();
  items.forEach((it, i) => {
    const r = find(i);
    groups.set(r, [...(groups.get(r) ?? []), it]);
  });
  const out: ClassifiedPermit[][] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.permit.issue_date.localeCompare(b.permit.issue_date) || a.permit.id.localeCompare(b.permit.id));
    let cluster: ClassifiedPermit[] = [];
    for (const it of g) {
      if (cluster.length && daysBetween(cluster[0].permit.issue_date, it.permit.issue_date) > clusterDays) {
        out.push(cluster);
        cluster = [];
      }
      cluster.push(it);
    }
    if (cluster.length) out.push(cluster);
  }
  return out;
}

/** New construction groups on the first PIN or the address. */
const newConstructionKeys = (permit: Permit): string[] =>
  [permit.pins[0] ? `pin:${permit.pins[0]}` : null, permit.address ? `addr:${normalizedAddress(permit.address)}` : null].filter(Boolean) as string[];

/** Demolitions group on every PIN the permit lists or the address. */
const demolitionKeys = (permit: Permit): string[] =>
  [...permit.pins.map((p) => `pin:${p}`), permit.address ? `addr:${normalizedAddress(permit.address)}` : null].filter(Boolean) as string[];

export function tenureFor(tenures: AlderTenure[], ward: number, date: string): AlderTenure | null {
  const hits = tenures.filter((t) => t.ward === ward && t.start_date <= date && (!t.end_date || date <= t.end_date));
  hits.sort((a, b) => b.start_date.localeCompare(a.start_date));
  return hits[0] ?? null;
}

export type DemolitionSource = "override" | "stated" | "assessor" | "fallback";

export interface DemolitionUnits {
  units: number;
  source: DemolitionSource;
  /** Parcels with a known unit count that went into an assessor total. */
  parcels: number;
  needs_review: boolean;
}

const HINT_RANK: Record<NonNullable<Classification["demo_hint"]>, number> = { multi: 2, single: 1, none: 0 };

/**
 * Units removed by one demolition, which may be several permits at one address or parcel.
 * - A correction on any permit settles it: corrected permits are added, the rest contribute nothing.
 * - Otherwise each assessor parcel counts once however many permits mention it, lots that carry the same building
 *   record count once, and the parcels' units are added.
 * - A permit that states its count is believed: distinct buildings add, a re-issued permit with the same wording
 *   counts once. When a group mixes permits that state a count with ones that do not, the larger of the stated
 *   and assessor totals is used.
 * - With no parcel and no stated count, the description's wording decides (demoFallbackUnits).
 */
export function demolitionUnits(members: ClassifiedPermit[]): DemolitionUnits {
  const overrides = members.filter((m) => m.cls.units_source === "override" && m.cls.units !== null);
  if (overrides.length) {
    return { units: overrides.reduce((s, m) => s + (m.cls.units ?? 0), 0), source: "override", parcels: 0, needs_review: false };
  }
  const review = members.some((m) => m.cls.needs_review);
  const parcels = new Map<string, number | null>();
  for (const m of members) {
    const list = m.cls.parcels ?? (m.cls.units_source === "assessor" && m.cls.units !== null ? [{ pin: m.permit.pins[0] ?? m.permit.id, units: m.cls.units, sig: null }] : []);
    for (const p of list) {
      // Lots that carry the same building record are one building.
      const k = p.sig ?? p.pin;
      const cur = parcels.get(k);
      if (cur === undefined || cur === null) parcels.set(k, p.units);
    }
  }
  const known = [...parcels.values()].filter((u): u is number => u !== null);
  const assessor = known.length ? known.reduce((s, u) => s + u, 0) : null;
  const stated = members.filter((m) => m.cls.units_source === "structured_demo" && m.cls.units !== null);
  const byText = new Map<string, number>();
  for (const m of stated) {
    const k = normalize(m.permit.description);
    byText.set(k, Math.max(byText.get(k) ?? 0, m.cls.units ?? 0));
  }
  const statedSum = stated.length ? [...byText.values()].reduce((s, u) => s + u, 0) : null;
  if (statedSum !== null && (assessor === null || stated.length === members.length || statedSum >= assessor)) {
    return { units: statedSum, source: "stated", parcels: 0, needs_review: review };
  }
  if (assessor !== null) return { units: assessor, source: "assessor", parcels: known.length, needs_review: review };
  const hint = members.map((m) => m.cls.demo_hint ?? "none").sort((a, b) => HINT_RANK[b] - HINT_RANK[a])[0] ?? "none";
  const fb = demoFallbackUnits(hint);
  return { units: fb.units, source: "fallback", parcels: 0, needs_review: review || fb.needs_review };
}

/** The permit whose description and status represent the group: the one that supplied the count, earliest on ties. */
function pickPrimary(members: ClassifiedPermit[], source: DemolitionSource): ClassifiedPermit {
  const score: Record<DemolitionSource, (m: ClassifiedPermit) => number> = {
    override: (m) => (m.cls.units_source === "override" ? 1 : 0),
    stated: (m) => (m.cls.units_source === "structured_demo" ? 1 + (m.cls.units ?? 0) : 0),
    assessor: (m) => (m.cls.units_source === "assessor" ? 1 + (m.cls.units ?? 0) : 0),
    fallback: (m) => HINT_RANK[m.cls.demo_hint ?? "none"],
  };
  const s = score[source];
  let best = members[0];
  for (const m of members) if (s(m) > s(best)) best = m;
  return best;
}

export function buildProjects(items: ClassifiedPermit[], opts: BuildOptions): Project[] {
  const projects: Project[] = [];
  const finish = (p: Omit<Project, "alder_tenure_id" | "subsidized" | "replaced_units" | "merged_into">): Project => ({
    replaced_units: 0,
    merged_into: null,
    ...p,
    alder_tenure_id: tenureFor(opts.tenures, p.ward, p.first_issue_date)?.id ?? null,
    subsidized: p.lat !== null && p.lon !== null ? opts.subsidizedAt(p.lat, p.lon) : false,
  });
  const wardOf = (permit: Permit): { ward: number | null; mismatch: boolean } => {
    const geo = permit.lon !== null && permit.lat !== null ? opts.wardAt(permit.lon, permit.lat) : null;
    const ward = permit.ward ?? geo;
    return { ward, mismatch: permit.ward !== null && geo !== null && geo !== permit.ward };
  };

  // New construction
  const nc = items.filter(({ permit, cls }) => permit.permit_type.toUpperCase().includes("NEW CONSTRUCTION") && (cls.category === "new_residential" || cls.category === "revision_or_phase"));
  for (const cluster of groupByKeys(nc, newConstructionKeys, CLUSTER_DAYS)) {
    const counting = cluster.filter((it) => it.cls.category === "new_residential" && it.cls.units !== null);
    const nonRevision = cluster.filter((it) => it.cls.category !== "revision_or_phase");
    const chosen = counting.at(-1) ?? null;
    let units: number | null = chosen?.cls.units ?? null;
    if (units === null) {
      const parsed = cluster.map((it) => it.cls.units).filter((u): u is number => u !== null);
      units = parsed.length ? Math.max(...parsed) : null;
    }
    if (chosen) {
      for (const it of cluster) {
        if (it.cls.category !== "revision_or_phase" || it.permit.issue_date <= chosen.permit.issue_date) continue;
        const delta = fromToDelta(normalize(it.permit.description));
        if (delta !== null && units !== null) units += delta;
      }
    }
    const anchor = nonRevision[0] ?? cluster[0];
    const primary = chosen ?? anchor;
    const { ward, mismatch } = wardOf(primary.permit);
    if (ward === null) {
      if (opts.unplaced) opts.unplaced.count += 1;
      continue;
    }
    const review = cluster.some((it) => it.cls.needs_review) || units === null;
    const kind: ProjectKind = chosen?.cls.notes.some((n) => n.startsWith("adu")) ? "adu" : "new_construction";
    const key = primary.permit.pins[0] ? `pin:${primary.permit.pins[0]}` : `addr:${normalizedAddress(primary.permit.address)}`;
    const flags: FlagKey[] = [];
    if (cluster.length > 1) flags.push("multi_permit");
    if (chosen?.cls.units_source === "override") flags.push("overridden");
    projects.push(
      finish({
        id: `nc:${key}:${anchor.permit.issue_date}`,
        project_key: key,
        kind,
        ward,
        units_delta: units ?? 0,
        counted: units !== null && units > 0,
        first_issue_date: anchor.permit.issue_date,
        primary_permit_id: primary.permit.id,
        permit_no: primary.permit.permit_no,
        permit_ids: cluster.map((it) => it.permit.id),
        address: primary.permit.address,
        lat: primary.permit.lat,
        lon: primary.permit.lon,
        status: primary.permit.status,
        description: primary.permit.description,
        reported_cost: primary.permit.reported_cost,
        review_type: primary.permit.review_type,
        needs_review: review,
        ward_geom_mismatch: mismatch,
        flags,
      }),
    );
  }

  // Renovation deltas: one project per permit
  for (const { permit, cls } of items) {
    if (cls.category !== "renovation_delta") continue;
    const { ward, mismatch } = wardOf(permit);
    if (ward === null) {
      if (opts.unplaced) opts.unplaced.count += 1;
      continue;
    }
    const u = cls.units;
    const kind: ProjectKind = u === null ? (cls.notes.some((n) => n.includes("deconversion")) ? "deconversion" : "conversion") : u > 0 ? (cls.notes.some((n) => n === "adu" || n === "legalize") ? "adu" : "conversion") : "deconversion";
    projects.push(
      finish({
        id: `ren:${permit.id}`,
        project_key: permit.pins[0] ? `pin:${permit.pins[0]}` : `addr:${normalizedAddress(permit.address)}`,
        kind,
        ward,
        units_delta: u ?? 0,
        counted: u !== null && u !== 0,
        first_issue_date: permit.issue_date,
        primary_permit_id: permit.id,
        permit_no: permit.permit_no,
        permit_ids: [permit.id],
        address: permit.address,
        lat: permit.lat,
        lon: permit.lon,
        status: permit.status,
        description: permit.description,
        reported_cost: permit.reported_cost,
        review_type: permit.review_type,
        needs_review: cls.needs_review || u === null,
        ward_geom_mismatch: mismatch,
        flags: cls.units_source === "override" ? ["overridden"] : [],
      }),
    );
  }

  // Demolitions: permits at one address or parcel within DEMO_GROUP_DAYS are one demolition. Emergency and
  // voluntary demolitions never share a group.
  for (const category of ["demolition", "emergency_demolition"] as const) {
    const demos = items.filter(({ cls }) => cls.category === category);
    for (const members of groupByKeys(demos, demolitionKeys, DEMO_GROUP_DAYS)) {
      const anchor = members[0];
      const placed = members.map((m) => ({ m, ...wardOf(m.permit) })).find((x) => x.ward !== null);
      if (!placed || placed.ward === null) {
        if (opts.unplaced) opts.unplaced.count += members.length;
        continue;
      }
      const du = demolitionUnits(members);
      const emergency = category === "emergency_demolition";
      const mixedUse = du.units === 0 && (du.source === "assessor" || du.source === "fallback") && members.some((m) => isMixedUse(m.permit.description));
      // A big loss read from assessor records waits for a person: the two largest ever were both wrong.
      const held = !emergency && du.source === "assessor" && du.units >= HOLD_UNITS;
      if (held) {
        for (const m of members) {
          if (m.cls.units_source !== "assessor") continue;
          m.cls.needs_review = true;
          m.cls.notes.push(`held: ${du.units} units from the assessor; a row in overrides.csv confirms it`);
        }
      }
      // Put the reasons on the permits too, so they reach permit_class and the review queue.
      if (du.source === "fallback" && du.units > 0) {
        for (const m of members) {
          if (m.cls.units !== null) continue;
          m.cls.needs_review = true;
          m.cls.notes.push(`no parcel: counted ${du.units} from the description`);
        }
      }
      if (mixedUse) {
        for (const m of members) {
          if (!isMixedUse(m.permit.description)) continue;
          m.cls.needs_review = true;
          m.cls.notes.push("mixed use but no residential units found");
        }
      }
      const primary = pickPrimary(members, du.source);
      const flags: FlagKey[] = [];
      if (members.length > 1) flags.push("multi_permit");
      if (du.source === "assessor") flags.push("assessor_units");
      if (du.source === "assessor" && du.parcels > 1) flags.push("summed_parcels");
      if (du.source === "fallback") flags.push("no_parcel");
      if (mixedUse) flags.push("mixed_use_zero");
      if (held) flags.push("held");
      if (du.source === "override") flags.push("overridden");
      projects.push(
        finish({
          id: `demo:${anchor.permit.id}`,
          project_key: primary.permit.pins[0] ? `pin:${primary.permit.pins[0]}` : `addr:${normalizedAddress(primary.permit.address)}`,
          kind: emergency ? "emergency_demolition" : "demolition",
          ward: placed.ward,
          units_delta: 0 - du.units,
          counted: !emergency && du.units > 0 && !held,
          first_issue_date: anchor.permit.issue_date,
          primary_permit_id: primary.permit.id,
          permit_no: primary.permit.permit_no,
          permit_ids: members.map((m) => m.permit.id),
          address: primary.permit.address,
          lat: primary.permit.lat,
          lon: primary.permit.lon,
          status: primary.permit.status,
          description: primary.permit.description,
          reported_cost: primary.permit.reported_cost,
          review_type: primary.permit.review_type,
          needs_review: du.needs_review || mixedUse || held,
          ward_geom_mismatch: placed.mismatch,
          flags,
        }),
      );
    }
  }
  mergeReplacements(projects);
  // Store the row-derived flags too (not counted, merged, replaces...), so the JSON route and the database are complete.
  for (const p of projects) p.flags = flagsFor(p);
  return projects;
}

/**
 * A voluntary demolition followed, or shortly preceded, by new construction at the same address or parcel is one
 * replacement project: the new building's row carries the demolished units in replaced_units and a units_delta net
 * of them, dated at the new-construction permit. The demolition row stays visible but uncounted, pointing at it.
 */
export function mergeReplacements(projects: Project[]): void {
  const byAddr = new Map<string, Project[]>();
  const byKey = new Map<string, Project[]>();
  for (const p of projects) {
    if ((p.kind !== "new_construction" && p.kind !== "adu") || !p.counted) continue;
    const a = normalizedAddress(p.address);
    byAddr.set(a, [...(byAddr.get(a) ?? []), p]);
    byKey.set(p.project_key, [...(byKey.get(p.project_key) ?? []), p]);
  }
  for (const d of projects) {
    if (d.kind !== "demolition" || !d.counted) continue;
    const gap = (n: Project) => daysBetween(n.first_issue_date, d.first_issue_date);
    const cands = [...new Set([...(byAddr.get(normalizedAddress(d.address)) ?? []), ...(byKey.get(d.project_key) ?? [])])].filter((n) => gap(n) <= REPLACEMENT_DAYS);
    if (!cands.length) continue;
    cands.sort((a, b) => gap(a) - gap(b));
    const n = cands[0];
    const removed = -d.units_delta;
    n.units_delta -= removed;
    n.replaced_units += removed;
    n.needs_review = n.needs_review || d.needs_review;
    n.permit_ids = [...n.permit_ids, ...d.permit_ids];
    d.counted = false;
    d.merged_into = n.id;
  }
}
