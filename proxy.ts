import { NextResponse, type NextRequest } from "next/server";

/**
 * /ward/[n] must answer with a real 404 for anything but wards 1–50. With Cache Components the
 * route's static shell is streamed before the page runs, which fixes the status at 200, so the
 * check runs here, before the response starts. The page still calls notFound() as a backstop.
 */
export const config = {
  matcher: "/ward/:n",
};

export function proxy(request: NextRequest) {
  const n = request.nextUrl.pathname.split("/")[2] ?? "";
  const ward = /^\d{1,2}$/.test(n) ? Number(n) : NaN;
  if (ward >= 1 && ward <= 50) return NextResponse.next();
  // Rewrite to a path with no route so app/not-found.tsx renders with a 404 status.
  const url = request.nextUrl.clone();
  url.pathname = "/ward-not-found";
  return NextResponse.rewrite(url);
}
