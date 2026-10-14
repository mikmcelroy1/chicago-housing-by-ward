import Link from "next/link";
import { KIND_LABELS, KINDS } from "@/lib/format";
import { buildHref, type QueryState } from "@/lib/query";
import type { CountedFilter } from "@/lib/select";

const chip = (active: boolean) =>
  `rounded-md border px-2 py-0.5 text-xs ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
  }`;

/** Kind and counted filters for a project list; state lives in the URL. */
export function ProjectFilters({ path, state, kind, counted, kindsPresent }: { path: string; state: QueryState; kind?: string; counted: CountedFilter; kindsPresent: Set<string> }) {
  const href = (next: { kind?: string; counted?: CountedFilter }) =>
    buildHref(path, state, {
      kind: "kind" in next ? next.kind : kind,
      counted: ("counted" in next ? next.counted : counted) === "all" ? undefined : "counted" in next ? next.counted : counted,
    });
  const kinds = KINDS.filter((k) => kindsPresent.has(k) || k === kind);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Kind</span>
        <Link href={href({ kind: undefined })} aria-current={!kind ? "page" : undefined} className={chip(!kind)}>
          All
        </Link>
        {kinds.map((k) => (
          <Link key={k} href={href({ kind: k })} aria-current={kind === k ? "page" : undefined} className={chip(kind === k)}>
            {KIND_LABELS[k]}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-zinc-500 dark:text-zinc-400">Counted</span>
        {(
          [
            ["all", "All"],
            ["yes", "Counted"],
            ["no", "Not counted"],
          ] as const
        ).map(([value, label]) => (
          <Link key={value} href={href({ counted: value })} aria-current={counted === value ? "page" : undefined} className={chip(counted === value)}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
