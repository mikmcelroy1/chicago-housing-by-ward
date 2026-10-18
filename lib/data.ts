/**
 * The one data entry point for the site: getSnapshot(). Two backends, one shape.
 *
 * - Fixture: data/fixtures/snapshot.json (written by `npm run etl -- --dry-run`). Used when
 *   DATA_SOURCE=fixture or NEXT_PUBLIC_SUPABASE_URL is unset.
 * - Supabase: the public-read tables in supabase/migrations/001_schema.sql.
 *
 * The result is cached for an hour with `use cache` (the Cache Components equivalent of
 * unstable_cache / revalidate = 3600). Server-side only.
 */
import { cacheLife } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ActionProject, AlderSponsorship, AlderTenure, KeyOrdinance, Project, Snapshot, WardFlag, WardRow, ZoningAction } from "@/scripts/lib/types";

/** First day of the current ward map and council; mirrors WINDOW_START in scripts/ingest-permits.ts. */
const WINDOW_START = "2023-05-15";
const PAGE_SIZE = 1000;

export async function getSnapshot(): Promise<Snapshot> {
  "use cache";
  cacheLife("hours");
  return isFixtureBackend() ? readFixture() : readSupabase();
}

function isFixtureBackend(): boolean {
  return process.env.DATA_SOURCE === "fixture" || !process.env.NEXT_PUBLIC_SUPABASE_URL;
}

async function readFixture(): Promise<Snapshot> {
  const file = path.join(process.cwd(), "data", "fixtures", "snapshot.json");
  const raw = JSON.parse(await readFile(file, "utf8")) as Partial<Snapshot> & Pick<Snapshot, "generated_at" | "window_start" | "wards" | "tenures" | "flags" | "projects" | "counts">;
  // A snapshot written before the zoning stage existed still renders, with empty alder-actions tables.
  return {
    ...raw,
    projects: raw.projects.map((p) => ({ ...p, flags: p.flags ?? [], action_matter_id: p.action_matter_id ?? null })),
    actions: raw.actions ?? [],
    action_projects: raw.action_projects ?? [],
    key_ordinances: raw.key_ordinances ?? [],
    sponsorships: raw.sponsorships ?? [],
  };
}

// --- Supabase ---------------------------------------------------------------------------------

type ProjectRow = Omit<Project, "permit_ids" | "reported_cost"> & { reported_cost: number | string | null };
type ActionRow = Omit<ZoningAction, "from_far" | "to_far"> & { from_far: number | string | null; to_far: number | string | null };
type EtlRunRow = { finished_at: string | null; counts: Record<string, number> | null };

function client(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function selectAll<T>(supabase: SupabaseClient, table: string, columns: string, orderBy: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(from, from + PAGE_SIZE - 1)
      .overrideTypes<T[], { merge: false }>();
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function readSupabase(): Promise<Snapshot> {
  const supabase = client();
  const [wards, tenures, flags, projectRows, runs, actionRows, actionProjects, keyOrdinances, sponsorships] = await Promise.all([
    selectAll<WardRow>(supabase, "wards", "ward, units_2020, pop_2020, alder_current, website", "ward"),
    selectAll<AlderTenure>(supabase, "alder_tenures", "id, ward, name, photo_url, start_date, end_date, source_url", "id"),
    selectAll<WardFlag>(supabase, "ward_flags", "ward, flag, value, source_url, as_of", "ward"),
    selectAll<ProjectRow>(
      supabase,
      "projects",
      "id, project_key, kind, ward, units_delta, counted, first_issue_date, primary_permit_id, permit_no, address, lat, lon, alder_tenure_id, subsidized, replaced_units, merged_into, status, description, reported_cost, review_type, needs_review, ward_geom_mismatch, flags, action_matter_id",
      "id",
    ),
    supabase
      .from("etl_runs")
      .select("finished_at, counts")
      .eq("status", "ok")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1),
    selectAll<ActionRow>(
      supabase,
      "zoning_actions",
      "matter_id, record_number, title, introduction_date, final_action_date, outcome, sponsor_ward, sponsor_name, sponsored_by_alder, ward, ward_source, alder_tenure_id, addresses, address, pins, app_no, type1, from_districts, from_district, to_district, from_far, to_far, direction, requested_units, approved_units, units_source, lot_sf, allowed_before, allowed_after, stage, stage_date, days_pending, substitute, days_to_passage, needs_review, exhibits_pending, notes",
      "matter_id",
    ),
    selectAll<ActionProject>(supabase, "action_projects", "matter_id, project_id, lag_days, match", "matter_id"),
    selectAll<KeyOrdinance>(supabase, "key_ordinances", "record_number, label, stance, note, flag, title, introduction_date, final_action_date, outcome", "record_number"),
    selectAll<AlderSponsorship>(supabase, "alder_sponsorships", "record_number, ward, alder_name, alder_tenure_id, role, vote", "record_number"),
  ]);
  if (runs.error) throw new Error(`etl_runs: ${runs.error.message}`);
  const latest: EtlRunRow | undefined = (runs.data ?? [])[0];

  const projects: Project[] = projectRows.map((row) => ({
    ...row,
    reported_cost: row.reported_cost === null ? null : Number(row.reported_cost),
    flags: row.flags ?? [],
    action_matter_id: row.action_matter_id ?? null,
    permit_ids: [],
  }));
  const actions: ZoningAction[] = actionRows.map((row) => ({
    ...row,
    from_far: row.from_far === null ? null : Number(row.from_far),
    to_far: row.to_far === null ? null : Number(row.to_far),
    addresses: row.addresses ?? [],
    pins: row.pins ?? [],
    from_districts: row.from_districts ?? [],
    notes: row.notes ?? [],
  }));

  const counts: Record<string, number> = {
    ...(latest?.counts ?? {}),
    projects: projects.length,
    counted_projects: projects.filter((p) => p.counted).length,
  };

  return {
    generated_at: latest?.finished_at ?? new Date().toISOString(),
    window_start: WINDOW_START,
    wards,
    tenures,
    flags,
    projects,
    counts,
    actions,
    action_projects: actionProjects,
    key_ordinances: keyOrdinances,
    sponsorships,
  };
}
