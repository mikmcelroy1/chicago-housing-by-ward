/**
 * Cook County Assessor lookups for demolitions: address -> every parcel at that address, and parcel -> unit count
 * the year before the permit.
 *
 * Results are cached so a nightly run only asks about new permits: in the parcel_cache table when the ETL has a
 * database (migration 003), otherwise in data/cache/parcels.json. Misses (no parcel at an address, no record for a
 * parcel) are kept for the run but never saved, so they are retried next time and self-heal once the assessor
 * publishes the data.
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
  /** "474 N MILWAUKEE AVE" -> every 14-digit PIN the assessor files at that address, sorted. Empty = none (not saved). */
  addressToPins: Record<string, string[]>;
  /** "17091050310000:2025" -> the record used, or null when the parcel has no record in that year or the two before (not saved). */
  unitsByPinYear: Record<string, ParcelUnits | null>;
}
export interface ParcelUnits {
  pin: string;
  year: number;
  cls: string | null;
  units: number | null;   // null = unknown for this class
  source: "improvement_chars" | "class_sfr" | "class_vacant" | "commercial_valuation" | "class_other";
}

export function emptyParcelCache(): ParcelCache {
  return { addressToPins: {}, unitsByPinYear: {} };
}

/** Drop misses so they are retried next run. */
export function pruneParcelCache(cache: ParcelCache): ParcelCache {
  return {
    addressToPins: Object.fromEntries(Object.entries(cache.addressToPins).filter(([, pins]) => pins.length > 0)),
    unitsByPinYear: Object.fromEntries(Object.entries(cache.unitsByPinYear).filter(([, r]) => r !== null)),
  };
}

// --- file cache (dry runs and local development) --------------------------------------------------

export function loadParcelCache(cacheDir = join(process.cwd(), "data", "cache")): ParcelCache {
  mkdirSync(cacheDir, { recursive: true });
  const p = join(cacheDir, "parcels.json");
  if (!existsSync(p)) return emptyParcelCache();
  // Files written before October 2026 had addressToPin (one PIN per address); those entries are re-resolved.
  const raw = JSON.parse(readFileSync(p, "utf8")) as Partial<ParcelCache>;
  return { addressToPins: raw.addressToPins ?? {}, unitsByPinYear: raw.unitsByPinYear ?? {} };
}
export function saveParcelCache(cache: ParcelCache, cacheDir = join(process.cwd(), "data", "cache")): void {
  writeFileSync(join(cacheDir, "parcels.json"), JSON.stringify(pruneParcelCache(cache)));
}

// --- database cache (parcel_cache table) -----------------------------------------------------------

export interface Queryable {
  query(text: string, values?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}
export interface CacheKeys {
  addresses: Set<string>;
  units: Set<string>;
}

/** The keys present now, taken before a run so saveParcelCacheDb only writes what the run added. */
export function cacheKeys(cache: ParcelCache): CacheKeys {
  return { addresses: new Set(Object.keys(cache.addressToPins)), units: new Set(Object.keys(cache.unitsByPinYear)) };
}

export async function loadParcelCacheDb(db: Queryable): Promise<ParcelCache> {
  const cache = emptyParcelCache();
  const { rows } = await db.query("select kind, key, value from parcel_cache");
  for (const r of rows) {
    if (r.kind === "address") cache.addressToPins[String(r.key)] = r.value as string[];
    else if (r.kind === "units") cache.unitsByPinYear[String(r.key)] = r.value as ParcelUnits;
  }
  return cache;
}

/** Upsert the hits added since `before`. Returns how many rows were written. */
export async function saveParcelCacheDb(db: Queryable, cache: ParcelCache, before: CacheKeys): Promise<number> {
  const pruned = pruneParcelCache(cache);
  const rows: [string, string, unknown][] = [];
  for (const [k, v] of Object.entries(pruned.addressToPins)) if (!before.addresses.has(k)) rows.push(["address", k, v]);
  for (const [k, v] of Object.entries(pruned.unitsByPinYear)) if (!before.units.has(k)) rows.push(["units", k, v]);
  for (const batch of chunk(rows, 500)) {
    const params: unknown[] = [];
    const tuples = batch.map(([kind, key, value]) => {
      params.push(kind, key, JSON.stringify(value));
      const b = params.length - 3;
      return `($${b + 1},$${b + 2},$${b + 3}::jsonb)`;
    });
    await db.query(
      `insert into parcel_cache (kind, key, value) values ${tuples.join(",")}
       on conflict (kind, key) do update set value = excluded.value, updated_at = now()`,
      params,
    );
  }
  return rows.length;
}

// --- lookups ----------------------------------------------------------------------------------------

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

/**
 * Every parcel the assessor files at an address. Parcels whose address is exactly the permit's win (a building on
 * a double lot, or an assemblage, is several of them); only when there are none do parcels whose address starts
 * with it count (condo units, a rear building). Sorted, so the result never depends on the order the API returned.
 */
export function pinsForAddress(rows: { pin: string; prop_address_full: string }[], address: string): string[] {
  const exact = rows.filter((r) => r.prop_address_full === address);
  const hits = exact.length ? exact : rows.filter((r) => r.prop_address_full.startsWith(address + " "));
  return [...new Set(hits.map((r) => pin14(r.pin)))].sort();
}

/** Resolve addresses to parcels in batches of 40 against the assessor's address table. */
export async function resolveAddresses(addresses: string[], cache: ParcelCache): Promise<void> {
  const todo = [...new Set(addresses.map(normalizeAddress))].filter((a) => a && !(a in cache.addressToPins));
  for (const batch of chunk(todo, 40)) {
    const where = `prop_address_city_name='CHICAGO' AND (${batch.map((a) => `starts_with(prop_address_full, ${lit(a + " ")}) OR prop_address_full=${lit(a)}`).join(" OR ")})`;
    const rows = await soql<{ pin: string; prop_address_full: string }>(COOK, ADDRESSES, {
      select: "pin,prop_address_full",
      where,
      group: "pin,prop_address_full",
      order: "pin",
      limit: 20_000,
    });
    for (const a of batch) cache.addressToPins[a] = pinsForAddress(rows, a);
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
