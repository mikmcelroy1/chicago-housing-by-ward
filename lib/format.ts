import type { ProjectKind } from "@/scripts/lib/types";
import { toUtcDate } from "./dates";

const MINUS = "−";
const DASH = "–";

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/Chicago",
  timeZoneName: "short",
});
const intFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const signedIntFormat = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, signDisplay: "exceptZero" });
const rateFormat = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const currencyFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function trueMinus(s: string): string {
  return s.replace("-", MINUS);
}

/** "2026-10-08" → "Oct 8, 2026" */
export function formatDate(iso: string): string {
  return dateFormat.format(toUtcDate(iso));
}

/** ISO timestamp → "Oct 9, 2026, 3:04 PM CDT" */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : dateTimeFormat.format(d);
}

export function formatInt(n: number): string {
  return trueMinus(intFormat.format(n));
}

/** +9, −2, 0 */
export function formatSigned(n: number): string {
  return trueMinus(signedIntFormat.format(n));
}

/** One decimal, true minus sign; null → en dash. */
export function formatRate(rate: number | null): string {
  return rate === null ? DASH : trueMinus(rateFormat.format(rate));
}

export function formatCurrency(n: number | null): string {
  return n === null ? DASH : currencyFormat.format(n);
}

export const KIND_LABELS: Record<ProjectKind, string> = {
  new_construction: "New construction",
  adu: "ADU",
  conversion: "Conversion",
  deconversion: "Deconversion",
  demolition: "Demolition",
  emergency_demolition: "Emergency demolition",
};

export const KINDS: ProjectKind[] = ["new_construction", "adu", "conversion", "deconversion", "demolition", "emergency_demolition"];

export function isProjectKind(value: string | undefined): value is ProjectKind {
  return value !== undefined && (KINDS as string[]).includes(value);
}

/** "adu_opt_in" → "ADU opt in" */
export function formatFlagName(flag: string): string {
  const words = flag.split("_").map((w) => (w.toLowerCase() === "adu" ? "ADU" : w));
  const text = words.join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Initials for an avatar fallback: "Walter Burnett Jr." → "WB" */
export function initials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((p) => p && !/^(jr|sr|ii|iii|iv)\.?$/i.test(p));
  if (parts.length === 0) return "?";
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

export { DASH };
