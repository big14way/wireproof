import { COOKIE, COOKIE_DAYS, matches, PASSCODE, safeNext, unlockToken } from "@/lib/passcode";

// Relative redirects only: behind the tunnel the app sees plain http, and an absolute URL would leave HTTPS.
const goTo = (location: string, cookie?: string) =>
  new Response(null, { status: 303, headers: { Location: location, ...(cookie ? { "Set-Cookie": cookie } : {}) } });

/** The passcode form posts here; a match sets the unlock cookie and goes back to where the visitor was heading. */
export async function POST(request: Request) {
  const form = await request.formData();
  const next = safeNext(form.get("next"));
  if (!PASSCODE) return goTo(next);
  // Phones capitalise the first letter, so case doesn't count.
  const tried = String(form.get("passcode") ?? "").trim().toLowerCase();
  if (!matches(unlockToken(tried), PASSCODE.toLowerCase())) return goTo(`/unlock?wrong=1&next=${encodeURIComponent(next)}`);
  return goTo(next, `${COOKIE}=${unlockToken(PASSCODE)}; Path=/; Max-Age=${COOKIE_DAYS * 86400}; HttpOnly; Secure; SameSite=Lax`);
}
