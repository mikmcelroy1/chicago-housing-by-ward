import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheKeys, liveParcels, loadParcelCache, pin14, pinsForAddress, pruneParcelCache, saveParcelCacheDb, type ParcelCache, type ParcelUnits } from "../scripts/lib/parcels";

const rows = [
  { pin: "17091050290000", prop_address_full: "474 N MILWAUKEE AVE", last: "2026.0" },
  { pin: "17091050310000", prop_address_full: "474 N MILWAUKEE AVE", last: "2026.0" },
  { pin: "13173110260000", prop_address_full: "6330 W IRVING PARK RD", last: "2022" },
  { pin: "13173110470000", prop_address_full: "6330 W IRVING PARK RD", last: "2026.0" },
  { pin: "14311200150000", prop_address_full: "2129 N OAKLEY AVE", last: "2026" },
  { pin: "14311200151001", prop_address_full: "2129 N OAKLEY AVE UNIT 1", last: "2026" },
  { pin: "14311200151002", prop_address_full: "2129 N OAKLEY AVE UNIT 2", last: "2026" },
  { pin: "17221100101001", prop_address_full: "100 W MAIN ST UNIT 1", last: "2026" },
  { pin: "17221100101002", prop_address_full: "100 W MAIN ST UNIT 2", last: "2026" },
  { pin: "17221100101002", prop_address_full: "100 W MAIN ST UNIT 2", last: "2024" },
  { pin: "17221100200000", prop_address_full: "1000 W MAIN ST", last: "2026" },
];

test("every parcel at an address with its newest year, exact matches first, sorted, deduplicated", () => {
  assert.deepEqual(pinsForAddress(rows, "474 N MILWAUKEE AVE"), [{ pin: "17091050290000", last: 2026 }, { pin: "17091050310000", last: 2026 }]);
  assert.deepEqual(pinsForAddress([...rows].reverse(), "474 N MILWAUKEE AVE").map((p) => p.pin), ["17091050290000", "17091050310000"], "independent of API order");
  assert.deepEqual(pinsForAddress(rows, "2129 N OAKLEY AVE").map((p) => p.pin), ["14311200150000"], "the base parcel wins over condo units");
  assert.deepEqual(pinsForAddress(rows, "100 W MAIN ST"), [{ pin: "17221100101001", last: 2026 }, { pin: "17221100101002", last: 2026 }], "condo units when there is no base parcel; 1000 W is not 100 W");
  assert.deepEqual(pinsForAddress(rows, "9 W NOWHERE ST"), []);
});

test("a retired PIN is left out: 6330 W Irving Park was renumbered in 2023", () => {
  const parcels = pinsForAddress(rows, "6330 W IRVING PARK RD");
  assert.deepEqual(liveParcels(parcels, 2024), { live: ["13173110470000"], retired: ["13173110260000"] });
  assert.deepEqual(liveParcels(parcels, 2023), { live: ["13173110260000", "13173110470000"], retired: [] }, "one year of slack for assessor lag");
  assert.deepEqual(liveParcels([{ pin: "A", last: 2020 }, { pin: "B", last: 2021 }], 2025), { live: ["B"], retired: ["A"] }, "nothing recent: the newest generation stands in");
  assert.deepEqual(liveParcels([], 2025), { live: [], retired: [] });
});

test("pin14 pads the city's 10-digit PINs", () => {
  assert.equal(pin14("1709105016"), "17091050160000");
  assert.equal(pin14("17-09-105-016"), "17091050160000");
  assert.equal(pin14("17091050160000"), "17091050160000");
});

test("misses are kept for the run but never saved", () => {
  const unit: ParcelUnits = { pin: "17091050310000", year: 2025, cls: "212", units: 3, source: "improvement_chars", sig: "bldg:212|Three|5910|1927" };
  const cache: ParcelCache = {
    addressToPins: { "474 N MILWAUKEE AVE": [{ pin: "17091050290000", last: 2026 }], "9 W NOWHERE ST": [] },
    unitsByPinYear: { "17091050310000:2025": unit, "17091050290000:2025": null },
  };
  assert.deepEqual(pruneParcelCache(cache), { addressToPins: { "474 N MILWAUKEE AVE": [{ pin: "17091050290000", last: 2026 }] }, unitsByPinYear: { "17091050310000:2025": unit } });
});

test("the database cache writes only what a run added", async () => {
  const unit: ParcelUnits = { pin: "P2", year: 2025, cls: "202", units: 1, source: "class_sfr", sig: "bldg:202||1200|1950" };
  const cache: ParcelCache = { addressToPins: { "1 W OLD ST": [{ pin: "P1", last: 2026 }] }, unitsByPinYear: { "P1:2025": unit } };
  const before = cacheKeys(cache);
  cache.addressToPins["2 W NEW ST"] = [{ pin: "P2", last: 2026 }];
  cache.addressToPins["3 W MISS ST"] = [];
  cache.unitsByPinYear["P2:2025"] = unit;
  cache.unitsByPinYear["P3:2025"] = null;
  const calls: { text: string; values?: unknown[] }[] = [];
  const written = await saveParcelCacheDb({ query: async (text, values) => { calls.push({ text, values }); return { rows: [] }; } }, cache, before);
  assert.equal(written, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ["address", "2 W NEW ST", JSON.stringify([{ pin: "P2", last: 2026 }]), "units", "P2:2025", JSON.stringify(unit)]);
  assert.match(calls[0].text, /on conflict \(kind, key\) do update/);
});

test("cache entries written by older shapes are ignored and re-resolved", () => {
  const dir = mkdtempSync(join(tmpdir(), "parcels-"));
  writeFileSync(join(dir, "parcels.json"), JSON.stringify({
    addressToPin: { "474 N MILWAUKEE AVE": "17091050290000" },
    addressToPins: { "478 N MILWAUKEE AVE": ["17091050300000", "17091050320000"], "6330 W IRVING PARK RD": [{ pin: "13173110470000", last: 2026 }] },
    unitsByPinYear: {
      "17091050290000:2025": { pin: "17091050290000", year: 2025, cls: "593", units: 0, source: "class_other" },
      "13173110470000:2024": { pin: "13173110470000", year: 2024, cls: "212", units: 5, source: "improvement_chars", sig: "bldg:212|Five|13968|1927" },
    },
  }));
  const cache = loadParcelCache(dir);
  assert.deepEqual(Object.keys(cache.addressToPins), ["6330 W IRVING PARK RD"]);
  assert.deepEqual(Object.keys(cache.unitsByPinYear), ["13173110470000:2024"]);
});
