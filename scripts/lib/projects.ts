/**
 * Turns classified permits into projects: deduped new-construction groups, renovation deltas, demolitions.
 * Spec: "Classification and parsing rules", Step G.
 */
import type { AlderTenure, Classification, Permit, Project, ProjectKind } from "./types";
import { demoFallbackUnits, fromToDelta, normalize } from "./rules";

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
/** A demolition within this many days of new construction at the same address or parcel is part of that project. */
export const REPLACEMENT_DAYS = 730;

export function normalizedAddress(address: string): string {
  return address.toUpperCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/** Union-find over permits sharing a first PIN or a normalized address. */
function groupNewConstruction(items: ClassifiedPermit[]): ClassifiedPermit[][] {
  const parent = items.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const union = (a: number, b: number) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parent[ra] = rb;
  };
  const byKey = new Map<string, number>();
  items.forEach(({ permit }, i) => {
    const keys = [permit.pins[0] ? `pin:${permit.pins[0]}` : null, permit.address ? `addr:${normalizedAddress(permit.address)}` : null].filter(Boolean) as string[];
    for (const k of keys) {
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
  // Split each group into clusters no wider than 36 months.
  const out: ClassifiedPermit[][] = [];
  for (const g of groups.values()) {
    g.sort((a, b) => a.permit.issue_date.localeCompare(b.permit.issue_date));
    let cluster: ClassifiedPermit[] = [];
    for (const it of g) {
      if (cluster.length && daysBetween(cluster[0].permit.issue_date, it.permit.issue_date) > CLUSTER_DAYS) {
        out.push(cluster);
        cluster = [];
      }
      cluster.push(it);
    }
    if (cluster.length) out.push(cluster);
  }
  return out;
}

export function tenureFor(tenures: AlderTenure[], ward: number, date: string): AlderTenure | null {
  const hits = tenures.filter((t) => t.ward === ward && t.start_date <= date && (!t.end_date || date <= t.end_date));
  hits.sort((a, b) => b.start_date.localeCompare(a.start_date));
  return hits[0] ?? null;
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
  for (const cluster of groupNewConstruction(nc)) {
    const counting = cluster.filter((it) => it.cls.category === "new_residential" && it.cls.units !== null);
    const nonRevision = cluster.filter((it) => it.cls.category !== "revision_or_phase");
    const chosen = counting.at(-1) ?? null;
    let units: number | null = chosen?.cls.units ?? null;
    let source: Project["needs_review"] = false;
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
    source = cluster.some((it) => it.cls.needs_review) || units === null;
    const kind: ProjectKind = chosen?.cls.notes.some((n) => n.startsWith("adu")) ? "adu" : "new_construction";
    const key = primary.permit.pins[0] ? `pin:${primary.permit.pins[0]}` : `addr:${normalizedAddress(primary.permit.address)}`;
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
        needs_review: source,
        ...({ ward_geom_mismatch: mismatch } as object),
      }),
    );
  }

  // Renovation deltas and demolitions: one project per permit
  for (const { permit, cls } of items) {
    if (cls.category === "renovation_delta") {
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
          ...({ ward_geom_mismatch: mismatch } as object),
        }),
      );
    } else if (cls.category === "demolition" || cls.category === "emergency_demolition") {
      const { ward, mismatch } = wardOf(permit);
      if (ward === null) {
        if (opts.unplaced) opts.unplaced.count += 1;
        continue;
      }
      let units = cls.units;
      let review = cls.needs_review;
      if (units === null) {
        const fb = demoFallbackUnits(cls.demo_hint);
        units = fb.units;
        review = review || fb.needs_review;
      }
      const emergency = cls.category === "emergency_demolition";
      projects.push(
        finish({
          id: `demo:${permit.id}`,
          project_key: permit.pins[0] ? `pin:${permit.pins[0]}` : `addr:${normalizedAddress(permit.address)}`,
          kind: emergency ? "emergency_demolition" : "demolition",
          ward,
          units_delta: -units,
          counted: !emergency && units > 0,
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
          needs_review: review,
          ...({ ward_geom_mismatch: mismatch } as object),
        }),
      );
    }
  }
  mergeReplacements(projects);
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
