import Link from "next/link";
import type { ActionProject, Project, ZoningAction, ZoningDirection, ZoningStage } from "@/scripts/lib/types";
import { councilmaticUrl } from "@/lib/actions";
import { DASH, formatDate, formatInt, formatSigned } from "@/lib/format";
import { SignedUnits } from "./SignedNumber";

const DIRECTION: Record<ZoningDirection, { label: string; tone: string }> = {
  up: { label: "Upzoning", tone: "border-emerald-600/50 text-emerald-800 dark:border-emerald-400/50 dark:text-emerald-300" },
  down: { label: "Downzoning", tone: "border-red-600/50 text-red-800 dark:border-red-400/50 dark:text-red-300" },
  lateral: { label: "Lateral", tone: "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" },
  pd: { label: "Planned development", tone: "border-emerald-600/50 text-emerald-800 dark:border-emerald-400/50 dark:text-emerald-300" },
  pd_amend: { label: "PD amendment", tone: "border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300" },
  unknown: { label: "Not read", tone: "border-amber-500/60 text-amber-800 dark:border-amber-400/60 dark:text-amber-300" },
};

const chip = "inline-flex items-center rounded border px-1.5 py-0.5 text-xs leading-4";

function Stage({ a }: { a: ZoningAction }) {
  const label: Record<ZoningStage, string> = {
    passed: `Passed ${a.final_action_date ? formatDate(a.final_action_date) : ""}`.trim(),
    undecided: `Undecided · ${formatInt(a.days_pending ?? 0)} days`,
    stalled: `Stalled · ${formatInt(a.days_pending ?? 0)} days`,
    rejected: a.outcome ? a.outcome.charAt(0).toUpperCase() + a.outcome.slice(1) : "Rejected",
  };
  const tone =
    a.stage === "passed"
      ? "text-zinc-700 dark:text-zinc-300"
      : a.stage === "undecided"
        ? "text-amber-700 dark:text-amber-400"
        : a.stage === "stalled"
          ? "text-red-700 dark:text-red-400"
          : "text-zinc-500 dark:text-zinc-400";
  const title = a.stage === "undecided" ? "Pending under 180 days: shown, left out of every count." : a.stage === "stalled" ? "Pending 180 days or more: counted as requested, not approved." : undefined;
  return (
    <span className={`text-sm ${tone}`} title={title}>
      {label[a.stage]}
    </span>
  );
}

function Units({ a }: { a: ZoningAction }) {
  if (a.direction === "down") {
    return <span>Capacity removed{a.allowed_before !== null && a.allowed_after !== null ? `: ${formatInt(a.allowed_before)} → ${formatInt(a.allowed_after)} homes allowed` : ""}</span>;
  }
  if (a.requested_units === null && a.approved_units === null) return <span>Homes: not read</span>;
  if (a.units_source === "capacity") {
    const n = a.stage === "passed" ? (a.approved_units ?? 0) : (a.requested_units ?? 0);
    return <span>{a.stage === "passed" ? "Adds" : "Would add"} {formatInt(n)} {n === 1 ? "home" : "homes"} to what the lot&apos;s zoning allows</span>;
  }
  const source = a.units_source === "exhibit" ? " (from the statements)" : a.units_source === "narrative" ? " (from the narrative)" : a.units_source === "override" ? " (read by a person)" : "";
  if (a.stage === "passed" && a.substitute && a.requested_units !== null && a.approved_units !== null && a.requested_units !== a.approved_units) {
    return (
      <span>
        Requested {formatInt(a.requested_units)}, approved {formatInt(a.approved_units)} homes
        {a.requested_units > a.approved_units ? ` (${formatInt(a.requested_units - a.approved_units)} cut in committee)` : ""}
        {source}
      </span>
    );
  }
  if (a.stage === "passed") return <span>Approved for {formatInt(a.approved_units ?? a.requested_units ?? 0)} homes{source}</span>;
  return <span>Requested {formatInt(a.requested_units ?? 0)} homes{source}</span>;
}

export interface LinkedProject {
  project: Project;
  lag_days: number;
}

/**
 * Every zoning matter of a ward in the period, newest first: date, record number linked to the Clerk's page, the
 * site, from and to district with the direction, where it stands, who filed it, the homes, and the permits it led to.
 */
export function ZoningActionList({ actions, linked, showWard = false }: { actions: ZoningAction[]; linked: Map<string, LinkedProject[]>; showWard?: boolean }) {
  if (actions.length === 0) return <p className="py-6 text-sm text-zinc-500 dark:text-zinc-400">No zoning actions in this period.</p>;
  return (
    <ul className="border-t border-zinc-200 dark:border-zinc-800">
      {actions.map((a) => {
        const dir = DIRECTION[a.direction];
        const projects = linked.get(a.matter_id) ?? [];
        return (
          <li key={a.matter_id} className="border-b border-zinc-200 py-3 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <time dateTime={a.stage_date} className="w-24 shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
                {formatDate(a.stage_date)}
              </time>
              <span className="font-medium">{a.address || a.title}</span>
              {showWard && a.ward ? (
                <Link href={`/ward/${a.ward}`} className="text-sm text-zinc-500 underline underline-offset-2 dark:text-zinc-400">
                  Ward {a.ward}
                </Link>
              ) : null}
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {a.from_districts.length ? a.from_districts.join(" + ") : DASH} → {a.to_district ?? DASH}
              </span>
              <span className={`${chip} ${dir.tone}`}>{dir.label}</span>
              {a.type1 ? <span className={`${chip} border-zinc-300 text-zinc-600 dark:border-zinc-700 dark:text-zinc-300`} title="A Type 1 rezoning is bound to a site plan.">Type 1</span> : null}
              <Stage a={a} />
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-500 sm:pl-[6.75rem] dark:text-zinc-400">
              <a href={councilmaticUrl(a.record_number)} className="underline underline-offset-2" target="_blank" rel="noreferrer">
                {a.record_number}
              </a>
              <span>{a.sponsored_by_alder ? `Filed by ${a.sponsor_name ?? "the alder"}` : "Filed by the property owner"}</span>
              <Units a={a} />
              {a.stage === "passed" && a.days_to_passage !== null ? <span>{formatInt(a.days_to_passage)} days from filing to passage</span> : null}
              {a.allowed_before !== null && a.allowed_after !== null && a.direction !== "down" ? (
                <span title={a.lot_sf ? `Lot of ${formatInt(a.lot_sf)} square feet` : undefined}>
                  Allowed {formatInt(a.allowed_before)} → {formatInt(a.allowed_after)} ({formatSigned(a.allowed_after - a.allowed_before)})
                </span>
              ) : null}
              {a.needs_review ? (
                <span className="text-amber-700 dark:text-amber-400" title={a.notes.join("; ")}>
                  Needs review
                </span>
              ) : null}
              {a.exhibits_pending ? (
                <span className="text-zinc-500 dark:text-zinc-400" title="The scanned statements or narrative have not been read yet.">
                  Exhibits not read yet
                </span>
              ) : null}
            </div>
            {projects.length ? (
              <ul className="mt-1 flex flex-col gap-0.5 text-sm sm:pl-[6.75rem]">
                {projects.map(({ project: p, lag_days }) => (
                  <li key={p.id} className="flex flex-wrap gap-x-2 text-zinc-600 dark:text-zinc-400">
                    <span>Permitted {formatDate(p.first_issue_date)}:</span>
                    <span className="text-zinc-800 dark:text-zinc-200">{p.address}</span>
                    <SignedUnits value={p.units_delta + p.replaced_units} />
                    <span>units{p.counted ? "" : " (not counted)"}</span>
                    <span>· {formatInt(lag_days)} days after passage</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {a.notes.length ? (
              <details className="mt-1 text-sm sm:pl-[6.75rem]">
                <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">What was read</summary>
                <ul className="mt-1 list-disc pl-5 text-zinc-700 dark:text-zinc-300">
                  {a.notes.map((n, i) => (
                    <li key={i}>{n}</li>
                  ))}
                </ul>
              </details>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Projects linked to each action, for the list above. */
export function linkedProjects(links: readonly ActionProject[], projects: readonly Project[]): Map<string, LinkedProject[]> {
  const byId = new Map(projects.map((p) => [p.id, p]));
  const out = new Map<string, LinkedProject[]>();
  for (const l of links) {
    const p = byId.get(l.project_id);
    if (!p) continue;
    out.set(l.matter_id, [...(out.get(l.matter_id) ?? []), { project: p, lag_days: l.lag_days }]);
  }
  for (const list of out.values()) list.sort((a, b) => a.project.first_issue_date.localeCompare(b.project.first_issue_date));
  return out;
}
