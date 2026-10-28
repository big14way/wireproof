import "server-only";
import { logEgress, digest } from "@/lib/egress";
import type { Scene } from "@/lib/gate";
import { MetaApiError } from "./client";
import { gate, gateInfo, type GateResult } from "./gatemodel";

/**
 * Every photo goes through the privacy gate before it is sent to Meta's hosted models, and every send is
 * written to the egress log. A blocked photo never leaves (422), and neither does one the gate couldn't check (503).
 */
export async function guarded<T>(opts: { route: string; model: string; media: string; expected?: Scene }, send: () => Promise<T>): Promise<{ result: T; gate: GateResult }> {
  const bytes = Math.round((opts.media.length * 3) / 4);
  let g: GateResult;
  try {
    g = await gate(opts.media, opts.expected);
  } catch (e) {
    // The gate is configured but didn't answer (cold start, network). Fail closed: sending anyway would break the promise.
    const reason = e instanceof Error ? e.message : String(e);
    await logEgress({ route: opts.route, model: opts.model, bytes, digest: digest(opts.media), gate: "error", reasons: [reason], sent: false });
    throw new MetaApiError(503, "gate_unavailable", `The privacy gate (${gateInfo().name}) didn't answer, so the photo was not sent. It may be starting up: try again in a minute.`);
  }
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
