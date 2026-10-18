"use client";

import { useState, type ReactNode } from "react";
import type { SortDir } from "@/lib/rank";

interface Props {
  path: string;
  from: string;
  to: string;
  sort: string;
  /** The sort the page opens on, left out of the URL. */
  defaultSort: string;
  dir: SortDir;
  completed: boolean;
  customActive: boolean;
  extra: Record<string, string | undefined>;
  /** Preset links, rendered inside the form so the whole control block is one row group. */
  presets: ReactNode;
}

const input =
  "rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100";
const chip = (active: boolean) =>
  `rounded-md border px-2.5 py-1 text-sm ${
    active
      ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
      : "border-zinc-300 hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
  }`;

/** GET form for the time period and the completed-only toggle. Works without JavaScript via the Apply button. */
export function ControlsForm({ path, from, to, sort, defaultSort, dir, completed, customActive, extra, presets }: Props) {
  const [customOpen, setCustomOpen] = useState(customActive);
  return (
    <form method="get" action={path} className="flex flex-col gap-3">
      {sort !== defaultSort ? <input type="hidden" name="sort" value={sort} /> : null}
      {dir === "asc" ? <input type="hidden" name="dir" value="asc" /> : null}
      {Object.entries(extra).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Time period</span>
        {presets}
        <button
          type="button"
          aria-expanded={customOpen}
          aria-controls="custom-period"
          onClick={() => setCustomOpen((v) => !v)}
          className={chip(customActive)}
        >
          Custom
        </button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="completed"
            value="1"
            defaultChecked={completed}
            onChange={(e) => e.currentTarget.form?.requestSubmit()}
            className="h-4 w-4 accent-zinc-900 dark:accent-zinc-100"
          />
          Completed permits only
        </label>
      </div>

      {customOpen ? (
        <fieldset id="custom-period" className="flex flex-wrap items-center gap-2">
          <legend className="sr-only">Custom time period</legend>
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">Start</span>
            <input type="date" name="from" defaultValue={from} className={input} required />
          </label>
          <label className="flex items-center gap-1.5 text-sm">
            <span className="text-zinc-600 dark:text-zinc-400">End</span>
            <input type="date" name="to" defaultValue={to} className={input} required />
          </label>
          <button
            type="submit"
            className="rounded border border-zinc-300 px-2 py-1 text-sm hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
          >
            Apply
          </button>
        </fieldset>
      ) : (
        <>
          <input type="hidden" name="from" value={from} />
          <input type="hidden" name="to" value={to} />
        </>
      )}
    </form>
  );
}
