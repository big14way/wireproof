import { createHash, createHmac, timingSafeEqual } from "node:crypto";

// A shared passcode for anyone reaching the app through the public tunnel; this machine skips it.
export const PASSCODE = process.env.SITE_PASSCODE?.trim() || null;
export const COOKIE = "wp_unlock";
export const COOKIE_DAYS = 30;
/** Holds `<jobId>:<token>` once a share link has been opened, so the photos on that report load too. */
export const SHARE_COOKIE = "wp_share";

/**
 * The token in a report's share link. It opens that one job's report and the photos on it, nothing else, so the
 * owner can read it from WhatsApp without the passcode. It derives from the passcode: changing the passcode revokes it.
 */
export const shareToken = (jobId: string, passcode: string) =>
  createHmac("sha256", passcode).update(`share:${jobId}`).digest("hex").slice(0, 24);

export function sameToken(a: string | undefined | null, b: string): boolean {
  const x = Buffer.from(a ?? "");
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The cookie holds a hash of the passcode, never the passcode itself. */
export const unlockToken = (passcode: string) => createHash("sha256").update(`wireproof:${passcode}`).digest("hex");

export function matches(token: string | undefined, passcode: string): boolean {
  const want = Buffer.from(unlockToken(passcode));
  const got = Buffer.from(token ?? "");
  return got.length === want.length && timingSafeEqual(got, want);
}

/** Only a path on this site: no protocol-relative or absolute URLs, so the redirect can't leave the app. */
export const safeNext = (next: unknown) => (typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/");
