import { test } from "node:test";
import assert from "node:assert/strict";
import type { Project, ProjectKind, Snapshot } from "../scripts/lib/types";
import { newestFirst, parseCounted, selectProjects } from "../lib/select";

let seq = 0;
function project(o: Partial<Project> & { ward: number; kind: ProjectKind; units_delta: number; first_issue_date: string }): Project {
  seq += 1;
  return {
    id: `p${seq}`, project_key: `k${seq}`, counted: true, primary_permit_id: `${seq}`, permit_no: `B${seq}`, permit_ids: [], address: "1 MAIN ST", lat: null, lon: null,
    alder_tenure_id: null, subsidized: false, replaced_units: 0, merged_into: null, status: "ACTIVE", description: "", reported_cost: null, review_type: null, needs_review: false, ...o,
  };
}
const snap: Snapshot = {
  generated_at: "", window_start: "2023-05-15", wards: [], tenures: [], flags: [], counts: {},
  projects: [
    project({ ward: 1, kind: "new_construction", units_delta: 3, first_issue_date: "2026-01-10" }),
    project({ ward: 2, kind: "demolition", units_delta: -1, first_issue_date: "2026-03-01" }),
    project({ ward: 1, kind: "adu", units_delta: 1, first_issue_date: "2026-03-01", counted: false, needs_review: true }),
    project({ ward: 2, kind: "new_construction", units_delta: 9, first_issue_date: "2025-12-31", status: "COMPLETE" }),
  ],
};
const W = { from: "2026-01-01", to: "2026-12-31" };

test("selectProjects: window, ward, kind and counted filters, newest first", () => {
  const all = selectProjects(snap, { window: W, opts: {}, counted: "all" });
  assert.deepEqual(all.map((p) => p.first_issue_date), ["2026-03-01", "2026-03-01", "2026-01-10"]);
  assert.equal(selectProjects(snap, { window: W, opts: {}, ward: 1, counted: "all" }).length, 2);
  assert.equal(selectProjects(snap, { window: W, opts: {}, kind: "demolition", counted: "all" }).length, 1);
  assert.equal(selectProjects(snap, { window: W, opts: {}, counted: "no" }).length, 1);
  assert.equal(selectProjects(snap, { window: W, opts: {}, counted: "yes" }).length, 2);
  assert.equal(selectProjects(snap, { window: { from: "2025-01-01", to: "2026-12-31" }, opts: { completedOnly: true }, counted: "all" }).length, 1);
});

test("newestFirst is stable on equal dates; parseCounted defaults to all", () => {
  const a = project({ ward: 1, kind: "adu", units_delta: 1, first_issue_date: "2026-05-05" });
  const b = project({ ward: 1, kind: "adu", units_delta: 1, first_issue_date: "2026-05-05" });
  assert.ok(newestFirst(a, b) < 0);
  assert.equal(parseCounted("maybe"), "all");
  assert.equal(parseCounted("no"), "no");
});
