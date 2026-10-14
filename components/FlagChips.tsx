"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import {
  Ban,
  CircleDashed,
  CircleHelp,
  CirclePause,
  HandCoins,
  HardHat,
  Landmark,
  LayoutGrid,
  Layers,
  MapPinOff,
  Merge,
  PencilLine,
  RefreshCw,
  Store,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { FlagKey, Project } from "@/scripts/lib/types";
import { FLAG_BY_KEY, flagsFor, flagText, type FlagIcon } from "@/scripts/lib/flags";

const ICONS: Record<FlagIcon, LucideIcon> = {
  "triangle-alert": TriangleAlert,
  merge: Merge,
  ban: Ban,
  "circle-help": CircleHelp,
  "refresh-cw": RefreshCw,
  layers: Layers,
  "hard-hat": HardHat,
  landmark: Landmark,
  "layout-grid": LayoutGrid,
  "circle-dashed": CircleDashed,
  store: Store,
  "circle-pause": CirclePause,
  "pencil-line": PencilLine,
  "hand-coins": HandCoins,
  "map-pin-off": MapPinOff,
};

const TONE = {
  neutral:
    "border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-700 dark:text-zinc-300 dark:hover:border-zinc-400 dark:hover:text-zinc-100",
  warn: "border-amber-500/60 text-amber-800 hover:border-amber-700 dark:border-amber-400/60 dark:text-amber-300 dark:hover:border-amber-300",
};

/**
 * A project's flags as chips: an icon with a short label (icon only on narrow screens). Tap or click one for
 * what it means and a link to the matching section of the methodology.
 */
export function FlagChips({ project }: { project: Project }) {
  const keys = flagsFor(project);
  const [open, setOpen] = useState<FlagKey | null>(null);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onDoc);
    };
  }, [open]);
  if (keys.length === 0) return null;
  const current = open ? FLAG_BY_KEY.get(open) : undefined;
  return (
    <span ref={ref} className="relative flex flex-wrap items-center gap-1.5">
      {keys.map((key) => {
        const def = FLAG_BY_KEY.get(key);
        if (!def) return null;
        const Icon = ICONS[def.icon];
        const text = flagText(def, project);
        const short = def.short?.(project);
        const active = open === key;
        return (
          <button
            key={key}
            type="button"
            aria-label={text}
            title={def.description}
            aria-expanded={active}
            aria-controls={active ? id : undefined}
            onClick={() => setOpen((v) => (v === key ? null : key))}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs leading-4 ${TONE[def.tone]} ${active ? "ring-1 ring-current" : ""}`}
          >
            <Icon aria-hidden="true" size={12} className="shrink-0" />
            <span className="hidden sm:inline">{text}</span>
            {short ? <span className="sm:hidden">{short}</span> : null}
          </button>
        );
      })}
      {current ? (
        <span
          id={id}
          role="dialog"
          aria-label={flagText(current, project)}
          className="absolute top-full left-0 z-20 mt-1 w-72 rounded-md border border-zinc-300 bg-white p-3 text-left text-xs font-normal text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <span className="block font-medium text-zinc-900 dark:text-zinc-100">{flagText(current, project)}</span>
          <span className="mt-1 block leading-relaxed">{current.description}</span>
          <Link href={`/methodology#${current.anchor}`} className="mt-2 inline-block underline underline-offset-2">
            Read more in the methodology
          </Link>
        </span>
      ) : null}
    </span>
  );
}
