import type { AlderSponsorship, KeyOrdinance } from "@/scripts/lib/types";
import { councilmaticUrl } from "@/lib/actions";
import { DASH, formatDate } from "@/lib/format";

const ROLE: Record<AlderSponsorship["role"], string> = { sponsor: "Sponsor", cosponsor: "Co-sponsor", none: "Not a sponsor" };

/** The curated citywide housing ordinances with this ward's alder's role and roll-call vote on each. */
export function KeyVotes({ ordinances, sponsorships }: { ordinances: KeyOrdinance[]; sponsorships: AlderSponsorship[] }) {
  if (ordinances.length === 0) return null;
  const sorted = [...ordinances].sort((a, b) => (b.final_action_date ?? b.introduction_date ?? "").localeCompare(a.final_action_date ?? a.introduction_date ?? ""));
  return (
    <ul className="border-t border-zinc-200 dark:border-zinc-800">
      {sorted.map((k) => {
        const s = sponsorships.find((x) => x.record_number === k.record_number);
        const date = k.final_action_date ?? k.introduction_date;
        const role = s?.role ?? "none";
        const roleTone = role === "none" ? "text-zinc-500 dark:text-zinc-400" : "text-emerald-700 dark:text-emerald-400";
        return (
          <li key={k.record_number} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-zinc-200 py-2.5 text-sm dark:border-zinc-800">
            <time dateTime={date ?? undefined} className="w-24 shrink-0 tabular-nums text-zinc-500 dark:text-zinc-400">
              {date ? formatDate(date) : DASH}
            </time>
            <a href={councilmaticUrl(k.record_number)} className="font-medium underline underline-offset-2" target="_blank" rel="noreferrer">
              {k.label}
            </a>
            <span className="text-zinc-500 dark:text-zinc-400">{k.outcome === "passed" ? "Passed" : k.outcome === "pending" || !k.outcome ? "Pending" : k.outcome.charAt(0).toUpperCase() + k.outcome.slice(1)}</span>
            <span className={roleTone}>{ROLE[role]}</span>
            <span className="text-zinc-600 dark:text-zinc-400">{s?.vote ? `Voted ${s.vote}` : k.outcome === "passed" ? "No roll call recorded" : ""}</span>
            {k.note ? <span className="basis-full text-xs text-zinc-500 sm:basis-auto dark:text-zinc-400">{k.note}</span> : null}
          </li>
        );
      })}
    </ul>
  );
}
