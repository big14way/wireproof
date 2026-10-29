import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, matches, PASSCODE } from "@/lib/passcode";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** The host the request was addressed to, without the port. */
const hostOf = (request: NextRequest) => (request.headers.get("host") ?? "").match(/^(\[[^\]]+\]|[^:]+)/)?.[1] ?? "";

/**
 * With SITE_PASSCODE set, every request from another device needs the unlock cookie: the tunnel link is public, and
 * each photo spends Meta credits. Requests made on this machine (no cf-ray header, addressed to localhost) pass through.
 */
export function proxy(request: NextRequest) {
  if (!PASSCODE) return NextResponse.next();
  const { pathname } = request.nextUrl;
  if (!request.headers.has("cf-ray") && LOCAL.has(hostOf(request))) return NextResponse.next();
  if (pathname === "/unlock" || pathname === "/api/unlock") return NextResponse.next();
  if (matches(request.cookies.get(COOKIE)?.value, PASSCODE)) return NextResponse.next();
  if (pathname.startsWith("/api/")) return Response.json({ ok: false, error: "Locked: open the app and enter the passcode." }, { status: 401 });
  // Show the passcode form in place: the address bar keeps the page the visitor asked for, and no redirect has to
  // guess the public origin (behind the tunnel the app itself sees plain http).
  return NextResponse.rewrite(new URL("/unlock", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
