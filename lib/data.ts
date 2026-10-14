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
import type { AlderTenure, Project, Snapshot, WardFlag, WardRow } from "@/scripts/lib/types";

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
  const raw = await readFile(file, "utf8");
  return JSON.parse(raw) as Snapshot;
}

// --- Supabase ---------------------------------------------------------------------------------

type ProjectRow = Omit<Project, "permit_ids" | "reported_cost"> & { reported_cost: number | string | null };
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
  const [wards, tenures, flags, projectRows, runs] = await Promise.all([
    selectAll<WardRow>(supabase, "wards", "ward, units_2020, pop_2020, alder_current, website", "ward"),
    selectAll<AlderTenure>(supabase, "alder_tenures", "id, ward, name, photo_url, start_date, end_date, source_url", "id"),
    selectAll<WardFlag>(supabase, "ward_flags", "ward, flag, value, source_url, as_of", "ward"),
    selectAll<ProjectRow>(
      supabase,
      "projects",
      "id, project_key, kind, ward, units_delta, counted, first_issue_date, primary_permit_id, permit_no, address, lat, lon, alder_tenure_id, subsidized, replaced_units, merged_into, status, description, reported_cost, review_type, needs_review, ward_geom_mismatch, flags",
      "id",
    ),
    supabase
      .from("etl_runs")
      .select("finished_at, counts")
      .eq("status", "ok")
      .not("finished_at", "is", null)
      .order("finished_at", { ascending: false })
      .limit(1),
  ]);
  if (runs.error) throw new Error(`etl_runs: ${runs.error.message}`);
  const latest: EtlRunRow | undefined = (runs.data ?? [])[0];

  const projects: Project[] = projectRows.map((row) => ({
    ...row,
    reported_cost: row.reported_cost === null ? null : Number(row.reported_cost),
    flags: row.flags ?? [],
    permit_ids: [],
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
  };
}
