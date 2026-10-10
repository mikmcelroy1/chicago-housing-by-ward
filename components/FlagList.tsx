import type { WardFlag } from "@/scripts/lib/types";
import { formatDate, formatFlagName } from "@/lib/format";

function label(flag: WardFlag): string {
  const name = formatFlagName(flag.flag);
  return /^(yes|true|1)$/i.test(flag.value) ? name : `${name}: ${flag.value}`;
}

export function FlagList({ flags, withSource = false }: { flags: WardFlag[]; withSource?: boolean }) {
  if (flags.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {flags.map((f) => {
        const text = label(f);
        const chip = "inline-block rounded-full border border-zinc-300 px-2 py-0.5 text-xs text-zinc-700 dark:border-zinc-700 dark:text-zinc-300";
        return (
          <li key={`${f.ward}-${f.flag}`} className="flex items-center gap-1">
            {f.source_url ? (
              <a href={f.source_url} className={`${chip} hover:underline underline-offset-2`} rel="noreferrer" title={f.as_of ? `As of ${formatDate(f.as_of)}` : undefined}>
                {text}
              </a>
            ) : (
              <span className={chip} title={f.as_of ? `As of ${formatDate(f.as_of)}` : undefined}>
                {text}
              </span>
            )}
            {withSource && f.source_url ? (
              <a href={f.source_url} className="text-xs text-zinc-500 underline underline-offset-2 dark:text-zinc-400" rel="noreferrer">
                source
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
