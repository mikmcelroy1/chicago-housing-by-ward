/**
 * Existing housing units and population per ward, the denominator for "net new units per 1,000 existing units".
 *
 * Source for v1: Cook County Assessor parcels (no API key needed). Single-family and condo PINs count 1 each,
 * 2-to-6-unit buildings use the assessor's apartment count, 7+ unit buildings use the commercial valuation
 * unit count. Population is the city's ACS-by-ward table. A Census 2020 block-level path is the intended
 * upgrade once a CENSUS_API_KEY and block centroids are wired in (see README).
 *
 *   npm run load-denominator              writes wards.units_2020 / pop_2020 in the database
 *   npm run load-denominator -- --dry-run writes data/fixtures/denominator.json for the fixture backend
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { soql } from "./lib/socrata";

const COOK = "datacatalog.cookcountyil.gov";
const CHI = "data.cityofchicago.org";
const DRY = process.argv.includes("--dry-run");
const YEAR = Number(process.argv[process.argv.indexOf("--year") + 1]) || 2025;

const SFR = new Set(["202", "203", "204", "205", "206", "207", "208", "209", "210", "234", "278", "295"]);
const WORD: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6 };

async function main() {
  const t0 = Date.now();
  console.log(`parcel universe ${YEAR}: pulling Chicago PINs ...`);
  mkdirSync(join(process.cwd(), "data", "cache"), { recursive: true });
  const cacheFile = join(process.cwd(), "data", "cache", `parcel-universe-${YEAR}.json`);
  let parcels: { pin: string; class: string; ward_num: string }[];
  if (process.argv.includes("--cache") && existsSync(cacheFile)) parcels = JSON.parse(readFileSync(cacheFile, "utf8"));
  else {
    parcels = await soql<{ pin: string; class: string; ward_num: string }>(COOK, "nj4t-kc8j", {
      select: "pin,class,ward_num",
      where: `year=${YEAR} AND ward_num IS NOT NULL`,
    });
    writeFileSync(cacheFile, JSON.stringify(parcels));
  }
  console.log(`  ${parcels.length} parcels in ${Math.round((Date.now() - t0) / 1000)}s`);
  // Condo PINs include deeded parking spaces and common areas, which are not dwellings.
  console.log("condo characteristics: excluding parking spaces and common areas ...");
  const notUnits = new Set(
    (await soql<{ pin: string }>(COOK, "3r7i-mrz4", { select: "pin", where: `year=${YEAR} AND (is_parking_space=true OR is_common_area=true)` })).map((r) => r.pin),
  );
  console.log(`  ${notUnits.size} condo PINs are parking or common area`);
  const wardOf = new Map<string, number>();
  const units = new Map<number, { sfr: number; condo: number; small: number; big: number; smallBldgs: number; bigBldgs: number }>();
  for (let w = 1; w <= 50; w++) units.set(w, { sfr: 0, condo: 0, small: 0, big: 0, smallBldgs: 0, bigBldgs: 0 });
  const smallPins = new Set<string>();
  const bigPins = new Set<string>();
  for (const p of parcels) {
    const w = Number(p.ward_num);
    if (!(w >= 1 && w <= 50)) continue;
    wardOf.set(p.pin, w);
    const cls = String(p.class).split(".")[0];
    const u = units.get(w)!;
    if (SFR.has(cls)) u.sfr++;
    else if (cls === "299" || cls === "399") { if (!notUnits.has(p.pin)) u.condo++; }
    else if (cls === "211" || cls === "212") smallPins.add(p.pin);
    else if (/^(3|9)\d\d$/.test(cls)) bigPins.add(p.pin);
  }
  console.log(`  ${smallPins.size} 2-6 unit parcels, ${bigPins.size} 7+ unit parcels`);

  console.log("improvement characteristics: apartment counts for 2-6 unit buildings ...");
  const chars = await soql<{ pin: string; char_apts: string | null }>(COOK, "x54s-btds", {
    select: "pin,char_apts",
    where: `year=${YEAR} AND class in('211','212')`,
  });
  const apts = new Map<string, number>();
  for (const c of chars) {
    const n = c.char_apts ? WORD[c.char_apts.toUpperCase()] : undefined;
    if (n) apts.set(c.pin, n);
  }
  for (const pin of smallPins) {
    const w = wardOf.get(pin)!;
    const u = units.get(w)!;
    u.small += apts.get(pin) ?? 2;
    u.smallBldgs++;
  }

  console.log("commercial valuation: unit counts for 7+ unit buildings ...");
  const comm = await soql<{ keypin: string; pins: string; year: string; tot_units: string }>(COOK, "csik-bsws", {
    select: "keypin,pins,year,tot_units",
    where: "tot_units IS NOT NULL AND tot_units > 0",
    order: "year DESC",
  });
  const seen = new Set<string>();
  for (const r of comm) {
    const key = r.keypin || r.pins;
    if (!key || seen.has(key)) continue;
    const pin = (r.pins ?? r.keypin).split(/[,; ]+/).map((s) => s.replace(/\D/g, "")).find((s) => s.length === 14 && wardOf.has(s));
    if (!pin) continue;
    seen.add(key);
    const u = units.get(wardOf.get(pin)!)!;
    u.big += Number(r.tot_units);
    u.bigBldgs++;
  }

  console.log("population: ACS by ward ...");
  const acs = await soql<{ ward: string; total_population: string; acs_year: string }>(CHI, "awnk-6fvc", { select: "ward,total_population,acs_year", order: "acs_year DESC", limit: 200 });
  const pop = new Map<number, number>();
  for (const r of acs) if (!pop.has(Number(r.ward))) pop.set(Number(r.ward), Math.round(Number(r.total_population)));

  const rows = [...units.entries()].map(([ward, u]) => ({ ward, units: u.sfr + u.condo + u.small + u.big, pop: pop.get(ward) ?? null, detail: u }));
  console.log(`\n${"ward".padStart(4)} ${"units".padStart(8)} ${"pop".padStart(8)} ${"sfr".padStart(7)} ${"condo".padStart(7)} ${"2-6u".padStart(7)} ${"7+u".padStart(7)}`);
  for (const r of rows) console.log(`${String(r.ward).padStart(4)} ${String(r.units).padStart(8)} ${String(r.pop ?? "?").padStart(8)} ${String(r.detail.sfr).padStart(7)} ${String(r.detail.condo).padStart(7)} ${String(r.detail.small).padStart(7)} ${String(r.detail.big).padStart(7)}`);
  const total = rows.reduce((s, r) => s + r.units, 0);
  console.log(`\ncity total ${total} units (Census 2020 counted about 1,240,000)`);
  if (total < 900_000 || total > 1_500_000) {
    console.error("!!! city total is outside the plausible range; not writing");
    process.exit(2);
  }

  if (DRY) {
    mkdirSync(join(process.cwd(), "data", "fixtures"), { recursive: true });
    const out = Object.fromEntries(rows.map((r) => [r.ward, { units_2020: r.units, pop_2020: r.pop, source: "assessor_parcels", detail: r.detail }]));
    writeFileSync(join(process.cwd(), "data", "fixtures", "denominator.json"), JSON.stringify(out, null, 1));
    console.log("wrote data/fixtures/denominator.json");
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    await client.query("insert into wards (ward) select generate_series(1,50) on conflict do nothing");
    for (const r of rows) {
      await client.query("update wards set units_2020 = $2, pop_2020 = $3, denominator_source = 'assessor_parcels' where ward = $1", [r.ward, r.units, r.pop]);
    }
    await client.query("commit");
    console.log("wards.units_2020 / pop_2020 updated for 50 wards");
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
