import Link from "next/link";
import { getSnapshot } from "@/lib/data";
import { formatDateTime } from "@/lib/format";

export async function SiteFooter() {
  const snapshot = await getSnapshot();
  const repo = process.env.NEXT_PUBLIC_REPO_URL || "#";
  return (
    <footer className="border-t border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-4 text-sm text-zinc-600 sm:px-6 dark:text-zinc-400">
        <p>
          Data as of <time dateTime={snapshot.generated_at}>{formatDateTime(snapshot.generated_at)}</time>
        </p>
        <p className="flex gap-5">
          <Link href="/methodology" className="hover:underline underline-offset-4">
            Methodology
          </Link>
          <a href={repo} className="hover:underline underline-offset-4" rel="noreferrer">
            Source code
          </a>
        </p>
      </div>
    </footer>
  );
}
