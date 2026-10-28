import "server-only";
import { decide, hedged, parseVerdict, type GateDecision, type GateVerdict, type Scene } from "@/lib/gate";

/**
 * The privacy gate: an open-weights Meta model looks at every photo first, so nothing showing a person or a home
 * leaves for the hosted API, and it tells us what the photo is before Muse Spark is asked to read it.
 * Muse Glimmer 30B on a server we control (llama.cpp on Modal) when GLIMMER_BASE_URL is set; otherwise Muse Spark
 * Open on Baseten with the hackathon key. Both speak the OpenAI chat API.
 */
interface GateHost {
  name: string;
  model: string;
  url: string;
  key?: string;
  where: string;
  body: Record<string, unknown>;
  hedgeMs?: number;
  timeoutMs: number;
}

function pickHost(): GateHost | null {
  const glimmer = process.env.GLIMMER_BASE_URL?.replace(/\/$/, "");
  if (glimmer) {
    return {
      name: "Muse Glimmer",
      model: process.env.GLIMMER_MODEL ?? "muse-glimmer",
      url: `${glimmer}/v1/chat/completions`,
      key: process.env.GLIMMER_API_KEY,
      where: "our server",
      // Reasoning counts against max_tokens; "low" keeps a gate decision to a few hundred tokens.
      body: { chat_template_kwargs: { reasoning_strength: "low" } },
      // A cold start loads the weights onto the GPU; a second request would only wait in the same queue.
      timeoutMs: Number(process.env.GLIMMER_TIMEOUT_MS ?? 90_000),
    };
  }
  if (process.env.BASETEN_API_KEY) {
    return {
      name: "Muse Spark Open",
      model: "meta-models/muse-spark-open-1026",
      url: "https://inference.baseten.co/v1/chat/completions",
      key: process.env.BASETEN_API_KEY,
      where: "on Baseten, which keeps no inputs or outputs",
      body: { reasoning_effort: "low" },
      // Most verdicts take 5–8 s, but about one call in five stalls for 45 s or more; a second request cuts that tail.
      hedgeMs: 12_000,
      timeoutMs: 60_000,
    };
  }
  return null;
}

const HOST = pickHost();

export function gateConfigured(): boolean {
  return HOST !== null;
}

/** What the console shows about the gate. */
export function gateInfo() {
  return HOST
    ? { configured: true, name: HOST.name, model: HOST.model, host: new URL(HOST.url).host, where: HOST.where }
    : { configured: false, name: null, model: null, host: null, where: null };
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
  | (GateDecision & { verdict: GateVerdict; ms: number; name: string; model: string; host: string });

export async function gate(dataUrl: string, expected?: Scene): Promise<GateResult> {
  if (!HOST) return { status: "off" };
  const h = HOST;
  const started = Date.now();
  const ask = async (signal: AbortSignal) => {
    const res = await fetch(h.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(h.key ? { Authorization: `Bearer ${h.key}` } : {}) },
      signal,
      body: JSON.stringify({
        model: h.model,
        temperature: 0,
        max_tokens: 2000,
        ...h.body,
        messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }],
      }),
    });
    if (!res.ok) throw new Error(`${h.name} gate ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = await res.json();
    const verdict = parseVerdict(body.choices?.[0]?.message?.content ?? "");
    if (!verdict) throw new Error(`${h.name} gate returned no JSON verdict`);
    return verdict;
  };
  const verdict = await hedged(ask, h.hedgeMs, h.timeoutMs);
  return { ...decide(verdict, expected), verdict, ms: Date.now() - started, name: h.name, model: h.model, host: new URL(h.url).host };
}
