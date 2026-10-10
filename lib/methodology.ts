import { cacheLife } from "next/cache";
import { readFile } from "node:fs/promises";
import path from "node:path";

/** docs/METHODOLOGY.md, read from the repo at request time and cached for an hour. */
export async function getMethodology(): Promise<string> {
  "use cache";
  cacheLife("hours");
  return readFile(path.join(process.cwd(), "docs", "METHODOLOGY.md"), "utf8");
}
