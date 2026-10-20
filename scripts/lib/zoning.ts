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
 * "RT-3,5" is RT-3.5, "B3-] .5" is B3-1.5, "RSI" is RS-1, "RMS" is RM-5, "RTS.5" is RT-3.5, "B!-2" is B1-2, "RM-S" is
 * RM-5 (so is "RM-S5", the 5 read twice), "RS-8" is RS-3, "B38-2" is B3-2, "Blrl" is B1-1, "RSS" is RS-3, "Rt-4" is RT-4. An article
 * glued to the code ("aB2-3", "theRM-5") and a name glued to it ("Bl-lNeighborhood") are split; an em dash, a doubled
 * dash or a stray mark after the dash ("B3 — 2", "M1--2", "C2-]1", "RS-^2", "DX-.5", "C2'-2") is a plain dash.
 */
function fixOcrCodes(s: string): string {
  const digit = (c: string) => c.replace(/[Il|i\]!]/g, "1").replace(/[Oo]/g, "0");
  return s
    .replace(/\b(a|an|the|ofthe|ofa)(?=(?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123])[-–—]?[\d!])/g, "$1 ")
    .replace(/\b((?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123]))['’]?\s*[-–—]{1,2}\s*[\]^.';]?(?=[\d!])/g, "$1-")
    .replace(/\b([BCM])\s?([Il|il!1-3])\s?[-–]\s?([Il|il\]!1-9])(\s?\.\d)?(?![\d.a-z])/g, (_m, a: string, b: string, c: string, d?: string) => `${a}${digit(b)}-${digit(c)}${(d ?? "").replace(/\s/g, "")}`)
    .replace(/\b((?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123])-\d{1,2}(?:\.\d)?)(?=[A-Z][a-z])/g, "$1 ")
    .replace(/\b((?:RS|RT|RM|D[XRCS]|POS)\s?[-–]\s?)([Il|il])(\d?)\b/g, (_m, a: string, b: string, c: string) => `${a}${digit(b)}${c}`)
    .replace(/\bN4([123])(\s*[-–]\s*\d)(?=[^\n]{0,60}(?:Manufactur|Industr))/g, "M$1$2")
    .replace(/\bFI([123])(\s*[-–]\s*\d)(?=[^\n]{0,60}(?:Neighborhood|Community|Shopping|Mixed))/g, "B$1$2")
    .replace(/\bRS\s?[-–]?\s?[Il|il]\b/g, "RS-1")
    .replace(/\bRSS\b/g, "RS-3")
    .replace(/\bRS-8\b/g, "RS-3")
    .replace(/\bR\$-/g, "RS-")
    .replace(/\bRMS\b/g, "RM-5")
    .replace(/\bRM-S5?\b/g, "RM-5")
    .replace(/\bRTS\s?\.5\b/g, "RT-3.5")
    .replace(/\bRt-?(\d)/g, "RT-$1")
    .replace(/\b([BC][123])8\s*[-–—]\s*(\d)/g, "$1-$2")
    .replace(/\bB[lI1]r[lI1]\b/g, "B1-1")
    .replace(/\b((?:RS|RT|RM|B\d|C\d|D[XRCS]|M\d)\s*[-–]\s*\d)[,](\d)\b/g, "$1.$2");
}

/** Dash numbers no district has, as OCR and typists produce them, mapped to the district meant. */
const CANON: Record<string, [string, number]> = { "RT-4.5": ["RM", 4.5], "RM-4": ["RM", 4.5], "RT-3": ["RT", 3.5], "RM-3.5": ["RT", 3.5], "RS-3.5": ["RT", 3.5], "RT-5": ["RM", 5] };

/** The kinds a planned development's name carries: "Residential-Business Planned Development No. 1230". */
const PD_KIND = String.raw`(?:Residential|Business|Institutional|Industrial|Manufacturing|Waterway|Commercial|Transportation|Community|Mixed[- ]Use)`;
/** A planned development as the scans spell it: "Plaimed Development", "Planned Devclopment Number 776", "P.D. 1230", "Planned #889". */
const PD_RE = new RegExp(String.raw`(${PD_KIND}(?:\s*[-\/]?\s*${PD_KIND})*)?\s*(?:P[lIi]a[\w']{1,6}\s*Dev[a-z]*|P\.?D\.?|Planned(?=\s*(?:No\.?|Number|#)\s*\d))[*']?(?:\s*(?:N[oQ0]\.?|Number|#)\s*)?\s*(\d{1,4})?`, "gi");
const CODE_RE = /\b(RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123]|POS)\s*[-–—]?\s*(\d{1,2}(?:\.\d)?)\s*(A)?\b/g;
/** "PMD 4", "Planned Manufacturing District No. 11", and "RMD 2" as a scanner writes PMD. */
const PMD_RE = /\b(?:PMD|RMD|Planned\s+Manufacturing\s+District)\s*(?:No\.?|Number|#)?\s*[-–]?\s*(\d{1,2})?/gi;
const T_RE = /\bT\s*[-,;]?\s*Transp\w*\s+District/g;

/**
 * District families by the name the ordinance spells out, for a code the scanner garbled beyond repair ("83-1
 * Community Shopping District" is B3-1, "R'r-4 Residential Two-Flat, Townhouse and Multi-Unit District" is RT-4).
 * The dash number is still read from the text before the name; a name with no number is no district.
 */
const NAMED: [RegExp, string][] = [
  [/Residential\s+Single[-\s]?(?:Unit|Family)|Detached\s+Hous/gi, "RS"],
  [/Residential\s+Tw\w{0,2}[-\s]?Flat|Townhouse/gi, "RT"],
  [/Residential\s+Mu\w{1,3}[-\s]?Unit/gi, "RM"],
  [/Neighborhood\s+Shopping/gi, "B1"],
  [/Neighborhood\s+Mixed[-\s]{0,2}U\s?se/gi, "B2"],
  [/Community\s+Shopping/gi, "B3"],
  [/Neighborhood\s+(?:Related\s+)?Commercial/gi, "C1"],
  [/Motor\s+Vehicle/gi, "C2"],
  [/Commercial,?\s+Manufacturing,?\s+and\s+Employment/gi, "C3"],
  [/Limited\s+Manufacturing|Business\s+Park/gi, "M1"],
  [/Light\s+Industry/gi, "M2"],
  [/Heavy\s+Industry/gi, "M3"],
  [/Downtown\s+Core/gi, "DC"],
  [/Downtown\s+Mixed/gi, "DX"],
  [/Downtown\s+Residential/gi, "DR"],
  [/Downtown\s+Service/gi, "DS"],
];

function namedDistricts(text: string, found: { index: number; d: District }[]): { index: number; d: District }[] {
  const out: { index: number; d: District }[] = [];
  const near = (list: { index: number }[], at: number) => list.some((f) => f.index <= at && at - f.index < 45);
  // A capital I, an l, a bar or a bang after the dash is a 1; a lowercase i is not read (a scan once wrote "ti'2-i" for B2-3).
  const digit = (c: string) => c.replace(/[Il|\]!L]/g, "1").replace(/[Oo]/g, "0");
  for (const [re, sub] of NAMED) {
    for (const m of text.matchAll(re)) {
      const at = m.index!;
      if (near(found, at) || near(out, at)) continue;
      const window = text.slice(Math.max(0, at - 30), at);
      // The number is the last "-3", "- L", "-]1" or "-1.5" before the name, else the last bare digit ("332 Community").
      let num: string | null = null;
      let end = -1;
      // A bare digit right after B, C or M is the family's own digit ("B1, Neighborhood Shopping" has no dash number).
      for (const n of window.matchAll(/[-–—]\s?[\]^.';]?([\dIl|!LO])(?:\s?[.,]\s?(\d))?|(?<![BCM])(\d)(?:[.,](\d))?/g)) {
        const e = n.index! + n[0].length;
        if (e < end) continue;
        end = e;
        num = n[1] !== undefined ? `${digit(n[1])}${n[2] ? `.${n[2]}` : ""}` : `${n[3]}${n[4] ? `.${n[4]}` : ""}`;
      }
      if (num === null) continue;
      let s = sub;
      let dash = Number(num);
      const canon = CANON[`${s}-${dash}`];
      if (canon) [s, dash] = canon;
      const family: DistrictFamily = s.startsWith("R") ? (s as DistrictFamily) : s.startsWith("B") ? "B" : s.startsWith("C") ? "C" : s.startsWith("D") ? "D" : "M";
      out.push({ index: at, d: { family, sub: s, dash, suffixA: false, pdNumber: null, pdKind: null, amended: false } });
    }
  }
  return out;
}

/** Every district named in a chunk of ordinance text, in the order named. */
export function parseDistricts(chunk: string): District[] {
  const text = fixOcrCodes(stripOcrMarks(chunk));
  const found: { index: number; d: District }[] = [];
  for (const m of text.matchAll(PD_RE)) {
    if (/P\.?D\.?/i.test(m[0]) && !/P[lIi]a/i.test(m[0]) && !m[2]) continue; // a bare "PD" with no number is not a district
    const after = text.slice(m.index! + m[0].length, m.index! + m[0].length + 40);
    found.push({
      index: m.index!,
      d: { family: "PD", sub: "PD", dash: null, suffixA: false, pdNumber: m[2] ? Number(m[2]) : null, pdKind: m[1] ? m[1].replace(/\s*[-\/]\s*|\s+/g, "-") : null, amended: /a\.?s\s*amend/i.test(after) },
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
  found.push(...namedDistricts(text, found));
  found.sort((a, b) => a.index - b.index);
  const out: District[] = [];
  let prevIndex = -1;
  for (const { index, d } of found) {
    const prev = out[out.length - 1];
    if (prev && displayDistrict(prev) === displayDistrict(d)) continue;
    // "PD 1302, Planned Development District" and "PMD 6 (Planned Manufacturing District)" name one district, not two.
    if (prev && d.family === "PD" && d.pdNumber === null && prev.family === "PD" && prev.pdNumber !== null && index - prevIndex < 45) continue;
    if (prev && d.family === "PMD" && d.dash === null && prev.family === "PMD" && prev.dash !== null && index - prevIndex < 60) continue;
    out.push(d);
    prevIndex = index;
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

/** Kinds of planned development that allow no homes; a residential or mixed-use one allows some, how many the ordinance does not say. */
const PD_NO_HOMES = /^(?:Business|Institutional|Industrial|Manufacturing|Waterway|Commercial|Transportation)(?:-(?:Business|Institutional|Industrial|Manufacturing|Waterway|Commercial|Transportation))*$/i;

/**
 * What the change does to housing. A new planned development is `pd`; an amendment of one is `pd_amend`. Otherwise
 * the districts are compared on how many homes they allow per square foot of lot, and when that is equal (or
 * neither allows homes) on floor area ratio. A manufacturing or C3 district allows no homes, so leaving one for any
 * residential or mixed district is up. Leaving a planned development for a plain district: a business, commercial,
 * institutional, industrial, manufacturing, waterway or transportation PD allowed no homes, so that is up when the
 * new district allows homes and lateral when it does not; a residential or mixed-use PD allowed homes, so that is down
 * when the new district allows none and otherwise unknown; a PD whose kind the ordinance does not name is unknown.
 */
export function direction(from: District[], to: District | null): ZoningDirection {
  if (!to) return "unknown";
  if (to.family === "PD") {
    if (to.amended) return "pd_amend";
    if (from.some((f) => f.family === "PD" && (to.pdNumber === null || f.pdNumber === to.pdNumber))) return "pd_amend";
    return "pd";
  }
  const plain = from.filter((f) => f.family !== "PD");
  if (!plain.length) {
    const kinds = from.filter((f) => f.family === "PD").map((f) => f.pdKind);
    const toHomes = allowsHousing(to);
    if (!kinds.length || toHomes === null || kinds.some((k) => k === null)) return "unknown";
    if (kinds.every((k) => PD_NO_HOMES.test(k!))) return toHomes ? "up" : "lateral";
    if (kinds.every((k) => /Residential|Mixed/i.test(k!))) return toHomes ? "unknown" : "down";
    return "unknown";
  }
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

/** The kind ("Residential-Business") a planned development's number is given anywhere in the record, or null. */
export function pdKindFromText(text: string, pdNumber: number): string | null {
  const re = new RegExp(String.raw`(${PD_KIND}(?:[-\s\/]+${PD_KIND})*)\s+Planned\s+Development\s*(?:No\.?|Number|#)?\s*${pdNumber}\b`, "gi");
  const m = re.exec(stripOcrMarks(text));
  return m ? m[1].replace(/\s*[-\/]\s*|\s+/g, "-") : null;
}

export interface OrdinanceSection {
  from: District[];
  to: District | null;
  fromText: string;
  toText: string;
}

const DISTRICT_START = String.raw`(?:(?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123]|POS|PMD|PD|Residential|Business|Institutional|Industrial|Manufacturing|Waterway|Commercial|Transportation|Mixed|Planned)\b|P[lIi]a[\w']{1,6}\s*Dev|[BCM][Il|i]\b|T\s*[-,;]?\s*Transp)`;
/** "changing" as the scans spell it ("changmg", "clianging", "changed", "changingall"); a misspelling counts only after "by". */
const CHANGING = String.raw`(?:changing|(?<=\bby\s{1,3}(?:the\s+)?)c[hli][\w']{1,6}(?:ing|mg|es|ed))(?:all(?:of)?(?:the)?)?\s+`;
/** Where the from-districts end: "symbols and indications", "designations", "as shown on", ", Map No.". */
/** After "symbols and indications", another district's symbols: "and all the RS-3", "and Ml-3 Limited". */
const MORE_FROM = String.raw`\s+and\s+(?:all\b|the\b|of\b|${DISTRICT_START})`;
const FROM_END = String.raw`\s*,?\s*(?:(?:symbo[lL]s?|s[yi][mn]i?bo[lL]s?)(?:\b|(?=and))(?:\s*and\s+(?:indica\w*|designations?)\b)?(?!${MORE_FROM})(?!\s+and\s+indica\w*${MORE_FROM})|(?:designations?|indications?)\s+(?:as\s+)?(?:s\w{3,6}\s+)?on\s+Map|as\s+i?s\w{3,6}\s+on|,?\s*s\w{3,6}\s+on\s+Map|,\s*Map\s+No)`;
/** "to those of a" as the scans spell it: "lo those o f a", "t o those", "To tho.se ofa", "tb those bf a", "to that of an", "those of a" with the "to" lost. */
const TO_THOSE_OF = String.raw`(?:\b(?:[TtlIf]\s?[ob]|l\s?b)\s+|\bto(?=t[hl])|\b(?=[tl][hl]))(?:[tl][hl][il]?[oae]\.?s[ec]\s*|[tl][hl][il]?[oae][\w.]{1,4}\s+)[o06b]\s?[fTtl](?!f)\s*(?:an?\b|the\b)?\s*`;
const TO_DESIGNATION = String.raw`\b[TtlIf]\s?o\s+the\s+desi\w{3,10}\s+of\s*(?:an?\b|the\b)?\s*`;
/** "to a B2-3", "to the DC-16", "to Residential Planned Development Number 1135, as amended". */
const TO_ARTICLE = String.raw`\b[TtlIf]\s?o\s+(?:(?:an?|the)\s+(?=${DISTRICT_START})|(?=${PD_KIND}(?:\s*[-\/]?\s*${PD_KIND})*\s*P[lIi]a[\w']{1,6}\s*Dev))`;
const TO_END = String.raw`(?=\s*(?:,\s*which\b|\bwhich\b|\band\s+a\s+corresponding\b|\bsubject\s+to\b|\bis\s+hereby\b|(?<!\bNos?)\.\s|\n\s*\n|\bSECTION\b|$)|(?<=\bamended)\s*[,;])`;
const PD_START = String.raw`${PD_KIND}(?:\s*[-\/]?\s*${PD_KIND})*\s*P[lIi]a[\w']{1,6}\s*Dev`;
/** The typist dropped "to those of": the new district stands alone on the next line ("North May Street;\na Business Planned Development."), a plain district only after a blank line. */
const TO_BLANK = String.raw`\n[ \t]*\n\s*(?=(?:RS|RT|RM|B[123]|C[123]|D[XRCS]|M[123])\s?[-–—]\s?\d)|\n\s*(?:(?:an?|the)\s+)?(?=${PD_START})`;
/** "symbols and indications within the area herein above as Institutional Planned Development Number". */
const TO_AS = String.raw`\bas\s+(?:(?:an?|the)\s+)?(?=${PD_START})`;
const TO_CLAUSE = String.raw`(?:${TO_THOSE_OF}|${TO_DESIGNATION}|${TO_ARTICLE}|${TO_BLANK}|${TO_AS})([\s\S]{2,260}?)${TO_END}`;
/** The boundary description: up to 16,000 characters (a rail corridor's runs that long), never past the next SECTION heading. */
const MIDDLE = String.raw`(?:(?![\n\f][ \t]*SECTION\s*[\dIVX]+\s*[.:\n](?![ \t]*(?:[Tt]o\s+t[hl]|[Tt]h[oa]se)))[\s\S]){0,16000}?`;
const SECTION_RE = new RegExp(String.raw`${CHANGING}(?:all\s+)?(?:of\s+)?(?:the\s+)?(?:current\s+|existing\s+)?([\s\S]{2,700}?)${FROM_END}(${MIDDLE})${TO_CLAUSE}`, "gi");

/** "changing all the symbols and indications of Institutional Planned Development Number 1054 as shown on Map ... to those of ..." */
const SECTION_OF_RE = new RegExp(String.raw`${CHANGING}all\s+(?:of\s+)?(?:the\s+|t[hl]ie\s+)?symbo[lL]s?\s+and\s+indica\w*\s+of\s+([\s\S]{2,300}?)\s+as\s+shown\s+on(${MIDDLE})${TO_CLAUSE}`, "gi");

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
      // "to those of a B3-2 Community Shopping District then to Institutional Planned Development 1150, as amended": the last.
      const pick = /\bthen\s+to\b/i.test(toText) ? to[to.length - 1] : to[0];
      found.push({ index: m.index!, section: { from: parseDistricts(fromText), to: pick ?? null, fromText, toText } });
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
 * The "Maximum Dwelling Unit Count" line of a planned development's bulk table, in the spellings the scans give it
 * ("Maximum Number of Dwelling Units", "Maximum Permitted Dwelling Units", "Max. Residential Dwelling Units",
 * "MAXIMUM NUMBER OF DWELLING 120"). A number right after the label is the total; "N/A" or "None Permitted" is 0; a
 * table with subarea lines uses its own "Total" line, else the subareas are summed; a table laid out in columns (the
 * labels in one run, the values in the next) gives the first value after the labels, unless it is an area or a height.
 * Without a bulk-table line, an explicit statement in the development's own words ("permits the construction of 500
 * dwelling units", "a 25-story building with 350 residential units", "fifty-six (56) dwelling units") stands in, the
 * largest when there are several, as the permit rules do.
 */
export function pdUnitCount(text: string): CountReading {
  const t = stripOcrMarks(text);
  const label = /Max(?:imum|\.)?\s+(?:Number\s+of\s+|No\.?\s+of\s+|Permitted\s+)?(?:Residential\s+)?Dwelling(?:\s+Uni[tl][sz]?)?(?:\s+Count)?\s*(?:\([^)\n]{0,40}\))?\s*[:;]?/gi;
  const labels = [...t.matchAll(label)].map((m) => ({ at: m.index! + m[0].length, start: m.index! }));
  // A number right after a label, or a subarea table under it, in text order.
  for (const { at } of labels) {
    const window = t.slice(at, at + 600);
    if (/^\s*(?:N\/A|None(?:\s+Permitted)?)\b/i.test(window)) return { units: 0, notes: ["the statements allow no dwelling units"] };
    const direct = /^\s*\(?([\d,]{1,7})\)?\s*\*?/.exec(window);
    // Subarea lines; a decimal ("Subarea A: 1.58") is a floor area ratio, not a count.
    const sub = [...window.matchAll(/Sub-?\s?areas?\s+['"]?[A-Z0-9]{1,2}['"]?\s*[:=]?\s*\(?([\d,]{1,6})\)?(?!\.\d)\s*(?:\*|units)?/gi)];
    const stop = window.search(/Maximum\s+(?!Dwelling)|Max\.\s+(?!Dwelling|Residential)|Minimum\s+|Net\s+Site|Retail\s+Area|Open\s+Space/i);
    const inWindow = sub.filter((s) => stop < 0 || s.index! < stop);
    if (direct && toInt(direct[1]) <= 25_000) {
      // A total can never be smaller than one of its subareas: "141" over subareas of 361 and 380 is a 741 the scanner misread.
      const largest = inWindow.reduce((m, x) => Math.max(m, toInt(x[1])), 0);
      if (largest > toInt(direct[1])) return { units: inWindow.reduce((s, x) => s + toInt(x[1]), 0), notes: [`the total line reads ${direct[1]}, below its subareas; summed ${inWindow.length} subareas`] };
      return { units: toInt(direct[1]), notes: [] };
    }
    if (sub.length) {
      if (inWindow.length) {
        const total = /\bTotal\s*[:=]?\s*\n?\s*\(?([\d,]{1,6})\)?\s*(?:\*|units)?/i.exec(stop < 0 ? window : window.slice(0, stop));
        if (total && toInt(total[1]) <= 25_000) return { units: toInt(total[1]), notes: [`the table's total over ${inWindow.length} subareas`] };
        return { units: inWindow.reduce((s, x) => s + toInt(x[1]), 0), notes: [`summed ${inWindow.length} subareas`] };
      }
    }
  }
  // A table laid out in columns: the labels in one run, the values in the next. Only a label that starts its line is
  // a table row ("the maximum number of dwelling units allowed within this planned development" mid-sentence is not).
  for (const { at, start } of labels) {
    if (!(start === 0 || /\n[ \t]*$/.test(t.slice(Math.max(0, start - 40), start)))) continue;
    const column = /^(?:[ \t]*[^\d\n]*\n){1,14}[ \t]*\(?([\d,]{1,7})\)?(?![\d,]*\s*(?:\.\d|sq|square|feet|ft\b|'|%|\$|acres?|x\s*\d))/i.exec(t.slice(at, at + 600));
    if (column && toInt(column[1]) <= 25_000) return { units: toInt(column[1]), notes: ["read from a bulk table laid out in columns"] };
  }
  const said = new Set<number>();
  const add = (s: string) => {
    const n = toInt(s);
    if (n <= 25_000) said.add(n);
  };
  const DU = String.raw`(?:residential\s+|new\s+|overall\s+)?dwelling\s+units`;
  for (const m of t.matchAll(new RegExp(String.raw`permits(?:\s+the\s+construction\s+of)?\s+(?:up\s+to\s+)?(?:approximately\s+)?(?:a\s+total\s+of\s+)?(?:[a-z-]+\s+){0,4}?\(?([\d,]{1,6})\)?\s+${DU}`, "gi"))) add(m[1]);
  for (const m of t.matchAll(new RegExp(String.raw`\b(?:maximum|total)\s+of\s+(?:[a-z-]+\s+){0,5}?\(?([\d,]{1,6})\)?\s+${DU}`, "gi"))) add(m[1]);
  for (const m of t.matchAll(/\b(?:containing|contain|with|of|including)\s+(?:up\s+to\s+)?(?:approximately\s+)?([\d,]{1,6})\s+(?:overall\s+)?(?:residential\s+|new\s+)?(?:dwelling\s+)?units\b(?!\s+or\s+more)/gi)) add(m[1]);
  for (const m of t.matchAll(/\b([\d,]{1,6})\s*-?\s*(?:residential\s+)?dwelling[-\s]unit\s+(?:residential\s+|mixed-use\s+)?building/gi)) add(m[1]);
  for (const m of t.matchAll(/\(\s*(\d{1,5})\s*\)\s+(?:residential\s+|new\s+)?dwelling\s+units/gi)) add(m[1]);
  for (const m of t.matchAll(new RegExp(String.raw`\bup\s+to\s+(?:[a-z-]+\s+){0,3}?\(?([\d,]{1,6})\)?\s+${DU}`, "gi"))) add(m[1]);
  if (!said.size && /\b(?:no|zero|0)\s+(?:new\s+|residential\s+)?dwelling\s+units\b/i.test(t)) return { units: 0, notes: ["the statements say no dwelling units"] };
  if (said.size) {
    const nums = [...said].sort((a, b) => a - b);
    return { units: nums[nums.length - 1], notes: ["from the planned development statements' narrative" + (nums.length > 1 ? ` (several unit numbers: ${nums.join(", ")})` : "")] };
  }
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
  // "982 SF PER DWELLING UNIT", "MIN. LOT AREA/DWELLING UNIT: 688": a density standard, not a count.
  const densityBefore = (index: number) => /\b(?:PER|AREA|FEET|FT|SF|S\.F\.|MLA)\s*[:\/]?\s*$/.test(d.slice(Math.max(0, index - 14), index));
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
  // The filing's districts, unless its scan lost them where the substitute's did not.
  let fromDistricts = firstSections[0]?.from.length ? firstSections[0].from : (sections[0]?.from ?? []);
  // An ordinance that names no from-district ("changing all the Community Shopping District symbols"): the application
  // form bound into the record says "Present Zoning District: B3-3".
  if (!fromDistricts.length && sections.length) {
    const present = /Present\s+Zoning\s+District:?\s*([^\n]{2,80})/i.exec(stripOcrMarks(text));
    const fromForm = present ? parseDistricts(present[1]) : [];
    if (fromForm.length) {
      fromDistricts = fromForm;
      notes.push(`from-district read from the application form's "Present Zoning District" line: ${fromForm.map(displayDistrict).join(", ")}`);
    }
  }
  // "changing all the Planned Development No. 1449 symbols": the record names its kind elsewhere ("Residential Business Planned Development No. 1449").
  fromDistricts = fromDistricts.map((f) => (f.family === "PD" && f.pdNumber !== null && f.pdKind === null ? { ...f, pdKind: pdKindFromText(text, f.pdNumber) } : f));
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
  // "RM-5 to B3-5, then B3-5 to PD 1335, as amended": a planned development named in any section's from-chunk makes it an amendment.
  const pdFrom = sections.flatMap((s) => s.from.filter((f) => f.family === "PD"));
  const dir = direction(fromDistricts.some((f) => f.family === "PD") ? fromDistricts : [...fromDistricts, ...pdFrom], to);
  if (dir === "unknown" && sections.length && fromDistricts.length && to) {
    notes.push(
      fromDistricts.every((f) => f.family === "PD")
        ? "direction unknown: leaving a planned development whose homes the ordinance does not state"
        : "direction unknown: the districts' tables do not cover this change",
    );
  }
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
