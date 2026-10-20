import { test } from "node:test";
import assert from "node:assert/strict";
import type { AlderSponsorship, KeyOrdinance, Project, Snapshot, WardRow, ZoningAction } from "../scripts/lib/types";
import {
  actionTenureSplit,
  cityActionTotals,
  computeWardActionStats,
  homesApproved,
  median,
  rankActionsWithChange,
  rankWardActions,
  selectActions,
  wardFlagsWithDerived,
} from "../lib/actions";

let seq = 0;
function action(o: Partial<ZoningAction> & { ward: number | null; stage: ZoningAction["stage"]; stage_date: string }): ZoningAction {
  seq += 1;
  const intro = o.introduction_date ?? o.stage_date;
  return {
    matter_id: `m${seq}`, record_number: `O2025-${seq}`, title: "", introduction_date: intro, final_action_date: o.stage === "passed" ? o.stage_date : null, outcome: o.stage === "passed" ? "passed" : "pending",
    sponsor_ward: null, sponsor_name: null, sponsored_by_alder: false, ward_source: "parcel", alder_tenure_id: o.ward ? `w${String(o.ward).padStart(2, "0")}-2023` : null,
    addresses: [], address: "1 W MAIN ST", pins: [], app_no: null, type1: false, from_districts: ["RS-3"], from_district: "RS-3", to_district: "RT-4", from_far: 0.9, to_far: 1.2,
    direction: "up", requested_units: null, approved_units: null, units_source: "none", lot_sf: null, allowed_before: null, allowed_after: null,
    days_pending: null, substitute: false, days_to_passage: null, needs_review: false, exhibits_pending: false, notes: [], documents: [], history: [], ...o,
  };
}
function project(o: Partial<Project> & { ward: number; units_delta: number; first_issue_date: string }): Project {
  seq += 1;
  return {
    id: `p${seq}`, project_key: `k${seq}`, kind: "new_construction", counted: true, primary_permit_id: `${seq}`, permit_no: `B${seq}`, permit_ids: [], address: "1 W MAIN ST", lat: null, lon: null,
    alder_tenure_id: null, subsidized: false, replaced_units: 0, merged_into: null, status: "ACTIVE", description: "", reported_cost: null, review_type: null, needs_review: false, ward_geom_mismatch: false, flags: [], action_matter_id: null, ...o,
  };
}
const ward = (n: number, units: number | null): WardRow => ({ ward: n, units_2020: units, pop_2020: null, alder_current: null, website: null });
function snapshot(partial: Partial<Snapshot>): Snapshot {
  return { generated_at: "", window_start: "2023-05-15", wards: [], tenures: [], flags: [], projects: [], counts: {}, actions: [], action_projects: [], key_ordinances: [], sponsorships: [], ...partial };
}
const W = { from: "2025-01-01", to: "2025-12-31" };

test("ward stats: approved, requested, stalled, undecided, allowed added, permitted so far, low sample", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 2000)],
    actions: [
      action({ ward: 1, stage: "passed", stage_date: "2025-03-01", introduction_date: "2025-01-10", approved_units: 12, requested_units: 12, allowed_before: 1, allowed_after: 12 }),
      action({ ward: 1, stage: "passed", stage_date: "2025-06-01", introduction_date: "2024-11-01", approved_units: 3, requested_units: 3 }), // introduced before the period: approved, not requested
      action({ ward: 1, stage: "stalled", stage_date: "2025-02-01", introduction_date: "2025-02-01", requested_units: 40, approved_units: 0, days_pending: 300 }),
      action({ ward: 1, stage: "undecided", stage_date: "2025-11-01", introduction_date: "2025-11-01", requested_units: 9, days_pending: 50 }),
      action({ ward: 1, stage: "passed", stage_date: "2025-04-01", introduction_date: "2025-03-01", direction: "down", approved_units: 0, requested_units: 0, allowed_before: 3, allowed_after: 1 }),
      action({ ward: 2, stage: "passed", stage_date: "2025-05-01", introduction_date: "2025-03-01", approved_units: 100, requested_units: 100 }),
      action({ ward: null, stage: "passed", stage_date: "2025-05-01", approved_units: 999 }), // unplaced: left out
      action({ ward: 1, stage: "passed", stage_date: "2024-05-01", approved_units: 999 }), // before the period
    ],
  });
  snap.projects = [
    project({ ward: 1, units_delta: 9, first_issue_date: "2025-09-01", action_matter_id: snap.actions[0].matter_id }),
    project({ ward: 1, units_delta: 4, first_issue_date: "2025-09-01", action_matter_id: snap.actions[4].matter_id }), // linked to a downzoning: not counted
    project({ ward: 1, units_delta: 7, first_issue_date: "2026-02-01", action_matter_id: snap.actions[0].matter_id }), // permitted after the period: still the approval's follow-through
    project({ ward: 1, units_delta: 3, first_issue_date: "2025-09-01", action_matter_id: snap.actions[7].matter_id }), // its rezoning passed before the period
    project({ ward: 1, units_delta: 5, first_issue_date: "2025-09-01" }), // by right
  ];
  const [w1, w2] = computeWardActionStats(snap, W);
  assert.equal(w1.approved, 15);
  assert.equal(w1.approved_rate, 15);
  assert.equal(w1.passed, 3);
  assert.equal(w1.requested, 52, "the passed one introduced in the period plus the stalled one; undecided left out");
  assert.equal(w1.approved_of_requested, 12);
  assert.equal(w1.applications, 3);
  assert.equal(w1.raw_rate, 12 / 52);
  assert.equal(w1.stalled, 1);
  assert.equal(w1.undecided, 1);
  assert.equal(w1.allowed_added, 9, "+11 from the upzoning, -2 from the downzoning");
  assert.equal(w1.allowed_known, 2);
  assert.equal(w1.permitted, 16, "9 and 7 follow the rezoning that passed in the period; the downzoning's 4 and the earlier rezoning's 3 do not");
  assert.equal(w1.lowSample, true);
  assert.equal(w2.approved, 100);
  assert.equal(w2.approved_rate, 50);
  // Adjusted rate: k = median requested (52 and 100 -> 76), citywide rate 112/152.
  const city = 112 / 152;
  assert.ok(Math.abs(w1.approval_rate! - (12 + 76 * city) / (52 + 76)) < 1e-9);
  assert.ok(Math.abs(w2.approval_rate! - (100 + 76 * city) / (100 + 76)) < 1e-9);
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), 0);
  const totals = cityActionTotals([w1, w2], snap.wards);
  assert.equal(totals.approved, 115);
  assert.equal(totals.requested, 152);
  assert.equal(totals.approval_rate, city);
  assert.equal(totals.permitted, 16);
  assert.equal(totals.stalled, 1);
});

test("homes approved: stated count, nothing for downzonings or unpassed matters", () => {
  assert.equal(homesApproved(action({ ward: 1, stage: "passed", stage_date: "2025-01-01", approved_units: 8 })), 8);
  assert.equal(homesApproved(action({ ward: 1, stage: "passed", stage_date: "2025-01-01", direction: "down", approved_units: 8 })), 0);
  assert.equal(homesApproved(action({ ward: 1, stage: "stalled", stage_date: "2025-01-01", approved_units: 8 })), 0);
  assert.equal(homesApproved(action({ ward: 1, stage: "passed", stage_date: "2025-01-01" })), 0);
});

test("ranking: nulls last, ties by homes approved, rank change against the prior period", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 1000), ward(3, null)],
    actions: [
      action({ ward: 1, stage: "passed", stage_date: "2025-02-10", approved_units: 10 }),
      action({ ward: 2, stage: "passed", stage_date: "2025-02-10", approved_units: 30 }),
      action({ ward: 3, stage: "passed", stage_date: "2025-02-10", approved_units: 50 }),
      action({ ward: 1, stage: "passed", stage_date: "2025-01-10", approved_units: 40 }),
      action({ ward: 2, stage: "passed", stage_date: "2025-01-10", approved_units: 1 }),
    ],
  });
  const feb = { from: "2025-02-01", to: "2025-02-28" };
  const ranked = rankActionsWithChange(snap, feb, "approved_rate");
  assert.deepEqual(ranked.map((r) => [r.ward, r.rank, r.rankChange]), [[2, 1, 1], [1, 2, -1], [3, 3, 0]]);
  const byApproved = rankWardActions(computeWardActionStats(snap, feb), "permitted");
  assert.deepEqual(byApproved.map((r) => r.ward), [3, 2, 1], "all tie on permitted so far; homes approved breaks the tie");
});

test("selection, tenure split, derived ward flags", () => {
  const tenures = [
    { id: "w27-2023", ward: 27, name: "A", photo_url: null, start_date: "2023-05-15", end_date: "2025-07-31", source_url: null },
    { id: "w27-2025", ward: 27, name: "B", photo_url: null, start_date: "2025-09-05", end_date: null, source_url: null },
  ];
  const snap = snapshot({
    tenures,
    actions: [
      action({ ward: 27, stage: "passed", stage_date: "2025-06-01", approved_units: 4, alder_tenure_id: "w27-2023" }),
      action({ ward: 27, stage: "passed", stage_date: "2025-10-01", approved_units: 6, alder_tenure_id: "w27-2025" }),
      action({ ward: 27, stage: "stalled", stage_date: "2025-03-01", introduction_date: "2025-03-01", alder_tenure_id: "w27-2023" }),
      action({ ward: 28, stage: "passed", stage_date: "2025-06-01", approved_units: 9 }),
    ],
    flags: [
      { ward: 27, flag: "adu_opt_in", value: "yes", source_url: "https://hand", as_of: "2025-12-10" },
      { ward: 5, flag: "adu_opt_in", value: "yes", source_url: "https://pilot", as_of: "2021-05-01" },
    ],
    key_ordinances: [{ record_number: "SO2025-0020513", label: "ADU opt-in", stance: "pro", note: "", flag: "adu_opt_in", title: null, introduction_date: "2025-11-01", final_action_date: "2025-12-10", outcome: "passed" } as KeyOrdinance],
    sponsorships: [
      { record_number: "SO2025-0020513", ward: 27, alder_name: "B", alder_tenure_id: "w27-2025", role: "sponsor", vote: "Yea" },
      { record_number: "SO2025-0020513", ward: 28, alder_name: "C", alder_tenure_id: null, role: "cosponsor", vote: "Yea" },
      { record_number: "SO2025-0020513", ward: 29, alder_name: "D", alder_tenure_id: null, role: "none", vote: "Yea" },
    ] as AlderSponsorship[],
  });
  const window = { from: "2025-01-01", to: "2025-12-31" };
  assert.deepEqual(selectActions(snap, window, 27).map((a) => a.stage_date), ["2025-10-01", "2025-06-01", "2025-03-01"]);
  assert.deepEqual(actionTenureSplit(snap, 27, window).map((s) => [s.tenure.id, s.approved, s.actions]), [["w27-2023", 4, 1], ["w27-2025", 6, 1]]);
  const flags = wardFlagsWithDerived(snap);
  assert.deepEqual(flags.map((f) => [f.ward, f.value, f.source_url]), [
    [5, "yes", "https://pilot"],
    [27, "yes", "https://chicago.councilmatic.org/legislation/o2025-0020513/"],
    [28, "yes", "https://chicago.councilmatic.org/legislation/o2025-0020513/"],
  ]);
  const stats = computeWardActionStats({ ...snap, wards: [ward(27, 100), ward(28, 100), ward(29, 100)] }, window);
  assert.deepEqual(stats.map((s) => [s.ward, s.adu, s.sponsorships]), [[27, "yes", 1], [28, "yes", 1], [29, "none", 0]]);
});
