import "server-only";
import { timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { DATA_DIR } from "@/lib/paths";

/**
 * Where model calls go. Meta's API decides availability by where a call comes from, and cloud servers get an empty
 * model list, so a hosted copy can send its calls through a relay on a machine where the key works
 * (relay/meta-relay.mjs, exposed by a Cloudflare tunnel). The relay checks in every minute with its current address.
 */
const DIRECT = "https://api.meta.ai/v1";
const RELAY_FILE = path.join(DATA_DIR, "relay.json");
const CALLS_FILE = path.join(DATA_DIR, "calls.json");

/** A relay that hasn't checked in for this long counts as gone. */
export const RELAY_STALE_MS = 3 * 60_000;
export const RELAY_TOKEN = process.env.META_RELAY_TOKEN?.trim() || null;
export const VIA_RELAY = process.env.META_VIA_RELAY === "1";

export interface RelayState {
  base: string;
  at: number;
}

let cached: { state: RelayState | null; read: number } | null = null;

export async function relayState(): Promise<RelayState | null> {
  if (cached && Date.now() - cached.read < 5_000) return cached.state;
  let state: RelayState | null = null;
  try {
    state = JSON.parse(await readFile(RELAY_FILE, "utf8"));
  } catch {
    // no relay has checked in on this volume yet
  }
  cached = { state, read: Date.now() };
  return state;
}

export async function saveRelay(base: string): Promise<RelayState> {
  const state = { base, at: Date.now() };
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(RELAY_FILE, JSON.stringify(state));
  cached = { state, read: Date.now() };
  return state;
}

export function relayTokenOk(given: string | null): boolean {
  if (!RELAY_TOKEN || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(RELAY_TOKEN);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The base URL and extra headers for the next call, or null when this host needs the relay and it is gone. */
export async function metaTarget(): Promise<{ base: string; headers: Record<string, string>; via: "direct" | "relay" } | null> {
  if (!VIA_RELAY) return { base: process.env.META_API_BASE ?? DIRECT, headers: {}, via: "direct" };
  const s = await relayState();
  if (!s || !RELAY_TOKEN || Date.now() - s.at > RELAY_STALE_MS) return null;
  return { base: `${s.base}/v1`, headers: { "x-relay-token": RELAY_TOKEN }, via: "relay" };
}

let counting: Promise<unknown> = Promise.resolve();

/**
 * Count one paid call against META_DAILY_CALL_CAP (UTC day). Meta's spend alerts don't stop billing, so a public
 * copy needs its own ceiling once the hackathon credits run out. Returns false when today's calls are used up.
 */
export function takeCall(): Promise<boolean> {
  const cap = Number(process.env.META_DAILY_CALL_CAP) || 0;
  if (!cap) return Promise.resolve(true);
  const next = counting.then(async () => {
    const day = new Date().toISOString().slice(0, 10);
    let s = { day, n: 0 };
    try {
      const saved = JSON.parse(await readFile(CALLS_FILE, "utf8"));
      if (saved.day === day) s = saved;
    } catch {
      // first call today on this volume
    }
    if (s.n >= cap) return false;
    s.n += 1;
    await mkdir(DATA_DIR, { recursive: true });
    await writeFile(CALLS_FILE, JSON.stringify(s));
    return true;
  });
  counting = next.catch(() => undefined);
  return next;
}
