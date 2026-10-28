import "server-only";
import { decide, parseVerdict, type GateDecision, type GateVerdict, type Scene } from "@/lib/gate";

/**
 * Muse Glimmer 30B (open weights, Apache 2.0) on a server we control: llama.cpp on Modal by default, or any
 * OpenAI-compatible host. It looks at every photo first, so nothing showing a person or a home leaves for the
 * hosted API, and it tells us what the photo is before Muse Spark is asked to read it.
 */
const BASE = process.env.GLIMMER_BASE_URL?.replace(/\/$/, "");
const KEY = process.env.GLIMMER_API_KEY;
export const GLIMMER_MODEL = process.env.GLIMMER_MODEL ?? "muse-glimmer";

export function glimmerConfigured(): boolean {
  return Boolean(BASE);
}

export function glimmerHost(): string | null {
  if (!BASE) return null;
  try {
    return new URL(BASE).host;
  } catch {
    return BASE;
  }
}

const PROMPT = `You are a privacy and triage gate for photos taken on a building site by an electrician.
Look at the photo and reply with only a JSON object, no other text:
{"scene": one of "cable_print" (close-up of printed text on a cable), "distribution_board" (breaker panel / consumer unit),
"chased_wall" (unplastered wall with conduit cut into it) or "other",
"people_visible": true if any person or part of a person (hand excepted) is visible,
"faces_visible": true if any human face is visible, even small or in the background,
"private_text_visible": true if a name, phone number, street address, ID card, letter or screen with personal details is readable,
"usable": false if the photo is too blurry, too dark, too far away or covered in glare to read,
"issue": a few words on what makes it hard to read, or ""}`;

export type GateResult =
  | { status: "off" }
  | (GateDecision & { verdict: GateVerdict; ms: number; model: string; host: string | null });

export async function gate(dataUrl: string, expected?: Scene): Promise<GateResult> {
  if (!BASE) return { status: "off" };
  const started = Date.now();
  const res = await fetch(`${BASE}/v1/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(KEY ? { Authorization: `Bearer ${KEY}` } : {}) },
    signal: AbortSignal.timeout(Number(process.env.GLIMMER_TIMEOUT_MS ?? 90_000)),
    body: JSON.stringify({
      model: GLIMMER_MODEL,
      temperature: 0,
      // Reasoning counts against max_tokens; "low" keeps a gate decision to a few hundred tokens.
      max_tokens: 2000,
      chat_template_kwargs: { reasoning_strength: "low" },
      messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
    }),
  });
  if (!res.ok) throw new Error(`Glimmer gate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const text: string = body.choices?.[0]?.message?.content ?? "";
  const verdict = parseVerdict(text);
  if (!verdict) throw new Error("Glimmer gate returned no JSON verdict");
  return { ...decide(verdict, expected), verdict, ms: Date.now() - started, model: GLIMMER_MODEL, host: glimmerHost() };
}
