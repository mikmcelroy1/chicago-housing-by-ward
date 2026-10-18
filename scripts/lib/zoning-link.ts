/**
 * Placing a zoning action in a ward and linking it to the permit projects it enabled. Pure functions; the assessor
 * lookups they need are done by scripts/ingest-zoning.ts with scripts/lib/parcels.ts.
 * Spec: "Alder Actions Tab v2", section "Linking approvals to permits".
 */
import type { ActionProject, AddressRange, Project, ZoningAction } from "./types";

/** The columns of a project the link needs. */
export type LinkableProject = Pick<Project, "id" | "project_key" | "kind" | "ward" | "first_issue_date" | "address">;
import { addressMatches, parsePermitAddress, streetKey } from "./zoning";
import { pin14 } from "./parcels";

/** A permit links to an action that passed before it, up to this many days earlier. */
export const LINK_WINDOW_DAYS = 4 * 365 + 1;
/** Street numbers looked up per range; a longer range is sampled evenly, both ends included. */
export const ADDRESS_LOOKUPS_PER_RANGE = 24;

const GROSS_KINDS = new Set<LinkableProject["kind"]>(["new_construction", "adu", "conversion"]);

/** The street addresses to ask the assessor about for one range: "1401 N MAGNOLIA AVE", "1403 N MAGNOLIA AVE"... */
export function enumerateAddresses(r: AddressRange, cap = ADDRESS_LOOKUPS_PER_RANGE): string[] {
  const oneSide = r.lo % 2 === r.hi % 2;
  const step = oneSide ? 2 : 1;
  const numbers: number[] = [];
  for (let n = r.lo; n <= r.hi; n += step) numbers.push(n);
  let picked = numbers;
  if (numbers.length > cap) {
    picked = [];
    for (let i = 0; i < cap; i++) picked.push(numbers[Math.round((i * (numbers.length - 1)) / (cap - 1))]);
    picked = [...new Set(picked)];
  }
  return picked.map((n) => `${n} ${r.dir} ${r.street}`);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10))) - Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))) / 86_400_000);
}

interface Indexed {
  byStreet: Map<string, LinkableProject[]>;
  byPin: Map<string, LinkableProject[]>;
}

export function indexProjects(projects: readonly LinkableProject[]): Indexed {
  const byStreet = new Map<string, LinkableProject[]>();
  const byPin = new Map<string, LinkableProject[]>();
  for (const p of projects) {
    const a = parsePermitAddress(p.address);
    if (a) {
      const k = streetKey(a.dir, a.street);
      byStreet.set(k, [...(byStreet.get(k) ?? []), p]);
    }
    if (p.project_key.startsWith("pin:")) {
      const pin = pin14(p.project_key.slice(4));
      byPin.set(pin, [...(byPin.get(pin) ?? []), p]);
    }
  }
  return { byStreet, byPin };
}

/** Projects whose address falls inside one of the action's ranges, any date. */
export function projectsAtSite(action: Pick<ZoningAction, "addresses" | "pins">, projects: readonly LinkableProject[], idx = indexProjects(projects)): { project: LinkableProject; match: "pin" | "address" }[] {
  const out = new Map<string, { project: LinkableProject; match: "pin" | "address" }>();
  for (const pin of action.pins) for (const p of idx.byPin.get(pin) ?? []) out.set(p.id, { project: p, match: "pin" });
  for (const r of action.addresses) {
    for (const p of idx.byStreet.get(streetKey(r.dir, r.street)) ?? []) {
      const a = parsePermitAddress(p.address);
      if (a && addressMatches(r, a) && !out.has(p.id)) out.set(p.id, { project: p, match: "address" });
    }
  }
  return [...out.values()];
}

/** The ward the permits at the site say, when the assessor could not place it: the most common ward among them. */
export function wardFromProjects(action: Pick<ZoningAction, "addresses" | "pins">, projects: readonly LinkableProject[], idx = indexProjects(projects)): number | null {
  const count = new Map<number, number>();
  for (const { project } of projectsAtSite(action, projects, idx)) count.set(project.ward, (count.get(project.ward) ?? 0) + 1);
  if (!count.size) return null;
  return [...count.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

/**
 * A passed action links to the new-construction, ADU and conversion projects at its site whose permit came after
 * it passed, within LINK_WINDOW_DAYS. Several projects can link to one action; a project links to one action only:
 * a PIN match beats an address match, then the latest action that passed before the permit.
 */
export function linkProjects(actions: readonly ZoningAction[], projects: readonly LinkableProject[]): { links: ActionProject[]; actionByProject: Map<string, string> } {
  const idx = indexProjects(projects);
  const best = new Map<string, { action: ZoningAction; match: "pin" | "address"; lag: number }>();
  for (const action of actions) {
    if (action.stage !== "passed") continue;
    for (const { project, match } of projectsAtSite(action, projects, idx)) {
      if (!GROSS_KINDS.has(project.kind)) continue;
      const lag = daysBetween(action.stage_date, project.first_issue_date);
      if (lag <= 0 || lag > LINK_WINDOW_DAYS) continue;
      const cur = best.get(project.id);
      const better = !cur || (match === "pin" && cur.match === "address") || (match === cur.match && action.stage_date > cur.action.stage_date);
      if (better) best.set(project.id, { action, match, lag });
    }
  }
  const links: ActionProject[] = [];
  const actionByProject = new Map<string, string>();
  for (const [projectId, { action, match, lag }] of best) {
    links.push({ matter_id: action.matter_id, project_id: projectId, lag_days: lag, match });
    actionByProject.set(projectId, action.matter_id);
  }
  links.sort((a, b) => a.matter_id.localeCompare(b.matter_id) || a.project_id.localeCompare(b.project_id));
  return { links, actionByProject };
}
