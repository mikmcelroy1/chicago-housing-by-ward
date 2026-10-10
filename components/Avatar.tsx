import Image from "next/image";
import { initials } from "@/lib/format";

export function Avatar({ name, photoUrl, size }: { name: string; photoUrl: string | null; size: 40 | 72 }) {
  const style = { width: size, height: size };
  if (photoUrl) {
    return (
      <Image
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        style={style}
        className="shrink-0 rounded-full bg-zinc-100 object-cover dark:bg-zinc-800"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      style={{ ...style, fontSize: Math.round(size * 0.36) }}
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-zinc-200 font-medium text-zinc-700 dark:bg-zinc-700 dark:text-zinc-100"
    >
      {initials(name)}
    </span>
  );
}
