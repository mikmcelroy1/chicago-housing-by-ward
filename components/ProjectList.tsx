import Link from "next/link";
import type { Project } from "@/scripts/lib/types";
import { formatCurrency, formatDate, KIND_LABELS } from "@/lib/format";
import { FlagChips } from "./FlagChips";
import { SignedUnits } from "./SignedNumber";

export function permitUrl(primaryPermitId: string): string {
  return `https://data.cityofchicago.org/resource/ydr8-5enu.json?id=${encodeURIComponent(primaryPermitId)}`;
}

function ProjectRow({ project: p, showWard }: { project: Project; showWard: boolean }) {
  const emergency = p.kind === "emergency_demolition";
  return (
    <li className="border-b border-zinc-200 py-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <time dateTime={p.first_issue_date} className="w-24 shrink-0 text-sm tabular-nums text-zinc-500 dark:text-zinc-400">
          {formatDate(p.first_issue_date)}
        </time>
        <span className="font-medium">{p.address}</span>
        {showWard ? (
          <Link href={`/ward/${p.ward}`} className="text-sm text-zinc-500 underline underline-offset-2 dark:text-zinc-400">
            Ward {p.ward}
          </Link>
        ) : null}
        <span className={`text-sm ${emergency ? "text-amber-700 dark:text-amber-400" : "text-zinc-600 dark:text-zinc-400"}`}>{KIND_LABELS[p.kind]}</span>
        <SignedUnits value={p.units_delta} className="font-medium" />
        <FlagChips project={p} />
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-zinc-500 sm:pl-[6.75rem] dark:text-zinc-400">
        {p.reported_cost !== null ? (
          <span title="Estimated construction cost the applicant reported on the permit. Not the permit fee, and often reported low.">
            Est. cost {formatCurrency(p.reported_cost)}
          </span>
        ) : null}
        {p.review_type ? <span>{p.review_type}</span> : null}
        {p.status ? <span>{p.status}</span> : null}
        <a href={permitUrl(p.primary_permit_id)} className="underline underline-offset-2" target="_blank" rel="noreferrer">
          Permit {p.permit_no || p.primary_permit_id}
        </a>
      </div>
      {p.description ? (
        <details className="mt-1 text-sm sm:pl-[6.75rem]">
          <summary className="cursor-pointer text-zinc-500 dark:text-zinc-400">Description</summary>
          <p className="mt-1 whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">{p.description}</p>
        </details>
      ) : null}
    </li>
  );
}

export function ProjectList({ projects, showWard = false }: { projects: Project[]; showWard?: boolean }) {
  if (projects.length === 0) {
    return <p className="py-6 text-sm text-zinc-500 dark:text-zinc-400">No projects match in this window.</p>;
  }
  return (
    <ul className="border-t border-zinc-200 dark:border-zinc-800">
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} showWard={showWard} />
      ))}
    </ul>
  );
}
