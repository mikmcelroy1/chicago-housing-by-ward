/**
 * Ward polygons (Boundaries - Wards 2023-, p293-wvbd) and ward office websites (Ward Offices, htai-wnw4)
 * into the wards table. Idempotent; runs before the ETL in the nightly workflow. Exits 2 on structural drift.
 * The alder shown on the site comes from data/alder_tenure.csv, not from here.
 */
import { Client } from "pg";
import { fetchWithRetry } from "./lib/socrata";
import { WARDS_GEOJSON_URL } from "./lib/geo";

const OFFICES_URL = "https://data.cityofchicago.org/resource/htai-wnw4.json?$limit=100";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const [offices, boundaries] = await Promise.all([
    fetchWithRetry(OFFICES_URL).then((r) => r.json() as Promise<{ ward: string; alderman?: string; website?: { url?: string } }[]>),
    fetchWithRetry(WARDS_GEOJSON_URL).then((r) => r.json() as Promise<{ features: { properties: { ward?: string }; geometry: unknown }[] }>),
  ]);
  const geom = new Map<number, unknown>();
  for (const f of boundaries.features ?? []) {
    const w = Number(f.properties?.ward);
    if (w >= 1 && w <= 50 && f.geometry) geom.set(w, f.geometry);
  }
  const site = new Map<number, string | null>();
  for (const o of offices) {
    const w = Number(o.ward);
    if (w >= 1 && w <= 50) site.set(w, o.website?.url ?? null);
  }
  if (geom.size !== 50) {
    console.error(`!!! ward boundaries: ${geom.size}/50`);
    process.exit(2);
  }
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin");
    for (let w = 1; w <= 50; w++) {
      await client.query(
        `insert into wards (ward, geom, website, synced_at)
         values ($1, st_multi(st_setsrid(st_geomfromgeojson($2), 4326)), $3, now())
         on conflict (ward) do update set geom = excluded.geom, website = excluded.website, synced_at = now()`,
        [w, JSON.stringify(geom.get(w)), site.get(w) ?? null],
      );
    }
    await client.query("commit");
    console.log("wards synced: 50/50 boundaries, websites");
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
