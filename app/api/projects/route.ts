import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/data";
import { todayInChicago } from "@/lib/dates";
import { isProjectKind } from "@/lib/format";
import { parseQuery } from "@/lib/query";
import { parseCounted, selectProjects } from "@/lib/select";

const MAX_LIMIT = 500;

/** Pages of projects for a period and filters; feeds the lazy-loading list on the citywide page. */
export async function GET(request: Request) {
  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const snapshot = await getSnapshot();
  const state = parseQuery(sp, todayInChicago(), snapshot.window_start);
  const kind = isProjectKind(sp.kind) ? sp.kind : undefined;
  const ward = sp.ward && /^\d{1,2}$/.test(sp.ward) && Number(sp.ward) >= 1 && Number(sp.ward) <= 50 ? Number(sp.ward) : undefined;
  const offset = Math.max(0, Math.trunc(Number(sp.offset)) || 0);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.trunc(Number(sp.limit)) || 200));
  const all = selectProjects(snapshot, { window: { from: state.from, to: state.to }, opts: { completedOnly: state.completed }, ward, kind, counted: parseCounted(sp.counted) });
  return NextResponse.json(
    { total: all.length, offset, limit, projects: all.slice(offset, offset + limit) },
    { headers: { "Cache-Control": "public, max-age=300, stale-while-revalidate=3600" } },
  );
}
