/**
 * Impact report for a change to the rules: Chicago and every ward, before and after, for the two windows the site
 * opens on (last 12 months, this term), plus every project whose number moved. Writes docs/impact/<date>-<slug>.xlsx
 * and a Markdown twin next to it. Run it BEFORE `npm run etl` loads the change, while the database still holds the
 * old numbers.
 *
 *   npm run etl -- --dry-run --cache                                  "after": the working tree on the cached pull
 *   npm run impact -- --before-commit HEAD --note "what changed"      "before": that commit, dry-run on the same pull
 *   npm run impact -- --note "what changed"                           "before": the live database instead
 *
 *   --before-commit <git ref>       a temporary worktree of that commit is dry-run on the same cached permit
 *                                   pull, so every difference is the rules (takes a few minutes: the assessor
 *                                   lookups start from an empty cache there)
 *   --before db | <snapshot.json>   default db; ignored when --before-commit is given
 *   --after <snapshot.json>         default data/fixtures/snapshot.json
 *   --slug <file name part>         default: made from the note
 *   --date YYYY-MM-DD               default: today in Chicago; the windows end here
 *
 * The Excel file keeps its arithmetic as formulas (variances, totals, rates) so it recalculates if a number is edited.
 * Ranks are values: the site breaks ties on net, then gross, which a RANK() cannot.
 */
import { execSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { Client } from "pg";
import { todayInChicago } from "../lib/dates";
import { presetWindow } from "../lib/query";
import { computeWardStats, rankWards, type DateWindow, type RankedWard } from "../lib/rank";
import type { AlderTenure, Project, Snapshot, WardRow } from "./lib/types";

const ROOT = process.cwd();
const argVal = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const NOTE = argVal("--note") ?? "";
if (!NOTE) {
  console.error('usage: npm run impact -- --note "what changed" [--before db|file] [--after file] [--slug name] [--date YYYY-MM-DD]');
  process.exit(1);
}
const BEFORE = argVal("--before") ?? "db";
const BEFORE_COMMIT = argVal("--before-commit");
const AFTER = argVal("--after") ?? join("data", "fixtures", "snapshot.json");
const DATE = argVal("--date") ?? todayInChicago();
const TITLE = NOTE.split(/(?<=\.)\s+/)[0].replace(/\.$/, "").slice(0, 110);
const SLUG = (argVal("--slug") ?? TITLE).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);

const FONT: Partial<ExcelJS.Font> = { name: "Arial", size: 10 };
const BOLD: Partial<ExcelJS.Font> = { ...FONT, bold: true };
const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE4E4E7" } };
const INT = "#,##0;-#,##0;0";
const SIGNED = "+#,##0;-#,##0;0";
const RATE = "0.0;-0.0;0.0";
const SIGNED_RATE = "+0.0;-0.0;0.0";
const GREEN = "FF047857";
const RED = "FFB91C1C";

// --- inputs -----------------------------------------------------------------------------------------

async function loadBefore(): Promise<{ snapshot: Snapshot; label: string }> {
  if (BEFORE_COMMIT) return snapshotAtCommit(BEFORE_COMMIT);
  if (BEFORE !== "db") return { snapshot: readSnapshot(BEFORE), label: BEFORE };
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set; pass --before <snapshot.json> for an offline comparison");
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    const wards = (await c.query("select ward, units_2020, pop_2020, alder_current, website from wards order by ward")).rows as WardRow[];
    const tenures = (await c.query("select id, ward, name, photo_url, start_date::text, end_date::text, source_url from alder_tenures")).rows as AlderTenure[];
    const rows = (await c.query(
      "select id, project_key, kind, ward, units_delta, counted, first_issue_date::text, primary_permit_id, permit_no, address, lat, lon, alder_tenure_id, subsidized, replaced_units, merged_into, status, description, reported_cost, review_type, needs_review, ward_geom_mismatch, flags from projects",
    )).rows as (Omit<Project, "permit_ids" | "reported_cost"> & { reported_cost: string | null })[];
    const run = (await c.query("select id, finished_at from etl_runs where status = 'ok' and finished_at is not null order by id desc limit 1")).rows[0] as { id: number; finished_at: Date } | undefined;
    const projects: Project[] = rows.map((r) => ({ ...r, permit_ids: [], reported_cost: r.reported_cost === null ? null : Number(r.reported_cost), flags: r.flags ?? [], action_matter_id: null }));
    const snapshot: Snapshot = { generated_at: run ? new Date(run.finished_at).toISOString() : "", window_start: "2023-05-15", wards, tenures, flags: [], projects, counts: {}, actions: [], action_projects: [], key_ordinances: [], sponsorships: [] };
    return { snapshot, label: `live database, ETL run ${run?.id ?? "?"}` };
  } finally {
    await c.end().catch(() => {});
  }
}

/**
 * The pipeline as it was at a commit, run on the same cached permit pull as the working tree: a temporary worktree
 * with this checkout's node_modules, permit pull and ward boundaries linked in, and an empty parcel cache (the cache
 * file's shape may have changed since). The worktree is removed afterwards.
 */
function snapshotAtCommit(ref: string): { snapshot: Snapshot; label: string } {
  const short = execSync(`git rev-parse --short ${ref}`, { cwd: ROOT, encoding: "utf8" }).trim();
  const dir = mkdtempSync(join(tmpdir(), "impact-before-"));
  execSync(`git worktree add --detach "${dir}" ${ref}`, { cwd: ROOT, stdio: "ignore" });
  try {
    symlinkSync(join(ROOT, "node_modules"), join(dir, "node_modules"));
    mkdirSync(join(dir, "data", "cache"), { recursive: true });
    mkdirSync(join(dir, "data", "fixtures"), { recursive: true });
    for (const f of readdirSync(join(ROOT, "data", "cache"))) {
      if (/^permits-.*\.json$/.test(f) || f.endsWith(".geojson")) symlinkSync(join(ROOT, "data", "cache", f), join(dir, "data", "cache", f));
    }
    const denominator = join(ROOT, "data", "fixtures", "denominator.json");
    if (existsSync(denominator)) copyFileSync(denominator, join(dir, "data", "fixtures", "denominator.json"));
    console.log(`before: dry run of commit ${short} in a temporary worktree ...`);
    execSync("npx tsx scripts/ingest-permits.ts --dry-run --cache", { cwd: dir, stdio: "inherit" });
    const snapshot = JSON.parse(readFileSync(join(dir, "data", "fixtures", "snapshot.json"), "utf8")) as Snapshot;
    return { snapshot, label: `commit ${short}, dry run on the same cached permit pull` };
  } finally {
    execSync(`git worktree remove --force "${dir}"`, { cwd: ROOT, stdio: "ignore" });
  }
}

function readSnapshot(path: string): Snapshot {
  const full = join(ROOT, path);
  if (!existsSync(full)) throw new Error(`${path} not found; run \`npm run etl -- --dry-run --cache\` first`);
  return JSON.parse(readFileSync(full, "utf8")) as Snapshot;
}

function alderOf(s: Snapshot, ward: number): string {
  return s.tenures.find((t) => t.ward === ward && !t.end_date)?.name ?? s.wards.find((w) => w.ward === ward)?.alder_current ?? "";
}

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

// --- the comparison ---------------------------------------------------------------------------------

interface WardLine {
  ward: number;
  alder: string;
  units2020: number | null;
  before: RankedWard;
  after: RankedWard;
}
interface WindowReport {
  key: string;
  title: string;
  window: DateWindow;
  lines: WardLine[];
}
interface ProjectLine {
  status: "changed" | "regrouped" | "removed" | "added";
  ward: number;
  address: string;
  kind: string;
  date: string;
  before: number | null;
  after: number | null;
  countedBefore: boolean | null;
  countedAfter: boolean | null;
  flagsBefore: string;
  flagsAfter: string;
  permit: string;
  description: string;
}

function compareWindow(key: string, title: string, window: DateWindow, before: Snapshot, after: Snapshot): WindowReport {
  const b = new Map(rankWards(computeWardStats(before, window), "rate").map((r) => [r.ward, r]));
  const a = new Map(rankWards(computeWardStats(after, window), "rate").map((r) => [r.ward, r]));
  const lines: WardLine[] = after.wards.map((w) => ({
    ward: w.ward,
    alder: alderOf(after, w.ward),
    units2020: w.units_2020,
    before: b.get(w.ward)!,
    after: a.get(w.ward)!,
  }));
  lines.sort((x, y) => x.after.rank - y.after.rank);
  return { key, title, window, lines };
}

function compareProjects(before: Snapshot, after: Snapshot): ProjectLine[] {
  const b = new Map(before.projects.map((p) => [p.id, p]));
  const a = new Map(after.projects.map((p) => [p.id, p]));
  const out: ProjectLine[] = [];
  const line = (status: ProjectLine["status"], x: Project | undefined, y: Project | undefined): ProjectLine => {
    const p = (y ?? x)!;
    return {
      status, ward: p.ward, address: p.address, kind: p.kind, date: p.first_issue_date,
      before: x ? x.units_delta : null, after: y ? y.units_delta : null,
      countedBefore: x ? x.counted : null, countedAfter: y ? y.counted : null,
      flagsBefore: (x?.flags ?? []).join(", "), flagsAfter: (y?.flags ?? []).join(", "),
      permit: p.permit_no, description: p.description.slice(0, 160),
    };
  };
  for (const [id, x] of b) {
    const y = a.get(id);
    if (!y) out.push(line("removed", x, undefined));
    else if (x.units_delta !== y.units_delta || x.counted !== y.counted || x.kind !== y.kind) out.push(line("changed", x, y));
  }
  for (const [id, y] of a) if (!b.has(id)) out.push(line("added", undefined, y));
  // A removed and an added project at the same address and kind are the same project under a new id: its permits
  // regrouped (for example, its first permit turned out to be a garage). Show them as one row.
  const removed = out.filter((l) => l.status === "removed");
  for (const added of out.filter((l) => l.status === "added")) {
    const i = removed.findIndex((r) => r.address === added.address && r.kind === added.kind);
    if (i < 0) continue;
    const [r] = removed.splice(i, 1);
    added.status = "regrouped";
    added.before = r.before;
    added.countedBefore = r.countedBefore;
    added.flagsBefore = r.flagsBefore;
    out.splice(out.indexOf(r), 1);
  }
  const effect = (l: ProjectLine) => Math.abs((l.after ?? 0) - (l.before ?? 0));
  out.sort((x, y) => effect(y) - effect(x) || x.address.localeCompare(y.address));
  return out;
}

// --- Excel ------------------------------------------------------------------------------------------

function styleHeader(row: ExcelJS.Row): void {
  row.eachCell((cell) => {
    cell.font = BOLD;
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: "middle", wrapText: true };
    cell.border = { bottom: { style: "thin", color: { argb: "FFA1A1AA" } } };
  });
  row.height = 30;
}
function signedFormatting(ws: ExcelJS.Worksheet, ref: string): void {
  ws.addConditionalFormatting({
    ref,
    rules: [
      { type: "cellIs", operator: "greaterThan", formulae: ["0"], priority: 1, style: { font: { color: { argb: GREEN } } } },
      { type: "cellIs", operator: "lessThan", formulae: ["0"], priority: 2, style: { font: { color: { argb: RED } } } },
    ],
  });
}
const f = (formula: string, result: number | string | null) => ({ formula, result: result === null ? undefined : result }) as ExcelJS.CellFormulaValue;

function wardSheet(wb: ExcelJS.Workbook, name: string, rep: WindowReport): { name: string; totalsRow: number } {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", xSplit: 2, ySplit: 1 }] });
  const headers = [
    "Ward", "Alder", "Existing units (2020)",
    "Gross before", "Gross after", "Gross change",
    "Lost before", "Lost after", "Lost change",
    "Net before", "Net after", "Net change",
    "Rate before (net per 1,000)", "Rate after", "Rate change",
    "Counted projects before", "Counted projects after",
    "Rank before", "Rank after", "Rank move (+ = up)",
    "Emergency units before (not counted)", "Emergency units after",
  ];
  styleHeader(ws.addRow(headers));
  ws.columns = headers.map((h, i) => ({ width: i === 1 ? 24 : i === 0 ? 7 : 12 }));
  for (const l of rep.lines) {
    const r = ws.rowCount + 1;
    const rateB = l.units2020 ? (l.before.net / l.units2020) * 1000 : null;
    const rateA = l.units2020 ? (l.after.net / l.units2020) * 1000 : null;
    const row = ws.addRow([
      l.ward, l.alder, l.units2020,
      l.before.gross, l.after.gross, f(`E${r}-D${r}`, l.after.gross - l.before.gross),
      l.before.lost, l.after.lost, f(`H${r}-G${r}`, l.after.lost - l.before.lost),
      l.before.net, l.after.net, f(`K${r}-J${r}`, l.after.net - l.before.net),
      f(`IF(C${r}>0,J${r}/C${r}*1000,"")`, rateB), f(`IF(C${r}>0,K${r}/C${r}*1000,"")`, rateA), f(`IF(OR(M${r}="",N${r}=""),"",N${r}-M${r})`, rateB !== null && rateA !== null ? rateA - rateB : null),
      l.before.projects, l.after.projects,
      l.before.rank, l.after.rank, f(`R${r}-S${r}`, l.before.rank - l.after.rank),
      l.before.emergency_units, l.after.emergency_units,
    ]);
    row.eachCell((cell, col) => {
      cell.font = FONT;
      if ([3, 4, 5, 7, 8, 10, 11, 16, 17, 18, 19, 21, 22].includes(col)) cell.numFmt = INT;
      if ([6, 9, 12, 20].includes(col)) cell.numFmt = SIGNED;
      if ([13, 14].includes(col)) cell.numFmt = RATE;
      if (col === 15) cell.numFmt = SIGNED_RATE;
    });
  }
  const t = ws.rowCount + 1;
  const tot = (c: string) => rep.lines.reduce((s, l) => s + numberAt(l, c), 0);
  const sum = (c: string) => f(`SUM(${c}2:${c}${t - 1})`, tot(c));
  const units = tot("C");
  const rateB = units > 0 ? (tot("J") / units) * 1000 : "";
  const rateA = units > 0 ? (tot("K") / units) * 1000 : "";
  const totals = ws.addRow([
    "Chicago", "", sum("C"),
    sum("D"), sum("E"), f(`E${t}-D${t}`, tot("E") - tot("D")),
    sum("G"), sum("H"), f(`H${t}-G${t}`, tot("H") - tot("G")),
    sum("J"), sum("K"), f(`K${t}-J${t}`, tot("K") - tot("J")),
    f(`IF(C${t}>0,J${t}/C${t}*1000,"")`, rateB), f(`IF(C${t}>0,K${t}/C${t}*1000,"")`, rateA), f(`IF(OR(M${t}="",N${t}=""),"",N${t}-M${t})`, typeof rateA === "number" && typeof rateB === "number" ? rateA - rateB : ""),
    sum("P"), sum("Q"), "", "", "", sum("U"), sum("V"),
  ]);
  totals.eachCell((cell, col) => {
    cell.font = BOLD;
    cell.border = { top: { style: "thin", color: { argb: "FFA1A1AA" } } };
    if ([6, 9, 12].includes(col)) cell.numFmt = SIGNED;
    else if ([13, 14].includes(col)) cell.numFmt = RATE;
    else if (col === 15) cell.numFmt = SIGNED_RATE;
    else if (col > 2) cell.numFmt = INT;
  });
  signedFormatting(ws, `F2:F${t}`);
  signedFormatting(ws, `I2:I${t}`);
  signedFormatting(ws, `L2:L${t}`);
  signedFormatting(ws, `O2:O${t}`);
  signedFormatting(ws, `T2:T${t - 1}`);
  ws.autoFilter = { from: "A1", to: `V${t - 1}` };
  return { name, totalsRow: t };
}
/** Cached totals for the SUM formulas so the file shows numbers before any recalculation. */
function numberAt(l: WardLine, col: string): number {
  switch (col) {
    case "C": return l.units2020 ?? 0;
    case "D": return l.before.gross;
    case "E": return l.after.gross;
    case "G": return l.before.lost;
    case "H": return l.after.lost;
    case "J": return l.before.net;
    case "K": return l.after.net;
    case "P": return l.before.projects;
    case "Q": return l.after.projects;
    case "U": return l.before.emergency_units;
    case "V": return l.after.emergency_units;
    default: return 0;
  }
}

function projectsSheet(wb: ExcelJS.Workbook, lines: ProjectLine[]): void {
  const ws = wb.addWorksheet("Projects", { views: [{ state: "frozen", ySplit: 1 }] });
  const headers = ["Status", "Ward", "Address", "Kind", "Permit date", "Units before", "Units after", "Units change", "Counted before", "Counted after", "Flags before", "Flags after", "Permit", "Description"];
  styleHeader(ws.addRow(headers));
  ws.columns = [10, 7, 26, 18, 12, 11, 11, 11, 12, 12, 30, 30, 12, 60].map((width) => ({ width }));
  for (const l of lines) {
    const r = ws.rowCount + 1;
    const row = ws.addRow([
      l.status, l.ward, l.address, l.kind, l.date,
      l.before, l.after, f(`N(G${r})-N(F${r})`, (l.after ?? 0) - (l.before ?? 0)),
      l.countedBefore === null ? "" : l.countedBefore ? "yes" : "no", l.countedAfter === null ? "" : l.countedAfter ? "yes" : "no",
      l.flagsBefore, l.flagsAfter, l.permit, l.description,
    ]);
    row.eachCell((cell, col) => {
      cell.font = FONT;
      if (col === 6 || col === 7) cell.numFmt = INT;
      if (col === 8) cell.numFmt = SIGNED;
    });
  }
  if (lines.length) {
    signedFormatting(ws, `H2:H${lines.length + 1}`);
    ws.autoFilter = { from: "A1", to: `N${lines.length + 1}` };
  }
}

function summarySheet(ws: ExcelJS.Worksheet, meta: [string, string][], windows: { rep: WindowReport; sheet: string; totalsRow: number }[], notes: string[], projectCounts: Record<string, number>): void {
  ws.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 16 }];
  ws.getCell("A1").value = `Impact report: ${TITLE}`;
  ws.getCell("A1").font = { ...FONT, size: 14, bold: true };
  for (const [k, v] of meta) {
    const row = ws.addRow([k, v]);
    row.getCell(1).font = BOLD;
    row.getCell(2).font = FONT;
    row.getCell(2).alignment = { wrapText: false };
  }
  for (const { rep, sheet, totalsRow: t } of windows) {
    ws.addRow([]);
    const title = ws.addRow([`${rep.title} (${rep.window.from} to ${rep.window.to})`]);
    title.getCell(1).font = { ...FONT, size: 12, bold: true };
    styleHeader(ws.addRow(["Chicago", "Before", "After", "Change"]));
    const q = `'${sheet}'!`;
    const lines: [string, string, string, string, string][] = [
      ["Gross units", `${q}D${t}`, `${q}E${t}`, "C{r}-B{r}", SIGNED],
      ["Lost units", `${q}G${t}`, `${q}H${t}`, "C{r}-B{r}", SIGNED],
      ["Net units", `${q}J${t}`, `${q}K${t}`, "C{r}-B{r}", SIGNED],
      ["Net per 1,000 existing units", `${q}M${t}`, `${q}N${t}`, "C{r}-B{r}", SIGNED_RATE],
      ["Counted projects", `${q}P${t}`, `${q}Q${t}`, "C{r}-B{r}", SIGNED],
      ["Emergency units (shown, not counted)", `${q}U${t}`, `${q}V${t}`, "C{r}-B{r}", SIGNED],
    ];
    const tot = (c: string) => rep.lines.reduce((s, l) => s + numberAt(l, c), 0);
    const units = tot("C");
    const cached: Record<string, [number, number]> = {
      "Gross units": [tot("D"), tot("E")],
      "Lost units": [tot("G"), tot("H")],
      "Net units": [tot("J"), tot("K")],
      "Net per 1,000 existing units": [units ? (tot("J") / units) * 1000 : 0, units ? (tot("K") / units) * 1000 : 0],
      "Counted projects": [tot("P"), tot("Q")],
      "Emergency units (shown, not counted)": [tot("U"), tot("V")],
    };
    for (const [label, b, a, d, fmt] of lines) {
      const r = ws.rowCount + 1;
      const [cb, ca] = cached[label];
      const row = ws.addRow([label, f(b, cb), f(a, ca), f(d.replace(/\{r\}/g, String(r)), ca - cb)]);
      row.getCell(1).font = FONT;
      for (const c of [2, 3, 4]) {
        row.getCell(c).font = FONT;
        row.getCell(c).numFmt = fmt === SIGNED_RATE ? (c === 4 ? SIGNED_RATE : RATE) : c === 4 ? SIGNED : INT;
      }
      signedFormatting(ws, `D${r}:D${r}`);
    }
    const movers = [...rep.lines].sort((x, y) => Math.abs(y.after.net - y.before.net) - Math.abs(x.after.net - x.before.net) || y.before.rank - y.after.rank - (x.before.rank - x.after.rank)).filter((l) => l.after.net !== l.before.net || l.after.rank !== l.before.rank).slice(0, 5);
    if (movers.length) {
      const m = ws.addRow([`Largest ward moves, ${rep.title.toLowerCase()}`]);
      m.getCell(1).font = BOLD;
      for (const l of movers) {
        const row = ws.addRow([`Ward ${l.ward}, ${l.alder}`, `net ${fmtSigned(l.before.net)} to ${fmtSigned(l.after.net)}`, `rank ${l.before.rank} to ${l.after.rank}`]);
        row.eachCell((cell) => (cell.font = FONT));
      }
    }
  }
  ws.addRow([]);
  styleHeader(ws.addRow(["Projects", "Count"]));
  for (const [label, status] of [["Changed (units, counted or kind)", "changed"], ["Regrouped (same address, permits regrouped)", "regrouped"], ["Removed (no longer a project)", "removed"], ["Added (a project only after)", "added"]]) {
    const row = ws.addRow([label, f(`COUNTIF(Projects!A:A,"${status}")`, projectCounts[status] ?? 0)]);
    row.getCell(1).font = FONT;
    row.getCell(2).font = FONT;
    row.getCell(2).numFmt = INT;
  }
  ws.addRow([]);
  const n = ws.addRow(["Notes"]);
  n.getCell(1).font = BOLD;
  for (const note of notes) {
    const row = ws.addRow([note]);
    row.getCell(1).font = FONT;
    row.getCell(1).alignment = { wrapText: true, vertical: "top" };
    ws.mergeCells(`A${row.number}:D${row.number}`);
    row.height = Math.max(15, Math.ceil(note.length / 95) * 14);
  }
}

function changesSheet(wb: ExcelJS.Workbook, files: string[]): void {
  const ws = wb.addWorksheet("Changes");
  ws.columns = [{ width: 110 }];
  const title = ws.addRow(["What changed"]);
  title.getCell(1).font = BOLD;
  const note = ws.addRow([NOTE]);
  note.getCell(1).font = FONT;
  note.getCell(1).alignment = { wrapText: true, vertical: "top" };
  note.height = Math.max(15, Math.ceil((NOTE ?? "").length / 100) * 14);
  ws.addRow([]);
  const fh = ws.addRow(["Files"]);
  fh.getCell(1).font = BOLD;
  for (const line of files.length ? files : ["(no file changes recorded)"]) {
    const row = ws.addRow([line]);
    row.getCell(1).font = { ...FONT, name: "Courier New" };
  }
}

const fmtSigned = (n: number) => (n > 0 ? `+${n}` : String(n));

// --- Markdown ---------------------------------------------------------------------------------------

function markdown(meta: [string, string][], windows: WindowReport[], projects: ProjectLine[], files: string[]): string {
  const out: string[] = [`# Impact report: ${TITLE}`, "", NOTE, ""];
  for (const [k, v] of meta) out.push(`- **${k}:** ${v}`);
  for (const rep of windows) {
    const tot = (c: string) => rep.lines.reduce((s, l) => s + numberAt(l, c), 0);
    const units = tot("C");
    const rate = (net: number) => (units ? ((net / units) * 1000).toFixed(1) : "");
    out.push("", `## ${rep.title} (${rep.window.from} to ${rep.window.to})`, "", "| Chicago | Before | After | Change |", "| --- | ---: | ---: | ---: |");
    out.push(`| Gross units | ${tot("D")} | ${tot("E")} | ${fmtSigned(tot("E") - tot("D"))} |`);
    out.push(`| Lost units | ${tot("G")} | ${tot("H")} | ${fmtSigned(tot("H") - tot("G"))} |`);
    out.push(`| Net units | ${tot("J")} | ${tot("K")} | ${fmtSigned(tot("K") - tot("J"))} |`);
    out.push(`| Net per 1,000 existing units | ${rate(tot("J"))} | ${rate(tot("K"))} | ${units ? fmtSigned(Number((((tot("K") - tot("J")) / units) * 1000).toFixed(1))) : ""} |`);
    out.push(`| Counted projects | ${tot("P")} | ${tot("Q")} | ${fmtSigned(tot("Q") - tot("P"))} |`);
    const movers = [...rep.lines].filter((l) => l.after.net !== l.before.net || l.after.rank !== l.before.rank).sort((x, y) => Math.abs(y.after.net - y.before.net) - Math.abs(x.after.net - x.before.net)).slice(0, 10);
    if (movers.length) {
      out.push("", `Wards that moved (${movers.length} of ${rep.lines.filter((l) => l.after.net !== l.before.net || l.after.rank !== l.before.rank).length}, largest net change first):`, "", "| Ward | Alder | Net before | Net after | Change | Rank before | Rank after |", "| --- | --- | ---: | ---: | ---: | ---: | ---: |");
      for (const l of movers) out.push(`| ${l.ward} | ${l.alder} | ${l.before.net} | ${l.after.net} | ${fmtSigned(l.after.net - l.before.net)} | ${l.before.rank} | ${l.after.rank} |`);
    } else out.push("", "No ward moved.");
  }
  const counts = { changed: 0, regrouped: 0, removed: 0, added: 0 };
  for (const p of projects) counts[p.status] += 1;
  out.push("", `## Projects: ${counts.changed} changed, ${counts.regrouped} regrouped, ${counts.removed} removed, ${counts.added} added`, "");
  if (projects.length) {
    out.push("| Status | Ward | Address | Kind | Units before | Units after | Change | Flags after |", "| --- | ---: | --- | --- | ---: | ---: | ---: | --- |");
    for (const p of projects.slice(0, 60)) out.push(`| ${p.status} | ${p.ward} | ${p.address} | ${p.kind} | ${p.before ?? ""} | ${p.after ?? ""} | ${fmtSigned((p.after ?? 0) - (p.before ?? 0))} | ${p.flagsAfter} |`);
    if (projects.length > 60) out.push("", `${projects.length - 60} more in the Excel file.`);
  }
  out.push("", "## Files", "", "```", ...(files.length ? files : ["(no file changes recorded)"]), "```", "");
  return out.join("\n");
}

// --- main -------------------------------------------------------------------------------------------

async function main() {
  const { snapshot: before, label: beforeLabel } = await loadBefore();
  const after = readSnapshot(AFTER);
  const windowStart = after.window_start;
  const windows = [
    compareWindow("last12", "Last 12 months", presetWindow("last12", DATE, windowStart), before, after),
    compareWindow("term", "This term", presetWindow("term", DATE, windowStart), before, after),
  ];
  const projects = compareProjects(before, after);
  const dirty = git("status --porcelain").split("\n").filter(Boolean);
  const files = (dirty.length ? git("diff --stat HEAD") : git("show --stat --format= HEAD")).split("\n").filter(Boolean);
  const commit = git("rev-parse --short HEAD");
  const meta: [string, string][] = [
    ["Generated", `${DATE} (windows end here)`],
    ["Before", `${beforeLabel}; generated ${before.generated_at.slice(0, 10) || "unknown"}`],
    ["After", `${AFTER}; generated ${after.generated_at.slice(0, 10) || "unknown"}`],
    ["Commit", commit ? `${commit}${dirty.length ? ` plus uncommitted changes in ${dirty.length} file${dirty.length === 1 ? "" : "s"}` : ""}` : "not a git checkout"],
  ];
  const notes = [
    "Before and after are two runs of the same pipeline. When both use the same permit pull, every difference is the rule change. When the pull dates differ, projects marked added or removed on the Projects sheet may be new permits rather than rule effects; changed projects are always rule effects.",
    "Last 12 months and this term are the two windows the site opens on. Gross, lost, net and rate follow docs/METHODOLOGY.md: rate is net per 1,000 existing units, from Cook County Assessor parcels (the Existing units column).",
    "Ranks are the site's: by rate, ties broken on net, then gross. They are written as values because that tie-break has no spreadsheet formula. Everything else that is derived (changes, totals, rates) is a formula.",
    "A removed project is one the new rules no longer make a project at all, for example a demolition that turned out to be a garage or a smokestack. An added project is the reverse.",
  ];

  const wb = new ExcelJS.Workbook();
  wb.creator = "ward-housing-ranker, npm run impact";
  wb.created = new Date();
  // Summary first in the tab order; it is filled last because it points at the other sheets.
  const summary = wb.addWorksheet("Summary", { views: [{ showGridLines: false }] });
  const sheets = windows.map((rep) => ({ rep, ...wardSheet(wb, `Wards (${rep.title.toLowerCase()})`, rep) }));
  projectsSheet(wb, projects);
  changesSheet(wb, files);
  const projectCounts = { changed: 0, regrouped: 0, removed: 0, added: 0 };
  for (const p of projects) projectCounts[p.status] += 1;
  summarySheet(summary, meta, sheets.map((s) => ({ rep: s.rep, sheet: s.name, totalsRow: s.totalsRow })), notes, projectCounts);

  const dir = join(ROOT, "docs", "impact");
  mkdirSync(dir, { recursive: true });
  const base = join(dir, `${DATE}-${SLUG}`);
  await wb.xlsx.writeFile(`${base}.xlsx`);
  writeFileSync(`${base}.md`, markdown(meta, windows, projects, files));
  console.log(`wrote docs/impact/${DATE}-${SLUG}.xlsx and .md`);
  for (const rep of windows) {
    const tot = (c: string) => rep.lines.reduce((s, l) => s + numberAt(l, c), 0);
    const moved = rep.lines.filter((l) => l.after.rank !== l.before.rank).length;
    console.log(`  ${rep.title}: net ${tot("J")} -> ${tot("K")} (${fmtSigned(tot("K") - tot("J"))}); lost ${tot("G")} -> ${tot("H")}; ${moved} wards changed rank`);
  }
  console.log(`  projects: ${projectCounts.changed} changed, ${projectCounts.regrouped} regrouped, ${projectCounts.removed} removed, ${projectCounts.added} added`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
