/** URL state shared by every page: ?from=YYYY-MM-DD&to=YYYY-MM-DD&sort=rate|net|gross|lost|projects&dir=asc&completed=1 */
import { addDays, isIsoDate } from "./dates";
import { SORT_KEYS, type DateWindow, type SortDir, type SortKey } from "./rank";

export type Preset = "last12" | "ytd" | "term" | "custom";
export type SearchParams = Record<string, string | string[] | undefined>;

/** A sortable column with the words its header and info badge carry. */
export interface SortColumn<K extends string = SortKey> {
  key: K;
  label: string;
  info: string;
  /** Heading id on /methodology. */
  anchor: string;
  /** Wording for the phone sort menu, when the header label is too short to stand alone. */
  menuLabel?: string;
}

export interface QueryState<K extends string = SortKey> extends DateWindow {
  preset: Preset;
  sort: K;
  dir: SortDir;
  completed: boolean;
  /** The sort the page opens on; links leave it out of the URL. Absent means "rate", the permits tab's default. */
  defaultSort?: K;
}

export type SortState<K extends string = SortKey> = { sort: K; dir: SortDir; defaultSort?: K };

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

export interface ParseOptions<K extends string> {
  /** The period a page opens on when the URL names none; the permits tab opens on the last 12 months. */
  defaultPreset?: Exclude<Preset, "custom">;
  /** The page's sortable columns and the one it opens on; the permits tab's are the ranking's SORT_KEYS and "rate". */
  sortKeys?: readonly K[];
  defaultSort?: K;
}

/** Parse defensively: a missing or malformed window falls back to the page's default period, a bad sort to its default sort. */
export function parseQuery<K extends string = SortKey>(sp: SearchParams, today: string, windowStart: string, opts: ParseOptions<K> = {}): QueryState<K> {
  const from = firstValue(sp, "from");
  const to = firstValue(sp, "to");
  const window: DateWindow =
    isIsoDate(from) && isIsoDate(to) && from <= to ? { from, to } : presetWindow(opts.defaultPreset ?? "last12", today, windowStart);
  const keys: readonly string[] = opts.sortKeys ?? SORT_KEYS;
  const fallback = (opts.defaultSort ?? "rate") as K;
  const sortRaw = firstValue(sp, "sort") ?? (firstValue(sp, "rank") === "net" ? "net" : undefined);
  const sort = (keys.includes(sortRaw ?? "") ? sortRaw : fallback) as K;
  const dir: SortDir = firstValue(sp, "dir") === "asc" ? "asc" : "desc";
  const completedRaw = firstValue(sp, "completed");
  const completed = completedRaw === "1" || completedRaw === "true" || completedRaw === "on";
  const state: QueryState<K> = { ...window, preset: detectPreset(window, today, windowStart), sort, dir, completed };
  if (opts.defaultSort) state.defaultSort = opts.defaultSort;
  return state;
}

/** The sort state after clicking a column: same column flips direction, a new column starts descending. */
export function nextSort<K extends string>(state: SortState<K>, key: K): { sort: K; dir: SortDir } {
  if (state.sort === key) return { sort: key, dir: state.dir === "desc" ? "asc" : "desc" };
  return { sort: key, dir: "desc" };
}

/** Build a path with the query string for a state, keeping any page-specific extras (kind, counted). */
export function buildHref(path: string, state: DateWindow & SortState<string> & { completed: boolean }, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  params.set("from", state.from);
  params.set("to", state.to);
  if (state.sort !== (state.defaultSort ?? "rate")) params.set("sort", state.sort);
  if (state.dir === "asc") params.set("dir", "asc");
  if (state.completed) params.set("completed", "1");
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  return `${path}?${params.toString()}`;
}

/** The same period on another page (the tabs): the period and the completed toggle carry over, the sort does not. */
export function periodHref(path: string, state: DateWindow & { completed: boolean }): string {
  const params = new URLSearchParams({ from: state.from, to: state.to });
  if (state.completed) params.set("completed", "1");
  return `${path}?${params.toString()}`;
}
