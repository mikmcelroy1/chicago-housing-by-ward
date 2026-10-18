import { test } from "node:test";
import assert from "node:assert/strict";
import { checkZoningGoldenText, loadZoningGolden } from "../scripts/lib/zoning-golden";

const rows = loadZoningGolden();
const line = (m: { record_number: string; field: string; expected: string; actual: string }) => `${m.record_number}: ${m.field} expected ${m.expected}, got ${m.actual}`;

test("zoning golden list: the parser reads every checked matter as agreed", () => {
  assert.ok(rows.length >= 50, "data/zoning_golden.csv should hold the matters we have read by hand");
  assert.deepEqual(checkZoningGoldenText(rows.filter((r) => r.status === "pass")).map(line), []);
});

test("zoning golden list: a known gap that starts passing is promoted (change its status to pass)", () => {
  const gaps = rows.filter((r) => r.status === "known_gap");
  assert.deepEqual(gaps.filter((r) => checkZoningGoldenText([r]).length === 0).map((r) => r.record_number), []);
});
