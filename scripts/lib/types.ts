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
}
