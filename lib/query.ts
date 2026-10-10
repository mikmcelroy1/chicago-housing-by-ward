/** URL state shared by every page: ?from=YYYY-MM-DD&to=YYYY-MM-DD&sort=rate|net|gross|lost|projects&dir=asc&completed=1 */
import { addDays, isIsoDate } from "./dates";
import { SORT_KEYS, type DateWindow, type SortDir, type SortKey } from "./rank";

export type Preset = "last12" | "ytd" | "term" | "custom";
export type SearchParams = Record<string, string | string[] | undefined>;

export interface QueryState extends DateWindow {
  preset: Preset;
  sort: SortKey;
  dir: SortDir;
  completed: boolean;
}

export type SortState = { sort: SortKey; dir: SortDir };

export const PRESET_LABELS: Record<Preset, string> = {
  last12: "Last 12 months",
  ytd: "YTD",
  term: "Current term",
  custom: "Custom",
};

export function firstValue(sp: SearchParams, key: string): string | undefined {
  const v = sp[key];
  return Array.isArray(v) ? v[0] : v;
}

export function presetWindow(preset: Exclude<Preset, "custom">, today: string, windowStart: string): DateWindow {
  switch (preset) {
    case "last12":
      return { from: addDays(today, -365), to: today };
    case "ytd":
      return { from: `${today.slice(0, 4)}-01-01`, to: today };
    case "term":
      return { from: windowStart, to: today };
  }
}

export function detectPreset(window: DateWindow, today: string, windowStart: string): Preset {
  for (const preset of ["last12", "ytd", "term"] as const) {
    const w = presetWindow(preset, today, windowStart);
    if (w.from === window.from && w.to === window.to) return preset;
  }
  return "custom";
}

/** Parse defensively: a missing or malformed window falls back to the last 12 months. */
export function parseQuery(sp: SearchParams, today: string, windowStart: string): QueryState {
  const from = firstValue(sp, "from");
  const to = firstValue(sp, "to");
  const window: DateWindow =
    isIsoDate(from) && isIsoDate(to) && from <= to ? { from, to } : presetWindow("last12", today, windowStart);
  const sortRaw = firstValue(sp, "sort") ?? (firstValue(sp, "rank") === "net" ? "net" : undefined);
  const sort: SortKey = (SORT_KEYS as readonly string[]).includes(sortRaw ?? "") ? (sortRaw as SortKey) : "rate";
  const dir: SortDir = firstValue(sp, "dir") === "asc" ? "asc" : "desc";
  const completedRaw = firstValue(sp, "completed");
  const completed = completedRaw === "1" || completedRaw === "true" || completedRaw === "on";
  return { ...window, preset: detectPreset(window, today, windowStart), sort, dir, completed };
}

/** The sort state after clicking a column: same column flips direction, a new column starts descending. */
export function nextSort(state: SortState, key: SortKey): SortState {
  if (state.sort === key) return { sort: key, dir: state.dir === "desc" ? "asc" : "desc" };
  return { sort: key, dir: "desc" };
}

/** Build a path with the query string for a state, keeping any page-specific extras (kind, counted). */
export function buildHref(path: string, state: DateWindow & SortState & { completed: boolean }, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  params.set("from", state.from);
  params.set("to", state.to);
  if (state.sort !== "rate") params.set("sort", state.sort);
  if (state.dir === "asc") params.set("dir", "asc");
  if (state.completed) params.set("completed", "1");
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  return `${path}?${params.toString()}`;
}
