import { test } from "node:test";
import assert from "node:assert/strict";
import { checkGoldenText, loadGolden } from "../scripts/lib/golden";

const rows = loadGolden();
const line = (m: { permit_no: string; address: string; field: string; expected: string; actual: string }) => `${m.permit_no} ${m.address}: ${m.field} expected ${m.expected}, got ${m.actual}`;

test("golden list: the rules read every checked permit as agreed", () => {
  assert.ok(rows.length >= 20, "data/golden.csv should hold the permits we have checked by hand");
  assert.deepEqual(checkGoldenText(rows.filter((r) => r.status === "pass")).map(line), []);
});

test("golden list: a known gap that starts passing is promoted (change its status to pass)", () => {
  const gaps = rows.filter((r) => r.status === "known_gap");
  assert.deepEqual(gaps.filter((r) => checkGoldenText([r]).length === 0).map((r) => `${r.permit_no} ${r.address}`), []);
});
