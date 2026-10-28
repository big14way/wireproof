import "server-only";
import { logEgress, digest } from "@/lib/egress";
import type { Scene } from "@/lib/gate";
import { MetaApiError } from "./client";
import { gate, type GateResult } from "./glimmer";

/**
 * Every photo goes through the Glimmer gate before it is sent to Meta's hosted models, and every send is
 * written to the egress log. A blocked photo never leaves; the caller gets a 422 with the reasons.
 */
export async function guarded<T>(opts: { route: string; model: string; media: string; expected?: Scene }, send: () => Promise<T>): Promise<{ result: T; gate: GateResult }> {
  const bytes = Math.round((opts.media.length * 3) / 4);
  const g = await gate(opts.media, opts.expected).catch((e: Error): GateResult => {
    console.warn("Glimmer gate unavailable:", e.message);
    return { status: "off" };
  });
  if (g.status === "block") {
    await logEgress({ route: opts.route, model: opts.model, bytes, digest: digest(opts.media), gate: "block", reasons: g.reasons, gateMs: g.ms, sent: false });
    throw new MetaApiError(422, "privacy_block", g.reasons.join(" "));
  }
  const result = await send();
  await logEgress({
    route: opts.route, model: opts.model, bytes, digest: digest(opts.media), gate: g.status,
    reasons: g.status === "off" ? undefined : g.reasons, gateMs: g.status === "off" ? undefined : g.ms, sent: true,
  });
  return { result, gate: g };
}
