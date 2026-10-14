import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Project } from "../scripts/lib/types";
import { FLAGS, FLAG_BY_KEY, flagsFor, flagText } from "../scripts/lib/flags";

const METHODOLOGY = readFileSync(join(import.meta.dirname, "..", "docs", "METHODOLOGY.md"), "utf8");

/** Heading id as rehype-slug (github-slugger) makes it: lower case, punctuation dropped, spaces to hyphens. */
function slug(heading: string): string {
  return heading.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s/g, "-");
}

function project(o: Partial<Project> = {}): Project {
  return {
    id: "p1", project_key: "k1", kind: "new_construction", ward: 1, units_delta: 3, counted: true, first_issue_date: "2026-06-01",
    primary_permit_id: "x", permit_no: "B1", permit_ids: ["x"], address: "1 W MAIN ST", lat: null, lon: null, alder_tenure_id: null,
    subsidized: false, replaced_units: 0, merged_into: null, status: "ACTIVE", description: "", reported_cost: null, review_type: null,
    needs_review: false, ward_geom_mismatch: false, flags: [], ...o,
  };
}

test("flag keys are unique and every flag has an icon, a tone and a one-sentence description", () => {
  assert.equal(FLAG_BY_KEY.size, FLAGS.length);
  for (const f of FLAGS) {
    assert.ok(f.description.length > 20 && /\.$/.test(f.description), `${f.key}: description should be a sentence`);
    assert.ok(f.icon && f.tone, f.key);
  }
});

test("every flag has a matching heading and the same description in the methodology's Flags section", () => {
  const section = METHODOLOGY.split(/^## Flags$/m)[1]?.split(/^## /m)[0];
  assert.ok(section, "docs/METHODOLOGY.md needs a '## Flags' section");
  const headings = [...section.matchAll(/^### (.+)$/gm)].map((m) => m[1].trim());
  const slugs = headings.map(slug);
  assert.equal(new Set(slugs).size, slugs.length, "heading ids under Flags must be unique");
  for (const f of FLAGS) {
    assert.ok(slugs.includes(f.anchor), `${f.key}: no '### ${f.label}' heading with id ${f.anchor} under ## Flags`);
    assert.equal(headings[slugs.indexOf(f.anchor)], f.label, `${f.key}: heading text should equal the label`);
    assert.ok(section.includes(f.description), `${f.key}: the methodology should carry the same description text`);
  }
  // No heading elsewhere in the document may steal an anchor.
  const allSlugs = [...METHODOLOGY.matchAll(/^#{2,3} (.+)$/gm)].map((m) => slug(m[1]));
  for (const f of FLAGS) assert.equal(allSlugs.filter((s) => s === f.anchor).length, 1, `${f.anchor} appears once`);
});

test("flagsFor derives row flags, keeps stored ones, and orders by the registry", () => {
  assert.deepEqual(flagsFor(project()), []);
  assert.deepEqual(flagsFor(project({ counted: false })), ["not_counted"]);
  assert.deepEqual(flagsFor(project({ kind: "emergency_demolition", counted: false, units_delta: -2 })), ["emergency"], "emergency is not also 'not counted'");
  assert.deepEqual(flagsFor(project({ kind: "demolition", counted: false, merged_into: "nc:1", units_delta: -2 })), ["merged"]);
  assert.deepEqual(flagsFor(project({ replaced_units: 2, needs_review: true, subsidized: true, ward_geom_mismatch: true })), ["needs_review", "replaces", "subsidized", "ward_mismatch"]);
  assert.deepEqual(flagsFor(project({ kind: "demolition", units_delta: -3, flags: ["summed_parcels", "assessor_units", "multi_permit"] })), ["multi_permit", "assessor_units", "summed_parcels"]);
  assert.deepEqual(flagsFor({ ...project(), flags: undefined as unknown as [] }), [], "a fixture written before flags existed still renders");
});

test("chip text", () => {
  const replaces = FLAG_BY_KEY.get("replaces")!;
  assert.equal(flagText(replaces, project({ replaced_units: 1 })), "Replaces 1 unit");
  assert.equal(flagText(replaces, project({ replaced_units: 3 })), "Replaces 3 units");
  assert.equal(replaces.short?.(project({ replaced_units: 3 })), "3");
  assert.equal(flagText(FLAG_BY_KEY.get("assessor_units")!, project()), "Assessor count");
});
