import { formatRate, formatSigned } from "@/lib/format";

const tone = (n: number) =>
  n > 0 ? "text-emerald-700 dark:text-emerald-400" : n < 0 ? "text-red-700 dark:text-red-400" : "text-zinc-500 dark:text-zinc-400";

/** A signed integer (+9, −2, 0) colored only by its sign. */
export function SignedUnits({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`tabular-nums ${tone(value)} ${className}`}>{formatSigned(value)}</span>;
}

/** Net per 1,000 units to one decimal; null renders as a muted dash. */
export function Rate({ value, className = "" }: { value: number | null; className?: string }) {
  const color = value === null ? "text-zinc-400 dark:text-zinc-500" : tone(value);
  return <span className={`tabular-nums ${color} ${className}`}>{formatRate(value)}</span>;
}
