/** Ward polygons from the city portal and a point-in-polygon test, so the ETL can verify wards offline. */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { fetchWithRetry } from "./socrata";

export const WARDS_GEOJSON_URL = "https://data.cityofchicago.org/api/geospatial/p293-wvbd?method=export&format=GeoJSON";

type Ring = [number, number][];


export async function loadWardPolygons(cacheDir = join(process.cwd(), "data", "cache")): Promise<{ ward: number; polys: Ring[][] }[]> {
  mkdirSync(cacheDir, { recursive: true });
  const cache = join(cacheDir, "wards-2023.geojson");
  let text: string;
  if (existsSync(cache)) text = readFileSync(cache, "utf8");
  else {
    const res = await fetchWithRetry(WARDS_GEOJSON_URL);
    text = await res.text();
    writeFileSync(cache, text);
  }
  const gj = JSON.parse(text) as { features: { properties: { ward: string }; geometry: { type: string; coordinates: unknown } }[] };
  const out: { ward: number; polys: Ring[][] }[] = [];
  for (const f of gj.features) {
    const ward = Number(f.properties.ward);
    if (!(ward >= 1 && ward <= 50)) continue;
    const g = f.geometry;
    const polys = (g.type === "Polygon" ? [g.coordinates] : g.coordinates) as Ring[][];
    out.push({ ward, polys });
  }
  if (out.length !== 50) throw new Error(`ward GeoJSON has ${out.length}/50 wards`);
  return out;
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function wardAt(polys: { ward: number; polys: Ring[][] }[], lon: number, lat: number): number | null {
  for (const w of polys) {
    for (const poly of w.polys) {
      if (!inRing(lon, lat, poly[0])) continue;
      if (poly.slice(1).some((hole) => inRing(lon, lat, hole))) continue;
      return w.ward;
    }
  }
  return null;
}

/** Metres between two WGS84 points. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
