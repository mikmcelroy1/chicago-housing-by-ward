/**
 * Zoning stage of the nightly ETL (spec "Alder Actions Tab v2"): copy zoning reclassification matters from the
 * chicago-budget project, read each ordinance, place it in a ward, link it to the permit projects it enabled, read
 * each alder's part in the curated citywide housing ordinances, and write the tables the Alder actions tab reads.
 * Runs after scripts/ingest-permits.ts, which builds the projects it links to.
 *
 *   npm run etl-zoning                        full run: copy over ZONING_DATABASE_URL, load DATABASE_URL; exhibit texts in
 *                                             data/cache/exhibit-texts.json (a local backfill) are written to the live table too
 *   npm run etl-zoning -- --dry-run           no database: reads and writes data/fixtures/snapshot.json
 *   npm run etl-zoning -- --cache             reuse data/cache/zoning-matters.json instead of copying
 *   npm run etl-zoning -- --full              copy the whole corpus again, not only what was published since the last copy
 *   npm run etl-zoning -- --no-parcels        skip assessor lookups (dev)
 *   npm run etl-zoning -- --no-ocr            skip exhibit OCR; --ocr-limit N reads at most N exhibits (default 25),
 *                                             --ocr-workers N runs N tesseract processes at once (default 3)
 *   npm run etl-zoning -- --today YYYY-MM-DD  judge stages as of that day (dev, golden checks)
 *
 * Fails loudly (exit 2) when the copy holds fewer matters than chicago-budget does, or, after loading, when a
 * golden-list matter (data/zoning_golden.csv) disagrees. Matters the parser cannot read fully go to
 * data/zoning-review-queue.csv.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { todayInChicago } from "../lib/dates";
import { parseCsv, toCsv } from "./lib/csv";
import { ExhibitStore, incomplete, loadExhibitFile, ocrTools, readExhibit, saveExhibitFile, type ExhibitText } from "./lib/exhibits";
import { cacheKeys, liveParcels, loadParcelCache, loadParcelCacheDb, normalizeAddress, resolveAddresses, resolveLots, resolveWards, saveParcelCache, saveParcelCacheDb, sumLots, type ParcelCache, type Queryable } from "./lib/parcels";
import { tenureFor } from "./lib/projects";
import type { ActionProject, AlderSponsorship, AlderTenure, KeyOrdinance, Snapshot, ZoningAction } from "./lib/types";
import { readMatter, type MatterReading } from "./lib/zoning";
import { compareReading, loadZoningGolden, type ZoningGoldenMismatch } from "./lib/zoning-golden";
import { enumerateAddresses, indexProjects, linkProjects, wardFromProjects, type LinkableProject } from "./lib/zoning-link";
import { CORPUS_SINCE, copyMatters, copyRecords, loadZoningCache, mergeRows, newestPublication, personWards, saveZoningCache, sourceInventory, type ZoningCache, type ZoningMatterRow } from "./lib/zoning-source";

const ROOT = process.cwd();
const DATA = join(ROOT, "data");
const CACHE = join(DATA, "cache");
const FIXTURE = join(DATA, "fixtures", "snapshot.json");
const ZONING_CACHE = join(CACHE, "zoning-matters.json");
const EXHIBIT_CACHE = join(CACHE, "exhibit-texts.json");
/** Source links on the site point at Councilmatic; a substitute's S is dropped. */
export const councilmaticUrl = (record: string) => `https://chicago.councilmatic.org/legislation/${record.replace(/^S/i, "").toLowerCase()}/`;

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const argVal = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const DRY = flags.has("--dry-run");
const USE_CACHE = flags.has("--cache");
const FULL = flags.has("--full");
const NO_PARCELS = flags.has("--no-parcels");
const NO_OCR = flags.has("--no-ocr");
const OCR_LIMIT = Number(argVal("--ocr-limit") ?? 25);
/** tesseract processes at a time; one per core is about right. */
const OCR_WORKERS = Math.max(1, Number(argVal("--ocr-workers") ?? 3));
const TODAY = argVal("--today") ?? todayInChicago();
const SINCE = argVal("--since") ?? CORPUS_SINCE;

// --- inputs ------------------------------------------------------------------------------------------

interface KeyRow {
  record_number: string;
  label: string;
  stance: KeyOrdinance["stance"];
  flag: string | null;
  note: string;
}

function loadKeyOrdinances(): KeyRow[] {
  return parseCsv(readFileSync(join(DATA, "key_ordinances.csv"), "utf8")).map((r) => ({
    record_number: r.record_number.trim(),
    label: r.label,
    stance: (["pro", "anti", "mixed"].includes(r.stance) ? r.stance : "mixed") as KeyOrdinance["stance"],
    flag: r.flag || null,
    note: r.note ?? "",
  }));
}

interface ZoningOverride {
  record_number: string;
  ward: number | null;
  direction: ZoningAction["direction"] | null;
  requested_units: number | null;
  approved_units: number | null;
  note: string;
}

/** data/zoning_overrides.csv: a person's reading of a matter the parser got wrong. Blank cells leave the parser's value. */
function loadOverrides(): Map<string, ZoningOverride> {
  const file = join(DATA, "zoning_overrides.csv");
  const out = new Map<string, ZoningOverride>();
  if (!existsSync(file)) return out;
  const num = (v: string | undefined) => (v === undefined || v.trim() === "" ? null : Number(v));
  for (const r of parseCsv(readFileSync(file, "utf8"))) {
    const dir = (r.direction ?? "").trim();
    out.set(r.record_number.trim(), {
      record_number: r.record_number.trim(),
      ward: num(r.ward),
      direction: ["up", "down", "lateral", "pd", "pd_amend", "unknown"].includes(dir) ? (dir as ZoningAction["direction"]) : null,
      requested_units: num(r.requested_units),
      approved_units: num(r.approved_units),
      note: r.note ?? "",
    });
  }
  return out;
}

function loadTenures(): AlderTenure[] {
  return parseCsv(readFileSync(join(DATA, "alder_tenure.csv"), "utf8")).map((r) => ({
    id: r.id, ward: Number(r.ward), name: r.name, photo_url: r.photo_url || null, start_date: r.start_date, end_date: r.end_date || null, source_url: r.source_url || null,
  }));
}

async function withDb<T>(url: string | undefined, name: string, fn: (db: Client) => Promise<T>): Promise<T> {
  if (!url) throw new Error(`${name} is not set${name === "DATABASE_URL" ? " (use --dry-run for an offline run)" : " (use --cache to reuse the last copy)"}`);
  const client = new Client({ connectionString: url, ssl: /localhost|127\.0\.0\.1/.test(url) ? undefined : { rejectUnauthorized: false } });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => {});
  }
}
const queryable = (db: Client): Queryable => ({ query: (text, values) => db.query(text, values) });

/** The corpus and the curated records, copied from chicago-budget or taken from the last copy. */
async function obtainRows(keyRecords: string[]): Promise<{ cache: ZoningCache; fresh: ZoningMatterRow[]; inventory: Set<string> | null }> {
  if (USE_CACHE) {
    const cache = loadZoningCache(ZONING_CACHE);
    if (!cache) throw new Error(`--cache: ${ZONING_CACHE} does not exist; run once without it`);
    console.log(`copy: ${cache.matters.length} matters and ${cache.records.length} key ordinances from the cache of ${cache.copied_at.slice(0, 10)}`);
    return { cache, fresh: [], inventory: null };
  }
  const previous = FULL ? null : loadZoningCache(ZONING_CACHE);
  if (!process.env.ZONING_DATABASE_URL) {
    if (previous) {
      console.log(`copy: ZONING_DATABASE_URL is not set; using the cache of ${previous.copied_at.slice(0, 10)} (${previous.matters.length} matters)`);
      return { cache: previous, fresh: [], inventory: null };
    }
    console.log("zoning stage skipped: ZONING_DATABASE_URL is not set and there is no cached copy (see README, Deploy)");
    process.exit(0);
  }
  const t0 = Date.now();
  const run = async (publishedAfter: string | null) =>
    withDb(process.env.ZONING_DATABASE_URL, "ZONING_DATABASE_URL", async (db) => {
      const q = queryable(db);
      const fresh = await copyMatters(q, { since: SINCE, publishedAfter });
      const records = await copyRecords(q, keyRecords);
      const inventory = await sourceInventory(q, SINCE);
      return { fresh, records, inventory };
    });
  let cursor = previous?.cursor ?? null;
  let { fresh, records, inventory } = await run(cursor);
  let merged = mergeRows(previous?.matters ?? [], fresh).filter((r) => inventory.ids.has(r.matter_id));
  if (merged.length !== inventory.ids.size && cursor) {
    console.log(`copy: ${merged.length} after the incremental copy but chicago-budget holds ${inventory.ids.size}; copying everything`);
    cursor = null;
    ({ fresh, records, inventory } = await run(null));
    merged = fresh.filter((r) => inventory.ids.has(r.matter_id));
  }
  const pruned = (previous?.matters.length ?? 0) + fresh.filter((r) => !previous?.matters.some((p) => p.matter_id === r.matter_id)).length - merged.length;
  console.log(`copy: ${fresh.length} matters published since ${cursor ? cursor.slice(0, 10) : "the beginning"}, ${merged.length} in the corpus now (chicago-budget: ${inventory.ids.size}), ${Math.max(0, pruned)} dropped, ${records.length}/${keyRecords.length} key ordinances, ${Math.round((Date.now() - t0) / 1000)}s`);
  if (merged.length < inventory.ids.size) {
    console.error(`!!! copy: ${inventory.ids.size - merged.length} matters missing after the copy`);
    process.exit(2);
  }
  const missingKeys = keyRecords.filter((k) => !records.some((r) => r.record_number === k));
  if (missingKeys.length) console.log(`copy: key ordinances not found in chicago-budget: ${missingKeys.join(", ")}`);
  const cache: ZoningCache = { copied_at: new Date().toISOString(), since: SINCE, cursor: newestPublication(merged) ?? cursor, matters: merged, records };
  saveZoningCache(ZONING_CACHE, cache);
  return { cache, fresh: [...fresh, ...records], inventory: inventory.ids };
}

/** The copy query selects the corpus; this only drops the odd non-ordinance that shares a record. */
const isCorpus = (r: ZoningMatterRow) => (r.type ?? "Ordinance") === "Ordinance";

// --- reading -----------------------------------------------------------------------------------------

function read(r: ZoningMatterRow, exhibits: Record<string, string>, lotSf: number | null): MatterReading {
  return readMatter(
    {
      record_number: r.record_number,
      title: r.title ?? "",
      full_text: r.full_text,
      attachments: r.attachments,
      exhibit_texts: exhibits,
      outcome: r.outcome,
      sub_status: r.sub_status,
      introduction_date: r.introduction_date ?? r.final_action_date ?? TODAY,
      final_action_date: r.final_action_date,
      filing_office: r.filing_office,
      filing_sponsor: r.filing_sponsor,
    },
    TODAY,
    { lot_sf: lotSf },
  );
}

/** OCR the exhibits the readings still want, newest passed matters first, up to the budget. */
async function readExhibits(rows: ZoningMatterRow[], readings: Map<string, MatterReading>, store: ExhibitStore): Promise<Record<string, number>> {
  const counts = { wanted: 0, read: 0, unreadable: 0, transient: 0 };
  const tools = NO_OCR ? null : await ocrTools();
  // Passed matters first, newest first within each group.
  const order = (r: ZoningMatterRow) => `${readings.get(r.matter_id)?.stage === "passed" ? "0" : "1"}|${readings.get(r.matter_id)?.stage_date ?? ""}`;
  const sorted = [...rows].sort((a, b) => {
    const [ga, da] = order(a).split("|");
    const [gb, db] = order(b).split("|");
    return ga.localeCompare(gb) || db.localeCompare(da);
  });
  const todo: { r: ZoningMatterRow; att: { source_url: string; file_name: string | null }; resume?: ExhibitText }[] = [];
  for (const r of sorted) {
    const x = readings.get(r.matter_id);
    if (!x) continue;
    for (const att of x.wanted_exhibits) {
      if (!att.source_url) continue;
      const have = store.get(att.source_url);
      if (!have) todo.push({ r, att: { source_url: att.source_url, file_name: att.file_name } });
      else if (incomplete(have)) todo.push({ r, att: { source_url: att.source_url, file_name: att.file_name }, resume: have });
    }
  }
  counts.wanted = todo.length;
  if (!todo.length) return counts;
  if (NO_OCR) {
    console.log(`exhibits: ${todo.length} scanned exhibits wait for OCR (--no-ocr)`);
    return counts;
  }
  if (!tools?.ok) {
    console.log(`exhibits: ${todo.length} scanned exhibits wait for OCR; tools missing: ${tools?.missing.join(", ")}`);
    return counts;
  }
  const t0 = Date.now();
  const queue = todo.slice(0, OCR_LIMIT);
  let next = 0;
  const worker = async () => {
    while (next < queue.length) {
      const { r, att, resume } = queue[next++];
      const t = await readExhibit(att, r.record_number, { engine: tools.engine, resume });
      if (!t) {
        counts.transient += 1;
        continue;
      }
      store.add(t);
      counts.read += 1;
      if (!t.text) counts.unreadable += 1;
      // A dry run keeps what it has read so far, so an interrupted backfill loses nothing.
      if (DRY) saveExhibitFile(EXHIBIT_CACHE, store);
    }
  };
  await Promise.all(Array.from({ length: Math.min(OCR_WORKERS, queue.length) }, worker));
  console.log(`exhibits: ${counts.read} read (${counts.unreadable} unreadable, ${counts.transient} failed for now) of ${todo.length} wanted, ${Math.round((Date.now() - t0) / 1000)}s; ${store.size} texts kept`);
  return counts;
}

interface Placement {
  ward: number | null;
  source: ZoningAction["ward_source"];
  pins: string[];
  lot_sf: number | null;
}

/** Every address range -> assessor parcels -> ward and land; then the permits at the site; then the alder's office. */
async function place(rows: ZoningMatterRow[], readings: Map<string, MatterReading>, cache: ParcelCache, projects: LinkableProject[]): Promise<Map<string, Placement>> {
  const idx = indexProjects(projects);
  const out = new Map<string, Placement>();
  const lookups: string[] = [];
  if (!NO_PARCELS) {
    for (const r of rows) for (const range of readings.get(r.matter_id)?.addresses ?? []) lookups.push(...enumerateAddresses(range));
    const t0 = Date.now();
    await resolveAddresses(lookups, cache);
    console.log(`parcels: ${new Set(lookups.map(normalizeAddress)).size} addresses looked up, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  const pinsOf = new Map<string, string[]>();
  for (const r of rows) {
    const x = readings.get(r.matter_id)!;
    const year = Number(x.stage_date.slice(0, 4));
    // The site's parcels are the ones at the title's addresses; the PINs the text names stand in only when none resolve.
    const pins = new Set<string>();
    if (!NO_PARCELS) {
      for (const range of x.addresses) {
        for (const a of enumerateAddresses(range)) for (const pin of liveParcels(cache.addressToPins[normalizeAddress(a)] ?? [], year).live) pins.add(pin);
      }
    }
    if (!pins.size) for (const pin of x.pins) pins.add(pin);
    pinsOf.set(r.matter_id, [...pins].sort());
  }
  if (!NO_PARCELS) {
    const all = [...new Set([...pinsOf.values()].flat())];
    const t0 = Date.now();
    await resolveWards(all, cache);
    await resolveLots(all, cache);
    console.log(`parcels: ${all.length} parcels placed and sized, ${Math.round((Date.now() - t0) / 1000)}s`);
  }
  let byParcel = 0, byPermit = 0, bySponsor = 0, unplaced = 0;
  for (const r of rows) {
    const x = readings.get(r.matter_id)!;
    const pins = pinsOf.get(r.matter_id) ?? [];
    const votes = new Map<number, number>();
    for (const pin of pins) {
      const w = cache.wardByPin[pin];
      if (w) votes.set(w, (votes.get(w) ?? 0) + 1);
    }
    let ward: number | null = votes.size ? [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0] : null;
    let source: Placement["source"] = ward ? "parcel" : null;
    if (!ward) {
      ward = wardFromProjects({ addresses: x.addresses, pins }, projects, idx);
      if (ward) source = "permit";
    }
    if (!ward && x.sponsor_ward) {
      ward = x.sponsor_ward;
      source = "sponsor";
    }
    if (source === "parcel") byParcel += 1;
    else if (source === "permit") byPermit += 1;
    else if (source === "sponsor") bySponsor += 1;
    else unplaced += 1;
    out.set(r.matter_id, { ward, source, pins, lot_sf: NO_PARCELS ? null : sumLots(pins, cache) });
  }
  console.log(`placed: ${byParcel} by parcel, ${byPermit} by permit, ${bySponsor} by sponsor's ward, ${unplaced} unplaced`);
  return out;
}

/** A person's reading wins over the parser's. */
function applyOverride(a: ZoningAction, o: ZoningOverride | undefined): ZoningAction {
  if (!o) return a;
  const out = { ...a, notes: [...a.notes, `corrected by a person: ${o.note}`] };
  if (o.ward !== null) {
    out.ward = o.ward;
    out.ward_source = "parcel";
  }
  if (o.direction !== null) out.direction = o.direction;
  if (o.requested_units !== null || o.approved_units !== null) {
    out.requested_units = o.requested_units ?? o.approved_units;
    out.approved_units = a.stage === "passed" ? (o.approved_units ?? o.requested_units) : a.stage === "undecided" ? null : 0;
    out.units_source = "override";
  }
  out.needs_review = false;
  out.exhibits_pending = false;
  return out;
}

/**
 * A planned development's amendment restates the whole bulk table, so its count is the PD's new total, not new homes.
 * Where an earlier matter for the same PD number is in the corpus, the amendment approves the difference, and the
 * earlier total is what the site allowed before.
 */
function pdAmendmentDeltas(actions: ZoningAction[]): number {
  const pdNumber = (d: string | null) => {
    const m = d && /^PD (\d+)/.exec(d);
    return m ? Number(m[1]) : null;
  };
  const byPd = new Map<number, ZoningAction[]>();
  for (const a of actions) {
    const n = pdNumber(a.to_district);
    if (n !== null && a.stage === "passed") byPd.set(n, [...(byPd.get(n) ?? []), a]);
  }
  let adjusted = 0;
  for (const [n, list] of byPd) {
    list.sort((a, b) => a.stage_date.localeCompare(b.stage_date) || a.record_number.localeCompare(b.record_number));
    let previous: ZoningAction | null = null;
    for (const a of list) {
      if (previous && previous.approved_units !== null && a.direction === "pd_amend" && a.approved_units !== null) {
        const total = a.approved_units;
        a.allowed_before = previous.approved_units;
        a.approved_units = Math.max(0, total - previous.approved_units);
        if (a.requested_units !== null) a.requested_units = Math.max(0, a.requested_units - previous.approved_units);
        a.notes.push(`PD ${n} was approved for ${previous.approved_units} homes in ${previous.record_number}; this amendment's ${total} is the new total, ${a.approved_units} more`);
        adjusted += 1;
      }
      if (a.approved_units !== null) previous = a.allowed_after !== null && a.direction === "pd_amend" ? { ...a, approved_units: a.allowed_after } : a;
    }
  }
  return adjusted;
}

function toAction(r: ZoningMatterRow, x: MatterReading, p: Placement, tenures: AlderTenure[]): ZoningAction {
  const notes = [...x.notes];
  if (!p.ward) notes.push("ward unknown: no parcel, permit or sponsor placed it");
  return {
    matter_id: r.matter_id,
    record_number: r.record_number,
    title: r.title ?? "",
    introduction_date: r.introduction_date ?? x.stage_date,
    final_action_date: r.final_action_date,
    outcome: r.outcome ?? "pending",
    sponsor_ward: x.sponsor_ward,
    sponsor_name: x.sponsor_name,
    sponsored_by_alder: x.sponsored_by_alder,
    ward: p.ward,
    ward_source: p.source,
    alder_tenure_id: p.ward ? (tenureFor(tenures, p.ward, x.stage_date)?.id ?? null) : null,
    addresses: x.addresses,
    address: x.address,
    pins: p.pins,
    app_no: x.app_no,
    type1: x.type1,
    from_districts: x.from_districts,
    from_district: x.from_district,
    to_district: x.to_district,
    from_far: x.from_far,
    to_far: x.to_far,
    direction: x.direction,
    requested_units: x.requested_units,
    approved_units: x.approved_units,
    units_source: x.units_source,
    lot_sf: x.lot_sf,
    allowed_before: x.allowed_before,
    allowed_after: x.allowed_after,
    stage: x.stage,
    stage_date: x.stage_date,
    days_pending: x.days_pending,
    substitute: x.substitute,
    days_to_passage: x.days_to_passage,
    needs_review: x.needs_review || !p.ward,
    exhibits_pending: x.exhibits_pending,
    notes,
  };
}

// --- key ordinances and sponsorships -----------------------------------------------------------------------

/** "Mosley, Ronnie L." -> the tenure of that alder on `date`, by last name, then first initial. */
function tenureByVoterName(name: string, date: string | null, tenures: AlderTenure[]): AlderTenure | null {
  const [lastRaw, firstRaw = ""] = name.split(",").map((s) => s.trim());
  const last = lastRaw.replace(/\b(jr|sr|ii|iii)\.?$/i, "").trim().toLowerCase();
  const first = firstRaw.replace(/^(jr|sr)\.?\s+/i, "").split(/\s+/)[0]?.toLowerCase() ?? "";
  const when = date ?? TODAY;
  const active = tenures.filter((t) => t.start_date <= when && (!t.end_date || when <= t.end_date));
  const byLast = active.filter((t) => t.name.toLowerCase().replace(/\b(jr|sr|ii|iii)\.?/g, "").trim().split(/\s+/).includes(last));
  if (byLast.length === 1) return byLast[0];
  const byFirst = byLast.filter((t) => t.name.toLowerCase().startsWith(first.slice(0, 3)));
  return byFirst.length === 1 ? byFirst[0] : null;
}

function keyOrdinances(keys: KeyRow[], records: ZoningMatterRow[], allRows: ZoningMatterRow[], tenures: AlderTenure[]): { ordinances: KeyOrdinance[]; sponsorships: AlderSponsorship[] } {
  const pw = personWards(allRows);
  const ordinances: KeyOrdinance[] = [];
  const sponsorships: AlderSponsorship[] = [];
  for (const k of keys) {
    const row = records.find((r) => r.record_number === k.record_number);
    ordinances.push({ ...k, title: row?.title ?? null, introduction_date: row?.introduction_date ?? null, final_action_date: row?.final_action_date ?? null, outcome: row?.outcome ?? null });
    if (!row) continue;
    const when = row.final_action_date ?? row.introduction_date ?? TODAY;
    const byWard = new Map<number, AlderSponsorship>();
    const entry = (ward: number, fallbackName: string | null): AlderSponsorship => {
      let e = byWard.get(ward);
      if (!e) {
        const t = tenureFor(tenures, ward, when);
        e = { record_number: k.record_number, ward, alder_name: t?.name ?? fallbackName ?? `Ward ${ward}`, alder_tenure_id: t?.id ?? null, role: "none", vote: null };
        byWard.set(ward, e);
      }
      return e;
    };
    for (const s of row.sponsors) {
      const ward = /^\d{1,2}$/.test(s.office ?? "") ? Number(s.office) : s.person_id ? (pw.get(s.person_id) ?? null) : null;
      if (!ward || ward < 1 || ward > 50) continue;
      const e = entry(ward, s.name);
      const role: AlderSponsorship["role"] = /co/i.test(s.type ?? "") ? "cosponsor" : "sponsor";
      if (e.role === "none" || role === "sponsor") e.role = role;
    }
    // The roll call on the final action: one vote per alder from the latest dated votes.
    const latest = row.votes.reduce<string | null>((m, v) => (v.date && (!m || v.date > m) ? v.date : m), null);
    for (const v of row.votes) {
      if (latest && v.date !== latest) continue;
      let ward = v.person_id ? (pw.get(v.person_id) ?? null) : null;
      if (!ward && v.voter_name) ward = tenureByVoterName(v.voter_name, v.date, tenures)?.ward ?? null;
      if (!ward) continue;
      entry(ward, v.voter_name).vote = v.vote;
    }
    sponsorships.push(...[...byWard.values()].sort((a, b) => a.ward - b.ward));
  }
  return { ordinances, sponsorships };
}

// --- outputs -------------------------------------------------------------------------------------------

function writeReviewQueue(actions: ZoningAction[]): number {
  const rows = actions
    .filter((a) => a.needs_review || a.exhibits_pending)
    .sort((a, b) => b.stage_date.localeCompare(a.stage_date))
    .map((a) => [a.record_number, a.stage, a.ward, a.address, a.from_districts.join(" + "), a.to_district, a.direction, a.requested_units, a.approved_units, a.needs_review ? "yes" : "", a.exhibits_pending ? "yes" : "", a.notes.join("; "), a.title, councilmaticUrl(a.record_number)]);
  writeFileSync(join(DATA, "zoning-review-queue.csv"), toCsv(["record_number", "stage", "ward", "address", "from", "to", "direction", "requested", "approved", "needs_review", "exhibits_pending", "notes", "title", "url"], rows));
  return rows.length;
}

function checkGolden(actions: ZoningAction[], counts: Record<string, number>): ZoningGoldenMismatch[] {
  const file = join(DATA, "zoning_golden.csv");
  if (!existsSync(file)) return [];
  const golden = loadZoningGolden(file);
  const byRecord = new Map(actions.map((a) => [a.record_number, a]));
  const mismatches: ZoningGoldenMismatch[] = [];
  let waiting = 0;
  for (const row of golden) {
    if (row.status !== "pass") continue;
    const a = byRecord.get(row.record_number);
    if (!a) {
      mismatches.push({ record_number: row.record_number, status: row.status, field: "matter", expected: "in the copy", actual: "missing", note: row.note });
      continue;
    }
    // A count that waits for its scanned exhibit is not checkable yet; the run says so instead of going red.
    const checkable = a.exhibits_pending ? { ...row, expected_requested: "", expected_approved: "" } : row;
    if (a.exhibits_pending && (row.expected_requested || row.expected_approved)) waiting += 1;
    mismatches.push(...compareReading(checkable, a, a.ward));
  }
  if (waiting) console.log(`zoning golden list: ${waiting} matter${waiting === 1 ? "" : "s"} wait for their exhibits before their counts can be checked`);
  counts.zoning_golden_rows = golden.length;
  counts.zoning_golden_mismatches = mismatches.length;
  const out = join(DATA, "zoning-golden-mismatches.csv");
  if (mismatches.length) {
    writeFileSync(out, toCsv(["record_number", "field", "expected", "actual", "note"], mismatches.map((m) => [m.record_number, m.field, m.expected, m.actual, m.note])));
    console.error(`!!! zoning golden list: ${mismatches.length} mismatch${mismatches.length === 1 ? "" : "es"} (data/zoning-golden-mismatches.csv)`);
    for (const m of mismatches) console.error(`    ${m.record_number}: ${m.field} expected ${m.expected}, got ${m.actual}`);
  } else {
    if (existsSync(out)) writeFileSync(out, "");
    console.log(`zoning golden list: ${golden.length} matters agree`);
  }
  return mismatches;
}

function chunk<T>(arr: T[], n: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

async function insertRows(db: Client, table: string, columns: string[], rows: unknown[][], onConflict = ""): Promise<void> {
  for (const batch of chunk(rows, 200)) {
    const params: unknown[] = [];
    const tuples = batch.map((row) => {
      params.push(...row);
      const b = params.length - row.length;
      return `(${row.map((_, k) => `$${b + k + 1}`).join(",")})`;
    });
    await db.query(`insert into ${table} (${columns.join(",")}) values ${tuples.join(",")} ${onConflict}`, params);
  }
}

async function loadDatabase(db: Client, fresh: ZoningMatterRow[], all: ZoningMatterRow[], inventory: Set<string> | null, keyRecords: string[], actions: ZoningAction[], links: ActionProject[], ordinances: KeyOrdinance[], sponsorships: AlderSponsorship[], exhibits: ExhibitText[], counts: Record<string, number>): Promise<void> {
  // zoning_actions points at zoning_matters: when the table holds fewer rows than the copy (a fresh database, a
  // run that failed after the copy), every matter is written, not only the ones published since the last copy.
  const held = Number((await db.query("select count(*) as n from zoning_matters")).rows[0].n);
  if (held < all.length) {
    console.log(`database: zoning_matters holds ${held} of ${all.length} matters; writing all of them`);
    fresh = all;
  }
  await db.query("begin");
  try {
    const cols = ["matter_id", "record_number", "title", "type", "matter_category", "introduction_date", "final_action_date", "outcome", "sub_status", "superseded_by", "filing_sponsor", "filing_office", "sponsor_offices", "last_action_date", "last_publication_date", "full_text", "extraction_method", "sponsors", "actions", "attachments", "copied_at"];
    await insertRows(
      db,
      "zoning_matters",
      cols,
      fresh.map((r) => [r.matter_id, r.record_number, r.title, r.type, r.matter_category, r.introduction_date, r.final_action_date, r.outcome, r.sub_status, r.superseded_by, r.filing_sponsor, r.filing_office, r.sponsor_offices, r.last_action_date, r.last_publication_date, r.full_text, r.extraction_method, JSON.stringify(r.sponsors), JSON.stringify(r.actions), JSON.stringify(r.attachments), new Date().toISOString()]),
      `on conflict (matter_id) do update set ${cols.slice(1).map((c) => `${c} = excluded.${c}`).join(", ")}`,
    );
    if (inventory) await db.query("delete from zoning_matters where matter_id <> all($1::uuid[]) and record_number <> all($2::text[])", [[...inventory], keyRecords]);
    await db.query("delete from zoning_actions");
    const acols = ["matter_id", "record_number", "title", "introduction_date", "final_action_date", "outcome", "sponsor_ward", "sponsor_name", "sponsored_by_alder", "ward", "ward_source", "alder_tenure_id", "addresses", "address", "pins", "app_no", "type1", "from_districts", "from_district", "to_district", "from_far", "to_far", "direction", "requested_units", "approved_units", "units_source", "lot_sf", "allowed_before", "allowed_after", "stage", "stage_date", "days_pending", "substitute", "days_to_passage", "needs_review", "exhibits_pending", "notes"];
    await insertRows(db, "zoning_actions", acols, actions.map((a) => [a.matter_id, a.record_number, a.title, a.introduction_date, a.final_action_date, a.outcome, a.sponsor_ward, a.sponsor_name, a.sponsored_by_alder, a.ward, a.ward_source, a.alder_tenure_id, JSON.stringify(a.addresses), a.address, a.pins, a.app_no, a.type1, a.from_districts, a.from_district, a.to_district, a.from_far, a.to_far, a.direction, a.requested_units, a.approved_units, a.units_source, a.lot_sf, a.allowed_before, a.allowed_after, a.stage, a.stage_date, a.days_pending, a.substitute, a.days_to_passage, a.needs_review, a.exhibits_pending, a.notes]));
    await db.query("delete from action_projects");
    await insertRows(db, "action_projects", ["matter_id", "project_id", "lag_days", "match"], links.map((l) => [l.matter_id, l.project_id, l.lag_days, l.match]));
    await db.query("update projects set action_matter_id = null where action_matter_id is not null");
    for (const batch of chunk(links, 500)) {
      const params: unknown[] = [];
      const tuples = batch.map((l) => {
        params.push(l.project_id, l.matter_id);
        return `($${params.length - 1}, $${params.length}::uuid)`;
      });
      await db.query(`update projects p set action_matter_id = v.matter_id from (values ${tuples.join(",")}) as v(id, matter_id) where p.id = v.id`, params);
    }
    await db.query("delete from alder_sponsorships");
    await db.query("delete from key_ordinances");
    await insertRows(db, "key_ordinances", ["record_number", "label", "stance", "note", "flag", "title", "introduction_date", "final_action_date", "outcome"], ordinances.map((k) => [k.record_number, k.label, k.stance, k.note, k.flag, k.title, k.introduction_date, k.final_action_date, k.outcome]));
    await insertRows(db, "alder_sponsorships", ["record_number", "ward", "alder_name", "alder_tenure_id", "role", "vote"], sponsorships.map((s) => [s.record_number, s.ward, s.alder_name, s.alder_tenure_id, s.role, s.vote]));
    await insertRows(
      db,
      "zoning_attachment_texts",
      ["source_url", "record_number", "file_name", "text", "pages_read", "pages_total", "method", "engine", "extracted_at"],
      exhibits.map((e) => [e.source_url, e.record_number, e.file_name, e.text, e.pages_read, e.pages_total, e.method, e.engine, e.extracted_at]),
      "on conflict (source_url) do update set text = excluded.text, pages_read = excluded.pages_read, pages_total = excluded.pages_total, method = excluded.method, engine = excluded.engine, extracted_at = excluded.extracted_at",
    );
    const zc = Object.fromEntries(Object.entries(counts).map(([k, v]) => [k.startsWith("zoning_") ? k : `zoning_${k}`, v]));
    await db.query("update etl_runs set counts = counts || $1::jsonb where id = (select max(id) from etl_runs where status = 'ok')", [JSON.stringify(zc)]);
    await db.query("commit");
    console.log(`database: ${fresh.length} matters upserted, ${actions.length} actions, ${links.length} links, ${sponsorships.length} sponsorship rows, ${exhibits.length} exhibit texts`);
  } catch (err) {
    await db.query("rollback").catch(() => {});
    throw err;
  }
}

async function main() {
  const t0 = Date.now();
  const keys = loadKeyOrdinances();
  const keyRecords = keys.map((k) => k.record_number);
  const tenures = loadTenures();
  const { cache, fresh, inventory } = await obtainRows(keyRecords);
  const corpus = cache.matters.filter(isCorpus);

  // The projects to link to, and this run's caches.
  let projects: LinkableProject[];
  let snapshot: Snapshot | null = null;
  if (DRY) {
    if (!existsSync(FIXTURE)) throw new Error(`${FIXTURE} does not exist; run npm run etl -- --dry-run first`);
    snapshot = JSON.parse(readFileSync(FIXTURE, "utf8")) as Snapshot;
    projects = snapshot.projects;
  } else {
    projects = await withDb(process.env.DATABASE_URL, "DATABASE_URL", async (db) => (await db.query("select id, project_key, kind, ward, first_issue_date::text, address from projects")).rows as LinkableProject[]);
  }
  const parcelCache = NO_PARCELS ? null : DRY ? loadParcelCache(CACHE) : await withDb(process.env.DATABASE_URL, "DATABASE_URL", (db) => loadParcelCacheDb(queryable(db)));
  const parcelKeysBefore = parcelCache ? cacheKeys(parcelCache) : null;
  const store = DRY
    ? loadExhibitFile(EXHIBIT_CACHE)
    : await withDb(process.env.DATABASE_URL, "DATABASE_URL", async (db) => new ExhibitStore((await db.query("select source_url, record_number, file_name, text, pages_read, pages_total, method, engine, extracted_at::text from zoning_attachment_texts")).rows as ExhibitText[]));
  // A live run on a machine that holds the dry-run cache (a local backfill) writes its texts to the table too, so
  // the nightly job does not re-read them 25 a night. Texts the table already has are left as they are.
  if (!DRY && existsSync(EXHIBIT_CACHE)) {
    let seeded = 0;
    for (const t of loadExhibitFile(EXHIBIT_CACHE).all()) {
      if (store.has(t.source_url)) continue;
      store.add(t);
      seeded += 1;
    }
    if (seeded) console.log(`exhibits: ${seeded} texts from the dry-run cache will be written to zoning_attachment_texts`);
  }

  // Read, OCR what is still wanted, read again.
  const readAll = (lots: Map<string, number | null>) => new Map(corpus.map((r) => [r.matter_id, read(r, store.byUrl(), lots.get(r.matter_id) ?? null)]));
  let readings = readAll(new Map());
  const exhibitCounts = await readExhibits(corpus, readings, store);
  readings = readAll(new Map());
  const placements = await place(corpus, readings, parcelCache ?? { addressToPins: {}, unitsByPinYear: {}, wardByPin: {}, lotByPin: {} }, projects);
  readings = readAll(new Map([...placements].map(([id, p]) => [id, p.lot_sf])));

  const overrides = loadOverrides();
  const actions = corpus.map((r) => applyOverride(toAction(r, readings.get(r.matter_id)!, placements.get(r.matter_id)!, tenures), overrides.get(r.record_number))).sort((a, b) => b.stage_date.localeCompare(a.stage_date) || a.record_number.localeCompare(b.record_number));
  const pdAdjusted = pdAmendmentDeltas(actions);
  const { links, actionByProject } = linkProjects(actions, projects);
  const { ordinances, sponsorships } = keyOrdinances(keys, cache.records, [...cache.matters, ...cache.records], tenures);

  const counts: Record<string, number> = { matters: corpus.length, actions: actions.length, links: links.length, key_ordinances: ordinances.length, sponsorship_rows: sponsorships.length, exhibits_read: exhibitCounts.read, exhibits_wanted: exhibitCounts.wanted, overrides_applied: [...overrides.keys()].filter((k) => corpus.some((r) => r.record_number === k)).length, pd_amendments_adjusted: pdAdjusted };
  for (const a of actions) {
    counts[`stage_${a.stage}`] = (counts[`stage_${a.stage}`] ?? 0) + 1;
    counts[`direction_${a.direction}`] = (counts[`direction_${a.direction}`] ?? 0) + 1;
  }
  counts.parsed = actions.filter((a) => a.from_district !== null && a.to_district !== null).length;
  counts.placed = actions.filter((a) => a.ward !== null).length;
  counts.units_known = actions.filter((a) => a.approved_units !== null || a.requested_units !== null).length;
  counts.needs_review = actions.filter((a) => a.needs_review).length;
  counts.exhibits_pending = actions.filter((a) => a.exhibits_pending).length;
  counts.review_queue = writeReviewQueue(actions);
  const mismatches = checkGolden(actions, counts);
  console.log(counts);

  if (DRY && snapshot) {
    for (const p of snapshot.projects) p.action_matter_id = actionByProject.get(p.id) ?? null;
    snapshot.actions = actions;
    snapshot.action_projects = links;
    snapshot.key_ordinances = ordinances;
    snapshot.sponsorships = sponsorships;
    for (const [k, v] of Object.entries(counts)) snapshot.counts[`zoning_${k}`] = v;
    mkdirSync(join(DATA, "fixtures"), { recursive: true });
    writeFileSync(FIXTURE, JSON.stringify(snapshot));
    if (parcelCache) saveParcelCache(parcelCache, CACHE);
    saveExhibitFile(EXHIBIT_CACHE, store);
    console.log(`snapshot: ${FIXTURE} updated with ${actions.length} actions and ${links.length} links`);
  } else {
    await withDb(process.env.DATABASE_URL, "DATABASE_URL", async (db) => {
      if (parcelCache && parcelKeysBefore) {
        const written = await saveParcelCacheDb(queryable(db), parcelCache, parcelKeysBefore);
        console.log(`parcel cache: ${written} new entries saved`);
      }
      await loadDatabase(db, fresh, [...cache.matters, ...cache.records], inventory, keyRecords, actions, links, ordinances, sponsorships, store.added(), counts);
    });
  }
  console.log(`done in ${Math.round((Date.now() - t0) / 1000)}s`);
  if (mismatches.length && !DRY) {
    console.error(`!!! ${mismatches.length} zoning golden-list mismatch${mismatches.length === 1 ? "" : "es"}`);
    process.exit(2);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
