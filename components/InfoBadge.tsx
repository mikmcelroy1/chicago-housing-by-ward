"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";

/** A small "i" button that toggles a short explanation with a link to the methodology page. */
export function InfoBadge({ label, children, anchor = "the-rank" }: { label: string; children: React.ReactNode; anchor?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onDoc);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onDoc);
    };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-block align-middle">
      <button
        type="button"
        aria-label={`What is ${label}?`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full border border-zinc-400 text-[10px] font-semibold normal-case leading-none text-zinc-500 hover:border-zinc-700 hover:text-zinc-800 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-100"
      >
        i
      </button>
      {open ? (
        <span
          id={id}
          role="dialog"
          className="absolute right-0 top-6 z-20 w-64 rounded-md border border-zinc-300 bg-white p-3 text-left text-xs font-normal normal-case tracking-normal text-zinc-700 shadow-lg dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
        >
          <span className="block font-medium text-zinc-900 dark:text-zinc-100">{label}</span>
          <span className="mt-1 block leading-relaxed">{children}</span>
          <Link href={`/methodology#${anchor}`} className="mt-2 inline-block underline underline-offset-2">
            Full methodology
          </Link>
        </span>
      ) : null}
    </span>
  );
}
