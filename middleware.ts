import { NextResponse, type NextRequest } from "next/server";

/**
 * Session-specific pages and APIs are private and never cached, so no shared cache
 * (CDN, proxy, back-forward cache) can show one guest's result to another.
 */
const PRIVATE = /^\/(attempts|activity|api)(\/|$)/;

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (PRIVATE.test(req.nextUrl.pathname)) {
    res.headers.set("Cache-Control", "private, no-store, max-age=0");
    res.headers.set("Vary", "Cookie");
  }
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
