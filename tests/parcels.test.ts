import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cacheKeys, loadParcelCache, pin14, pinsForAddress, pruneParcelCache, saveParcelCacheDb, type ParcelCache, type ParcelUnits } from "../scripts/lib/parcels";

const rows = [
  { pin: "17091050290000", prop_address_full: "474 N MILWAUKEE AVE" },
  { pin: "17091050310000", prop_address_full: "474 N MILWAUKEE AVE" },
  { pin: "17091050300000", prop_address_full: "478 N MILWAUKEE AVE" },
  { pin: "17091050320000", prop_address_full: "478 N MILWAUKEE AVE" },
  { pin: "14311200150000", prop_address_full: "2129 N OAKLEY AVE" },
  { pin: "14311200151001", prop_address_full: "2129 N OAKLEY AVE UNIT 1" },
  { pin: "14311200151002", prop_address_full: "2129 N OAKLEY AVE UNIT 2" },
  { pin: "17221100101001", prop_address_full: "100 W MAIN ST UNIT 1" },
  { pin: "17221100101002", prop_address_full: "100 W MAIN ST UNIT 2" },
  { pin: "17221100101002", prop_address_full: "100 W MAIN ST UNIT 2" },
  { pin: "17221100200000", prop_address_full: "1000 W MAIN ST" },
];

test("every parcel at an address, exact matches first, sorted, deduplicated", () => {
  assert.deepEqual(pinsForAddress(rows, "474 N MILWAUKEE AVE"), ["17091050290000", "17091050310000"]);
  assert.deepEqual(pinsForAddress([...rows].reverse(), "474 N MILWAUKEE AVE"), ["17091050290000", "17091050310000"], "independent of API order");
  assert.deepEqual(pinsForAddress(rows, "2129 N OAKLEY AVE"), ["14311200150000"], "the base parcel wins over condo units");
  assert.deepEqual(pinsForAddress(rows, "100 W MAIN ST"), ["17221100101001", "17221100101002"], "condo units when there is no base parcel; 1000 W is not 100 W");
  assert.deepEqual(pinsForAddress(rows, "9 W NOWHERE ST"), []);
});

test("pin14 pads the city's 10-digit PINs", () => {
  assert.equal(pin14("1709105016"), "17091050160000");
  assert.equal(pin14("17-09-105-016"), "17091050160000");
  assert.equal(pin14("17091050160000"), "17091050160000");
});

test("misses are kept for the run but never saved", () => {
  const unit: ParcelUnits = { pin: "17091050310000", year: 2025, cls: "212", units: 3, source: "improvement_chars" };
  const cache: ParcelCache = {
    addressToPins: { "474 N MILWAUKEE AVE": ["17091050290000", "17091050310000"], "9 W NOWHERE ST": [] },
    unitsByPinYear: { "17091050310000:2025": unit, "17091050290000:2025": null },
  };
  assert.deepEqual(pruneParcelCache(cache), { addressToPins: { "474 N MILWAUKEE AVE": ["17091050290000", "17091050310000"] }, unitsByPinYear: { "17091050310000:2025": unit } });
});

test("the database cache writes only what a run added", async () => {
  const unit: ParcelUnits = { pin: "P2", year: 2025, cls: "202", units: 1, source: "class_sfr" };
  const cache: ParcelCache = { addressToPins: { "1 W OLD ST": ["P1"] }, unitsByPinYear: { "P1:2025": unit } };
  const before = cacheKeys(cache);
  cache.addressToPins["2 W NEW ST"] = ["P2"];
  cache.addressToPins["3 W MISS ST"] = [];
  cache.unitsByPinYear["P2:2025"] = unit;
  cache.unitsByPinYear["P3:2025"] = null;
  const calls: { text: string; values?: unknown[] }[] = [];
  const written = await saveParcelCacheDb({ query: async (text, values) => { calls.push({ text, values }); return { rows: [] }; } }, cache, before);
  assert.equal(written, 2);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].values, ["address", "2 W NEW ST", JSON.stringify(["P2"]), "units", "P2:2025", JSON.stringify(unit)]);
  assert.match(calls[0].text, /on conflict \(kind, key\) do update/);
});

test("a cache file from before the all-parcels change is read without its address entries", () => {
  const dir = mkdtempSync(join(tmpdir(), "parcels-"));
  writeFileSync(join(dir, "parcels.json"), JSON.stringify({ addressToPin: { "474 N MILWAUKEE AVE": "17091050290000" }, unitsByPinYear: { "17091050290000:2025": { pin: "17091050290000", year: 2025, cls: "593", units: 0, source: "class_other" } } }));
  const cache = loadParcelCache(dir);
  assert.deepEqual(cache.addressToPins, {});
  assert.equal(cache.unitsByPinYear["17091050290000:2025"]?.cls, "593");
});
