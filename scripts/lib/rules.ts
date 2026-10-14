/**
 * Classification and unit-parsing rules. Pure functions over the permit's work description.
 * The spec's "Classification and parsing rules" section is the source of truth; keep the two in sync.
 */
import type { Category, Classification, Permit } from "./types";

const WORD_NUM: Record<string, number> = {
  ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5, SIX: 6, SEVEN: 7, EIGHT: 8, NINE: 9, TEN: 10, ELEVEN: 11, TWELVE: 12,
};
const WORDS = Object.keys(WORD_NUM).join("|");

/** Upper-case, collapse whitespace, turn "TWO (2)" and "(2)" into plain digits, word-numbers before unit words into digits. */
export function normalize(desc: string): string {
  let d = (desc || "").toUpperCase().replace(/\s+/g, " ").trim();
  d = d.replace(new RegExp(`\\b(${WORDS})\\s*\\((\\d+)\\)`, "g"), "$2");
  d = d.replace(/\((\d{1,4})\)/g, " $1 ");
  d = d.replace(/(\w)-\s+(?=(?:DWELLING |RESIDENTIAL )?(?:UNITS?|D\.?U\.?|FLATS?)\b)/g, "$1-");
  d = d.replace(
    new RegExp(`\\b(${WORDS})[- ](?=(?:NEW |EXISTING |DWELLING |RESIDENTIAL |RESIDENTIAL DWELLING |APARTMENT |CONDO\\w* |SRO |EFFICIENCY |ADDITIONAL )?(?:UNITS?|D\\.?U\\.?S?|FLATS?|DWELLINGS?|ADU|A\\.D\\.U|TOWNHO\\w*|APARTMENTS?)\\b)`, "g"),
    (_m, w: string) => String(WORD_NUM[w]),
  );
  return d.replace(/\s+/g, " ");
}

const UNIT_WORD = String.raw`(?:UNITS?|D\.?\s?U\.?S?'?|FLATS?)`;
/** Words allowed between a number and the unit word for the mention to mean dwellings. */
const OK_QUALIFIERS = new Set([
  "", "DWELLING", "RESIDENTIAL", "RESID", "RESID.", "APARTMENT", "APT", "APT.", "CONDO", "CONDOMINIUM", "CONDOS",
  "SRO", "EFFICIENCY", "LIVING", "AFFORDABLE", "RENTAL", "NEW", "RESIDENTIAL DWELLING", "NEW DWELLING", "NEW RESIDENTIAL",
  "ADDITIONAL", "EXISTING", "TOTAL", "ADDITIONAL DWELLING", "SENIOR", "ARO", "STUDIO", "LOFT", "DWELLING RENTAL",
]);
const BAD_QUALIFIER = /\b(STORAGE|HVAC|A\/?C|AIR|CONDENSING|ROOFTOP|MECHANICAL|PTAC|COMMERCIAL|RETAIL|OFFICE|PARKING|HOTEL|GUEST|SLEEPING|HEATING|COOLING|RTU|FAN|COIL|OUTDOOR|INDOOR|SPLIT|WALL|WINDOW|LIGHTING|LIGHT|EV|CHARGING|SELF|DOCK|LOADING|KITCHEN|BATH|TOILET|FIXTURE|BED|TRASH|REFRIGERAT\w*|FREEZER|DISPLAY|CELL|BATTERY|SOLAR|PV|DEHUMIDIF\w*|HUMIDIF\w*|EXHAUST|SUPPLY|VENT\w*|TERMINAL|WORK|DIALYSIS|LABORATORY|LAB|TENANT|LOT|KIOSK|VENDING|SHOWER|WASH\w*|LAUNDRY|CONTROL|POWER|GENERATOR|POOL|SPA|ELEVATOR|LIFT|HOIST)\b/;

interface Mention { n: number; qualifier: string; index: number; uncertain: boolean }

/** Every "<n> [qualifier] UNIT(S)/D.U./FLAT" mention that plausibly means dwelling units. */
export function unitMentions(d: string): Mention[] {
  const re = new RegExp(String.raw`\b(\d{1,4})\s*-?\s*((?:[A-Z.'/]+\s+){0,3}?)${UNIT_WORD}\b`, "g");
  const out: Mention[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d))) {
    const n = Number(m[1]);
    const qualifier = m[2].trim().replace(/\s+/g, " ");
    if (BAD_QUALIFIER.test(qualifier)) continue;
    const known = OK_QUALIFIERS.has(qualifier) || /^(NEW|EXISTING|ADDITIONAL|RESIDENTIAL|DWELLING|AFFORDABLE|RENTAL|SENIOR)\b/.test(qualifier);
    // Unknown qualifiers (typos like "DWEELING", unexpected adjectives) count but go to review.
    if (!known && qualifier.split(" ").length > 2) continue;
    if (n === 0 || n > 2000) continue;
    out.push({ n, qualifier, index: m.index, uncertain: !known });
  }
  return out;
}

const TOTAL_RE = /\b(\d{1,4})\s*TOTAL\s*(?:DWELLING\s*|RESIDENTIAL\s*)?UNITS?\b|\bTOTAL OF\s+(\d{1,4})\s*(?:DWELLING\s*|RESIDENTIAL\s*)?(?:UNITS?|D\.?U\.?S?)\b/;
const TOWNHOME_RE = /\b(\d{1,3})\s*(?:NEW\s+)?(?:UNIT\s+)?(?:TOWNHOMES?|TOWNHOUSES?|TOWN\s?HOMES?|TOWN\s?HOUSES?|ROWHOUSES?|ROW\s?HOUSES?)\b/;
const SFR_WORD = /\b(SINGLE[- ]FAMILY|SFR|S\.F\.R\.?|ONE[- ]FAMILY|1[- ]FAMILY|SINGLE FAMILY)\b/;
const NEW_INTENT = /\b(ERECT\w*|NEW|CONSTRUCT\w*|BUILD(?!-?OUT)|PROPOSED|FULL BUILDING PERMIT|PERMIT FOR)\b/;
const RESIDENCE_WORD = /\b(RESIDENCE|RESIDENCES|HOME|HOMES|HOUSE|HOUSES|DWELLING|DWELLINGS|TOWNHOME|TOWNHOUSE|ROWHOUSE)\b/;
const RES_KEYWORD = /\b(RESIDENTIAL|RESIDENCE|RESIDENCES|APARTMENTS?|DWELLINGS?|CONDO\w*|R-?2|R-?3|R-?5|MULTI[- ]?(?:UNIT|FAMILY)|TOWNHO\w*|SINGLE[- ]FAMILY|SFR|UNITS?|D\.U\.|HOME|HOUSE|COACH HOUSE|ADU)\b/;
const EXISTING_RES = /\bEXISTING\b(?:\s+\S+){0,8}?\s+(?:RESIDENCE|HOME|HOUSE|DWELLING|BUILDING|BLDG|STRUCTURE|\d-?FLAT|UNIT|RESIDENTIAL)/;

const STRONG_NOISE = /\b(TENTS?|MOBILE STAGE|CRANES?|SCAFFOLD\w*|EV CHARG\w*|ANTENNAS?|WIRELESS|BLEACHERS?|SCULPTURE|TEMPORARY STRUCTURE|TEMPORARY ELECTRIC\w*|TEMPORARY SERVICE|ELECTRIC VEHICLE|SOLAR|GENERATOR|CELL SITE|MONOPOLE|BILLBOARD|FLAGPOLE|KIOSK)\b/;
const WEAK_NOISE = /\b(STAGES?|PLATFORMS?|CANOP(?:Y|IES)|SIGNS?|AWNINGS?|FESTIVAL|EVENT)\b/;
const BUILDOUT = /\b(BUILD-?OUTS?|TENANT IMPROVEMENT|INTERIOR ALTERATION|INTERIOR BUILD)\b/;
const ACCESSORY = /\b(GARAGES?|CARPORTS?|SHEDS?|FENCES?|FENCING|DECKS?|PORCH\w*|PERGOLAS?|GAZEBOS?|PATIOS?|STAIRS?|STAIRCASE|BREEZEWAY|RETAINING WALL|DRIVEWAY|PARKING PAD|GREENHOUSE|POOL|HOT TUB|TRELLIS|DUMPSTER|TRASH ENCLOSURE)\b/;
const REVISION_RE = /\b(REVISION|REVISED|REVISE|REINSTATE\w*|REINST\b)|\b(?:CAISSONS?|PILES?|PILE|FOUNDATIONS?|SUPERSTRUCTURE|SHELL|STRUCTUR\w*|LANDSCAPE|EXCAVATION|SHORING|EARTH RETENTION|VERTICAL PENETRATIONS?|SITE WORK|DEMOLITION|MEP|PLUMBING|ELECTRICAL)\s*(?:\([^)]*\)\s*)?ONLY\b|\bONLY PERMIT\b|\bCORE AND SHELL\b|\bPHASED\b|\bPHASE [1-9]\b/;
const BEDS_ROOMS = /\b(HOTEL|MOTEL|DORMITOR\w*|NURSING|ASSISTED LIVING|SHELTER|HOSPICE|MEMORY CARE|HOSPITAL|BARRACKS)\b/;
const NONRES = /\b(COMMERCIAL|RETAIL|OFFICE|WAREHOUSE|INDUSTRIAL|SCHOOL|CHURCH|HOSPITAL|RESTAURANT|STORE|MANUFACTUR\w*|DISTRIBUTION|DATA CENTER|PARKING (?:LOT|GARAGE|STRUCTURE)|CLINIC|HOTEL|GYM|FIELDHOUSE|STATION|TRANSIT|LIBRARY|STADIUM|TERMINAL|CONCOURSE|SWITCHGEAR|SUBSTATION|BANK|DAYCARE|DAY CARE|CHILD CARE|SALON|CAR WASH|GAS STATION|THEATER|MUSEUM|LABORATORY|SHOWROOM|FACTORY|PLANT|DEPOT|HANGAR|BUS|WAREHOUSING|SELF[- ]STORAGE|CULTURAL|ATHLETIC|RECREATION\w*|PAVILION|KENNEL|VETERINARY|DEALERSHIP|DISPENSARY|CANNABIS)\b/;
const ADU_RE = /\b(ADUS?|A\.D\.U\.?S?|COACH HOUSE|COACH HOUSES|ADDITIONAL DWELLING|ACCESSORY DWELLING|CONVERSION UNIT)\b/;
const ADU_COUNT_RE = /\b(\d{1,2})\s*(?:NEW\s+)?(?:ADUS?|A\.D\.U\.?S?|ADDITIONAL DWELLING UNITS?|COACH HOUSES?)\b/;
const EMERGENCY_RE = /\b(EMERGENCY|COURT[- ]ORDER\w*|DANGEROUS AND HAZARDOUS|IMMINENT)\b/;
const STRUCTURED_DEMO_RE = /\b(\d{1,4})\s*RESIDENTIAL UNITS?\b/;
const NUM = String.raw`(\d{1,3})`;
const UNIT_OR_SFR = String.raw`(?:${UNIT_WORD}|DWELLINGS?|SINGLE[- ]FAMILY\w*|SFR|S\.F\.R\.?)`;
const QUAL = String.raw`(?:(?:NEW|EXISTING|DWELLING|RESIDENTIAL|ORIGINAL|LEGAL|TOTAL|SEPARATE|RESIDENTIAL DWELLING)\s+){0,2}`;

/** Rule F1: FROM X [units] TO/INTO Y units|SFR. Returns Y-X. */
export function fromToDelta(d: string): number | null {
  const re = new RegExp(String.raw`\bFROM\s+(?:A\s+|AN\s+|THE\s+)?(?:EXISTING\s+)?${NUM}\s*-?\s*${QUAL}${UNIT_WORD}?\s*(?:[A-Z]+\s+){0,3}?\b(?:TO|INTO)\s+(?:A\s+|AN\s+)?(?:TOTAL OF\s+)?(?:${NUM}\s*-?\s*${QUAL}${UNIT_OR_SFR}|(SINGLE[- ]FAMILY|SFR|S\.F\.R\.?))`);
  const m = re.exec(d);
  if (m) {
    const x = Number(m[1]);
    const y = m[3] ? 1 : Number(m[2]);
    if (x <= 500 && y <= 500) return y - x;
  }
  const re2 = new RegExp(String.raw`\b${NUM}\s*-?\s*${QUAL}${UNIT_WORD}\s+(?:[A-Z]+\s+){0,2}?(?:TO|INTO)\s+(?:A\s+|AN\s+)?(?:TOTAL OF\s+)?${NUM}\s*-?\s*${QUAL}${UNIT_WORD}\b`);
  const m2 = re2.exec(d);
  if (m2) {
    const x = Number(m2[1]);
    const y = Number(m2[2]);
    if (x <= 500 && y <= 500) return y - x;
  }
  return null;
}

/** Rule F2: X UNIT/FLAT ... TO SFR => 1-X; and SFR ... TO N UNITS => N-1. */
function toSfr(d: string): number | null {
  const m = new RegExp(String.raw`\b${NUM}\s*-?\s*(?:DWELLING\s+|RESIDENTIAL\s+)?(?:UNITS?|D\.?U\.?S?|FLAT)\b[^.;]{0,40}?\b(?:TO|INTO)\s+(?:A\s+|AN\s+)?(?:SINGLE[- ]FAMILY|SFR|S\.F\.R\.?|ONE[- ]FAMILY|1[- ]FAMILY)`).exec(d);
  if (m) return 1 - Number(m[1]);
  const m2 = new RegExp(String.raw`\b(?:SINGLE[- ]FAMILY|SFR|S\.F\.R\.?|ONE[- ]FAMILY)\b[^.;]{0,80}?\b(?:TO|INTO)\s+(?:A\s+|AN\s+)?${NUM}\s*-?\s*(?:DWELLING\s+|RESIDENTIAL\s+)?(?:UNITS?|D\.?U\.?S?|FLAT)`).exec(d);
  if (m2) return Number(m2[1]) - 1;
  return null;
}

/** Rule F3: COMBINE N UNITS => 1-N; COMBINE UNITS 1201 AND 1202 => -1. */
function combine(d: string): number | null {
  if (!/\bCOMBIN\w*\b/.test(d)) return null;
  const m = new RegExp(String.raw`\bCOMBIN\w*\s+(?:OF\s+)?(?:THE\s+)?(?:${NUM}\s+)?(?:EXISTING\s+|ADJACENT\s+)?(?:DWELLING\s+|RESIDENTIAL\s+|CONDO\w*\s+|APARTMENT\s+)?UNITS?\b`).exec(d);
  if (!m) return null;
  if (m[1]) return 1 - Number(m[1]);
  const listed = d.match(/\bUNITS?\s+#?\s*\d+[A-Z]?\s*(?:,\s*#?\d+[A-Z]?\s*)*(?:AND|&|\+)\s*#?\d+[A-Z]?/);
  if (listed) {
    const ids = listed[0].match(/\d+[A-Z]?/g) ?? [];
    if (ids.length >= 2) return 1 - ids.length;
  }
  return -1;
}

/** Rule F7: CONVERT ... (nonres use) ... TO N (dwelling) units => +N. */
function nonresConversion(d: string): number | null {
  if (!/\bCONVER\w*\b/.test(d)) return null;
  if (!/\b(OFFICE|COMMERCIAL|RETAIL|WAREHOUSE|HOTEL|SCHOOL|CHURCH|INDUSTRIAL|STORAGE|VACANT|BUSINESS|BANK|FACTORY|MANUFACTURING|STORE|RESTAURANT|TAVERN|GARAGE|LAUNDROMAT|DAYCARE)\b/.test(d)) return null;
  const m = new RegExp(String.raw`\b(?:TO|INTO)\s+(?:A\s+|AN\s+|ONE\s+)?(?:NEW\s+|TOTAL OF\s+)?(?:${NUM}\s*-?\s*)?(?:NEW\s+|RESIDENTIAL\s+|DWELLING\s+|RESIDENTIAL DWELLING\s+|APARTMENT\s+)?(?:UNITS?|D\.?U\.?S?|APARTMENTS?|DWELLINGS?)\b`).exec(d);
  if (m) {
    const n = m[1] ? Number(m[1]) : 1;
    return n > 1500 ? null : n;
  }
  // "...CONVERT IT TO MULTI-UNIT RESIDENTIAL USE. NEW OCCUPANCY TO CONTAIN 57 DWELLING UNITS."
  const mentions = unitMentions(d).filter((x) => /DWELLING|RESIDENTIAL|APARTMENT/.test(x.qualifier));
  if (mentions.length) return Math.max(...mentions.map((x) => x.n));
  return null;
}

function legalize(d: string): number | null {
  const m = /\bLEGALIZ\w*\b[^.;]{0,60}?\b(?:(\d{1,2})\s+)?(?:EXISTING\s+|BASEMENT\s+|ATTIC\s+|GARDEN\s+|REAR\s+|ILLEGAL\s+|NON-?PERMITTED\s+|AS-BUILT\s+)*(?:DWELLING\s+|RESIDENTIAL\s+)?(?:UNITS?|D\.?U\.?S?|ADUS?|A\.D\.U\.?)\b/.exec(d);
  if (!m) return null;
  return m[1] ? Number(m[1]) : 1;
}

function newConstructionUnits(d: string): { units: number | null; source: Classification["units_source"]; notes: string[] } {
  const notes: string[] = [];
  const total = TOTAL_RE.exec(d);
  if (total) return { units: Number(total[1] ?? total[2]), source: "regex_number", notes: ["total units phrase"] };
  const mentions = unitMentions(d);
  if (mentions.length) {
    const distinct = new Set(mentions.map((m) => m.n));
    const units = Math.max(...mentions.map((m) => m.n));
    if (distinct.size > 1) notes.push(`multiple unit numbers: ${[...distinct].join(", ")}`);
    const uncertain = mentions.filter((m) => m.n === units).every((m) => m.uncertain);
    if (uncertain) notes.push(`uncertain qualifier: ${mentions.find((m) => m.n === units)?.qualifier}`);
    return { units, source: "regex_number", notes };
  }
  const th = TOWNHOME_RE.exec(d);
  if (th) return { units: Number(th[1]), source: "regex_number", notes: ["townhomes"] };
  if (ADU_RE.test(d) && !/NO CHANGE/.test(d)) {
    const c = ADU_COUNT_RE.exec(d);
    return { units: c ? Number(c[1]) : 1, source: "sfr_keyword", notes: ["adu/coach house"] };
  }
  if (SFR_WORD.test(d)) return { units: 1, source: "sfr_keyword", notes: [] };
  if (/\b(TOWNHOME|TOWNHOUSE|ROWHOUSE|ROW HOUSE)\b/.test(d)) return { units: 1, source: "sfr_keyword", notes: ["single townhome"] };
  // RESIDENCE / HOME / HOUSE being erected, not an existing one being worked on.
  if (RESIDENCE_WORD.test(d) && NEW_INTENT.test(d) && !EXISTING_RES.test(d)) {
    return { units: 1, source: "sfr_keyword", notes: ["residence keyword"] };
  }
  return { units: null, source: "unknown", notes };
}

// --- demolition scope ------------------------------------------------------------------------
/** Clauses about what stays ("NO WORK TO FRONT BUILDING", "EXISTING HOUSE TO REMAIN"), dropped before looking for a building word. */
const STAYS = /\bNO WORK (?:TO|ON|AT)\b[^.;,]*|[^.;,]*\bTO REMAIN\b[^.;,]*|[^.;,]*\b(?:WILL|IS|ARE) (?:NOT|TO) (?:BE )?(?:DEMOLISHED|REMOVED|WRECKED|AFFECTED)\b[^.;,]*|[^.;,]*\bREMAINS?\b[^.;,]*/g;
/** A whole building is coming down. "1 STORY" is not on this list: a garage has stories too. */
const BUILDING_WORD = /\b(BUILDINGS?|BLDGS?|RESIDENCES?|DWELLINGS?|HOUSES?|HOMES?|\d-?\s?FLATS?|FLATS?|UNITS?|APARTMENTS?|TOWNHO\w+|BUNGALOWS?|COTTAGES?|DUPLEX|CONDO\w*|STRUCTURES?|GREYSTONE|COACH HOUSE)\b/;
/** Things that can be wrecked without a dwelling going with them. */
const PART_WORD = /\b(SMOKE ?STACKS?|CHIMNEYS?|CANOP(?:Y|IES)|AWNINGS?|SIGNS?|BILLBOARDS?|FIRE ESCAPES?|BALCON(?:Y|IES)|PARAPETS?|CORNICES?|FACADES?|ROOFTOP|PENTHOUSE|WATER TOWER|TANKS?|SILOS?|ANTENNAS?|ELEVATORS?|ESCALATORS?|VESTIBULES?|MARQUEES?|GARAGES?|SHEDS?|CARPORTS?|PORCH(?:ES)?|DECKS?|STAIRS?|STAIRCASES?|FENCES?|FENCING|RETAINING WALLS?|TRELLIS|PERGOLAS?|GAZEBOS?|POOLS?|GREENHOUSES?|ADDITIONS?|DUMPSTERS?|TRASH ENCLOSURES?|PLAYGROUNDS?|BLEACHERS?|KIOSKS?|SLABS?|FOUNDATIONS?|PAVEMENT|PARKING LOTS?|DRIVEWAYS?|PATIOS?|WALLS?|ROOFS?)\b/;
/** The permit itself says only part of something comes down. "PARTIALLY BUILT" is a whole unfinished building, not this. */
const PARTIAL_WORD = /\bPARTIAL(?:LY)?\b(?!\s+(?:BUILT|COMPLETED|CONSTRUCTED|ERECTED)\b)|\b(?:PORTION OF|PART OF|SELECTIVE|INTERIOR (?:DEMOLITION|DEMO|ONLY|NON-?STRUCTURAL|WORK)|NON-?STRUCTURAL)\b/;

/** A wrecking permit for a part or an outbuilding, not a dwelling: zero units, no assessor lookup. */
export function isPartialDemolition(desc: string): boolean {
  const d = normalize(desc);
  if (PARTIAL_WORD.test(d)) return true;
  const kept = d.replace(STAYS, " ");
  return PART_WORD.test(kept) && !BUILDING_WORD.test(kept);
}

export function classify(permit: Pick<Permit, "permit_type" | "description" | "pins">): Classification {
  const type = (permit.permit_type || "").toUpperCase();
  const d = normalize(permit.description);
  const base = (category: Category, units: number | null, units_source: Classification["units_source"], needs_review = false, notes: string[] = []): Classification => ({
    category, units, units_source, needs_review, notes,
  });

  if (type.includes("NEW CONSTRUCTION")) {
    if (d.startsWith("PERMIT EXPIRES ON")) return base("noise", 0, "unknown", false, ["temporary structure prefix"]);
    const resKw = RES_KEYWORD.test(d);
    if (STRONG_NOISE.test(d)) return base("noise", 0, "unknown", false, ["noise keyword"]);
    if (WEAK_NOISE.test(d) && !resKw) return base("noise", 0, "unknown", false, ["weak noise keyword"]);
    if (BUILDOUT.test(d)) return base("new_nonresidential", 0, "unknown", false, ["build-out"]);
    const hasUnits = unitMentions(d).length > 0 || TOTAL_RE.test(d) || TOWNHOME_RE.test(d);
    if (ACCESSORY.test(d) && !hasUnits && (!resKw || EXISTING_RES.test(d)) && !(SFR_WORD.test(d) && NEW_INTENT.test(d) && !EXISTING_RES.test(d))) {
      return base("accessory", 0, "unknown", false, ["accessory structure"]);
    }
    const rev = REVISION_RE.test(d);
    const u = newConstructionUnits(d);
    if (rev) {
      return base("revision_or_phase", u.units, u.units === null ? "unknown" : u.source, false, ["revision or phase", ...u.notes]);
    }
    if (u.units !== null) {
      const review = u.notes.some((n) => n.startsWith("multiple unit numbers") || n.startsWith("uncertain qualifier"));
      return base("new_residential", u.units, u.source, review, u.notes);
    }
    if (BEDS_ROOMS.test(d)) return base("new_nonresidential", 0, "unknown", false, ["beds/rooms, not dwelling units"]);
    if (resKw && !NONRES.test(d)) return base("new_residential", null, "unknown", true, ["residential keyword, no unit count"]);
    if (resKw && NONRES.test(d)) return base("new_residential", null, "unknown", true, ["mixed keywords, no unit count"]);
    return base("new_nonresidential", 0, "unknown", false, []);
  }

  if (type.includes("WRECKING") || type.includes("DEMOLITION")) {
    const emergency = EMERGENCY_RE.test(d);
    const category: Category = emergency ? "emergency_demolition" : "demolition";
    const hint: Classification["demo_hint"] = /\bMULTI[- ]?(?:UNIT|FAMILY)\b|\b[2-9]-?\s?FLAT\b|\bAPARTMENT/.test(d)
      ? "multi"
      : /\b(RESIDENCE|DWELLING|HOUSE|HOME|SINGLE[- ]FAMILY|SFR)\b/.test(d)
        ? "single"
        : "none";
    // When the city states the count, that is the answer, partial or not.
    const structured = STRUCTURED_DEMO_RE.exec(d);
    if (structured) return { ...base(category, Number(structured[1]), "structured_demo", false, ["structured demo template"]), demo_hint: hint };
    // A smokestack, a garage, a porch, a rear addition: nothing a dwelling goes with. Never sent to the assessor.
    if (isPartialDemolition(d)) return { ...base("demolition_accessory", 0, "unknown", false, ["part or outbuilding only, no dwelling"]), demo_hint: "none" };
    // Unit count resolved later against the assessor; null here means "look it up".
    return { ...base(category, null, "unknown", false, ["needs parcel lookup"]), demo_hint: hint };
  }

  if (type.includes("RENOVATION") || type.includes("ALTERATION")) {
    if (/\bNO CHANGE\b[^.;]{0,40}\b(?:UNITS?|D\.?U\.?|DWELLING)/.test(d)) return base("renovation_other", 0, "unknown", false, ["no change in units"]);
    const ft = fromToDelta(d);
    if (ft !== null) return base(ft === 0 ? "renovation_other" : "renovation_delta", ft, "regex_number", false, ["from-to"]);
    const sfr = toSfr(d);
    if (sfr !== null) return base(sfr === 0 ? "renovation_other" : "renovation_delta", sfr, "regex_number", false, ["to/from single family"]);
    const comb = combine(d);
    if (comb !== null) return base("renovation_delta", comb, "regex_number", comb === -1 && !/\b\d\s+(?:DWELLING\s+)?UNITS?\b/.test(d), ["combine units"]);
    const conv = nonresConversion(d);
    if (conv !== null) return base("renovation_delta", conv, "regex_number", false, ["non-residential conversion"]);
    if (/\b(DEMO\w*|REMOV\w*|WRECK\w*|RAZE)\b[^.;]{0,30}?\b(?:EXISTING\s+)?(?:COACH HOUSE|ADU|A\.D\.U\.?)\b/.test(d) && !/\b(NEW|PROPOSED|ERECT\w*|CONSTRUCT\w*)\s+(?:\S+\s+){0,3}?(?:COACH HOUSE|ADU)\b/.test(d)) {
      return base("renovation_delta", -1, "regex_number", true, ["coach house removed"]);
    }
    if (ADU_RE.test(d) && !/\bNO CHANGE\b|\bREVISION\b|\bREVISED\b/.test(d)) {
      const c = ADU_COUNT_RE.exec(d);
      return base("renovation_delta", c ? Number(c[1]) : 1, "regex_number", false, ["adu"]);
    }
    const leg = legalize(d);
    if (leg !== null) return base("renovation_delta", leg, "regex_number", false, ["legalize"]);
    if (/\bDE-?CONVER\w*\b/.test(d)) return base("renovation_delta", null, "unknown", true, ["deconversion without numbers"]);
    return base("renovation_other", 0, "unknown", false, []);
  }

  return base("other_type", 0, "unknown", false, []);
}

/** For demolition fallback when no parcel resolves (spec Step E4). */
export function demoFallbackUnits(hint: Classification["demo_hint"]): { units: number; needs_review: boolean } {
  if (hint === "multi") return { units: 2, needs_review: true };
  if (hint === "single") return { units: 1, needs_review: true };
  return { units: 0, needs_review: false };
}

/** The description calls the building mixed use: shops or offices below, apartments above. */
export function isMixedUse(desc: string): boolean {
  return /\bMIXED[- ]?USE\b/.test(normalize(desc));
}
