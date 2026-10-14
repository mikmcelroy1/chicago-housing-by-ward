import { test } from "node:test";
import assert from "node:assert/strict";
import { findDrift, type PreviousProject } from "../scripts/lib/drift";
import type { Project } from "../scripts/lib/types";

function project(o: Partial<Project> & { id: string; kind: Project["kind"]; units_delta: number; permit_ids: string[] }): Project {
  return {
    project_key: "k", ward: 44, counted: true, first_issue_date: "2026-06-01", primary_permit_id: o.permit_ids[0], permit_no: "B1", address: "1 W MAIN ST",
    lat: null, lon: null, alder_tenure_id: null, subsidized: false, replaced_units: 0, merged_into: null, status: "ACTIVE", description: "", reported_cost: null,
    review_type: null, needs_review: false, ward_geom_mismatch: false, flags: [], ...o,
  };
}
const prev = (o: Partial<PreviousProject> & { id: string; kind: PreviousProject["kind"]; units_delta: number; permit_ids: string[] }): PreviousProject => ({ replaced_units: 0, address: "1 W MAIN ST", ward: 44, ...o });

test("a project with the same permits but different units is drift; new permits, regroupings and removals are not", () => {
  const before = [
    prev({ id: "demo:1", kind: "demolition", units_delta: -2, permit_ids: ["1"] }),
    prev({ id: "demo:2", kind: "demolition", units_delta: -3, permit_ids: ["2"] }),
    prev({ id: "nc:a", kind: "new_construction", units_delta: 9, permit_ids: ["3"] }),
    prev({ id: "nc:b", kind: "new_construction", units_delta: 4, permit_ids: ["4"] }),
    prev({ id: "demo:5", kind: "demolition", units_delta: -1, permit_ids: ["5"] }),
  ];
  const after = [
    project({ id: "demo:1", kind: "demolition", units_delta: -5, permit_ids: ["1"] }), // the county published a record: drift
    project({ id: "demo:2", kind: "demolition", units_delta: -3, permit_ids: ["2"], counted: false, merged_into: "nc:a" }), // merged into a rebuild, same units: fine
    project({ id: "nc:a", kind: "new_construction", units_delta: 6, replaced_units: 3, permit_ids: ["3", "2"] }), // gained the demolition's permit: not compared
    project({ id: "nc:b", kind: "new_construction", units_delta: 4, permit_ids: ["4", "6"] }), // a new phase permit joined: not compared
  ];
  const drift = findDrift(before, after);
  assert.deepEqual(drift, [{ id: "demo:1", ward: 44, address: "1 W MAIN ST", kind_before: "demolition", kind_after: "demolition", units_before: 2, units_after: 5 }]);
});

test("a change of kind with the same permits is drift even when the units match", () => {
  const drift = findDrift([prev({ id: "ren:1", kind: "conversion", units_delta: 2, permit_ids: ["1"] })], [project({ id: "ren:1", kind: "adu", units_delta: 2, permit_ids: ["1"] })]);
  assert.equal(drift.length, 1);
  assert.equal(drift[0].kind_after, "adu");
});
