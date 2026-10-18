/**
 * The copy step: zoning reclassification matters, and the curated citywide housing ordinances, read from the
 * chicago-budget project's tables (matters, matter_sponsors, matter_actions, matter_votes, matter_texts,
 * matter_attachments, matter_classifications_current) over ZONING_DATABASE_URL, a read-only role there.
 *
 * Nothing is scraped: chicago-budget syncs the City Clerk's eLMS API nightly. Texts are capped at TEXT_CAP
 * characters; the rezoning sentence sits in the first few thousand and a planned development's bulk table well
 * inside the cap (99% of them within 100,000 characters). Beyond the cap are plats, applications and disclosures.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Queryable } from "./parcels";

/** Matters introduced from this date on are copied, so a rezoning that preceded a 2023 permit by years is still linkable. */
export const CORPUS_SINCE = "2019-01-01";
export const TEXT_CAP = 200_000;

export interface SourceSponsor {
  name: string | null;
  type: string | null;
  office: string | null;
  person_id: string | null;
}
export interface SourceAction {
  date: string | null;
  name: string | null;
}
export interface SourceAttachment {
  file_name: string | null;
  attachment_type: string | null;
  source_url: string | null;
}
export interface SourceVote {
  voter_name: string | null;
  vote: string | null;
  person_id: string | null;
  date: string | null;
}

/** One matter as copied: the row the zoning_matters table holds. */
export interface ZoningMatterRow {
  matter_id: string;
  record_number: string;
  title: string | null;
  type: string | null;
  matter_category: string | null;
  introduction_date: string | null;
  final_action_date: string | null;
  outcome: string | null;
  sub_status: string | null;
  superseded_by: string | null;
  filing_sponsor: string | null;
  filing_office: string | null;
  sponsor_offices: string[];
  last_action_date: string | null;
  last_publication_date: string | null;
  full_text: string | null;
  extraction_method: string | null;
  sponsors: SourceSponsor[];
  actions: SourceAction[];
  attachments: SourceAttachment[];
  /** Roll calls, copied for the curated ordinances only. */
  votes: SourceVote[];
}

const CORPUS_WHERE = `m.type = 'Ordinance' and m.introduction_date >= $1
  and (m.matter_category like 'ZONING RECLASSIFICATIONS%'
       or exists (select 1 from matter_classifications_current c where c.matter_id = m.matter_id and c.action_type = 'rezones'))`;

const COLUMNS = `m.matter_id::text, m.record_number, m.title, m.type, m.matter_category,
  m.introduction_date::text, m.final_action_date::text, m.outcome, m.sub_status, m.superseded_by,
  m.filing_sponsor, m.filing_office, m.last_publication_date::text,
  left(t.full_text, ${TEXT_CAP}) as full_text, t.extraction_method,
  (select coalesce(json_agg(json_build_object('name', s.sponsor_name, 'type', s.sponsor_type, 'office', s.office, 'person_id', s.person_id::text) order by s.id), '[]'::json)
     from matter_sponsors s where s.matter_id = m.matter_id) as sponsors,
  (select coalesce(json_agg(json_build_object('date', a.action_date::text, 'name', a.action_name) order by a.action_date, a.sort), '[]'::json)
     from matter_actions a where a.matter_id = m.matter_id) as actions,
  (select max(a.action_date)::text from matter_actions a where a.matter_id = m.matter_id) as last_action_date,
  (select coalesce(json_agg(json_build_object('file_name', x.file_name, 'attachment_type', x.attachment_type, 'source_url', x.source_url) order by x.id), '[]'::json)
     from matter_attachments x where x.matter_id = m.matter_id) as attachments`;

const VOTES = `(select coalesce(json_agg(json_build_object('voter_name', v.voter_name, 'vote', v.vote, 'person_id', v.person_id::text, 'date', v.action_date::text) order by v.id), '[]'::json)
     from matter_votes v where v.matter_id = m.matter_id) as votes`;

function toRow(r: Record<string, unknown>, withVotes: boolean): ZoningMatterRow {
  const json = <T>(v: unknown): T => (typeof v === "string" ? (JSON.parse(v) as T) : (v as T));
  const sponsors = json<SourceSponsor[]>(r.sponsors) ?? [];
  return {
    matter_id: String(r.matter_id).toLowerCase(),
    record_number: String(r.record_number),
    title: (r.title as string | null) ?? null,
    type: (r.type as string | null) ?? null,
    matter_category: (r.matter_category as string | null) ?? null,
    introduction_date: (r.introduction_date as string | null) ?? null,
    final_action_date: (r.final_action_date as string | null) ?? null,
    outcome: (r.outcome as string | null) ?? null,
    sub_status: (r.sub_status as string | null) ?? null,
    superseded_by: (r.superseded_by as string | null) ?? null,
    filing_sponsor: (r.filing_sponsor as string | null) ?? null,
    filing_office: (r.filing_office as string | null) ?? null,
    sponsor_offices: [...new Set(sponsors.map((s) => s.office ?? "").filter((o) => /^\d{1,2}$/.test(o)).map((o) => String(Number(o))))],
    last_action_date: (r.last_action_date as string | null) ?? null,
    last_publication_date: (r.last_publication_date as string | null) ?? null,
    full_text: (r.full_text as string | null) ?? null,
    extraction_method: (r.extraction_method as string | null) ?? null,
    sponsors,
    actions: json<SourceAction[]>(r.actions) ?? [],
    attachments: json<SourceAttachment[]>(r.attachments) ?? [],
    votes: withVotes ? (json<SourceVote[]>(r.votes) ?? []) : [],
  };
}

export interface CopyOptions {
  /** Corpus start (introduction date). */
  since: string;
  /** Only matters published after this timestamp (minus a day of overlap); omit for the whole corpus. */
  publishedAfter?: string | null;
}

/** The zoning reclassification corpus: every matter, or only those published since a cursor. */
export async function copyMatters(db: Queryable, opts: CopyOptions): Promise<ZoningMatterRow[]> {
  const params: unknown[] = [opts.since];
  let where = CORPUS_WHERE;
  if (opts.publishedAfter) {
    params.push(opts.publishedAfter);
    where += ` and m.last_publication_date > ($2::timestamptz - interval '1 day')`;
  }
  const { rows } = await db.query(`select ${COLUMNS} from matters m left join matter_texts t on t.matter_id = m.matter_id where ${where} order by m.introduction_date, m.record_number`, params);
  return rows.map((r) => toRow(r, false));
}

/** The curated ordinances (any date, any category), with their roll calls. Records not found are left out. */
export async function copyRecords(db: Queryable, recordNumbers: string[]): Promise<ZoningMatterRow[]> {
  if (!recordNumbers.length) return [];
  const { rows } = await db.query(`select ${COLUMNS}, ${VOTES} from matters m left join matter_texts t on t.matter_id = m.matter_id where m.record_number = any($1::text[])`, [recordNumbers]);
  return rows.map((r) => toRow(r, true));
}

/** Every matter id in the corpus right now, for the count check and for dropping matters the Clerk removed. */
export async function sourceInventory(db: Queryable, since: string): Promise<{ ids: Set<string>; newestPublication: string | null }> {
  const { rows } = await db.query(`select m.matter_id::text as id, (max(m.last_publication_date) over ())::text as newest from matters m where ${CORPUS_WHERE}`, [since]);
  return { ids: new Set(rows.map((r) => String(r.id).toLowerCase())), newestPublication: rows.length ? ((rows[0].newest as string | null) ?? null) : null };
}

/** The ward each alder sponsor's person id maps to, from every sponsorship in the copy (alders file under their ward office). */
export function personWards(rows: readonly ZoningMatterRow[]): Map<string, number> {
  const votes = new Map<string, Map<number, number>>();
  for (const r of rows) {
    for (const s of r.sponsors) {
      if (!s.person_id || !s.office || !/^\d{1,2}$/.test(s.office)) continue;
      const w = Number(s.office);
      if (w < 1 || w > 50) continue;
      const m = votes.get(s.person_id) ?? new Map<number, number>();
      m.set(w, (m.get(w) ?? 0) + 1);
      votes.set(s.person_id, m);
    }
  }
  const out = new Map<string, number>();
  for (const [pid, m] of votes) out.set(pid, [...m.entries()].sort((a, b) => b[1] - a[1])[0][0]);
  return out;
}

// --- offline cache (dry runs) --------------------------------------------------------------------------

export interface ZoningCache {
  copied_at: string;
  since: string;
  /** Newest last_publication_date among the rows, the cursor for the next incremental copy. */
  cursor: string | null;
  matters: ZoningMatterRow[];
  records: ZoningMatterRow[];
}

export function loadZoningCache(file: string): ZoningCache | null {
  if (!existsSync(file)) return null;
  return JSON.parse(readFileSync(file, "utf8")) as ZoningCache;
}

export function saveZoningCache(file: string, cache: ZoningCache): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(cache));
}

/** Merge an incremental copy into an older set: new rows replace rows with the same matter id. */
export function mergeRows(previous: readonly ZoningMatterRow[], fresh: readonly ZoningMatterRow[]): ZoningMatterRow[] {
  const byId = new Map(previous.map((r) => [r.matter_id, r]));
  for (const r of fresh) byId.set(r.matter_id, r);
  return [...byId.values()].sort((a, b) => (a.introduction_date ?? "").localeCompare(b.introduction_date ?? "") || a.record_number.localeCompare(b.record_number));
}

export function newestPublication(rows: readonly ZoningMatterRow[]): string | null {
  let newest: string | null = null;
  for (const r of rows) if (r.last_publication_date && (!newest || r.last_publication_date > newest)) newest = r.last_publication_date;
  return newest;
}
