/** Paged reads from Socrata (data.cityofchicago.org, datacatalog.cookcountyil.gov). */

const PAGE = 50_000;

export interface SoqlOptions {
  select?: string;
  where?: string;
  group?: string;
  order?: string;
  limit?: number; // total cap
}

function headers(): Record<string, string> {
  const token = process.env.SOCRATA_APP_TOKEN;
  return token ? { "X-App-Token": token } : {};
}

export async function soql<T = Record<string, unknown>>(domain: string, dataset: string, opts: SoqlOptions): Promise<T[]> {
  const out: T[] = [];
  let offset = 0;
  for (;;) {
    const params = new URLSearchParams();
    if (opts.select) params.set("$select", opts.select);
    if (opts.where) params.set("$where", opts.where);
    if (opts.group) params.set("$group", opts.group);
    params.set("$order", opts.order ?? ":id");
    const want = opts.limit ? Math.min(PAGE, opts.limit - out.length) : PAGE;
    if (want <= 0) break;
    params.set("$limit", String(want));
    params.set("$offset", String(offset));
    const url = `https://${domain}/resource/${dataset}.json?${params}`;
    const res = await fetchWithRetry(url);
    const rows = (await res.json()) as T[];
    out.push(...rows);
    if (rows.length < want) break;
    offset += rows.length;
  }
  return out;
}

export async function fetchWithRetry(url: string, tries = 4): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { headers: headers(), signal: AbortSignal.timeout(180_000) });
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`${res.status} from ${url}`);
      } else {
        throw new Error(`${res.status} from ${url}: ${(await res.text()).slice(0, 300)}`);
      }
    } catch (err) {
      lastErr = err;
    }
    await new Promise((r) => setTimeout(r, 2000 * 2 ** i));
  }
  throw lastErr;
}

/** SoQL string literal. */
export function lit(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}
