/**
 * Cook County Assessor lookups for demolitions: address -> PIN, and PIN -> unit count the year before the permit.
 * Results are cached in data/cache/parcels.json so a nightly run only looks up new permits.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { soql, lit } from "./socrata";

const COOK = "datacatalog.cookcountyil.gov";
const ADDRESSES = "3723-97qp";     // Assessor - Parcel Addresses
const IMPROVEMENTS = "x54s-btds";  // Assessor - Single and Multi-Family Improvement Characteristics
const UNIVERSE = "nj4t-kc8j";      // Assessor - Parcel Universe
const COMMERCIAL = "csik-bsws";    // Assessor - Commercial Valuation Data

const SFR_CLASSES = new Set(["202", "203", "204", "205", "206", "207", "208", "209", "210", "234", "278", "295"]);
const SMALL_MULTI = new Set(["211", "212"]);
const WORD: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6 };

export interface ParcelCache {
  addressToPin: Record<string, string | null>;        // "2129 N OAKLEY AVE" -> 14-digit pin
  unitsByPinYear: Record<string, ParcelUnits | null>; // "14311200150000:2025" -> result
}
export interface ParcelUnits {
  pin: string;
  year: number;
  cls: string | null;
  units: number | null;   // null = unknown for this class
  source: "improvement_chars" | "class_sfr" | "class_vacant" | "commercial_valuation" | "class_other";
}

export function loadParcelCache(cacheDir = join(process.cwd(), "data", "cache")): ParcelCache {
  mkdirSync(cacheDir, { recursive: true });
  const p = join(cacheDir, "parcels.json");
  if (!existsSync(p)) return { addressToPin: {}, unitsByPinYear: {} };
  return JSON.parse(readFileSync(p, "utf8")) as ParcelCache;
}
export function saveParcelCache(cache: ParcelCache, cacheDir = join(process.cwd(), "data", "cache")): void {
  writeFileSync(join(cacheDir, "parcels.json"), JSON.stringify(cache));
}

export function pin14(pin10: string): string {
  const digits = pin10.replace(/\D/g, "");
  return digits.length === 10 ? digits + "0000" : digits.padEnd(14, "0").slice(0, 14);
}

/** "2129 N OAKLEY AVE" as the assessor spells it (no unit suffix). */
export function normalizeAddress(address: string): string {
  return address.toUpperCase().replace(/\s+/g, " ").replace(/\.$/, "").trim();
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/** Resolve addresses to PINs in batches of 40 using starts_with on the assessor's address table. */
export async function resolveAddresses(addresses: string[], cache: ParcelCache): Promise<void> {
  const todo = [...new Set(addresses.map(normalizeAddress))].filter((a) => !(a in cache.addressToPin));
  for (const batch of chunk(todo, 40)) {
    const where = `prop_address_city_name='CHICAGO' AND (${batch.map((a) => `starts_with(prop_address_full, ${lit(a + " ")}) OR prop_address_full=${lit(a)}`).join(" OR ")})`;
    const rows = await soql<{ pin: string; year: string; prop_address_full: string }>(COOK, ADDRESSES, {
      select: "pin,year,prop_address_full",
      where,
      order: "year DESC",
      limit: 5000,
    });
    for (const a of batch) {
      // Prefer an exact match, then the shortest address that starts with it (the base parcel, not a condo unit).
      const hits = rows.filter((r) => r.prop_address_full === a || r.prop_address_full.startsWith(a + " "));
      hits.sort((x, y) => x.prop_address_full.length - y.prop_address_full.length || Number(y.year) - Number(x.year));
      cache.addressToPin[a] = hits[0]?.pin ?? null;
    }
  }
}

/** Unit count for each (pin, year) from the assessor, trying the requested year then up to two earlier ones. */
export async function resolveUnits(items: { pin: string; year: number }[], cache: ParcelCache): Promise<void> {
  const want = new Map<string, { pin: string; year: number }>();
  for (const it of items) {
    const key = `${it.pin}:${it.year}`;
    if (!(key in cache.unitsByPinYear)) want.set(key, it);
  }
  const pins = [...new Set([...want.values()].map((w) => w.pin))];
  const years = [...new Set([...want.values()].flatMap((w) => [w.year, w.year - 1, w.year - 2]))];
  const improv = new Map<string, { cls: string; apts: string | null }>(); // "pin:year"
  const universe = new Map<string, string>(); // "pin:year" -> class
  const commercial = new Map<string, number>(); // pin -> tot_units (latest year)
  for (const batch of chunk(pins, 50)) {
    const inPins = batch.map(lit).join(",");
    const inYears = years.join(",");
    const rows = await soql<{ pin: string; year: string; class: string; char_apts: string | null }>(COOK, IMPROVEMENTS, {
      select: "pin,year,class,char_apts",
      where: `pin in(${inPins}) AND year in(${inYears})`,
      limit: 5000,
    });
    for (const r of rows) improv.set(`${r.pin}:${Math.trunc(Number(r.year))}`, { cls: String(r.class).split(".")[0], apts: r.char_apts });
    const urows = await soql<{ pin: string; year: string; class: string }>(COOK, UNIVERSE, {
      select: "pin,year,class",
      where: `pin in(${inPins}) AND year in(${inYears})`,
      limit: 5000,
    });
    for (const r of urows) universe.set(`${r.pin}:${Math.trunc(Number(r.year))}`, String(r.class).split(".")[0]);
    const crows = await soql<{ keypin: string; pins: string; year: string; tot_units: string }>(COOK, COMMERCIAL, {
      select: "keypin,pins,year,tot_units",
      where: `(${batch.map((p) => `pins like ${lit("%" + p + "%")}`).join(" OR ")})`,
      order: "year DESC",
      limit: 5000,
    });
    for (const r of crows) {
      for (const p of batch) if ((r.pins ?? "").includes(p) && !commercial.has(p) && r.tot_units) commercial.set(p, Number(r.tot_units));
    }
  }
  for (const [key, it] of want) {
    let result: ParcelUnits | null = null;
    for (const y of [it.year, it.year - 1, it.year - 2]) {
      const k = `${it.pin}:${y}`;
      const imp = improv.get(k);
      const cls = imp?.cls ?? universe.get(k) ?? null;
      if (!cls) continue;
      if (SMALL_MULTI.has(cls)) {
        const n = imp?.apts ? WORD[imp.apts.toUpperCase()] ?? null : null;
        result = { pin: it.pin, year: y, cls, units: n ?? 2, source: "improvement_chars" };
      } else if (SFR_CLASSES.has(cls)) result = { pin: it.pin, year: y, cls, units: 1, source: "class_sfr" };
      else if (/^1\d\d$/.test(cls) || cls === "0" || cls === "100") result = { pin: it.pin, year: y, cls, units: 0, source: "class_vacant" };
      else if (/^(3|9)\d\d$/.test(cls)) {
        const n = commercial.get(it.pin) ?? null;
        result = { pin: it.pin, year: y, cls, units: n, source: n === null ? "class_other" : "commercial_valuation" };
      } else if (cls === "299" || cls === "399") result = { pin: it.pin, year: y, cls, units: 1, source: "class_other" };
      else result = { pin: it.pin, year: y, cls, units: 0, source: "class_other" };
      break;
    }
    cache.unitsByPinYear[key] = result;
  }
}
