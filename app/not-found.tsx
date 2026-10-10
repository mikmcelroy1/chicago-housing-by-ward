import Link from "next/link";

export default function NotFound() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">Chicago has wards 1 through 50.</p>
      <Link href="/" className="mt-6 inline-block underline underline-offset-2">
        Back to the rankings
      </Link>
    </div>
  );
}
