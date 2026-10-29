import { createHash, timingSafeEqual } from "node:crypto";

// A shared passcode for anyone reaching the app through the public tunnel; this machine skips it.
export const PASSCODE = process.env.SITE_PASSCODE?.trim() || null;
export const COOKIE = "wp_unlock";
export const COOKIE_DAYS = 30;

/** The cookie holds a hash of the passcode, never the passcode itself. */
export const unlockToken = (passcode: string) => createHash("sha256").update(`wireproof:${passcode}`).digest("hex");

export function matches(token: string | undefined, passcode: string): boolean {
  const want = Buffer.from(unlockToken(passcode));
  const got = Buffer.from(token ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Only a path on this site: no protocol-relative or absolute URLs, so the redirect can't leave the app. */
export const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");
