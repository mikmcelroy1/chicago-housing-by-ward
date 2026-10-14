/**
 * The golden list: real permits with their agreed answers, in data/golden.csv. Every spot check that finds a problem
 * adds the permit with the right answer, plus a neighbor or two that must not change.
 *
 * - tests/golden.test.ts checks what the rules read from each permit's text, on every test run.
 * - The ETL checks the final numbers (after assessor lookups and grouping) on every run, dry or live, and a live run
 *   goes red when a row disagrees.
 *
 * Columns: expected_category; expected_text_units (what the text alone gives: a number, "null" for "look it up", or
 * blank to skip); expected_units (the permit's final count); expected_project_units (the units the permit's project
 * adds or removes, "none" when the permit must not be a project at all); expected_kind; expected_flags (each must be
 * present); status (pass, or known_gap for a wrong answer we know about and have not fixed); note.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv";
import type { ClassifiedPermit } from "./projects";
import { classify } from "./rules";
import type { Project } from "./types";

export interface GoldenRow {
  permit_id: string;
  permit_no: string;
  address: string;
  permit_type: string;
  pins: string[];
  description: string;
  expected_category: string;
  expected_text_units: string;
  expected_units: string;
  expected_project_units: string;
  expected_kind: string;
  expected_flags: string[];
  status: "pass" | "known_gap";
  note: string;
}

export interface GoldenMismatch {
  permit_id: string;
  permit_no: string;
  address: string;
  status: GoldenRow["status"];
  field: string;
  expected: string;
  actual: string;
  note: string;
}

export function loadGolden(path = join(process.cwd(), "data", "golden.csv")): GoldenRow[] {
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    permit_id: r.permit_id,
    permit_no: r.permit_no,
    address: r.address,
    permit_type: r.permit_type,
    pins: (r.pins ?? "").split("|").map((s) => s.trim()).filter(Boolean),
    description: r.description ?? "",
    expected_category: r.expected_category ?? "",
    expected_text_units: r.expected_text_units ?? "",
    expected_units: r.expected_units ?? "",
    expected_project_units: r.expected_project_units ?? "",
    expected_kind: r.expected_kind ?? "",
    expected_flags: (r.expected_flags ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    status: r.status === "known_gap" ? "known_gap" : "pass",
    note: r.note ?? "",
  }));
}

/** "" = not checked, "null" = must be null, otherwise a number. */
function want(cell: string): number | null | undefined {
  if (cell === "") return undefined;
  if (cell === "null") return null;
  return Number(cell);
}
const show = (v: unknown) => (v === null || v === undefined ? "null" : String(v));

/** Units a project adds (new construction, conversions, net of any replaced building) or removes (demolitions). */
export function grossContribution(p: Project): number {
  return p.kind === "demolition" || p.kind === "emergency_demolition" ? 0 - p.units_delta : p.units_delta + p.replaced_units;
}

/** What the rules read from the text alone, with no assessor or grouping. Pure, so the test suite can run it. */
export function checkGoldenText(rows: GoldenRow[]): GoldenMismatch[] {
  const out: GoldenMismatch[] = [];
  for (const row of rows) {
    const cls = classify({ permit_type: row.permit_type, description: row.description, pins: row.pins });
    const miss = (field: string, expected: string, actual: string) => out.push({ permit_id: row.permit_id, permit_no: row.permit_no, address: row.address, status: row.status, field, expected, actual, note: row.note });
    if (row.expected_category && cls.category !== row.expected_category) miss("category", row.expected_category, cls.category);
    const u = want(row.expected_text_units);
    if (u !== undefined && cls.units !== u) miss("text units", show(u), show(cls.units));
  }
  return out;
}

/** The project a permit leads, else the first that contains it (a merged demolition is in two). */
export function projectFor(permitId: string, projects: readonly Project[]): Project | undefined {
  return projects.find((p) => p.primary_permit_id === permitId) ?? projects.find((p) => p.permit_ids.includes(permitId));
}

/** The final numbers after assessor lookups, grouping and merging: what the ETL produced for each golden permit. */
export function checkGoldenRun(rows: GoldenRow[], items: readonly ClassifiedPermit[], projects: readonly Project[]): GoldenMismatch[] {
  const byId = new Map(items.map((it) => [it.permit.id, it]));
  const out: GoldenMismatch[] = [];
  for (const row of rows) {
    const miss = (field: string, expected: string, actual: string) => out.push({ permit_id: row.permit_id, permit_no: row.permit_no, address: row.address, status: row.status, field, expected, actual, note: row.note });
    const item = byId.get(row.permit_id);
    if (!item) {
      miss("permit", "in the pull", "missing");
      continue;
    }
    if (row.expected_category && item.cls.category !== row.expected_category) miss("category", row.expected_category, item.cls.category);
    const u = want(row.expected_units);
    if (u !== undefined && item.cls.units !== u) miss("units", show(u), show(item.cls.units));
    const p = projectFor(row.permit_id, projects);
    if (row.expected_project_units === "none") {
      if (p) miss("project", "none", `${p.kind} ${grossContribution(p)}`);
      continue;
    }
    const g = want(row.expected_project_units);
    if (g === undefined) continue;
    if (!p) {
      miss("project units", show(g), "no project");
      continue;
    }
    if (grossContribution(p) !== g) miss("project units", show(g), show(grossContribution(p)));
    if (row.expected_kind && p.kind !== row.expected_kind) miss("kind", row.expected_kind, p.kind);
    for (const f of row.expected_flags) if (!p.flags.includes(f as Project["flags"][number])) miss("flag", f, p.flags.join(",") || "(none)");
  }
  return out;
}
