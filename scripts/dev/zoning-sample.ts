/**
 * Dev harness: run the ordinance parser over a file of zoning matters and print how it read them.
 *   npx tsx scripts/dev/zoning-sample.ts --file matters.jsonl [--show 8] [--only needs_review|pd|type1|unknown|noaddr|nosection] [--record SO2024-0008415]
 * The file holds one matter per line with the columns the copy step reads (record_number, title, full_text,
 * attachments, outcome, sub_status, introduction_date, final_action_date, filing_office, filing_sponsor).
 */
import { readFileSync } from "node:fs";
import { readMatter, type MatterInput } from "../lib/zoning";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const file = args.get("file");
if (!file) throw new Error("--file <matters.jsonl> is required");
const show = Number(args.get("show") ?? 8);
const only = args.get("only");
const record = args.get("record");
const today = args.get("today") ?? new Date().toISOString().slice(0, 10);

type Row = MatterInput & { matter_category?: string | null; type?: string | null; extraction_method?: string | null };
const rows: Row[] = readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as Row)
  .filter((r) => (r.type ?? "Ordinance") === "Ordinance" && (r.matter_category ?? "ZONING RECLASSIFICATIONS").startsWith("ZONING RECLASSIFICATIONS"));

const tally = (label: string, f: (r: Row, x: ReturnType<typeof readMatter>) => boolean) => ({ label, f, n: 0 });
const tallies = [
  tally("address read", (_r, x) => x.addresses.length > 0),
  tally("section read", (_r, x) => x.from_district !== null && x.to_district !== null),
  tally("direction known", (_r, x) => x.direction !== "unknown"),
  tally("needs_review", (_r, x) => x.needs_review),
  tally("exhibits_pending", (_r, x) => x.exhibits_pending),
  tally("pd", (_r, x) => x.direction === "pd" || x.direction === "pd_amend"),
  tally("type1", (_r, x) => x.type1),
  tally("units known", (_r, x) => x.approved_units !== null || x.requested_units !== null),
  tally("lot_sf known", (_r, x) => x.lot_sf !== null),
  tally("allowed_after known", (_r, x) => x.allowed_after !== null),
];
const byDir = new Map<string, number>();
const bySource = new Map<string, number>();
const byStage = new Map<string, number>();
const shown: string[] = [];
for (const r of rows) {
  r.exhibit_texts ??= {};
  const x = readMatter(r, today);
  for (const t of tallies) if (t.f(r, x)) t.n += 1;
  byDir.set(x.direction, (byDir.get(x.direction) ?? 0) + 1);
  bySource.set(x.units_source, (bySource.get(x.units_source) ?? 0) + 1);
  byStage.set(x.stage, (byStage.get(x.stage) ?? 0) + 1);
  const pick = record ? r.record_number === record
    : only === "needs_review" ? x.needs_review
    : only === "pd" ? x.direction === "pd" || x.direction === "pd_amend"
    : only === "type1" ? x.type1
    : only === "unknown" ? x.direction === "unknown"
    : only === "noaddr" ? x.addresses.length === 0
    : only === "nosection" ? x.from_district === null || x.to_district === null
    : only === "down" ? x.direction === "down"
    : only === "lateral" ? x.direction === "lateral"
    : !only;
  if (pick && shown.length < show) {
    shown.push(
      `${r.record_number} [${r.outcome}${r.extraction_method ? "/" + r.extraction_method : ""}] ${r.title.slice(0, 110)}\n` +
        `   ${x.address} | ${x.from_districts.join(" + ") || "?"} -> ${x.to_district ?? "?"} (${x.direction}) | app ${x.app_no ?? "-"}${x.type1 ? " T1" : ""} | ${x.stage} ${x.stage_date}${x.days_pending !== null ? ` ${x.days_pending}d` : ""}\n` +
        `   units req ${x.requested_units ?? "?"} appr ${x.approved_units ?? "?"} (${x.units_source}) lot ${x.lot_sf ?? "?"} allowed ${x.allowed_before ?? "?"} -> ${x.allowed_after ?? "?"} | sponsor ${x.sponsor_name ?? "-"}${x.sponsor_ward ? " W" + x.sponsor_ward : ""} | pins ${x.pins.length}` +
        (x.needs_review ? " | REVIEW" : "") + (x.exhibits_pending ? ` | exhibits pending (${x.wanted_exhibits.length})` : "") + (x.notes.length ? `\n   notes: ${x.notes.join("; ")}` : ""),
    );
  }
}
console.log(`${rows.length} zoning ordinances from ${file} (today ${today})`);
for (const t of tallies) console.log(`  ${t.label.padEnd(22)} ${String(t.n).padStart(5)}  ${((100 * t.n) / rows.length).toFixed(1)}%`);
console.log(`  direction: ${[...byDir].map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`  units source: ${[...bySource].map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log(`  stage: ${[...byStage].map(([k, v]) => `${k} ${v}`).join(", ")}`);
console.log("");
for (const s of shown) console.log(s + "\n");
