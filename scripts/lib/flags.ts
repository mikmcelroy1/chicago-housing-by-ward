/**
 * Project flags: one registry for the chips on project lists, the ETL that stores them, the JSON route, and the
 * "Flags" section of docs/METHODOLOGY.md. Adding a flag means a key in FlagKey (types.ts), an entry here, and a
 * "### <label>" heading under "## Flags" in the methodology; tests/flags.test.ts checks the heading exists.
 */
import type { FlagKey, Project } from "./types";

export type FlagTone = "neutral" | "warn";
export type FlagIcon =
  | "triangle-alert"
  | "merge"
  | "ban"
  | "circle-help"
  | "refresh-cw"
  | "layers"
  | "landmark"
  | "layout-grid"
  | "circle-dashed"
  | "store"
  | "circle-pause"
  | "pencil-line"
  | "hand-coins"
  | "map-pin-off";

export interface FlagDef {
  key: FlagKey;
  /** Chip text and the methodology heading. */
  label: string;
  /** Chip text when it depends on the project (for example "Replaces 2 units"). Defaults to label. */
  text?: (p: Project) => string;
  /** Shown next to the icon on narrow screens, where the full text is hidden; omitted = icon only there. */
  short?: (p: Project) => string;
  /** One sentence, plain English. Shown in the chip's popover and under the methodology heading. */
  description: string;
  /** Heading id on /methodology: the slug of the "### " heading under "## Flags". */
  anchor: string;
  icon: FlagIcon;
  tone: FlagTone;
  /** Flags the site can tell from the project row itself. The rest are stored by the ETL in project.flags. */
  derive?: (p: Project) => boolean;
}

const plural = (n: number, word: string) => `${n} ${n === 1 ? word : `${word}s`}`;

export const FLAGS: readonly FlagDef[] = [
  {
    key: "emergency",
    label: "Emergency",
    description: "A city-ordered demolition of a derelict or dangerous building. Shown, never counted against the ward.",
    anchor: "emergency",
    icon: "triangle-alert",
    tone: "warn",
    derive: (p) => p.kind === "emergency_demolition",
  },
  {
    key: "merged",
    label: "Merged into rebuild",
    description:
      "A demolition followed by new construction at the same address within two years. Its units are subtracted on the new building's row and not counted here.",
    anchor: "merged-into-rebuild",
    icon: "merge",
    tone: "neutral",
    derive: (p) => p.merged_into !== null,
  },
  {
    key: "not_counted",
    label: "Not counted",
    description: "Not included in the ward's totals: the unit count is zero or could not be read.",
    anchor: "not-counted",
    icon: "ban",
    tone: "warn",
    derive: (p) => !p.counted && p.merged_into === null && p.kind !== "emergency_demolition" && !(p.flags ?? []).includes("held"),
  },
  {
    key: "needs_review",
    label: "Needs review",
    description:
      "The rules were not sure about this permit. It is in the public review queue, and the count shown stands until a person corrects it.",
    anchor: "needs-review",
    icon: "circle-help",
    tone: "warn",
    derive: (p) => p.needs_review,
  },
  {
    key: "replaces",
    label: "Replaces units",
    text: (p) => `Replaces ${plural(p.replaced_units, "unit")}`,
    short: (p) => String(p.replaced_units),
    description: "A building demolished at this address within two years of this permit. Its units are subtracted from this row.",
    anchor: "replaces-units",
    icon: "refresh-cw",
    tone: "neutral",
    derive: (p) => p.replaced_units > 0,
  },
  {
    key: "multi_permit",
    label: "Multiple permits",
    description: "Several permits at this address or parcel were combined into one project, so nothing is counted twice.",
    anchor: "multiple-permits",
    icon: "layers",
    tone: "neutral",
  },
  {
    key: "assessor_units",
    label: "Assessor count",
    description:
      "The permit did not state a unit count. It comes from Cook County Assessor records for the parcel in the year before the demolition.",
    anchor: "assessor-count",
    icon: "landmark",
    tone: "neutral",
  },
  {
    key: "summed_parcels",
    label: "Several parcels",
    description: "The assessor files more than one parcel under this address. Their units were added together.",
    anchor: "several-parcels",
    icon: "layout-grid",
    tone: "neutral",
  },
  {
    key: "no_parcel",
    label: "No parcel found",
    description:
      "No Cook County parcel matched this address, so the count is taken from the permit's wording: 2 for multi-unit, 1 for residence, otherwise 0.",
    anchor: "no-parcel-found",
    icon: "circle-dashed",
    tone: "warn",
  },
  {
    key: "mixed_use_zero",
    label: "Mixed use, no units",
    description:
      "The permit calls the building mixed use, but the assessor files it as commercial with no apartments. Counted as zero and flagged for review.",
    anchor: "mixed-use-no-units",
    icon: "store",
    tone: "warn",
  },
  {
    key: "held",
    label: "Held for review",
    description:
      "A demolition of seven or more units read from assessor records. Shown but not counted until a person confirms it in the corrections file.",
    anchor: "held-for-review",
    icon: "circle-pause",
    tone: "warn",
  },
  {
    key: "overridden",
    label: "Corrected",
    description: "A person read this permit and recorded the count in the public corrections file.",
    anchor: "corrected",
    icon: "pencil-line",
    tone: "neutral",
  },
  {
    key: "subsidized",
    label: "Subsidized",
    description: "Matches a development on the city's Affordable Rental Housing list.",
    anchor: "subsidized",
    icon: "hand-coins",
    tone: "neutral",
    derive: (p) => p.subsidized,
  },
  {
    key: "ward_mismatch",
    label: "Ward mismatch",
    description: "The permit's coordinates fall in a different ward from the one the city recorded. The city's ward is used.",
    anchor: "ward-mismatch",
    icon: "map-pin-off",
    tone: "neutral",
    derive: (p) => p.ward_geom_mismatch === true,
  },
];

export const FLAG_BY_KEY: ReadonlyMap<FlagKey, FlagDef> = new Map(FLAGS.map((f) => [f.key, f]));

/** Every flag that applies to a project, in registry order: the ones derivable from the row plus the ones the ETL stored. */
export function flagsFor(p: Project): FlagKey[] {
  const stored = new Set<string>(p.flags ?? []);
  return FLAGS.filter((f) => stored.has(f.key) || (f.derive ? f.derive(p) : false)).map((f) => f.key);
}

/** Chip text for a flag on a project. */
export function flagText(def: FlagDef, p: Project): string {
  return def.text ? def.text(p) : def.label;
}
