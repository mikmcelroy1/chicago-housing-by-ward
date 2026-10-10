/**
 * Dev harness: pull a sample of permits straight from the portal and print how the rules classify them.
 *   npx tsx scripts/dev/classify-sample.ts --type "PERMIT - NEW CONSTRUCTION" --since 2025-10-01 [--show 6] [--category new_residential]
 */
import { soql, lit } from "../lib/socrata";
import { classify } from "../lib/rules";

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1] ?? "");
const type = args.get("type") ?? "PERMIT - NEW CONSTRUCTION";
const since = args.get("since") ?? "2025-10-01";
const show = Number(args.get("show") ?? 5);
const only = args.get("category");

interface Row { id: string; permit_type: string; work_description?: string; pin_list?: string; ward?: string }

async function main() {
const rows = await soql<Row>("data.cityofchicago.org", "ydr8-5enu", {
  select: "id,permit_type,work_description,pin_list,ward",
  where: `permit_type=${lit(type)} AND issue_date>=${lit(since)}`,
});
const byCat = new Map<string, { row: Row; c: ReturnType<typeof classify> }[]>();
let units = 0, review = 0;
for (const row of rows) {
  const c = classify({ permit_type: row.permit_type, description: row.work_description ?? "", pins: (row.pin_list ?? "").split("|").map((s) => s.trim()).filter(Boolean) });
  byCat.set(c.category, [...(byCat.get(c.category) ?? []), { row, c }]);
  if (c.units && c.category !== "revision_or_phase" && c.category !== "emergency_demolition") units += c.units;
  if (c.needs_review) review++;
}
console.log(`${rows.length} permits of type ${type} since ${since}; units (excl. revisions/emergency) ${units}; needs_review ${review}\n`);
for (const [cat, list] of [...byCat.entries()].sort((a, b) => b[1].length - a[1].length)) {
  if (only && cat !== only) continue;
  console.log(`== ${cat}: ${list.length}`);
  const sample = only ? list : list.slice(0, show);
  for (const { row, c } of sample) {
    console.log(`  [${c.units ?? "?"}${c.needs_review ? " REVIEW" : ""}] W${row.ward ?? "?"} ${(row.work_description ?? "").slice(0, 150)}`);
    if (c.notes.length) console.log(`      notes: ${c.notes.join("; ")}`);
  }
}
}
main().catch((e) => { console.error(e); process.exit(1); });
