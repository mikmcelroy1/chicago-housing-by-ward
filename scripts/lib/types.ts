/** Shared types for the ETL and the web app. Keep in sync with supabase/migrations/*.sql. */

export type Category =
  | "new_residential"
  | "new_nonresidential"
  | "accessory"
  | "noise"
  | "revision_or_phase"
  | "demolition"
  | "emergency_demolition"
  | "demolition_accessory"
  | "renovation_delta"
  | "renovation_other"
  | "other_type";

export type UnitsSource =
  | "regex_number"
  | "regex_word"
  | "sfr_keyword"
  | "structured_demo"
  | "assessor"
  | "override"
  | "unknown";

export type ProjectKind =
  | "new_construction"
  | "adu"
  | "conversion"
  | "deconversion"
  | "demolition"
  | "emergency_demolition";

/** Keys of the flags shown as chips on project lists. The registry (labels, descriptions, icons) is scripts/lib/flags.ts. */
export type FlagKey =
  | "emergency"
  | "merged"
  | "not_counted"
  | "needs_review"
  | "replaces"
  | "multi_permit"
  | "phase_only"
  | "assessor_units"
  | "summed_parcels"
  | "no_parcel"
  | "mixed_use_zero"
  | "held"
  | "overridden"
  | "subsidized"
  | "ward_mismatch";

/** One row of the city's Building Permits dataset, as stored in `permits`. */
export interface Permit {
  id: string; // dataset row id
  permit_no: string;
  permit_type: string;
  review_type: string | null;
  issue_date: string; // YYYY-MM-DD
  status: string | null;
  address: string;
  lat: number | null;
  lon: number | null;
  ward: number | null;
  pins: string[]; // 10-digit PINs as the city lists them
  description: string;
  reported_cost: number | null;
  contacts: { type: string; name: string }[];
}

/** One Cook County Assessor parcel consulted for a demolition. */
export interface ParcelLookup {
  pin: string; // 14-digit
  cls: string | null; // assessor class, e.g. "212"; null = no record for the years tried
  units: number | null; // null = no record, or a class with no unit count
  year: number | null; // assessment year the record came from
  /** Fingerprint of the building record; lots that share one are one building and count once. */
  sig: string | null;
}

export interface Classification {
  category: Category;
  /** New construction: unit count. Renovation: signed delta. Demolition: units removed (positive). */
  units: number | null;
  units_source: UnitsSource;
  needs_review: boolean;
  notes: string[];
  /** Demolitions only: what the description says about the building, used when no parcel resolves. */
  demo_hint?: "multi" | "single" | "none";
  /** Demolitions only: every parcel consulted (the permit's PINs, else every parcel at its address). Empty = none found. */
  parcels?: ParcelLookup[];
}

export interface Project {
  id: string; // stable: kind + ":" + project_key (+ ":" + permit id for singletons)
  project_key: string;
  kind: ProjectKind;
  ward: number;
  units_delta: number;
  counted: boolean;
  first_issue_date: string;
  primary_permit_id: string;
  permit_no: string; // city permit number of the primary permit
  permit_ids: string[];
  address: string;
  lat: number | null;
  lon: number | null;
  alder_tenure_id: string | null;
  subsidized: boolean;
  /** New construction only: units of the building demolished at the same address for this project. units_delta is already net of them. */
  replaced_units: number;
  /** Demolitions only: the new-construction project this demolition was folded into, if any. */
  merged_into: string | null;
  status: string | null; // primary permit status, for the completed toggle
  description: string; // primary permit description
  reported_cost: number | null;
  review_type: string | null;
  needs_review: boolean;
  /** The permit's coordinates fall in a different ward than the city recorded. The city's ward is used. */
  ward_geom_mismatch: boolean;
  /** Flags written by the ETL; flagsFor() in scripts/lib/flags.ts completes them from the row at render time. */
  flags: FlagKey[];
  /** The passed zoning action (zoning_actions.matter_id) this project's permit needed, if any. See scripts/lib/zoning-link.ts. */
  action_matter_id: string | null;
}

export interface AlderTenure {
  id: string;
  ward: number;
  name: string;
  photo_url: string | null;
  start_date: string;
  end_date: string | null;
  source_url: string | null;
}

export interface WardFlag {
  ward: number;
  flag: string;
  value: string;
  source_url: string | null;
  as_of: string | null;
}

export interface WardRow {
  ward: number;
  units_2020: number | null;
  pop_2020: number | null;
  alder_current: string | null;
  website: string | null;
}

export interface Override {
  permit_id: string;
  category: Category | "";
  units: number | null;
  note: string;
}

/** The offline snapshot the ETL writes in --dry-run mode; also the web app's fixture backend. */
export interface Snapshot {
  generated_at: string;
  window_start: string;
  wards: WardRow[];
  tenures: AlderTenure[];
  flags: WardFlag[];
  projects: Project[];
  counts: Record<string, number>;
  /** Zoning actions (one per zoning reclassification matter since 2019), written by scripts/ingest-zoning.ts. */
  actions: ZoningAction[];
  /** Passed actions linked to the permit projects they enabled. */
  action_projects: ActionProject[];
  /** The curated citywide housing ordinances from data/key_ordinances.csv, with their record as copied. */
  key_ordinances: KeyOrdinance[];
  /** Each alder's role and vote on each key ordinance. */
  sponsorships: AlderSponsorship[];
}

// --- Alder actions (spec: "Alder Actions Tab v2") ------------------------------------------------

/** A street-number range on one street, as an ordinance title states it: "1401-1459 N Magnolia Ave". */
export interface AddressRange {
  lo: number;
  hi: number;
  /** N, S, E or W. */
  dir: string;
  /** Street name with its suffix, permit style: "MAGNOLIA AVE". */
  street: string;
}

/**
 * What the rezoning did to the zoning of the site. `up` and `down` compare how many homes the districts allow;
 * `pd` is a new planned development, `pd_amend` an amendment of one. Spec: "Reading a zoning ordinance", step 4.
 */
export type ZoningDirection = "up" | "down" | "lateral" | "pd" | "pd_amend" | "unknown";

/** Where the application stands. Spec: "Settled or undecided". */
export type ZoningStage = "passed" | "undecided" | "stalled" | "rejected";

export type ZoningUnitsSource = "exhibit" | "ordinance" | "narrative" | "capacity" | "override" | "none";

/** One zoning reclassification matter as the site shows it: the parser's reading plus the matter's own fields. */
export interface ZoningAction {
  matter_id: string;
  record_number: string;
  title: string;
  introduction_date: string;
  final_action_date: string | null;
  /** chicago-budget's canonical outcome: passed | pending | failed | filed | withdrawn | vetoed | repealed | void. */
  outcome: string;
  /** The alder's filing office when an alder filed it ("A" application numbers), else null. */
  sponsor_ward: number | null;
  sponsor_name: string | null;
  sponsored_by_alder: boolean;
  /** Ward the site was placed in; null when no lookup resolved it. */
  ward: number | null;
  ward_source: "parcel" | "permit" | "sponsor" | null;
  /** The alder in office on stage_date, when the ward is known. */
  alder_tenure_id: string | null;
  addresses: AddressRange[];
  /** The site as the title states it, for display. */
  address: string;
  /** 14-digit PINs the ordinance names, if any. */
  pins: string[];
  app_no: string | null;
  type1: boolean;
  /** Every district in the "changing all the ..." clause of the first section, display form. */
  from_districts: string[];
  from_district: string | null;
  /** The district the last section ends in, display form ("RT-4", "PD 1573"). */
  to_district: string | null;
  from_far: number | null;
  to_far: number | null;
  direction: ZoningDirection;
  /** Homes asked for (the original filing) and homes allowed by what passed. Null = not read. */
  requested_units: number | null;
  approved_units: number | null;
  units_source: ZoningUnitsSource;
  /** Lot size in square feet, from the ordinance's own figures when stated. */
  lot_sf: number | null;
  /** Homes the zoning rules allow on the lot before and after. Null = unknown district or lot size. */
  allowed_before: number | null;
  allowed_after: number | null;
  stage: ZoningStage;
  /** Final-action date for settled matters, introduction date for pending ones: the date the tab selects on. */
  stage_date: string;
  /** Days since introduction for pending matters, else null. */
  days_pending: number | null;
  /** A substitute ordinance replaced the original in committee. */
  substitute: boolean;
  days_to_passage: number | null;
  /** The parser could not read something it needs; what it read is in notes. */
  needs_review: boolean;
  /** A scanned exhibit still waits for OCR, so the unit count may be a capacity figure for now. */
  exhibits_pending: boolean;
  notes: string[];
}

/** A passed action linked to a permit project it enabled. */
export interface ActionProject {
  matter_id: string;
  project_id: string;
  /** Days from the action's final action to the permit. */
  lag_days: number;
  match: "pin" | "address";
}

/** A row of data/key_ordinances.csv plus the matter's record as copied from chicago-budget. */
export interface KeyOrdinance {
  record_number: string;
  label: string;
  stance: "pro" | "anti" | "mixed";
  note: string;
  /** A ward flag this ordinance fills from its sponsors (for example adu_opt_in), else null. */
  flag: string | null;
  title: string | null;
  introduction_date: string | null;
  final_action_date: string | null;
  outcome: string | null;
}

/** One alder's part in one key ordinance. */
export interface AlderSponsorship {
  record_number: string;
  ward: number;
  alder_name: string;
  alder_tenure_id: string | null;
  role: "sponsor" | "cosponsor" | "none";
  /** The roll-call vote (Yea, Nay, Absent...), null when none was recorded for this alder. */
  vote: string | null;
}
