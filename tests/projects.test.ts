import { test } from "node:test";
import assert from "node:assert/strict";
import type { Classification, Permit } from "../scripts/lib/types";
import { buildProjects, demolitionUnits, type ClassifiedPermit } from "../scripts/lib/projects";

let seq = 0;
function permit(o: Partial<Permit> & { permit_type: string; issue_date: string }): Permit {
  seq += 1;
  return {
    id: `id${seq}`, permit_no: `P${seq}`, review_type: null, status: "ACTIVE", address: "2129 N OAKLEY AVE", lat: 41.92, lon: -87.68,
    ward: 32, pins: [], description: "", reported_cost: null, contacts: [], ...o,
  };
}
function cls(o: Partial<Classification> & { category: Classification["category"]; units: number | null }): Classification {
  return { units_source: "regex_number", needs_review: false, notes: [], ...o };
}
const NC = "PERMIT - NEW CONSTRUCTION";
const DEMO = "PERMIT - WRECKING/DEMOLITION";
const opts = { tenures: [], wardAt: () => 32, subsidizedAt: () => false };

function build(items: ClassifiedPermit[]) {
  return buildProjects(items, opts);
}
/** A demolition permit resolved against the assessor: units are the parcels' units added together. */
function assessorDemo(o: Partial<Permit> & { issue_date: string }, parcels: { pin: string; units: number | null; cls?: string }[], extra: Partial<Classification> = {}): ClassifiedPermit {
  const known = parcels.filter((p) => p.units !== null);
  return {
    permit: permit({ permit_type: DEMO, ...o }),
    cls: cls({
      category: "demolition",
      units: known.length ? known.reduce((s, p) => s + (p.units ?? 0), 0) : null,
      units_source: known.length ? "assessor" : "unknown",
      demo_hint: "none",
      parcels: parcels.map((p) => ({ pin: p.pin, units: p.units, cls: p.cls ?? null, year: 2025 })),
      ...extra,
    }),
  };
}

test("demolition then rebuild at the same address becomes one replacement project", () => {
  const demo = { permit: permit({ permit_type: DEMO, issue_date: "2026-01-10" }), cls: cls({ category: "demolition", units: 1, units_source: "assessor" }) };
  const house = { permit: permit({ permit_type: NC, issue_date: "2026-01-25", description: "ERECT NEW 2 STORY SINGLE FAMILY RESIDENCE" }), cls: cls({ category: "new_residential", units: 1 }) };
  const out = build([demo, house]);
  const nc = out.find((p) => p.kind === "new_construction")!;
  const d = out.find((p) => p.kind === "demolition")!;
  assert.equal(nc.units_delta, 0);
  assert.equal(nc.replaced_units, 1);
  assert.equal(nc.counted, true);
  assert.equal(nc.first_issue_date, "2026-01-25");
  assert.equal(d.counted, false);
  assert.equal(d.merged_into, nc.id);
  assert.ok(nc.permit_ids.includes(demo.permit.id));
  assert.deepEqual(nc.flags, ["replaces"]);
  assert.deepEqual(d.flags, ["merged", "assessor_units"]);
});

test("rebuild permit issued before the demolition still merges; a 3-flat to a house nets minus two", () => {
  const house = { permit: permit({ permit_type: NC, issue_date: "2026-02-15" }), cls: cls({ category: "new_residential", units: 1, units_source: "sfr_keyword" }) };
  const demo = { permit: permit({ permit_type: DEMO, issue_date: "2026-03-01" }), cls: cls({ category: "demolition", units: 3, units_source: "assessor" }) };
  const nc = build([house, demo]).find((p) => p.kind === "new_construction")!;
  assert.equal(nc.units_delta, -2);
  assert.equal(nc.replaced_units, 3);
});

test("several demolitions of different buildings fold into one tower", () => {
  const demos = ["2025-05-01", "2025-05-02", "2025-05-03"].map((d, i) => assessorDemo({ issue_date: d }, [{ pin: `pin${i}`, units: 2, cls: "211" }]));
  const tower = { permit: permit({ permit_type: NC, issue_date: "2025-09-01" }), cls: cls({ category: "new_residential", units: 20 }) };
  const out = build([...demos, tower]);
  const nc = out.find((p) => p.kind === "new_construction")!;
  assert.equal(nc.units_delta, 14);
  assert.equal(nc.replaced_units, 6);
  const d = out.filter((p) => p.kind === "demolition");
  assert.equal(d.length, 1, "three permits at one address within six months are one demolition");
  assert.equal(d[0].merged_into, nc.id);
  assert.deepEqual(d[0].permit_ids, demos.map((x) => x.permit.id));
});

test("a demolition with no rebuild, an emergency demolition, and a rebuild years later stay separate", () => {
  const lone = { permit: permit({ permit_type: DEMO, issue_date: "2026-01-10", address: "100 W LONE ST" }), cls: cls({ category: "demolition", units: 2, units_source: "assessor" }) };
  const emergency = { permit: permit({ permit_type: DEMO, issue_date: "2026-01-10", address: "200 W EMERG ST" }), cls: cls({ category: "emergency_demolition", units: 2, units_source: "assessor" }) };
  const later = { permit: permit({ permit_type: NC, issue_date: "2026-02-01", address: "200 W EMERG ST" }), cls: cls({ category: "new_residential", units: 3 }) };
  const oldDemo = { permit: permit({ permit_type: DEMO, issue_date: "2023-06-01", address: "300 W OLD ST" }), cls: cls({ category: "demolition", units: 1, units_source: "assessor" }) };
  const farRebuild = { permit: permit({ permit_type: NC, issue_date: "2026-06-01", address: "300 W OLD ST" }), cls: cls({ category: "new_residential", units: 1 }) };
  const out = build([lone, emergency, later, oldDemo, farRebuild]);
  assert.equal(out.find((p) => p.address === "100 W LONE ST")!.counted, true);
  const em = out.find((p) => p.kind === "emergency_demolition")!;
  assert.equal(em.merged_into, null);
  assert.deepEqual(em.flags, ["emergency", "assessor_units"]);
  assert.equal(out.find((p) => p.address === "200 W EMERG ST" && p.kind === "new_construction")!.replaced_units, 0);
  assert.equal(out.filter((p) => p.address === "300 W OLD ST").every((p) => p.counted), true);
});

test("unplaced permits are counted, not silently dropped", () => {
  const nowhere = { permit: permit({ permit_type: NC, issue_date: "2026-01-01", ward: null, lat: null, lon: null }), cls: cls({ category: "new_residential", units: 2 }) };
  const unplaced = { count: 0 };
  const out = buildProjects([nowhere], { ...opts, wardAt: () => null, unplaced });
  assert.equal(out.length, 0);
  assert.equal(unplaced.count, 1);
});

// --- grouped demolitions -------------------------------------------------------------------------

test("permits at one address that resolve to the same parcel count it once", () => {
  const three = ["2026-09-16", "2026-09-16", "2026-10-02"].map((d) => assessorDemo({ issue_date: d }, [{ pin: "P1", units: 3, cls: "211" }]));
  const out = build(three);
  assert.equal(out.length, 1);
  assert.equal(out[0].units_delta, -3);
  assert.equal(out[0].counted, true);
  assert.equal(out[0].permit_ids.length, 3);
  assert.deepEqual(out[0].flags, ["multi_permit", "assessor_units"]);
});

test("several parcels at one address are added together", () => {
  const demo = assessorDemo({ issue_date: "2026-09-16", address: "474 N MILWAUKEE AVE" }, [{ pin: "17091050290000", units: 0, cls: "593" }, { pin: "17091050310000", units: 3, cls: "212" }]);
  const [p] = build([demo]);
  assert.equal(p.units_delta, -3);
  assert.deepEqual(p.flags, ["assessor_units", "summed_parcels"]);
});

test("the assemblage at 470 N Milwaukee: a permit with its own PIN and one with no parcel, mixed use, zero units", () => {
  const withPin = assessorDemo(
    { issue_date: "2026-09-16", address: "470 N MILWAUKEE AVE", pins: ["1709105016"], description: "WRECK AND REMOVE A 2 STORY MASONRY MIXED USE BUILDING" },
    [{ pin: "17091050160000", units: 0, cls: "580" }],
  );
  const garage = assessorDemo({ issue_date: "2026-09-16", address: "470 N MILWAUKEE AVE", description: "COMPLEX DEMOLITION: WRECK AND REMOVE A 1 STORY MASONRY COMMERCIAL GARAGE" }, []);
  const out = build([withPin, garage]);
  assert.equal(out.length, 1, "same address joins the two permits");
  const [p] = out;
  assert.equal(p.units_delta, 0);
  assert.equal(p.counted, false);
  assert.equal(p.needs_review, true);
  assert.equal(p.primary_permit_id, withPin.permit.id, "the permit that supplied the count is the primary");
  assert.deepEqual(p.flags, ["not_counted", "needs_review", "multi_permit", "assessor_units", "mixed_use_zero"]);
  assert.equal(withPin.cls.needs_review, true, "the mixed-use permit is sent to the review queue");
  assert.ok(withPin.cls.notes.some((n) => n.includes("mixed use")));
  assert.equal(garage.cls.needs_review, false);
});

test("stated counts: distinct buildings add, a re-issued permit with the same wording counts once", () => {
  const front = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20", description: "DEMOLITION OF A 2-STORY RESIDENTIAL BUILDING. 2 RESIDENTIAL UNITS. LOCATION ON LOT: FRONT." }), cls: cls({ category: "demolition", units: 2, units_source: "structured_demo", demo_hint: "none" }) };
  const rear = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20", description: "DEMOLITION OF A 1-STORY COACH HOUSE. 1 RESIDENTIAL UNIT. LOCATION ON LOT: REAR." }), cls: cls({ category: "demolition", units: 1, units_source: "structured_demo", demo_hint: "none" }) };
  const reissue = { permit: permit({ permit_type: DEMO, issue_date: "2026-10-01", description: front.permit.description }), cls: cls({ category: "demolition", units: 2, units_source: "structured_demo", demo_hint: "none" }) };
  const [p] = build([front, rear, reissue]);
  assert.equal(p.units_delta, -3);
  assert.deepEqual(p.flags, ["multi_permit"]);
});

test("a group that mixes a stated count with an assessor count uses the larger; an all-stated group is believed", () => {
  const garage = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20", description: "GARAGE. 0 RESIDENTIAL UNITS." }), cls: cls({ category: "demolition", units: 0, units_source: "structured_demo", demo_hint: "none" }) };
  const house = assessorDemo({ issue_date: "2026-09-20" }, [{ pin: "P1", units: 3, cls: "211" }]);
  assert.equal(demolitionUnits([garage, house]).units, 3);
  assert.equal(demolitionUnits([garage, house]).source, "assessor");
  const stated = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20", description: "HOUSE. 2 RESIDENTIAL UNITS." }), cls: cls({ category: "demolition", units: 2, units_source: "structured_demo", demo_hint: "none", parcels: [{ pin: "P1", units: 3, cls: "211", year: 2025 }] }) };
  assert.equal(demolitionUnits([stated]).units, 2, "a permit that states its count is believed over a stale assessor record");
});

test("a correction on any permit settles the group", () => {
  const corrected = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20" }), cls: cls({ category: "demolition", units: 0, units_source: "override", notes: ["override: commercial, no apartments"] }) };
  const sibling = assessorDemo({ issue_date: "2026-09-20" }, [{ pin: "P1", units: 3, cls: "211" }]);
  const [p] = build([corrected, sibling]);
  assert.equal(p.units_delta, 0);
  assert.equal(p.counted, false);
  assert.equal(p.primary_permit_id, corrected.permit.id);
  assert.deepEqual(p.flags, ["not_counted", "multi_permit", "overridden"]);
});

test("with no parcel the wording decides, and the permit goes to the review queue", () => {
  const demo = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20", description: "WRECK AND REMOVE A 2 STORY MASONRY MULTI UNIT RESIDENCE" }), cls: cls({ category: "demolition", units: null, units_source: "unknown", demo_hint: "multi", parcels: [] }) };
  const [p] = build([demo]);
  assert.equal(p.units_delta, -2);
  assert.equal(p.counted, true);
  assert.equal(p.needs_review, true);
  assert.deepEqual(p.flags, ["needs_review", "no_parcel"]);
  assert.equal(demo.cls.needs_review, true);
  const nothing = { permit: permit({ permit_type: DEMO, issue_date: "2026-09-20", description: "WRECK AND REMOVE A 1 STORY MASONRY BUILDING" }), cls: cls({ category: "demolition", units: null, units_source: "unknown", demo_hint: "none", parcels: [] }) };
  const [z] = build([nothing]);
  assert.equal(z.units_delta, 0);
  assert.deepEqual(z.flags, ["not_counted", "no_parcel"]);
  assert.equal(nothing.cls.needs_review, false);
});

test("emergency and voluntary demolitions at one address stay separate; so do permits more than six months apart", () => {
  const a = assessorDemo({ issue_date: "2026-01-10" }, [{ pin: "P1", units: 2, cls: "211" }]);
  const b = assessorDemo({ issue_date: "2026-01-12" }, [{ pin: "P1", units: 2, cls: "211" }], { category: "emergency_demolition" });
  const c = assessorDemo({ issue_date: "2026-09-01" }, [{ pin: "P1", units: 2, cls: "211" }]);
  const out = build([a, b, c]);
  assert.equal(out.length, 3);
  assert.equal(out.filter((p) => p.kind === "emergency_demolition").length, 1);
});

test("new-construction clusters carry the multi-permit flag", () => {
  const caissons = { permit: permit({ permit_type: NC, issue_date: "2026-01-05", description: "CAISSONS ONLY FOR 9 STORY RESIDENTIAL BUILDING" }), cls: cls({ category: "revision_or_phase", units: null, units_source: "unknown" }) };
  const full = { permit: permit({ permit_type: NC, issue_date: "2026-03-01", description: "FULL BUILDING PERMIT FOR 9 STORY 40 DWELLING UNIT BUILDING" }), cls: cls({ category: "new_residential", units: 40 }) };
  const [p] = build([caissons, full]);
  assert.equal(p.units_delta, 40);
  assert.deepEqual(p.flags, ["multi_permit"]);
  assert.equal(p.ward_geom_mismatch, false);
});
