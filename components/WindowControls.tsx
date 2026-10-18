import Link from "next/link";
import { formatDate } from "@/lib/format";
import { buildHref, PRESET_LABELS, presetWindow, type QueryState } from "@/lib/query";
import { ControlsForm } from "./ControlsForm";

interface Props {
  path: string;
  state: QueryState<string>;
  today: string;
  windowStart: string;
  /** Page-specific params to carry along (e.g. kind, counted on the ward page). */
  extra?: Record<string, string | undefined>;
  /** What the period selects: "Permits issued" (default) or "Council actions dated". */
  subject?: string;
}

const chip = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-sm ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
  }`;

export function WindowControls({ path, state, today, windowStart, extra = {}, subject = "Permits issued" }: Props) {
  const presets = (["last12", "ytd", "term"] as const).map((preset) => {
    const w = presetWindow(preset, today, windowStart);
    return (
      <Link
        key={preset}
        href={buildHref(path, { ...w, sort: state.sort, dir: state.dir, completed: state.completed, defaultSort: state.defaultSort }, extra)}
        aria-current={state.preset === preset ? "page" : undefined}
        className={chip(state.preset === preset)}
      >
        {PRESET_LABELS[preset]}
      </Link>
    );
  });

  return (
    <section aria-label="Time period controls" className="flex flex-col gap-2">
      <ControlsForm
        key={`${state.from}|${state.to}|${state.sort}|${state.dir}|${state.completed ? 1 : 0}`}
        path={path}
        from={state.from}
        to={state.to}
        sort={state.sort}
        defaultSort={state.defaultSort ?? "rate"}
        dir={state.dir}
        completed={state.completed}
        customActive={state.preset === "custom"}
        extra={extra}
        presets={presets}
      />
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        {subject} <time dateTime={state.from}>{formatDate(state.from)}</time> – <time dateTime={state.to}>{formatDate(state.to)}</time>
        {state.completed ? ", completed permits only" : ""}.
      </p>
      {state.completed ? (
        <p className="rounded-md border border-amber-500/50 px-3 py-2 text-sm text-amber-900 dark:border-amber-400/40 dark:text-amber-200">
          Completed means the city has closed the permit. A demolition completes in weeks; a new building takes one to three years. In a
          recent period this view keeps most losses and drops most gains, so it only says something about periods that ended a few years
          ago.
        </p>
      ) : null}
    </section>
  );
}
