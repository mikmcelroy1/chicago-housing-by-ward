import Link from "next/link";

export function SiteHeader() {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800">
      <div className="mx-auto flex w-full max-w-6xl items-baseline justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="whitespace-nowrap text-base font-semibold tracking-tight sm:text-lg">
          Ward Housing Ranker
        </Link>
        <nav aria-label="Site" className="flex shrink-0 gap-4 text-sm sm:gap-5">
          <Link href="/" className="hover:underline underline-offset-4">
            Rankings
          </Link>
          <Link href="/methodology" className="hover:underline underline-offset-4">
            Methodology
          </Link>
        </nav>
      </div>
    </header>
  );
}
