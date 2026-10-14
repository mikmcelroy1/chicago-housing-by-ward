import type { Metadata } from "next";
import ReactMarkdown from "react-markdown";
import rehypeSlug from "rehype-slug";
import remarkGfm from "remark-gfm";
import { getSnapshot } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { getMethodology } from "@/lib/methodology";

export const metadata: Metadata = { title: "Methodology" };

export default async function MethodologyPage() {
  const [markdown, snapshot] = await Promise.all([getMethodology(), getSnapshot()]);
  return (
    <article className="doc mx-auto max-w-3xl">
      <p className="mb-4 text-sm text-zinc-500 dark:text-zinc-400">
        Data as of <time dateTime={snapshot.generated_at}>{formatDateTime(snapshot.generated_at)}</time>
      </p>
      {/* rehype-slug gives every heading an id, so flag chips and column badges can deep-link into the page. */}
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSlug]}>
        {markdown}
      </ReactMarkdown>
    </article>
  );
}
