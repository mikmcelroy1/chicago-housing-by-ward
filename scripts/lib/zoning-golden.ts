/**
 * The zoning golden list: real zoning matters a person has read, with the agreed reading, in data/zoning_golden.csv.
 * Each row carries the title and an excerpt of the ordinance text (and of the exhibit, when the count came from
 * one), so tests/zoning-golden.test.ts can run the parser on them without a database; the ETL checks the same rows
 * against its full reading, ward included, every run.
 *
 * Columns: record_number; title; outcome; sub_status; introduction_date; final_action_date; filing_office;
 * filing_sponsor; text (excerpt of the ordinance; "===== file =====" banners separate a filing from its substitute);
 * exhibit_text (excerpt of the statements or narrative as filed); final_exhibit_text (the substitute's, when the record
 * carries one); expected_address; expected_from; expected_to;
 * expected_direction; expected_requested; expected_approved; expected_stage; expected_ward (ETL only);
 * status (pass | known_gap); note. A blank expected cell is not checked.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsv } from "./csv";
import { readMatter, type MatterReading } from "./zoning";

export interface ZoningGoldenRow {
  record_number: string;
  title: string;
  outcome: string;
  sub_status: string;
  introduction_date: string;
  final_action_date: string;
  filing_office: string;
  filing_sponsor: string;
  text: string;
  exhibit_text: string;
  final_exhibit_text: string;
  expected_address: string;
  expected_from: string;
  expected_to: string;
  expected_direction: string;
  expected_requested: string;
  expected_approved: string;
  expected_stage: string;
  expected_ward: string;
  status: "pass" | "known_gap";
  note: string;
}

export interface ZoningGoldenMismatch {
  record_number: string;
  status: ZoningGoldenRow["status"];
  field: string;
  expected: string;
  actual: string;
  note: string;
}

/** The day the golden readings were agreed on; stages of pending matters are judged as of this date. */
export const GOLDEN_TODAY = "2026-10-17";

export function loadZoningGolden(path = join(process.cwd(), "data", "zoning_golden.csv")): ZoningGoldenRow[] {
  return parseCsv(readFileSync(path, "utf8")).map((r) => ({
    record_number: r.record_number,
    title: r.title ?? "",
    outcome: r.outcome ?? "",
    sub_status: r.sub_status ?? "",
    introduction_date: r.introduction_date ?? "",
    final_action_date: r.final_action_date ?? "",
    filing_office: r.filing_office ?? "",
    filing_sponsor: r.filing_sponsor ?? "",
    text: r.text ?? "",
    exhibit_text: r.exhibit_text ?? "",
    final_exhibit_text: r.final_exhibit_text ?? "",
    expected_address: r.expected_address ?? "",
    expected_from: r.expected_from ?? "",
    expected_to: r.expected_to ?? "",
    expected_direction: r.expected_direction ?? "",
    expected_requested: r.expected_requested ?? "",
    expected_approved: r.expected_approved ?? "",
    expected_stage: r.expected_stage ?? "",
    expected_ward: r.expected_ward ?? "",
    status: r.status === "known_gap" ? "known_gap" : "pass",
    note: r.note ?? "",
  }));
}

const show = (v: unknown) => (v === null || v === undefined ? "null" : String(v));

/** Compare one reading with a row's expectations; `ward` is checked only when the caller knows it. */
export function compareReading(row: ZoningGoldenRow, x: Pick<MatterReading, "address" | "from_district" | "to_district" | "direction" | "requested_units" | "approved_units" | "stage">, ward?: number | null): ZoningGoldenMismatch[] {
  const out: ZoningGoldenMismatch[] = [];
  const miss = (field: string, expected: string, actual: string) => out.push({ record_number: row.record_number, status: row.status, field, expected, actual, note: row.note });
  const check = (field: string, expected: string, actual: unknown) => {
    if (expected === "") return;
    const want = expected === "null" ? "null" : expected;
    if (show(actual) !== want) miss(field, want, show(actual));
  };
  check("address", row.expected_address, x.address);
  check("from", row.expected_from, x.from_district);
  check("to", row.expected_to, x.to_district);
  check("direction", row.expected_direction, x.direction);
  check("requested", row.expected_requested, x.requested_units);
  check("approved", row.expected_approved, x.approved_units);
  check("stage", row.expected_stage, x.stage);
  if (ward !== undefined) check("ward", row.expected_ward, ward);
  return out;
}

/** What the parser reads from each row's own excerpt. Pure, so the test suite can run it. */
export function checkZoningGoldenText(rows: ZoningGoldenRow[], today = GOLDEN_TODAY): ZoningGoldenMismatch[] {
  const out: ZoningGoldenMismatch[] = [];
  for (const row of rows) {
    const exhibitUrl = "golden://exhibit";
    const finalUrl = "golden://final-exhibit";
    const base = row.record_number.replace(/^S/, "");
    const attachments = [];
    const exhibit_texts: Record<string, string> = {};
    if (row.exhibit_text) {
      attachments.push({ file_name: `${base} Statements and Plans.pdf`, attachment_type: "Exhibits", source_url: exhibitUrl });
      exhibit_texts[exhibitUrl] = row.exhibit_text;
    }
    if (row.final_exhibit_text) {
      attachments.push({ file_name: `S${base} Final Statements and Plans.pdf`, attachment_type: "Exhibits", source_url: finalUrl });
      exhibit_texts[finalUrl] = row.final_exhibit_text;
    }
    const reading = readMatter(
      {
        record_number: row.record_number,
        title: row.title,
        full_text: row.text || null,
        attachments,
        exhibit_texts,
        outcome: row.outcome || null,
        sub_status: row.sub_status || null,
        introduction_date: row.introduction_date,
        final_action_date: row.final_action_date || null,
        filing_office: row.filing_office || null,
        filing_sponsor: row.filing_sponsor || null,
      },
      today,
    );
    out.push(...compareReading(row, reading));
  }
  return out;
}
