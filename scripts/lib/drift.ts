/**
 * The drift alarm. A project whose permits are exactly the same as last run but whose units or kind changed moved
 * for a reason other than a new permit. When the code is the same too, that reason is the county's or the city's
 * data, and someone should look. Pure, so the test suite can run it.
 */
import type { Project, ProjectKind } from "./types";

export interface PreviousProject {
  id: string;
  kind: ProjectKind;
  units_delta: number;
  replaced_units: number;
  address: string;
  ward: number;
  permit_ids: string[];
}

export interface DriftRow {
  id: string;
  ward: number;
  address: string;
  kind_before: ProjectKind;
  kind_after: ProjectKind;
  units_before: number;
  units_after: number;
}

const gross = (p: { kind: ProjectKind; units_delta: number; replaced_units: number }) =>
  p.kind === "demolition" || p.kind === "emergency_demolition" ? 0 - p.units_delta : p.units_delta + p.replaced_units;

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

export function findDrift(previous: readonly PreviousProject[], current: readonly Project[]): DriftRow[] {
  const now = new Map(current.map((p) => [p.id, p]));
  const out: DriftRow[] = [];
  for (const prev of previous) {
    const cur = now.get(prev.id);
    if (!cur || !sameSet(prev.permit_ids, cur.permit_ids)) continue;
    const before = gross(prev);
    const after = gross(cur);
    if (before === after && prev.kind === cur.kind) continue;
    out.push({ id: cur.id, ward: cur.ward, address: cur.address, kind_before: prev.kind, kind_after: cur.kind, units_before: before, units_after: after });
  }
  return out.sort((a, b) => Math.abs(b.units_after - b.units_before) - Math.abs(a.units_after - a.units_before) || a.address.localeCompare(b.address));
}
