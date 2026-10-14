import { test } from "node:test";
import assert from "node:assert/strict";
import type { AlderTenure, Project, ProjectKind, Snapshot, WardRow } from "../scripts/lib/types";
import {
  cityTotals,
  computeWardStats,
  priorWindow,
  projectsInWindow,
  rankWards,
  rankWithChange,
  tenureSplit,
  tenuresOverlapping,
  wardStats,
  wardsChangedHands,
} from "../lib/rank";
import { detectPreset, nextSort, parseQuery, presetWindow, buildHref } from "../lib/query";
import { addDays, daysBetween, isIsoDate } from "../lib/dates";
import { formatCurrency, formatDate, formatRate, formatSigned, initials } from "../lib/format";

let seq = 0;
function project(overrides: Partial<Project> & { ward: number; kind: ProjectKind; units_delta: number }): Project {
  seq += 1;
  const counted = overrides.kind !== "emergency_demolition" && !(overrides.needs_review ?? false);
  return {
    id: `p${seq}`,
    project_key: `k${seq}`,
    first_issue_date: "2026-06-15",
    primary_permit_id: `${1000 + seq}`,
    permit_no: `B${seq}`,
    permit_ids: [`${1000 + seq}`],
    address: "1 MAIN ST",
    lat: null,
    lon: null,
    alder_tenure_id: `w${String(overrides.ward).padStart(2, "0")}-2023`,
    subsidized: false,
    replaced_units: 0,
    merged_into: null,
    status: "ACTIVE",
    description: "",
    reported_cost: null,
    review_type: null,
    needs_review: false,
    counted,
    ...overrides,
  };
}

function ward(ward: number, units_2020: number | null): WardRow {
  return { ward, units_2020, pop_2020: null, alder_current: null, website: null };
}

function tenure(id: string, ward: number, start_date: string, end_date: string | null): AlderTenure {
  return { id, ward, name: id, photo_url: null, start_date, end_date, source_url: null };
}

function snapshot(partial: Partial<Snapshot>): Snapshot {
  return {
    generated_at: "2026-10-09T00:00:00Z",
    window_start: "2023-05-15",
    wards: [],
    tenures: [],
    flags: [],
    projects: [],
    counts: {},
    ...partial,
  };
}

const W = { from: "2026-01-01", to: "2026-12-31" };

test("wardStats: gross, lost, net, emergency, projects, rate, lowSample", () => {
  const projects = [
    project({ ward: 1, kind: "new_construction", units_delta: 9 }),
    project({ ward: 1, kind: "adu", units_delta: 1 }),
    project({ ward: 1, kind: "conversion", units_delta: 4 }),
    project({ ward: 1, kind: "deconversion", units_delta: -2 }),
    project({ ward: 1, kind: "demolition", units_delta: -3 }),
    project({ ward: 1, kind: "emergency_demolition", units_delta: -6 }),
    project({ ward: 1, kind: "new_construction", units_delta: 0, needs_review: true }), // not counted
  ];
  const s = wardStats(1, 1000, projects);
  assert.equal(s.gross, 14);
  assert.equal(s.lost, 5);
  assert.equal(s.net, 9);
  assert.equal(s.emergency_units, 6);
  assert.equal(s.projects, 5);
  assert.equal(s.rate, 9);
  assert.equal(s.lowSample, false);
});

test("wardStats: null or zero denominator gives null rate; fewer than 3 projects is low sample", () => {
  const projects = [project({ ward: 2, kind: "new_construction", units_delta: 3 })];
  assert.equal(wardStats(2, null, projects).rate, null);
  assert.equal(wardStats(2, 0, projects).rate, null);
  assert.equal(wardStats(2, 100, projects).lowSample, true);
  assert.equal(wardStats(2, 100, []).projects, 0);
});

test("projectsInWindow: inclusive bounds and completedOnly", () => {
  const projects = [
    project({ ward: 1, kind: "new_construction", units_delta: 1, first_issue_date: "2025-12-31" }),
    project({ ward: 1, kind: "new_construction", units_delta: 1, first_issue_date: "2026-01-01" }),
    project({ ward: 1, kind: "new_construction", units_delta: 1, first_issue_date: "2026-12-31", status: "COMPLETE" }),
    project({ ward: 1, kind: "new_construction", units_delta: 1, first_issue_date: "2027-01-01" }),
  ];
  assert.equal(projectsInWindow(projects, W).length, 2);
  assert.equal(projectsInWindow(projects, W, { completedOnly: true }).length, 1);
});

test("rankWards: rate mode orders by rate desc, nulls last, ties by net then gross", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 100), ward(3, null), ward(4, 1000)],
    projects: [
      project({ ward: 1, kind: "new_construction", units_delta: 10 }), // rate 10
      project({ ward: 2, kind: "new_construction", units_delta: 2 }), // rate 20
      project({ ward: 3, kind: "new_construction", units_delta: 50 }), // null rate
      project({ ward: 4, kind: "new_construction", units_delta: 12 }), // rate 10, same as ward 1 but net 10 after loss
      project({ ward: 4, kind: "demolition", units_delta: -2 }),
    ],
  });
  const ranked = rankWards(computeWardStats(snap, W), "rate");
  assert.deepEqual(
    ranked.map((r) => [r.rank, r.ward]),
    [
      [1, 2],
      [2, 4], // tie on rate 10 with ward 1, net equal (10), gross 12 > 10
      [3, 1],
      [4, 3],
    ],
  );
});

test("rankWards: net mode orders by net desc, ties by gross", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 100), ward(3, null)],
    projects: [
      project({ ward: 1, kind: "new_construction", units_delta: 10 }),
      project({ ward: 2, kind: "new_construction", units_delta: 2 }),
      project({ ward: 3, kind: "new_construction", units_delta: 12 }),
      project({ ward: 3, kind: "demolition", units_delta: -2 }),
    ],
  });
  const ranked = rankWards(computeWardStats(snap, W), "net");
  assert.deepEqual(ranked.map((r) => r.ward), [3, 1, 2]);
});

test("priorWindow: equal length ending the day before, omitted before window_start", () => {
  assert.deepEqual(priorWindow({ from: "2026-03-01", to: "2026-03-31" }, "2023-05-15"), { from: "2026-01-29", to: "2026-02-28" });
  assert.deepEqual(priorWindow({ from: "2024-01-01", to: "2024-12-31" }, "2023-05-15"), null);
  assert.deepEqual(priorWindow({ from: "2023-05-15", to: "2023-05-15" }, "2023-05-15"), null);
  assert.deepEqual(priorWindow({ from: "2023-05-16", to: "2023-05-16" }, "2023-05-15"), { from: "2023-05-15", to: "2023-05-15" });
});

test("rankWithChange: positive when a ward moves up, null when the prior window is unavailable", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 1000)],
    projects: [
      // prior window (Jan): ward 1 leads
      project({ ward: 1, kind: "new_construction", units_delta: 5, first_issue_date: "2026-01-10" }),
      project({ ward: 2, kind: "new_construction", units_delta: 1, first_issue_date: "2026-01-10" }),
      // current window (Feb): ward 2 leads
      project({ ward: 1, kind: "new_construction", units_delta: 1, first_issue_date: "2026-02-10" }),
      project({ ward: 2, kind: "new_construction", units_delta: 5, first_issue_date: "2026-02-10" }),
    ],
  });
  const feb = { from: "2026-02-01", to: "2026-02-28" };
  const ranked = rankWithChange(snap, feb, "rate");
  const byWard = new Map(ranked.map((r) => [r.ward, r]));
  assert.equal(byWard.get(2)?.rank, 1);
  assert.equal(byWard.get(2)?.rankChange, 1);
  assert.equal(byWard.get(1)?.rankChange, -1);

  const early = rankWithChange(snapshot({ ...snap, window_start: "2026-01-15" }), feb, "rate");
  assert.ok(early.every((r) => r.rankChange === null));
});

test("tenures: overlap, split, and wards changed hands", () => {
  const snap = snapshot({
    wards: [ward(27, 1000)],
    tenures: [
      tenure("w27-2023", 27, "2023-05-15", "2025-07-31"),
      tenure("w27-2025", 27, "2025-09-05", null),
      tenure("w01-2023", 1, "2023-05-15", null),
    ],
    projects: [
      project({ ward: 27, kind: "new_construction", units_delta: 4, first_issue_date: "2025-06-01", alder_tenure_id: "w27-2023" }),
      project({ ward: 27, kind: "new_construction", units_delta: 3, first_issue_date: "2025-10-01", alder_tenure_id: "w27-2025" }),
      project({ ward: 27, kind: "demolition", units_delta: -1, first_issue_date: "2025-10-02", alder_tenure_id: "w27-2025" }),
      project({ ward: 27, kind: "new_construction", units_delta: 9, first_issue_date: "2025-08-15", alder_tenure_id: null }), // vacant seat
    ],
  });
  const window = { from: "2025-05-01", to: "2025-12-31" };
  assert.deepEqual(tenuresOverlapping(snap.tenures, 27, window).map((t) => t.id), ["w27-2023", "w27-2025"]);
  assert.deepEqual(tenuresOverlapping(snap.tenures, 27, { from: "2025-08-01", to: "2025-08-31" }), []);
  const split = tenureSplit(snap, 27, window);
  assert.deepEqual(
    split.map((s) => [s.tenure.id, s.net, s.projects]),
    [
      ["w27-2023", 4, 1],
      ["w27-2025", 2, 2],
    ],
  );
  // A tenure with zero projects still appears.
  const empty = tenureSplit(snap, 27, { from: "2025-09-05", to: "2025-09-30" });
  assert.deepEqual(empty.map((s) => [s.tenure.id, s.net]), [["w27-2025", 0]]);
  assert.equal(wardsChangedHands(snap, window), 1);
  assert.equal(wardsChangedHands(snap, { from: "2025-10-01", to: "2025-12-31" }), 0);
});

test("presets and query parsing", () => {
  const today = "2026-10-09";
  const start = "2023-05-15";
  assert.deepEqual(presetWindow("last12", today, start), { from: "2025-10-09", to: today });
  assert.deepEqual(presetWindow("ytd", today, start), { from: "2026-01-01", to: today });
  assert.deepEqual(presetWindow("term", today, start), { from: start, to: today });
  assert.equal(detectPreset({ from: "2026-01-01", to: today }, today, start), "ytd");
  assert.equal(detectPreset({ from: "2026-02-01", to: today }, today, start), "custom");

  const q = parseQuery({ from: "2026-02-01", to: "2026-03-01", rank: "net", completed: "1" }, today, start);
  assert.deepEqual(q, { from: "2026-02-01", to: "2026-03-01", preset: "custom", sort: "net", dir: "desc", completed: true });
  const sorted = parseQuery({ from: "2026-02-01", to: "2026-03-01", sort: "gross", dir: "asc" }, today, start);
  assert.equal(sorted.sort, "gross");
  assert.equal(sorted.dir, "asc");

  // bad dates fall back to the default window; bad sort falls back to rate
  const bad = parseQuery({ from: "2026-02-30", to: "nope", sort: "bogus", dir: "sideways" }, today, start);
  assert.deepEqual(bad, { from: "2025-10-09", to: today, preset: "last12", sort: "rate", dir: "desc", completed: false });
  assert.deepEqual(nextSort({ sort: "rate", dir: "desc" }, "rate"), { sort: "rate", dir: "asc" });
  assert.deepEqual(nextSort({ sort: "rate", dir: "asc" }, "net"), { sort: "net", dir: "desc" });
  const reversed = parseQuery({ from: "2026-03-01", to: "2026-02-01" }, today, start);
  assert.equal(reversed.preset, "last12");
  const arr = parseQuery({ from: ["2026-01-01", "x"], to: today }, today, start);
  assert.equal(arr.preset, "ytd");

  assert.equal(buildHref("/ward/27", { from: "2026-01-01", to: today, sort: "net", dir: "desc", completed: true }, { kind: "adu", counted: undefined }), "/ward/27?from=2026-01-01&to=2026-10-09&sort=net&completed=1&kind=adu");
  assert.equal(buildHref("/", { from: "2026-01-01", to: today, sort: "rate", dir: "asc", completed: false }), "/?from=2026-01-01&to=2026-10-09&dir=asc");
  assert.equal(buildHref("/", { from: "2026-01-01", to: today, sort: "rate", dir: "desc", completed: false }), "/?from=2026-01-01&to=2026-10-09");
});

test("date helpers", () => {
  assert.equal(isIsoDate("2024-02-29"), true);
  assert.equal(isIsoDate("2023-02-29"), false);
  assert.equal(isIsoDate("2026-1-1"), false);
  assert.equal(isIsoDate(undefined), false);
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(addDays("2025-10-09", 365), "2026-10-09");
  assert.equal(daysBetween("2026-01-01", "2026-12-31"), 364);
});

test("formatting", () => {
  assert.equal(formatDate("2026-10-08"), "Oct 8, 2026");
  assert.equal(formatSigned(9), "+9");
  assert.equal(formatSigned(-2), "−2");
  assert.equal(formatSigned(0), "0");
  assert.equal(formatRate(0.27), "0.3");
  assert.equal(formatRate(-0.05), "−0.1");
  assert.equal(formatRate(null), "–");
  assert.equal(formatCurrency(1127127), "$1,127,127");
  assert.equal(formatCurrency(null), "–");
  assert.equal(initials("Walter Burnett Jr."), "WB");
  assert.equal(initials("Pat Dowell"), "PD");
  assert.equal(initials("Cher"), "C");
});

test("wardStats: a replacement counts the new building as gross and the demolished units as lost", () => {
  const stats = wardStats(1, 1000, [
    project({ ward: 1, kind: "new_construction", units_delta: -2, replaced_units: 3 }), // 3-flat torn down for a house
    project({ ward: 1, kind: "new_construction", units_delta: 5, replaced_units: 1 }), // house torn down for a 6-flat
    project({ ward: 1, kind: "demolition", units_delta: -1, counted: false, merged_into: "x" }), // folded in, not double counted
  ]);
  assert.equal(stats.gross, 7);
  assert.equal(stats.lost, 4);
  assert.equal(stats.net, 3);
  assert.equal(stats.projects, 2);
});

test("rankWards: any column sorts descending with rank 1 the highest, nulls last", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 1000), ward(3, null)],
    projects: [
      project({ ward: 1, kind: "new_construction", units_delta: 10 }),
      project({ ward: 1, kind: "demolition", units_delta: -4 }),
      project({ ward: 2, kind: "new_construction", units_delta: 3 }),
      project({ ward: 2, kind: "new_construction", units_delta: 3 }),
      project({ ward: 3, kind: "new_construction", units_delta: 1 }),
    ],
  });
  assert.deepEqual(rankWards(computeWardStats(snap, W), "lost").map((r) => r.ward), [1, 2, 3]);
  assert.deepEqual(rankWards(computeWardStats(snap, W), "projects").map((r) => r.ward), [1, 2, 3]);
  assert.deepEqual(rankWards(computeWardStats(snap, W), "gross").map((r) => r.ward), [1, 2, 3]);
});

test("cityTotals: sums the wards and rates against the summed housing stock", () => {
  const snap = snapshot({
    wards: [ward(1, 1000), ward(2, 3000), ward(3, null)],
    projects: [
      project({ ward: 1, kind: "new_construction", units_delta: 10 }),
      project({ ward: 2, kind: "demolition", units_delta: -2 }),
      project({ ward: 3, kind: "new_construction", units_delta: 4 }),
      project({ ward: 1, kind: "emergency_demolition", units_delta: -5 }),
    ],
  });
  const t = cityTotals(computeWardStats(snap, W), snap.wards);
  assert.equal(t.gross, 14);
  assert.equal(t.lost, 2);
  assert.equal(t.net, 12);
  assert.equal(t.emergency_units, 5);
  assert.equal(t.projects, 3);
  assert.equal(t.wardsWithDenominator, 2);
  assert.equal(t.rate, 3);
});
