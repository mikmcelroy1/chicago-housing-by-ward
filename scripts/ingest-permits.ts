/**
 * Nightly ETL: pull every permit issued since the 2023 ward map, classify, resolve demolition unit counts
 * against the assessor, build projects, attribute to alder tenures, and load Supabase.
 *
 *   npm run etl                       full run against DATABASE_URL
 *   npm run etl -- --dry-run          no database: writes data/fixtures/snapshot.json + data/review-queue.csv
 *   npm run etl -- --cache            reuse data/cache/permits.json instead of re-pulling (dev)
 *   npm run etl -- --no-parcels       skip assessor lookups (dev)
 *   npm run etl -- --since 2025-10-01 narrower window (dev)
 *
 * Fails loudly (exit 2) when the pull looks wrong (too few rows, no recent permits) so a cron run goes red
 * instead of silently loading a partial window. A live run also goes red, after loading, when a golden-list permit
 * (data/golden.csv) disagrees or when a project drifted with the same permits and the same code (data/drift.csv).
 */
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { soql, lit } from "./lib/socrata";
import { parseCsv, toCsv } from "./lib/csv";
import { classify } from "./lib/rules";
import { loadWardPolygons, wardAt as wardAtPolys, haversine } from "./lib/geo";
import {
  cacheKeys,
  loadParcelCache,
  loadParcelCacheDb,
  normalizeAddress,
  pin14,
  resolveAddresses,
  liveParcels,
  resolveUnits,
  saveParcelCache,
  saveParcelCacheDb,
  type ParcelCache,
  type Queryable,
} from "./lib/parcels";
import { findDrift, type DriftRow, type PreviousProject } from "./lib/drift";
import { checkGoldenRun, loadGolden, type GoldenMismatch } from "./lib/golden";
import { buildProjects, type ClassifiedPermit } from "./lib/projects";
import type { AlderTenure, Override, ParcelLookup, Permit, Project, Snapshot, WardFlag, WardRow } from "./lib/types";

const CHI = "data.cityofchicago.org";
const PERMITS = "ydr8-5enu";
const AFFORDABLE = "s6ha-ppgi";
const WINDOW_START = "2023-05-15";
const ROOT = process.cwd();
const DATA = join(ROOT, "data");
const CACHE = join(DATA, "cache");

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const argVal = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = flags.has("--dry-run");
const USE_CACHE = flags.has("--cache");
const NO_PARCELS = flags.has("--no-parcels");
const SINCE = argVal("--since") ?? WINDOW_START;
/** The code that ran, for the drift alarm: GitHub sets GITHUB_SHA; locally, ask git. */
const COMMIT: string | null = process.env.GITHUB_SHA ?? (() => {
  try {
    return execSync("git rev-parse HEAD", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || null;
  } catch {
    return null;
  }
})();

interface RawPermit {
  id: string; permit_: string; permit_type: string; review_type?: string; issue_date: string; permit_status?: string;
  street_number?: string; street_direction?: string; street_name?: string; work_description?: string; reported_cost?: string;
  pin_list?: string; ward?: string; latitude?: string; longitude?: string;
  contact_1_type?: string; contact_1_name?: string; contact_2_type?: string; contact_2_name?: string; contact_3_type?: string; contact_3_name?: string;
}

function toPermit(r: RawPermit): Permit {
  const num = (v: string | undefined) => (v === undefined || v === "" ? null : Number(v));
  const rec = r as unknown as Record<string, string | undefined>;
  const contacts = [1, 2, 3]
    .map((i) => ({ type: rec[`contact_${i}_type`] ?? "", name: rec[`contact_${i}_name`] ?? "" }))
    .filter((c) => c.name);
  return {
    id: r.id,
    permit_no: r.permit_,
    permit_type: r.permit_type,
    review_type: r.review_type ?? null,
    issue_date: r.issue_date.slice(0, 10),
    status: r.permit_status ?? null,
    address: [r.street_number, r.street_direction, r.street_name].filter(Boolean).join(" ").trim(),
    lat: num(r.latitude),
    lon: num(r.longitude),
    ward: num(r.ward),
    pins: (r.pin_list ?? "").split("|").map((s) => s.trim()).filter(Boolean),
    description: r.work_description ?? "",
    reported_cost: num(r.reported_cost),
    contacts,
  };
}

async function pullPermits(): Promise<{ permits: Permit[]; raw: Map<string, RawPermit> }> {
  mkdirSync(CACHE, { recursive: true });
  const cacheFile = join(CACHE, `permits-${SINCE}.json`);
  let rows: RawPermit[];
  if (USE_CACHE && existsSync(cacheFile)) {
    rows = JSON.parse(readFileSync(cacheFile, "utf8")) as RawPermit[];
    console.log(`permits: ${rows.length} from cache`);
  } else {
    const t0 = Date.now();
    rows = await soql<RawPermit>(CHI, PERMITS, {
      select: "id,permit_,permit_type,review_type,issue_date,permit_status,street_number,street_direction,street_name,work_description,reported_cost,pin_list,ward,latitude,longitude,contact_1_type,contact_1_name,contact_2_type,contact_2_name,contact_3_type,contact_3_name",
      where: `issue_date >= ${lit(SINCE)}`,
      order: "issue_date,:id",
    });
    writeFileSync(cacheFile, JSON.stringify(rows));
    console.log(`permits: ${rows.length} pulled in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  const perYearFloor = 20_000;
  const years = (Date.now() - Date.parse(SINCE)) / (365.25 * 86_400_000);
  if (rows.length < perYearFloor * Math.min(years, 1)) {
    console.error(`!!! only ${rows.length} permits since ${SINCE}; expected at least ${perYearFloor}/year`);
    process.exit(2);
  }
  const newest = rows.reduce((m, r) => (r.issue_date > m ? r.issue_date : m), "");
  if (Date.now() - Date.parse(newest) > 14 * 86_400_000) {
    console.error(`!!! newest permit is ${newest.slice(0, 10)}; the feed looks stale`);
    process.exit(2);
  }
  return { permits: rows.map(toPermit), raw: new Map(rows.map((r) => [r.id, r])) };
}

function loadCsvs(): { tenures: AlderTenure[]; wardFlags: WardFlag[]; overrides: Map<string, Override> } {
  const tenures = parseCsv(readFileSync(join(DATA, "alder_tenure.csv"), "utf8")).map((r) => ({
    id: r.id, ward: Number(r.ward), name: r.name, photo_url: r.photo_url || null, start_date: r.start_date, end_date: r.end_date || null, source_url: r.source_url || null,
  }));
  if (tenures.length < 50) throw new Error(`alder_tenure.csv has ${tenures.length} rows; expected at least 50`);
  const wardFlags = parseCsv(readFileSync(join(DATA, "ward_flags.csv"), "utf8")).map((r) => ({
    ward: Number(r.ward), flag: r.flag, value: r.value, source_url: r.source_url || null, as_of: r.as_of || null,
  }));
  const overrides = new Map<string, Override>();
  for (const r of parseCsv(readFileSync(join(DATA, "overrides.csv"), "utf8"))) {
    overrides.set(r.permit_id, { permit_id: r.permit_id, category: (r.category || "") as Override["category"], units: r.units === "" ? null : Number(r.units), note: r.note });
  }
  return { tenures, wardFlags, overrides };
}

/** One short-lived connection per phase, so a long run never sits on an idle pooler session. */
async function withDb<T>(fn: (db: Client) => Promise<T>): Promise<T> {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (use --dry-run for an offline run)");
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}
const queryable = (db: Client): Queryable => ({ query: (text, values) => db.query(text, values) });

/**
 * Demolitions without a stated unit count: the permit's own PINs, else every parcel the assessor files at its
 * address, each looked up for the year before the permit. The permit's units are the parcels' units added
 * together; buildProjects later merges permits at one address so each parcel counts once.
 */
async function resolveDemolitions(items: ClassifiedPermit[], resolvedPins: Map<string, string[]>, cache: ParcelCache): Promise<void> {
  const demos = items.filter(({ cls }) => (cls.category === "demolition" || cls.category === "emergency_demolition") && cls.units === null);
  await resolveAddresses(demos.filter(({ permit }) => permit.pins.length === 0).map(({ permit }) => permit.address), cache);
  const lookups: { item: ClassifiedPermit; pins: string[]; year: number }[] = [];
  for (const item of demos) {
    const year = Number(item.permit.issue_date.slice(0, 4)) - 1;
    let pins: string[];
    if (item.permit.pins.length) pins = [...new Set(item.permit.pins.map(pin14))].sort();
    else {
      // The county renumbers lots; a retired PIN would count the same building twice.
      const { live, retired } = liveParcels(cache.addressToPins[normalizeAddress(item.permit.address)] ?? [], year);
      pins = live;
      if (retired.length) item.cls.notes.push(`retired parcels left out: ${retired.join(", ")}`);
    }
    if (!pins.length) {
      item.cls.parcels = [];
      item.cls.notes.push("no assessor parcel at this address");
      continue;
    }
    lookups.push({ item, pins, year });
  }
  await resolveUnits(lookups.flatMap(({ pins, year }) => pins.map((pin) => ({ pin, year }))), cache);
  let hit = 0;
  for (const { item, pins, year } of lookups) {
    resolvedPins.set(item.permit.id, pins);
    const parcels: ParcelLookup[] = pins.map((pin) => {
      const r = cache.unitsByPinYear[`${pin}:${year}`];
      item.cls.notes.push(
        r
          ? `assessor ${pin}: class ${r.cls} ${r.units === null ? "has no unit count" : `= ${r.units} units`} (${r.source}, ${r.year})`
          : `assessor ${pin}: no record for ${year - 2}-${year}`,
      );
      return { pin, cls: r?.cls ?? null, units: r?.units ?? null, year: r?.year ?? null, sig: r?.sig ?? null };
    });
    item.cls.parcels = parcels;
    // One building on several lots carries the same record on each lot: count it once.
    const seen = new Set<string>();
    const known: ParcelLookup[] = [];
    for (const p of parcels) {
      if (p.units === null) continue;
      const k = p.sig ?? p.pin;
      if (seen.has(k)) continue;
      seen.add(k);
      known.push(p);
    }
    if (known.length) {
      item.cls.units = known.reduce((s, p) => s + (p.units ?? 0), 0);
      item.cls.units_source = "assessor";
      const dupes = parcels.filter((p) => p.units !== null).length - known.length;
      if (dupes > 0) item.cls.notes.push(`${dupes} parcel${dupes === 1 ? " carries" : "s carry"} the same building record and counted once`);
      if (known.length > 1) item.cls.notes.push(`summed across ${known.length} parcels`);
      hit++;
    }
    // A class the assessor files but gives no unit count for (large apartment buildings without a valuation row).
    if (parcels.some((p) => p.cls !== null && p.units === null)) item.cls.needs_review = true;
  }
  const parcelCount = lookups.reduce((s, l) => s + l.pins.length, 0);
  console.log(`demolitions: ${demos.length} needed a lookup, ${lookups.length} resolved to ${parcelCount} parcels, ${hit} got a unit count`);
}

async function loadAffordable(): Promise<{ lat: number; lon: number }[]> {
  const rows = await soql<{ latitude?: string; longitude?: string }>(CHI, AFFORDABLE, { select: "latitude,longitude" });
  return rows.filter((r) => r.latitude && r.longitude).map((r) => ({ lat: Number(r.latitude), lon: Number(r.longitude) }));
}

function writeReviewQueue(items: ClassifiedPermit[]): number {
  const rows = items
    .filter(({ cls }) => cls.needs_review)
    .sort((a, b) => b.permit.issue_date.localeCompare(a.permit.issue_date))
    .map(({ permit, cls }) => [permit.id, permit.issue_date, permit.ward, permit.permit_type, permit.address, cls.category, cls.units, cls.notes.join("; "), permit.description.slice(0, 400)]);
  writeFileSync(join(DATA, "review-queue.csv"), toCsv(["permit_id", "issue_date", "ward", "permit_type", "address", "category", "units", "notes", "description"], rows));
  return rows.length;
}

/** Last run's projects and commit, read before they are replaced, for the drift alarm. */
async function previousRun(client: Client): Promise<{ commit: string | null; projects: PreviousProject[] }> {
  const run = (await client.query("select commit from etl_runs where status = 'ok' order by id desc limit 1")).rows[0] as { commit: string | null } | undefined;
  const rows = (await client.query(
    `select p.id, p.kind, p.units_delta, p.replaced_units, p.address, p.ward,
            coalesce((select array_agg(pp.permit_id order by pp.permit_id) from project_permits pp where pp.project_id = p.id), '{}') as permit_ids
     from projects p`,
  )).rows as PreviousProject[];
  return { commit: run?.commit ?? null, projects: rows };
}

async function loadDatabase(client: Client, permits: Permit[], raw: Map<string, RawPermit>, items: ClassifiedPermit[], projects: Project[], tenures: AlderTenure[], wardFlags: WardFlag[], resolvedPins: Map<string, string[]>, counts: Record<string, number>): Promise<{ drift: DriftRow[]; codeChanged: boolean }> {
  // Drift: same project, same permits, different units or kind. With the same code that is data moving, not us.
  const previous = await previousRun(client);
  const drift = findDrift(previous.projects, projects);
  const codeChanged = previous.commit === null || COMMIT === null || previous.commit !== COMMIT;
  counts.drift = drift.length;
  counts.drift_code_changed = codeChanged ? 1 : 0;
  const run = await client.query("insert into etl_runs (commit) values ($1) returning id", [COMMIT]);
  const runId = run.rows[0].id as number;
  try {
    await client.query("begin");
    // Classifications and projects are rebuilt from scratch every run. Clear them first: projects
    // reference alder_tenures, which is reloaded from the CSV below.
    await client.query("delete from project_permits");
    await client.query("delete from projects");
    await client.query("delete from permit_class");
    await client.query(`insert into wards (ward) select generate_series(1,50) on conflict do nothing`);
    await client.query("delete from alder_tenures");
    for (const t of tenures) {
      await client.query("insert into alder_tenures (id, ward, name, photo_url, start_date, end_date, source_url) values ($1,$2,$3,$4,$5,$6,$7)", [t.id, t.ward, t.name, t.photo_url, t.start_date, t.end_date, t.source_url]);
    }
    await client.query("update wards set alder_current = t.name from alder_tenures t where t.ward = wards.ward and t.end_date is null");
    await client.query("delete from ward_flags");
    for (const f of wardFlags) {
      await client.query("insert into ward_flags (ward, flag, value, source_url, as_of) values ($1,$2,$3,$4,$5)", [f.ward, f.flag, f.value, f.source_url, f.as_of]);
    }
    // Permits: upsert in chunks, then soft-delete anything in the window the city no longer returns.
    const CHUNK = 500;
    for (let i = 0; i < permits.length; i += CHUNK) {
      const chunk = permits.slice(i, i + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((p) => {
        params.push(p.id, p.permit_no, p.permit_type, p.review_type, p.issue_date, p.status, p.address, p.lat, p.lon, p.ward, p.pins, p.description, p.reported_cost, JSON.stringify(p.contacts), JSON.stringify(raw.get(p.id)));
        const b = params.length - 15;
        return `(${Array.from({ length: 15 }, (_, k) => `$${b + k + 1}`).join(",")})`;
      });
      await client.query(
        `insert into permits (id, permit_no, permit_type, review_type, issue_date, status, address, lat, lon, ward, pins, description, reported_cost, contacts, raw)
         values ${tuples.join(",")}
         on conflict (id) do update set permit_no = excluded.permit_no, permit_type = excluded.permit_type, review_type = excluded.review_type,
           issue_date = excluded.issue_date, status = excluded.status, address = excluded.address, lat = excluded.lat, lon = excluded.lon,
           ward = excluded.ward, pins = excluded.pins, description = excluded.description, reported_cost = excluded.reported_cost,
           contacts = excluded.contacts, raw = excluded.raw, fetched_at = now(), voided_at = null`,
        params,
      );
    }
    const voided = await client.query(
      "update permits set voided_at = current_date where issue_date >= $1 and voided_at is null and id <> all($2::text[])",
      [SINCE, permits.map((p) => p.id)],
    );
    counts.voided_this_run = voided.rowCount ?? 0;
    for (let i = 0; i < items.length; i += CHUNK) {
      const chunk = items.slice(i, i + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map(({ permit, cls }) => {
        const pins = resolvedPins.get(permit.id) ?? [];
        params.push(permit.id, cls.category, cls.units, cls.units_source, cls.needs_review, cls.notes, pins[0] ?? null, pins);
        const b = params.length - 8;
        return `(${Array.from({ length: 8 }, (_, k) => `$${b + k + 1}`).join(",")})`;
      });
      await client.query(`insert into permit_class (permit_id, category, units, units_source, needs_review, notes, resolved_pin, resolved_pins) values ${tuples.join(",")}`, params);
    }
    for (let i = 0; i < projects.length; i += CHUNK) {
      const chunk = projects.slice(i, i + CHUNK);
      const params: unknown[] = [];
      const tuples = chunk.map((p) => {
        params.push(p.id, p.project_key, p.kind, p.ward, p.units_delta, p.counted, p.first_issue_date, p.primary_permit_id, p.permit_no, p.address, p.lat, p.lon, p.alder_tenure_id, p.subsidized, p.replaced_units, p.merged_into, p.status, p.description, p.reported_cost, p.review_type, p.needs_review, p.ward_geom_mismatch, p.flags);
        const b = params.length - 23;
        return `(${Array.from({ length: 23 }, (_, k) => `$${b + k + 1}`).join(",")})`;
      });
      await client.query(
        `insert into projects (id, project_key, kind, ward, units_delta, counted, first_issue_date, primary_permit_id, permit_no, address, lat, lon, alder_tenure_id, subsidized, replaced_units, merged_into, status, description, reported_cost, review_type, needs_review, ward_geom_mismatch, flags) values ${tuples.join(",")}`,
        params,
      );
      const links: unknown[] = [];
      const ltuples: string[] = [];
      for (const p of chunk) for (const pid of p.permit_ids) {
        links.push(p.id, pid);
        ltuples.push(`($${links.length - 1},$${links.length})`);
      }
      if (ltuples.length) await client.query(`insert into project_permits (project_id, permit_id) values ${ltuples.join(",")}`, links);
    }
    await client.query("update etl_runs set finished_at = now(), status = 'ok', counts = $2 where id = $1", [runId, JSON.stringify(counts)]);
    await client.query("commit");
    console.log(`database: loaded ${permits.length} permits, ${items.length} classifications, ${projects.length} projects (run ${runId})`);
  } catch (err) {
    await client.query("rollback").catch(() => {});
    await client.query("update etl_runs set finished_at = now(), status = 'failed', error = $2 where id = $1", [runId, String(err)]).catch(() => {});
    throw err;
  }
  if (process.env.VERCEL_DEPLOY_HOOK) {
    const res = await fetch(process.env.VERCEL_DEPLOY_HOOK, { method: "POST" });
    console.log(`deploy hook: ${res.status}`);
  }
  return { drift, codeChanged };
}

/** Golden-list check: the final numbers for every permit we have checked by hand. Mismatches go to data/golden-mismatches.csv. */
function checkGolden(items: ClassifiedPermit[], projects: Project[], counts: Record<string, number>): GoldenMismatch[] {
  const golden = loadGolden(join(DATA, "golden.csv"));
  const mismatches = checkGoldenRun(golden.filter((r) => r.status === "pass"), items, projects);
  const promoted = golden.filter((r) => r.status === "known_gap" && checkGoldenRun([r], items, projects).length === 0);
  counts.golden_rows = golden.length;
  counts.golden_mismatches = mismatches.length;
  const file = join(DATA, "golden-mismatches.csv");
  if (mismatches.length) {
    writeFileSync(file, toCsv(["permit_id", "permit_no", "address", "field", "expected", "actual", "note"], mismatches.map((m) => [m.permit_id, m.permit_no, m.address, m.field, m.expected, m.actual, m.note])));
    console.error(`!!! golden list: ${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"} (data/golden-mismatches.csv)`);
    for (const m of mismatches) console.error(`    ${m.permit_no} ${m.address}: ${m.field} expected ${m.expected}, got ${m.actual}`);
  } else {
    if (existsSync(file)) writeFileSync(file, "");
    console.log(`golden list: ${golden.length} permits agree`);
  }
  for (const r of promoted) console.log(`golden list: known gap now passes, mark it pass: ${r.permit_no} ${r.address}`);
  return mismatches;
}

function writeDrift(drift: DriftRow[], codeChanged: boolean): void {
  const file = join(DATA, "drift.csv");
  if (!drift.length) {
    if (existsSync(file)) writeFileSync(file, "");
    console.log("drift: none");
    return;
  }
  writeFileSync(file, toCsv(["project_id", "ward", "address", "kind_before", "kind_after", "units_before", "units_after"], drift.map((d) => [d.id, d.ward, d.address, d.kind_before, d.kind_after, d.units_before, d.units_after])));
  const why = codeChanged ? "the code changed since the last run, see the impact report" : "SAME CODE: the county's or the city's data moved, look at these";
  console[codeChanged ? "log" : "error"](`${codeChanged ? "" : "!!! "}drift: ${drift.length} project${drift.length === 1 ? "" : "s"} changed units or kind with the same permits (${why}; data/drift.csv)`);
  for (const d of drift.slice(0, 20)) console[codeChanged ? "log" : "error"](`    ward ${d.ward} ${d.address}: ${d.kind_before} ${d.units_before} -> ${d.kind_after} ${d.units_after}`);
}

function writeSnapshot(permits: Permit[], projects: Project[], tenures: AlderTenure[], wardFlags: WardFlag[], counts: Record<string, number>): void {
  const denomFile = join(DATA, "fixtures", "denominator.json");
  const denom: Record<string, { units_2020: number; pop_2020: number }> = existsSync(denomFile) ? JSON.parse(readFileSync(denomFile, "utf8")) : {};
  const wards: WardRow[] = Array.from({ length: 50 }, (_, i) => {
    const ward = i + 1;
    const cur = tenures.find((t) => t.ward === ward && !t.end_date);
    return { ward, units_2020: denom[ward]?.units_2020 ?? null, pop_2020: denom[ward]?.pop_2020 ?? null, alder_current: cur?.name ?? null, website: null };
  });
  const snapshot: Snapshot = { generated_at: new Date().toISOString(), window_start: SINCE, wards, tenures, flags: wardFlags, projects, counts };
  mkdirSync(join(DATA, "fixtures"), { recursive: true });
  writeFileSync(join(DATA, "fixtures", "snapshot.json"), JSON.stringify(snapshot));
  console.log(`snapshot: data/fixtures/snapshot.json (${projects.length} projects, ${permits.length} permits)`);
}

async function main() {
  const t0 = Date.now();
  const { permits, raw } = await pullPermits();
  const { tenures, wardFlags, overrides } = loadCsvs();

  // Classify, then apply overrides.
  const items: ClassifiedPermit[] = permits.map((permit) => ({ permit, cls: classify(permit) }));
  let overridden = 0;
  for (const it of items) {
    const o = overrides.get(it.permit.id);
    if (!o) continue;
    if (o.category) it.cls.category = o.category;
    if (o.units !== null) it.cls.units = o.units;
    it.cls.units_source = "override";
    it.cls.needs_review = false;
    it.cls.notes.push(`override: ${o.note}`);
    overridden++;
  }

  // Assessor lookups for demolitions, cached between runs: in the database for a real run, in data/cache for a dry run.
  const resolvedPins = new Map<string, string[]>();
  if (!NO_PARCELS) {
    const cache = DRY ? loadParcelCache(CACHE) : await withDb((db) => loadParcelCacheDb(queryable(db)));
    const before = cacheKeys(cache);
    await resolveDemolitions(items, resolvedPins, cache);
    if (DRY) saveParcelCache(cache, CACHE);
    else {
      const written = await withDb((db) => saveParcelCacheDb(queryable(db), cache, before));
      console.log(`parcel cache: ${written} new entries saved`);
    }
  }

  const polys = await loadWardPolygons(CACHE);
  const affordable = await loadAffordable();
  const unplaced = { count: 0 };
  const projects = buildProjects(items, {
    tenures,
    wardAt: (lon, lat) => wardAtPolys(polys, lon, lat),
    subsidizedAt: (lat, lon) => affordable.some((a) => haversine(lat, lon, a.lat, a.lon) <= 30),
    unplaced,
  });

  const counts: Record<string, number> = { permits: permits.length, overrides_applied: overridden, projects: projects.length, unplaced_permits: unplaced.count };
  counts.replacements = projects.filter((p) => p.replaced_units > 0).length;
  counts.replaced_units = projects.reduce((s, p) => s + p.replaced_units, 0);
  for (const { cls } of items) counts[`cat_${cls.category}`] = (counts[`cat_${cls.category}`] ?? 0) + 1;
  for (const p of projects) counts[`kind_${p.kind}`] = (counts[`kind_${p.kind}`] ?? 0) + 1;
  for (const p of projects) for (const f of p.flags) counts[`flag_${f}`] = (counts[`flag_${f}`] ?? 0) + 1;
  counts.counted_projects = projects.filter((p) => p.counted).length;
  const GROSS = new Set(["new_construction", "adu", "conversion"]);
  counts.gross_units = projects.filter((p) => p.counted && GROSS.has(p.kind)).reduce((s, p) => s + Math.max(p.units_delta + p.replaced_units, 0), 0);
  counts.lost_units = projects.filter((p) => p.counted).reduce((s, p) => s + (GROSS.has(p.kind) ? p.replaced_units : Math.max(-p.units_delta, 0)), 0);
  counts.emergency_units = -projects.filter((p) => p.kind === "emergency_demolition").reduce((s, p) => s + p.units_delta, 0);
  counts.ward_geom_mismatch = projects.filter((p) => p.ward_geom_mismatch).length;
  counts.needs_review = writeReviewQueue(items);
  const goldenMismatches = checkGolden(items, projects, counts);
  console.log(counts);

  let alarm: string[] = goldenMismatches.length ? [`${goldenMismatches.length} golden-list mismatch${goldenMismatches.length === 1 ? "" : "es"}`] : [];
  if (DRY) writeSnapshot(permits, projects, tenures, wardFlags, counts);
  else {
    const { drift, codeChanged } = await withDb((db) => loadDatabase(db, permits, raw, items, projects, tenures, wardFlags, resolvedPins, counts));
    writeDrift(drift, codeChanged);
    if (drift.length && !codeChanged) alarm = [...alarm, `${drift.length} project${drift.length === 1 ? "" : "s"} drifted with the same code`];
  }
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
  // The data is loaded either way; the red run is the alarm.
  if (alarm.length && !DRY) {
    console.error(`!!! ${alarm.join("; ")}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
