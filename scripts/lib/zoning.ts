/**
 * Reading a zoning reclassification ordinance. Pure functions over the matter's title, its ordinance text and its
 * exhibit text, so tests/zoning.test.ts and tests/zoning-golden.test.ts can run them directly.
 *
 * Every map amendment follows one sentence: "...the Chicago Zoning Ordinance be amended by changing all the B3-2
 * Community Shopping District symbols and indications as shown on Map No. 9-G in the area bounded by ... to those
 * of a B2-3 Neighborhood Mixed-Use District." The title carries the site ("at 3724 W Le Moyne St - App No.
 * 23187T1"). Spec: "Alder Actions Tab v2", section "Reading a zoning ordinance"; public rules: docs/METHODOLOGY.md,
 * "Alder actions".
 *
 * The density and floor-area tables were checked against Title 17 on American Legal Publishing on 2026-10-17
 * (17-2-0303, 17-2-0304, 17-3-0402, 17-3-0403, 17-4-0404, 17-4-0405, 17-5-0404).
 */
import type { AddressRange, ZoningDirection, ZoningStage, ZoningUnitsSource } from "./types";
import { normalize, unitMentions } from "./rules";

// --- districts ----------------------------------------------------------------------------------------

export type DistrictFamily = "RS" | "RT" | "RM" | "B" | "C" | "D" | "M" | "POS" | "PMD" | "T" | "PD";

export interface District {
  family: DistrictFamily;
  /** "RS", "B3", "DX", "M1", "POS", "PMD"; "PD" for a planned development. */
  sub: string;
  /** The number after the dash: 3, 4.5, 16. Null for a planned development or a PMD. */
  dash: number | null;
  /** RT-4A and RM-4.5A districts. */
  suffixA: boolean;
  pdNumber: number | null;
  /** "Residential", "Business", "Residential-Business", "Institutional"... as the ordinance names it. */
  pdKind: string | null;
  /** "...Planned Development No. 1230, as amended". */
  amended: boolean;
}

/** Maximum floor area ratio by district (17-2-0304, 17-3-0403, 17-4-0405, 17-5-0404). */
const FAR_R: Record<string, number> = { "RS-1": 0.5, "RS-2": 0.65, "RS-3": 0.9, "RT-3.5": 1.05, "RT-4": 1.2, "RM-4.5": 1.7, "RM-5": 2, "RM-5.5": 2.5, "RM-6": 4.4, "RM-6.5": 6.6 };
const FAR_BC: Record<string, number> = { "1": 1.2, "1.5": 1.5, "2": 2.2, "3": 3, "5": 5 };
const FAR_M: Record<string, number> = { "1": 1.2, "2": 2.2, "3": 3 };
/** Minimum lot area per dwelling unit, square feet (17-2-0303-A, 17-3-0402-A, 17-4-0404-A). */
const LOT_R: Record<string, number> = { "RS-1": 6250, "RS-2": 5000, "RS-3": 2500, "RT-3.5": 1250, "RT-4": 1000, "RM-4.5": 700, "RM-5": 400, "RM-5.5": 400, "RM-6": 300, "RM-6.5": 300 };
const LOT_BC: Record<string, number> = { "1": 2500, "1.5": 1350, "2": 1000, "3": 400, "5": 200 };
const LOT_D: Record<string, number> = { "3": 400, "5": 200, "7": 145, "10": 115, "12": 115, "16": 100 };

function rCode(d: District): string {
  return `${d.sub}-${d.dash}`;
}

/** Maximum floor area ratio, or null when the district is a planned development or unknown. */
export function districtFar(d: District): number | null {
  switch (d.family) {
    case "RS":
    case "RT":
    case "RM":
      return FAR_R[rCode(d)] ?? null;
    case "B":
    case "C":
      return d.dash === null ? null : (FAR_BC[String(d.dash)] ?? null);
    case "D":
      return d.dash;
    case "M":
      return d.dash === null ? null : (FAR_M[String(d.dash)] ?? null);
    default:
      return null;
  }
}

/** Does the district allow dwelling units at all? M, C3, POS and PMD do not (17-3-0207, 17-5-0207). Null = can't tell (a PD). */
export function allowsHousing(d: District): boolean | null {
  if (d.family === "PD") return null;
  if (d.family === "M" || d.family === "POS" || d.family === "PMD" || d.family === "T" || d.sub === "C3") return false;
  return true;
}

/** Square feet of lot the rules require per home; 0 when the district allows no homes; null when unknown or a PD. */
export function lotAreaPerUnit(d: District): number | null {
  if (allowsHousing(d) === false) return 0;
  switch (d.family) {
    case "RS":
    case "RT":
    case "RM":
      return LOT_R[rCode(d)] ?? null;
    case "B":
    case "C":
      return d.dash === null ? null : (LOT_BC[String(d.dash)] ?? null);
    case "D":
      return d.dash === null ? null : (LOT_D[String(d.dash)] ?? null);
    default:
      return null;
  }
}

/** Homes the rules allow on a lot of `lotSf` square feet in the district (whole homes), or null when unknown. */
export function allowedHomes(d: District, lotSf: number | null): number | null {
  const per = lotAreaPerUnit(d);
  if (per === null) return null;
  if (per === 0) return 0;
  if (lotSf === null || lotSf <= 0) return null;
  return Math.max(1, Math.floor(lotSf / per));
}

/** "RS-3", "RT-4A", "DX-7", "POS-1", "PMD 4", "PD 1573", "PD 1230 (amended)", "PD (new)". */
export function displayDistrict(d: District): string {
  if (d.family === "PD") return `PD ${d.pdNumber ?? "(new)"}${d.amended ? " (amended)" : ""}`;
  if (d.family === "PMD") return `PMD ${d.dash ?? ""}`.trim();
  if (d.family === "T") return "T";
  return `${d.sub}-${d.dash}${d.suffixA ? "A" : ""}`;
}

/**
 * Letters OCR misreads inside district codes: "CI-I" is C1-1, "Bi-3" is B1-3, "M l - I" is M1-1, "DX-l6" is DX-16,
 * "RT-3,5" is RT-3.5, "B3-] .5" is B3-1.5, "RSI" is RS-1, "RMS" is RM-5, "RTS.5" is RT-3.5.
 */
function fixOcrCodes(s: string): string {
  const digit = (c: string) => c.replace(/[Il|i\]]/g, "1").replace(/[Oo]/g, "0");
  return s
    .replace(/\b([BCM])\s?([Il|il1-3])\s?[-–]\s?([Il|il\]1-9])(\s?\.\d)?(?![\w.])/g, (_m, a: string, b: string, c: string, d?: string) => `${a}${digit(b)}-${digit(c)}${(d ?? "").replace(/\s/g, "")}`)
    .replace(/\b((?:RS|RT|RM|D[XRCS]|POS)\s?[-–]\s?)([Il|il])(\d?)\b/g, (_m, a: string, b: string, c: string) => `${a}${digit(b)}${c}`)
    .replace(/\bN4([123])(\s*[-–]\s*\d)(?=[^\n]{0,60}(?:Manufactur|Industr))/g, "M$1$2")
    .replace(/\bFI([123])(\s*[-–]\s*\d)(?=[^\n]{0,60}(?:Neighborhood|Community|Shopping|Mixed))/g, "B$1$2")
    .replace(/\bRS\s?[-–]?\s?[Il|il]\b/g, "RS-1")
    .replace(/\bRMS\b/g, "RM-5")
    .replace(/\bRTS\.5\b/g, "RT-3.5")
    .replace(/\b((?:RS|RT|RM|B\d|C\d|D[XRCS]|M\d)\s*[-–]\s*\d)[,](\d)\b/g, "$1.$2");
}

/** Dash numbers no district has, as OCR and typists produce them, mapped to the district meant. */
const CANON: Record<string, [string, number]> = { "RT-4.5": ["RM", 4.5], "RM-4": ["RM", 4.5], "RT-3": ["RT", 3.5], "RM-3.5": ["RT", 3.5], "RS-3.5": ["RT", 3.5], "RT-5": ["RM", 5] };

const PD_RE = /((?:Residential|Business|Institutional|Industrial|Waterway|Commercial|Transportation|Mixed[- ]Use)(?:\s*[-\/]\s*(?:Residential|Business|Institutional|Industrial|Commercial))?)?\s*(?:Planned\s+Develop\w*|P\.?D\.?)(?:\s*(?:No\.?|Number|#)\s*)?\s*(\d{1,4})?/gi;
const CODE_RE = /\b(RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123]|POS)\s*[-–]?\s*(\d{1,2}(?:\.\d)?)\s*(A)?\b/g;
const PMD_RE = /\bPMD\s*(?:No\.?\s*)?(\d{1,2})?/g;
const T_RE = /\bT,?\s+Transportation\s+District/g;

/** Every district named in a chunk of ordinance text, in the order named. */
export function parseDistricts(chunk: string): District[] {
  const text = fixOcrCodes(stripOcrMarks(chunk));
  const found: { index: number; d: District }[] = [];
  for (const m of text.matchAll(PD_RE)) {
    if (/P\.?D\.?/i.test(m[0]) && !/Planned/i.test(m[0]) && !m[2]) continue; // a bare "PD" with no number is not a district
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    found.push({
      index: m.index!,
      d: { family: "PD", sub: "PD", dash: null, suffixA: false, pdNumber: m[2] ? Number(m[2]) : null, pdKind: m[1] ? m[1].replace(/\s*[-\/]\s*/g, "-") : null, amended: /as\s+amended/i.test(after) },
    });
  }
  for (const m of text.matchAll(CODE_RE)) {
    let sub = m[1];
    let dash = Number(m[2]);
    const canon = CANON[`${sub}-${dash}`];
    if (canon) [sub, dash] = canon;
    const family: DistrictFamily = sub.startsWith("B") ? "B" : sub.startsWith("C") ? "C" : sub.startsWith("D") ? "D" : sub.startsWith("M") ? "M" : (sub as DistrictFamily);
    found.push({ index: m.index!, d: { family, sub, dash, suffixA: m[3] === "A", pdNumber: null, pdKind: null, amended: false } });
  }
  for (const m of text.matchAll(PMD_RE)) {
    found.push({ index: m.index!, d: { family: "PMD", sub: "PMD", dash: m[1] ? Number(m[1]) : null, suffixA: false, pdNumber: null, pdKind: null, amended: false } });
  }
  for (const m of text.matchAll(T_RE)) {
    found.push({ index: m.index!, d: { family: "T", sub: "T", dash: null, suffixA: false, pdNumber: null, pdKind: null, amended: false } });
  }
  found.sort((a, b) => a.index - b.index);
  const out: District[] = [];
  for (const { d } of found) {
    const prev = out[out.length - 1];
    if (prev && displayDistrict(prev) === displayDistrict(d)) continue;
    out.push(d);
  }
  return out;
}

/** Homes per square foot of lot the district allows: the measure `direction` compares first. */
function density(d: District): number | null {
  const per = lotAreaPerUnit(d);
  if (per === null) return null;
  return per === 0 ? 0 : 1 / per;
}

function compareAll(from: District[], to: District, measure: (d: District) => number | null): "up" | "down" | "lateral" | null {
  const t = measure(to);
  if (t === null) return null;
  let above = 0, below = 0, known = 0;
  for (const f of from) {
    const v = measure(f);
    if (v === null) continue;
    known += 1;
    if (t > v) above += 1;
    else if (t < v) below += 1;
  }
  if (!known) return null;
  if (above && !below) return "up";
  if (below && !above) return "down";
  if (!above && !below) return "lateral";
  return "lateral"; // more homes than one of the districts and fewer than another: an assemblage straddling two districts
}

/**
 * What the change does to housing. A new planned development is `pd`; an amendment of one is `pd_amend`. Otherwise
 * the districts are compared on how many homes they allow per square foot of lot, and when that is equal (or
 * neither allows homes) on floor area ratio. A manufacturing or C3 district allows no homes, so leaving one for any
 * residential or mixed district is up.
 */
export function direction(from: District[], to: District | null): ZoningDirection {
  if (!to) return "unknown";
  if (to.family === "PD") {
    if (to.amended) return "pd_amend";
    if (from.some((f) => f.family === "PD" && (to.pdNumber === null || f.pdNumber === to.pdNumber))) return "pd_amend";
    return "pd";
  }
  const plain = from.filter((f) => f.family !== "PD");
  if (!plain.length) return "unknown";
  const byDensity = compareAll(plain, to, density);
  if (byDensity === "up" || byDensity === "down") return byDensity;
  const byFar = compareAll(plain, to, districtFar);
  if (byFar === null && byDensity === null) return "unknown";
  return byFar ?? "lateral";
}

// --- the title: site addresses and the application number ----------------------------------------------

const SUFFIXES: Record<string, string> = {
  AVENUE: "AVE", STREET: "ST", BOULEVARD: "BLVD", ROAD: "RD", PLACE: "PL", COURT: "CT", DRIVE: "DR", PARKWAY: "PKWY", TERRACE: "TER",
  LANE: "LN", HIGHWAY: "HWY", SQUARE: "SQ", EXPRESSWAY: "EXPY", CIRCLE: "CIR", PLAZA: "PLZ", TRAIL: "TRL", CRESCENT: "CRES",
};
const DIRS: Record<string, string> = { N: "N", S: "S", E: "E", W: "W", NORTH: "N", SOUTH: "S", EAST: "E", WEST: "W" };

/** "Springfield Ave." → "SPRINGFIELD AVE"; "64th Place" → "64TH PL"; "St. Louis Avenue" → "ST LOUIS AVE". */
export function normalizeStreet(name: string): string {
  const words = name.toUpperCase().replace(/\./g, "").replace(/\s+/g, " ").trim().split(" ");
  return words.map((w, i) => (i === words.length - 1 && SUFFIXES[w] ? SUFFIXES[w] : w)).join(" ");
}

/** The key two spellings of one street share: direction plus the name without spaces ("N LASALLE ST" = "N LA SALLE ST"). */
export function streetKey(dir: string, street: string): string {
  return `${DIRS[dir.toUpperCase().replace(".", "")] ?? dir.toUpperCase()} ${normalizeStreet(street).replace(/[^A-Z0-9]/g, "")}`;
}

const NUM = String.raw`\d{1,5}(?:\s*[-–—]\s*\d{1,5})?`;
const NUMS = String.raw`${NUM}(?:\s*(?:,|\band\b|&|\/)\s*${NUM})*`;
const DIR = String.raw`(?:North|South|East|West|[NSEW])\.?`;
const NAME = String.raw`(?:\d{1,3}(?:st|nd|rd|th)\b|[A-Za-z])[A-Za-z0-9.'\s]*?`;
const LOOK = String.raw`(?=\s*(?:,|\/|;|\band\b|&)?\s*${NUMS}\s+${DIR}\s|\s*(?:,|;|\/)?\s*$)`;
const ADDRESS_RE = new RegExp(String.raw`(${NUMS})\s+(${DIR})\s+(${NAME})${LOOK}`, "gi");

/** "1600, 1620, 1609-1641 and 1647 N LaSalle St 1601 N Wells St and 130 and 200 W North Ave" → one range per number item. */
export function parseAddressList(segment: string): AddressRange[] {
  const out: AddressRange[] = [];
  const seen = new Set<string>();
  for (const m of segment.replace(/\s+/g, " ").trim().matchAll(ADDRESS_RE)) {
    const dir = DIRS[m[2].toUpperCase().replace(".", "")];
    const street = normalizeStreet(m[3]);
    if (!dir || !street) continue;
    for (const item of m[1].split(/\s*(?:,|\band\b|&|\/)\s*/)) {
      const nums = item.split(/\s*[-–—]\s*/).map((n) => Number(n)).filter((n) => Number.isInteger(n) && n > 0);
      if (!nums.length) continue;
      const lo = Math.min(...nums);
      const hi = Math.max(...nums);
      const key = `${lo}-${hi} ${dir} ${street}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ lo, hi, dir, street });
    }
  }
  return out;
}

export interface TitleReading {
  addresses: AddressRange[];
  appNo: string | null;
  type1: boolean;
  mapNos: string[];
}

/** "Zoning Reclassification Map No. 5-J at 2122-2124 N Springfield Ave and 3901-3911 W Shakespeare Ave - App No. 19990". */
export function parseTitle(title: string): TitleReading {
  const t = title.replace(/\s+/g, " ").trim();
  const app = /\bApp\.?\s*No\.?\s*:?\s*([A-Z]?\s?-?\s?\d{3,6}\s*(?:T-?1)?)\b/i.exec(t);
  const appNo = app ? app[1].replace(/\s+/g, "").toUpperCase() : null;
  const mapNos = [...t.matchAll(/\b(\d{1,2}-[A-Z])\b/g)].map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i);
  let segment = "";
  const at = /\b(?:at|located at)\s+(.+?)(?:\s*[-–—:,]?\s*\(?App\.?\s*No\b.*)?$/i.exec(t);
  if (at) segment = at[1];
  return { addresses: parseAddressList(segment), appNo, type1: appNo !== null && /T-?1$/i.test(appNo), mapNos };
}

/** "1401-1459 N MAGNOLIA AVE, 2122-2124 N SPRINGFIELD AVE" in title case. */
export function formatRanges(ranges: AddressRange[]): string {
  const title = (s: string) => s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\b(\d+)(St|Nd|Rd|Th)\b/g, (_m, n, suf) => n + suf.toLowerCase());
  return ranges.map((r) => `${r.lo === r.hi ? r.lo : `${r.lo}-${r.hi}`} ${r.dir} ${title(r.street)}`).join(", ");
}

export interface PermitAddress {
  number: number;
  dir: string;
  street: string;
}

/** "2129 N OAKLEY AVE" as the permit dataset writes it. */
export function parsePermitAddress(address: string): PermitAddress | null {
  const m = /^\s*(\d{1,5})\s*[A-Z]?\s+([NSEW])\s+(.+?)\s*$/i.exec(address);
  if (!m) return null;
  return { number: Number(m[1]), dir: m[2].toUpperCase(), street: normalizeStreet(m[3]) };
}

/** Same side of the same street, number inside the range. A range with both ends odd (or even) is one side of the street. */
export function addressMatches(range: AddressRange, p: PermitAddress): boolean {
  if (streetKey(range.dir, range.street) !== streetKey(p.dir, p.street)) return false;
  if (p.number < range.lo || p.number > range.hi) return false;
  if (range.lo % 2 === range.hi % 2 && p.number % 2 !== range.lo % 2) return false;
  return true;
}

// --- the ordinance text ------------------------------------------------------------------------------

/** Low-confidence OCR words are wrapped in ⟦ ⟧ by chicago-budget; the words themselves are kept. */
export function stripOcrMarks(text: string): string {
  return text.replace(/[⟦⟧]/g, "");
}

export interface OrdinanceSection {
  from: District[];
  to: District | null;
  fromText: string;
  toText: string;
}

const DISTRICT_START = String.raw`(?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123]|POS|PMD|Residential|Business|Institutional|Industrial|Waterway|Commercial|Transportation|Mixed|Planned|[BCM][Il|i])\b`;
const SECTION_RE = new RegExp(
  String.raw`changing\s+(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:current\s+|existing\s+)?([\s\S]{2,700}?)\s*,?\s*(?:symbo[lL]s?\b(?:\s+and\s+(?:indica\w*|designations?))?|as\s+shown\s+on)([\s\S]{0,4000}?)\b[TtlI]o\s+(?:(?:t[hl][io0l]\w{1,3}\s+of|the\s+designation\s+of)\s*(?:an?\b|the\b)?\s*|(?:an?\s+|the\s+)(?=${DISTRICT_START}))([\s\S]{2,260}?)(?=\s*(?:,\s*which\b|\bwhich\b|\band\s+a\s+corresponding\b|\bsubject\s+to\b|\bis\s+hereby\b|(?<!\bNos?)\.\s|\n\s*\n|\bSECTION\b|$))`,
  "gi",
);

/** "changing all the symbols and indications of Institutional Planned Development Number 1054 as shown on Map ... to those of ..." */
const SECTION_OF_RE = new RegExp(
  String.raw`changing\s+all\s+(?:of\s+)?(?:the\s+|t[hl]ie\s+)?symbo[lL]s?\s+and\s+indica\w*\s+of\s+([\s\S]{2,300}?)\s+as\s+shown\s+on([\s\S]{0,4000}?)\b[TtlI]o\s+(?:t[hl][io0l]\w{1,3}\s+of|the\s+designation\s+of)\s*(?:an?\b|the\b)?\s*([\s\S]{2,260}?)(?=\s*(?:,\s*which\b|\bwhich\b|\band\s+a\s+corresponding\b|\bsubject\s+to\b|\bis\s+hereby\b|(?<!\bNos?)\.\s|\n\s*\n|\bSECTION\b|$))`,
  "gi",
);

/** Every "changing all the X ... to those of Y" clause, in order. */
export function parseSections(text: string): OrdinanceSection[] {
  const t = stripOcrMarks(text);
  const found: { index: number; section: OrdinanceSection }[] = [];
  // The "symbols and indications of X" phrasing first: the general pattern also matches it, with an empty from-chunk.
  for (const re of [SECTION_OF_RE, SECTION_RE]) {
    for (const m of t.matchAll(re)) {
      if (found.some((f) => Math.abs(f.index - m.index!) < 40)) continue;
      const fromText = m[1].replace(/\s+/g, " ").trim();
      const toText = m[3].replace(/\s+/g, " ").trim();
      const to = parseDistricts(toText);
      found.push({ index: m.index!, section: { from: parseDistricts(fromText), to: to[0] ?? null, fromText, toText } });
    }
  }
  return found.sort((a, b) => a.index - b.index).map((f) => f.section);
}

export interface TextVersions {
  /** The ordinance as filed. */
  original: string;
  /** The substitute that passed, when the record carries one. */
  final: string | null;
}

/**
 * matter_texts merges several Legislation PDFs under "===== <file name> =====" banners. The substitute's file name
 * starts with S or says Final; everything else is the filing.
 */
export function splitVersions(fullText: string): TextVersions {
  const parts = fullText.split(/^===== (.+?) =====\s*$/m);
  if (parts.length < 3) return { original: fullText, final: null };
  const originals: string[] = [];
  const finals: string[] = [];
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i];
    const body = parts[i + 1] ?? "";
    if (/^S\w*\d{4}-|\bfinal\b|\bsubstitute\b/i.test(name)) finals.push(body);
    else originals.push(body);
  }
  if (!originals.length) return { original: finals[0] ?? fullText, final: finals.length > 1 ? finals[finals.length - 1] : null };
  return { original: originals[0], final: finals.length ? finals[finals.length - 1] : null };
}

/** "Common Address(es): 2122-2124 North Springfield Avenue; 3901-3911 West Shakespeare Avenue". */
export function parseCommonAddresses(text: string): AddressRange[] {
  const t = stripOcrMarks(text);
  const m = /(?:Common\s+Address(?:\(?es\)?)?(?:\s+of\s+(?:the\s+)?Property)?|^\s*ADDRESS(?:ES)?)\s*:?\s*\n?([^\n]*(?:\n[^\n]+){0,2})/im.exec(t);
  if (!m) return [];
  const segment = m[1].replace(/\bChicago,?\s+(?:IL|Illinois).*$/i, "").replace(/\n/g, " ").replace(/\s{2,}/g, " ");
  return parseAddressList(segment);
}

/** How far into the text PINs are read: the ordinance and its statements; the forms behind them list other properties. */
const PIN_SCAN_CHARS = 80_000;
/** 14-digit PINs the text writes as 17-09-105-031-0000 (or 10 digits without the unit part). More than this many is a list of something else. */
export const MAX_SITE_PINS = 40;
export function parsePins(text: string): string[] {
  const out = new Set<string>();
  for (const m of stripOcrMarks(text).slice(0, PIN_SCAN_CHARS).matchAll(/\b(\d{2})-(\d{2})-(\d{3})-(\d{3})(?:-(\d{4}))?\b/g)) out.add(`${m[1]}${m[2]}${m[3]}${m[4]}${m[5] ?? "0000"}`);
  return out.size > MAX_SITE_PINS ? [] : [...out].sort();
}

/** Lot size the ordinance states: "Net Site Area: 41,169 square feet", "LOT AREA: 3125 square feet". */
export function parseLotSf(text: string): number | null {
  const t = stripOcrMarks(text);
  for (const label of [/Net\s+Site\s+Area/i, /(?:Zoning\s+)?Lot\s+Area(?!\s+per)/i, /Gross\s+Site\s+Area/i, /Site\s+Area/i]) {
    const re = new RegExp(String.raw`${label.source}\s*(?:\([^)]*\))?\s*(?:of\s+)?(?:the\s+)?(?:Property\s+)?:?\s*(?:approximately\s+|approx\.?\s+)?([\d,]{3,11})(?:\.\d+)?\s*(?:sq|square|s\.?\s?f)`, "i");
    const m = re.exec(t);
    if (m) {
      const n = Number(m[1].replace(/,/g, ""));
      if (n >= 500 && n <= 50_000_000) return n;
    }
  }
  return null;
}

export interface CountReading {
  units: number | null;
  notes: string[];
}

const toInt = (s: string) => Number(s.replace(/,/g, ""));

/**
 * The "Maximum Dwelling Unit Count" (or "Maximum Number of Dwelling Units") line of a planned development's bulk
 * table. A number right after the label is the total; a table with only subarea lines is summed.
 */
export function pdUnitCount(text: string): CountReading {
  const t = stripOcrMarks(text);
  const label = /Maximum\s+(?:Number\s+of\s+|No\.?\s+of\s+)?(?:Residential\s+)?Dwelling\s+Units?(?:\s+Count)?\s*:?/gi;
  for (const m of t.matchAll(label)) {
    const window = t.slice(m.index! + m[0].length, m.index! + m[0].length + 500);
    const direct = /^\s*\(?([\d,]{1,7})\)?\s*\*?/.exec(window);
    if (direct && toInt(direct[1]) <= 25_000) return { units: toInt(direct[1]), notes: [] };
    const sub = [...window.matchAll(/Sub-?\s?areas?\s+[A-Z0-9]{1,2}\s*:?\s*\(?([\d,]{1,6})\)?\s*\*?/gi)];
    if (sub.length) {
      const stop = window.search(/Maximum\s+(?!Dwelling)|Minimum\s+|Net\s+Site/i);
      const inWindow = sub.filter((s) => stop < 0 || s.index! < stop);
      if (inWindow.length) return { units: inWindow.reduce((s, x) => s + toInt(x[1]), 0), notes: [`summed ${inWindow.length} subareas`] };
    }
  }
  const built = /permits\s+the\s+construction\s+of\s+(?:up\s+to\s+)?(?:approximately\s+)?([\d,]{1,6})\s+(?:residential\s+)?dwelling\s+units/i.exec(t);
  if (built) return { units: toInt(built[1]), notes: ["from the planned development statements' narrative"] };
  return { units: null, notes: [] };
}

/**
 * Homes a Type 1 narrative proposes: "a new 4 story mixed use building ... 3 dwelling units", "Number of Dwelling
 * Units: 6", "three (3) dwelling units". Several different numbers are noted; the largest is used, as the permit
 * rules do.
 */
/** District names carry unit words ("RT-4 Residential Two-Flat, Townhouse and Multi-Unit District") that are not counts. */
function stripDistrictNames(t: string): string {
  return t
    .replace(/\b(?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123])\s*-?\s*\d{1,2}(?:\.\d)?A?,?\s+(?:Residential|Neighborhood|Community|Downtown|Limited|Light|Heavy|Motor)[^\n.;]{0,70}?District/gi, " ")
    .replace(/\b(?:Two-?\s?Flat|Multi-?\s?Unit|Single-?\s?Unit)[^\n.;]{0,50}?District/gi, " ");
}

export function narrativeUnitCount(text: string, lotSf: number | null = null): CountReading {
  const t = stripDistrictNames(stripOcrMarks(text));
  if (/\b(?:no|zero)\s+(?:new\s+|additional\s+|residential\s+)*dwelling\s+units?\b/i.test(t) || /there\s+(?:are|will\s+be)\s+no\s+(?:residential\s+)?(?:dwelling\s+)?units/i.test(t)) {
    return { units: 0, notes: ["narrative says no dwelling units"] };
  }
  const labeled = new Set<number>();
  const found = new Set<number>();
  const d = normalize(t);
  const densityBefore = (index: number) => /\b(?:PER|AREA|FEET|FT|SF|S\.F\.|MLA)\s*:?\s*$/.test(d.slice(Math.max(0, index - 14), index));
  // A labeled total ("Residential Dwelling Units: 30", "(40 dwelling units proposed)") is the applicant's own figure.
  for (const m of d.matchAll(/(?:NUMBER\s+OF\s+|TOTAL\s+|PROPOSED\s+|RESIDENTIAL\s+)*DWELLING\s+UNITS?\s*(?:PROPOSED|TOTAL)?\s*[:=]\s*(\d{1,4})\b/g)) {
    if (densityBefore(m.index!)) continue;
    labeled.add(Number(m[1]));
  }
  for (const m of d.matchAll(/\(\s*(\d{1,4})\s+(?:RESIDENTIAL\s+)?DWELLING\s+UNITS?\s+PROPOSED\s*\)/g)) labeled.add(Number(m[1]));
  for (const m of d.matchAll(/\b(\d{1,4})\s+TOTAL\s+(?:DWELLING\s+)?UNITS?\b/g)) labeled.add(Number(m[1]));
  for (const m of unitMentions(d)) {
    // "982 SF PER DWELLING UNIT" and "1 UNIT PER 400 SF" are density standards; only plain dwelling-unit mentions count.
    if (m.uncertain || densityBefore(m.index) || /\bPER\b/.test(d.slice(m.index, m.index + 40).split(/UNITS?/)[1] ?? "")) continue;
    found.add(m.n);
  }
  for (const m of d.matchAll(/\b(\d{1,3})\s*-\s*(?:UNIT|FLAT)\b(?!\s*(?:PER|LOT))/g)) found.add(Number(m[1]));
  if (!labeled.size && !found.size && /\bSINGLE[-\s]+(?:FAMILY|DWELLING[-\s]+UNIT)\b|\bONE\s+DWELLING\s+UNIT\b/.test(d)) found.add(1);
  // No lot holds more than a home per 80 square feet, bonuses included; a bigger number is a misread.
  const ceiling = lotSf ? Math.max(4, Math.ceil(lotSf / 80)) : 2000;
  const pool = labeled.size ? labeled : found;
  const nums = [...pool].filter((n) => n > 0 && n <= ceiling);
  const dropped = [...pool].filter((n) => n > ceiling);
  const notes: string[] = [];
  if (dropped.length) notes.push(`ignored ${dropped.join(", ")}: more homes than the lot could hold`);
  if (!nums.length) return { units: null, notes };
  if (nums.length > 1) notes.push(`several unit numbers in the narrative: ${nums.sort((a, b) => a - b).join(", ")}`);
  return { units: Math.max(...nums), notes };
}

// --- stage --------------------------------------------------------------------------------------------

/** Pending this long is stalled: about three times the median time from filing to passage (56 days). */
export const STALL_DAYS = 180;

export interface StageReading {
  stage: ZoningStage;
  stage_date: string;
  days_pending: number | null;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10))) - Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))) / 86_400_000);
}

/**
 * Passed, filed, withdrawn and failed are settled. Pending under STALL_DAYS is undecided (shown, not counted);
 * pending STALL_DAYS or more is stalled (counted as requested, not approved).
 */
export function stageOf(outcome: string | null, introductionDate: string, finalActionDate: string | null, today: string): StageReading {
  if (outcome === "passed" || outcome === "repealed") return { stage: "passed", stage_date: finalActionDate ?? introductionDate, days_pending: null };
  if (outcome === "failed" || outcome === "withdrawn" || outcome === "filed" || outcome === "void" || outcome === "vetoed" || outcome === "superseded") {
    return { stage: "rejected", stage_date: finalActionDate ?? introductionDate, days_pending: null };
  }
  const days = Math.max(0, daysBetween(introductionDate, today));
  return { stage: days >= STALL_DAYS ? "stalled" : "undecided", stage_date: introductionDate, days_pending: days };
}

// --- one matter, read end to end ------------------------------------------------------------------------

export interface MatterAttachment {
  file_name: string | null;
  attachment_type: string | null;
  source_url: string | null;
}

export interface MatterInput {
  record_number: string;
  title: string;
  full_text: string | null;
  attachments: MatterAttachment[];
  /** Text of exhibit attachments already read (OCR), by source_url. */
  exhibit_texts: Record<string, string>;
  outcome: string | null;
  sub_status: string | null;
  introduction_date: string;
  final_action_date: string | null;
  filing_office: string | null;
  filing_sponsor: string | null;
}

export interface MatterReading {
  addresses: AddressRange[];
  address: string;
  pins: string[];
  app_no: string | null;
  type1: boolean;
  from_districts: string[];
  from_district: string | null;
  to_district: string | null;
  from_far: number | null;
  to_far: number | null;
  direction: ZoningDirection;
  requested_units: number | null;
  approved_units: number | null;
  units_source: ZoningUnitsSource;
  lot_sf: number | null;
  allowed_before: number | null;
  allowed_after: number | null;
  stage: ZoningStage;
  stage_date: string;
  days_pending: number | null;
  substitute: boolean;
  days_to_passage: number | null;
  sponsored_by_alder: boolean;
  sponsor_ward: number | null;
  sponsor_name: string | null;
  needs_review: boolean;
  exhibits_pending: boolean;
  notes: string[];
  /** Exhibit attachments the reading wants OCR text for and does not have yet. */
  wanted_exhibits: MatterAttachment[];
}

/** The "Statements and Plans" / "Narrative and Plans" exhibits: a planned development's bulk table, a Type 1's narrative. */
export function exhibitAttachments(attachments: MatterAttachment[]): { original: MatterAttachment[]; final: MatterAttachment[] } {
  // Every exhibit except the application form, the disclosure, letters and surveys; file names are typed by hand ("Statments and Plans").
  const relevant = attachments.filter((a) => a.attachment_type === "Exhibits" && a.source_url && !/application|\beds\b|letter|survey|\bplat\b|\bmap\b|rendering|elevation/i.test(a.file_name ?? ""));
  return {
    original: relevant.filter((a) => !/^S\w*\d{4}-|\bfinal\b/i.test(a.file_name ?? "")),
    final: relevant.filter((a) => /^S\w*\d{4}-|\bfinal\b/i.test(a.file_name ?? "")),
  };
}

const wardOffice = (office: string | null): number | null => {
  if (!office) return null;
  const n = Number(office);
  return Number.isInteger(n) && n >= 1 && n <= 50 ? n : null;
};

export interface ReadOptions {
  /** Land square feet of the site from the assessor, used when the ordinance states no lot size. */
  lot_sf?: number | null;
}

export function readMatter(m: MatterInput, today: string, opts: ReadOptions = {}): MatterReading {
  const notes: string[] = [];
  let needsReview = false;
  const title = parseTitle(m.title ?? "");
  const text = m.full_text ?? "";
  const versions = splitVersions(text);
  const original = versions.original;
  const final = versions.final;

  // Where.
  let addresses = title.addresses;
  if (!addresses.length) {
    addresses = parseCommonAddresses(final ?? original);
    if (addresses.length) notes.push("address read from the ordinance's common-address line, not the title");
  }
  if (!addresses.length) {
    needsReview = true;
    notes.push("no address could be read from the title");
  }
  const pins = parsePins(text);

  // From what, to what.
  const firstSections = parseSections(original);
  const finalSections = final ? parseSections(final) : firstSections;
  // The substitute's wording rules, unless its scan is unreadable where the filing's is not.
  const finalReadable = finalSections.length > 0 && finalSections[finalSections.length - 1].to !== null;
  const sections = finalReadable ? finalSections : firstSections.length ? firstSections : finalSections;
  const fromDistricts = (firstSections[0] ?? sections[0])?.from ?? [];
  const to = sections.length ? sections[sections.length - 1].to : null;
  if (!sections.length) {
    needsReview = true;
    notes.push(text ? "the rezoning sentence (changing all ... to those of ...) was not found in the text" : "no ordinance text");
  } else {
    if (!fromDistricts.length) {
      needsReview = true;
      notes.push(`no district read in "changing all the ${sections[0].fromText.slice(0, 80)}"`);
    }
    if (!to) {
      needsReview = true;
      notes.push(`no district read in "to those of ${sections[sections.length - 1].toText.slice(0, 80)}"`);
    }
  }
  const dir = direction(fromDistricts, to);
  if (dir === "unknown" && sections.length && fromDistricts.length && to) notes.push("direction unknown: the districts' tables do not cover this change");
  const fromFar = fromDistricts.length ? districtFar(fromDistricts[0]) : null;
  const toFar = to ? districtFar(to) : null;

  // How many homes.
  const isPd = dir === "pd" || dir === "pd_amend";
  const exhibits = exhibitAttachments(m.attachments);
  const exhibitText = (list: MatterAttachment[]) => list.map((a) => m.exhibit_texts[a.source_url!]).filter((t): t is string => typeof t === "string" && t.length > 0).join("\n");
  const origExhibit = exhibitText(exhibits.original);
  const finalExhibit = exhibitText(exhibits.final);
  const missing = [...exhibits.original, ...exhibits.final].filter((a) => !(a.source_url! in m.exhibit_texts));
  const unreadable = [...exhibits.original, ...exhibits.final].filter((a) => m.exhibit_texts[a.source_url!] === "");
  let requested: number | null = null;
  let approved: number | null = null;
  let source: ZoningUnitsSource = "none";
  const lotForCounts = parseLotSf(final ?? original) ?? opts.lot_sf ?? null;
  const countOf = (t: string): CountReading => (isPd ? pdUnitCount(t) : narrativeUnitCount(t, lotForCounts));
  // A stated count beats capacity wherever the record states one: planned developments in their bulk table, Type 1
  // rezonings in their narrative, and older plain rezonings in the application form bound into the ordinance.
  const want = true;
  if (want) {
    const fromOrig = origExhibit ? countOf(origExhibit) : countOf(original);
    const fromFinal = finalExhibit ? countOf(finalExhibit) : final ? countOf(final) : null;
    if (fromOrig.units !== null) {
      requested = fromOrig.units;
      source = origExhibit ? "exhibit" : isPd ? "ordinance" : "narrative";
      notes.push(...fromOrig.notes);
    }
    if (fromFinal && fromFinal.units !== null) {
      approved = fromFinal.units;
      source = finalExhibit ? "exhibit" : isPd ? "ordinance" : "narrative";
      notes.push(...fromFinal.notes.map((n) => `final: ${n}`));
    } else if (requested !== null) approved = requested;
    if (requested === null && approved !== null) requested = approved;
    if (requested === null && !missing.length && (isPd || title.type1)) {
      // The exhibits were read (or there are none) and still gave no number: a person has to look.
      needsReview = true;
      notes.push(
        unreadable.length
          ? `exhibit could not be read as a PDF: ${unreadable.map((a) => a.file_name).join(", ")}`
          : isPd
            ? "no Maximum Dwelling Unit Count read from the statements"
            : "no dwelling unit count read from the Type 1 narrative",
      );
    }
  }
  // Exhibits are read only for planned developments and Type 1 rezonings, and only while a count is still missing.
  const wanted = (isPd || title.type1) && (requested === null || (final !== null && approved === requested && finalExhibit === "" && exhibits.final.length > 0)) ? missing : [];

  // Lot size and what the rules allow.
  let lotSf = parseLotSf(finalExhibit || final || origExhibit || original) ?? parseLotSf(text);
  if (lotSf === null && opts.lot_sf) {
    lotSf = opts.lot_sf;
    notes.push("lot size from assessor parcels");
  }
  // Homes the rules allowed before: on a site spanning districts, the densest one (the smallest claim of homes added).
  let allowedBefore: number | null = null;
  if (fromDistricts.length) {
    const plainFrom = fromDistricts.filter((f) => f.family !== "PD");
    const values = plainFrom.map((f) => allowedHomes(f, lotSf));
    if (plainFrom.length === fromDistricts.length && values.every((v): v is number => v !== null)) {
      allowedBefore = Math.max(...values);
      if (plainFrom.length > 1) notes.push(`site spans ${plainFrom.length} districts; homes allowed before taken from the densest`);
    }
  }
  let allowedAfter: number | null = null;
  if (to && to.family === "PD") allowedAfter = approved;
  else if (to) allowedAfter = allowedHomes(to, lotSf);
  // A plain map amendment states no count: what it asks for, and approves, is the capacity it adds to the lot.
  if (requested === null && !isPd && to && dir !== "down" && allowedAfter !== null && allowedBefore !== null) {
    requested = Math.max(0, allowedAfter - allowedBefore);
    approved = requested;
    source = "capacity";
  }
  if (dir === "down" && requested === null) {
    requested = 0;
    approved = 0;
    source = "capacity";
  }

  // Where it stands.
  const stage = stageOf(m.outcome, m.introduction_date, m.final_action_date, today);
  if (stage.stage !== "passed") approved = stage.stage === "undecided" ? null : 0;
  const substitute = /^S/i.test(m.record_number) || /substitute/i.test(m.sub_status ?? "") || final !== null;
  const daysToPassage = stage.stage === "passed" && m.final_action_date ? daysBetween(m.introduction_date, m.final_action_date) : null;

  // Who filed it.
  const sponsorWard = wardOffice(m.filing_office);
  const sponsoredByAlder = sponsorWard !== null || /^A-?\d/.test(title.appNo ?? "");

  return {
    addresses,
    address: addresses.length ? formatRanges(addresses) : (m.title ?? "").replace(/^Zoning Reclassification\s+(?:Map\s+Nos?\.?\s*[\w\s,-]+?\s+)?at\s+/i, "").replace(/\s*-?\s*App\.?\s*No.*$/i, ""),
    pins,
    app_no: title.appNo,
    type1: title.type1,
    from_districts: fromDistricts.map(displayDistrict),
    from_district: fromDistricts.length ? displayDistrict(fromDistricts[0]) : null,
    to_district: to ? displayDistrict(to) : null,
    from_far: fromFar,
    to_far: toFar,
    direction: dir,
    requested_units: requested,
    approved_units: approved,
    units_source: source,
    lot_sf: lotSf,
    allowed_before: allowedBefore,
    allowed_after: allowedAfter,
    stage: stage.stage,
    stage_date: stage.stage_date,
    days_pending: stage.days_pending,
    substitute,
    days_to_passage: daysToPassage,
    sponsored_by_alder: sponsoredByAlder,
    sponsor_ward: sponsorWard,
    sponsor_name: sponsorWard !== null ? m.filing_sponsor : null,
    needs_review: needsReview,
    exhibits_pending: want && wanted.length > 0,
    notes,
    wanted_exhibits: want ? wanted : [],
  };
}
