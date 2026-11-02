import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_HEADER } from "@/lib/access";
import { COOKIE, COOKIE_DAYS, matches, PASSCODE, SHARE_COOKIE, sameToken, shareToken } from "@/lib/passcode";

const LOCAL = new Set(["localhost", "127.0.0.1", "[::1]"]);
/** On a hosted server anyone can send `Host: localhost`, so only this machine's own setup trusts it. */
const HOSTED = process.env.WIREPROOF_HOSTED === "1";

const REPORT = /^\/jobs\/([^/]+)\/report$/;
const MEDIA = /^\/api\/jobs\/([^/]+)\/media\/[^/]+$/;

/** The host the request was addressed to, without the port. */
const hostOf = (request: NextRequest) => (request.headers.get("host") ?? "").match(/^(\[[^\]]+\]|[^:]+)/)?.[1] ?? "";

/** Let the request through, telling the route how it got in. Set here every time, so a visitor can't supply it. */
function pass(request: NextRequest, access: "full" | "share") {
  const headers = new Headers(request.headers);
  headers.set(ACCESS_HEADER, access);
  return NextResponse.next({ request: { headers } });
}

/** A share link (`?share=` on a report) or the cookie it leaves opens that one job's report and photos, read-only. */
function viaShare(request: NextRequest, passcode: string) {
  if (request.method !== "GET") return null;
  const { pathname, searchParams } = request.nextUrl;
  const jobId = pathname.match(REPORT)?.[1] ?? pathname.match(MEDIA)?.[1];
  if (!jobId) return null;
  const want = shareToken(jobId, passcode);
  if (REPORT.test(pathname) && sameToken(searchParams.get("share"), want)) {
    const res = pass(request, "share");
    res.cookies.set(SHARE_COOKIE, `${jobId}:${want}`, { httpOnly: true, secure: true, sameSite: "lax", maxAge: COOKIE_DAYS * 86400, path: "/" });
    return res;
  }
  const [cookieJob, cookieToken] = (request.cookies.get(SHARE_COOKIE)?.value ?? "").split(":");
  return cookieJob === jobId && sameToken(cookieToken, want) ? pass(request, "share") : null;
}

/**
 * With SITE_PASSCODE set, every request from another device needs the unlock cookie: the link is public, and
 * each photo spends Meta credits. Requests made on this machine (no cf-ray header, addressed to localhost) pass
 * through, except on a hosted server. A report's share link opens just that report, so the owner can read it.
 */
export function proxy(request: NextRequest) {
  if (!PASSCODE) return pass(request, "full");
  const { pathname } = request.nextUrl;
  if (!HOSTED && !request.headers.has("cf-ray") && LOCAL.has(hostOf(request))) return pass(request, "full");
  if (pathname === "/unlock" || pathname === "/api/unlock" || pathname === "/api/health" || pathname === "/api/relay") return pass(request, "full");
  if (matches(request.cookies.get(COOKIE)?.value, PASSCODE)) return pass(request, "full");
  const shared = viaShare(request, PASSCODE);
  if (shared) return shared;
  if (pathname.startsWith("/api/")) return Response.json({ ok: false, error: "Locked: open the app and enter the passcode." }, { status: 401 });
  // Show the passcode form in place: the address bar keeps the page the visitor asked for, and no redirect has to
  // guess the public origin (behind the tunnel the app itself sees plain http).
  return NextResponse.rewrite(new URL("/unlock", request.url));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
