import "server-only";

// Thin server-side client for Meta's Model API. The key stays on the server; the browser only ever
// talks to our own /api routes.
import { metaTarget, takeCall } from "./upstream";

export const SPARK = process.env.SPARK_MODEL ?? "muse-spark-1.3";
export const SAM = "sam-3.1";
export const VOICE = "muse-voice-transcribe-1.0";

export class MetaApiError extends Error {
  constructor(public status: number, public code: string | undefined, message: string) {
    super(message);
  }
}

function key(): string {
  const k = process.env.MODEL_API_KEY;
  if (!k) throw new MetaApiError(500, "missing_key", "MODEL_API_KEY is not set on the server");
  return k;
}

/**
 * One call to Meta's API, direct or through the relay (see upstream.ts), counted against the daily cap.
 * `path` is relative to /v1. Headers are merged with the key and the relay token.
 */
export async function metaFetch(p: string, init: RequestInit & { headers?: Record<string, string> }): Promise<Response> {
  const target = await metaTarget();
  if (!target) throw new MetaApiError(503, "relay_offline", "The model relay is offline: the machine that reaches Meta's API isn't connected right now.");
  if (!(await takeCall())) throw new MetaApiError(429, "daily_cap", "Today's model-call budget is used up. Try again tomorrow.");
  return fetch(`${target.base}${p}`, { ...init, headers: { Authorization: `Bearer ${key()}`, ...target.headers, ...(init.headers ?? {}) } });
}

async function fail(res: Response): Promise<never> {
  let code: string | undefined;
  let message = `${res.status} ${res.statusText}`;
  try {
    const body = await res.json();
    code = body?.error?.code;
    message = body?.error?.message ?? message;
  } catch {
    // body was not JSON; keep the status line
  }
  throw new MetaApiError(res.status, code, message);
}

export type Media =
  | { kind: "image"; dataUrl: string }
  | { kind: "video"; dataUrl: string }
  | { kind: "video"; fileId: string };

function mediaPart(m: Media) {
  if (m.kind === "image") return { type: "input_image", image_url: m.dataUrl };
  return "fileId" in m ? { type: "input_video", file_id: m.fileId } : { type: "input_video", video_url: m.dataUrl };
}

export interface Usage {
  input_tokens?: number;
  output_tokens?: number;
  images_processed?: number;
  video_frames_processed?: number;
}

/** Ask Muse Spark one question about one image or clip and get JSON back in the given schema. */
export async function sparkJSON<T>(opts: {
  prompt: string;
  media: Media;
  schema: object;
  name: string;
  effort?: "low" | "medium" | "high";
}): Promise<{ data: T; usage?: Usage; model: string; ms: number }> {
  const started = Date.now();
  const res = await metaFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPARK,
      reasoning: { effort: opts.effort ?? "low" },
      // Reasoning shares this budget; too small and the answer comes back empty.
      max_output_tokens: 4000,
      text: { format: { type: "json_schema", name: opts.name, schema: opts.schema, strict: true } },
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: opts.prompt }, mediaPart(opts.media)] }],
    }),
  });
  if (!res.ok) await fail(res);
  const body = await res.json();
  const text: string = (body.output ?? [])
    .filter((o: { type: string }) => o.type === "message")
    .flatMap((o: { content?: { text?: string }[] }) => o.content ?? [])
    .map((c: { text?: string }) => c.text ?? "")
    .join("");
  if (!text) throw new MetaApiError(502, "empty_output", "Muse Spark returned no text");
  return { data: JSON.parse(text) as T, usage: body.usage, model: SPARK, ms: Date.now() - started };
}

export type ResponseItem = { type: string } & Record<string, unknown>;

/**
 * One agent turn: Muse Spark sees the conversation so far and either calls tools or answers. Nothing is stored
 * on Meta's side; the caller replays the items each turn, with reasoning carried in encrypted form.
 */
export async function sparkTurn(opts: {
  instructions: string;
  input: ResponseItem[];
  tools: object[];
  effort?: "minimal" | "low" | "medium" | "high";
}): Promise<{ output: ResponseItem[]; usage?: Usage; ms: number }> {
  const started = Date.now();
  const res = await metaFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SPARK,
      instructions: opts.instructions,
      input: opts.input,
      tools: opts.tools,
      parallel_tool_calls: true,
      reasoning: { effort: opts.effort ?? "low" },
      max_output_tokens: 4000,
      store: false,
      include: ["reasoning.encrypted_content"],
    }),
  });
  if (!res.ok) await fail(res);
  const body = await res.json();
  if (body.status === "incomplete") throw new MetaApiError(502, "incomplete", `Muse Spark stopped early: ${body.incomplete_details?.reason ?? "unknown reason"}`);
  return { output: body.output ?? [], usage: body.usage, ms: Date.now() - started };
}

/** Transcribe a short WAV (mono 16-bit PCM, 16 or 24 kHz) with Muse Voice Transcribe. */
export async function transcribe(wav: Blob, keywords: string[] = []): Promise<{ transcript: string; ms: number }> {
  const started = Date.now();
  const form = new FormData();
  form.set(
    "request",
    new Blob([JSON.stringify({ mode: "PUSH_TO_TALK", model: VOICE, audioEncoding: "WAV", keywords, languageBias: ["English"] })], { type: "application/json" }),
  );
  form.set("audio", wav, "speech.wav");
  const res = await metaFetch("/asr/transcribe", { method: "POST", body: form });
  if (!res.ok) await fail(res);
  const body = await res.json();
  return { transcript: body.transcript ?? "", ms: Date.now() - started };
}

export interface SamBox {
  id: number;
  /** Corners as fractions of the frame, so overlays scale to any display size. */
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  confidence?: number;
}

const FRAME = /<(\d+)f>/;
const BOX = /(\d+)<\|box;x1=(\d+);y1=(\d+);x2=(\d+);y2=(\d+);w=(\d+);h=(\d+)(?:;c=([\d.]+))?\|>/g;

/** Parse SAM's special-token output into boxes per frame. Masks are skipped; boxes are enough here. */
export function parseSam(text: string): Map<number, SamBox[]> {
  const frames = new Map<number, SamBox[]>();
  for (const line of text.split("\n")) {
    const f = line.match(FRAME);
    if (!f) continue;
    const boxes: SamBox[] = [];
    for (const m of line.matchAll(BOX)) {
      const [, id, x1, y1, x2, y2, w, h, c] = m;
      boxes.push({ id: +id, x1: +x1 / +w, y1: +y1 / +h, x2: +x2 / +w, y2: +y2 / +h, confidence: c ? +c : undefined });
    }
    frames.set(+f[1], boxes);
  }
  return frames;
}

/** Find every instance of a short noun phrase in one image with SAM 3.1. */
export async function samImage(dataUrl: string, concept: string): Promise<{ boxes: SamBox[]; ms: number }> {
  const started = Date.now();
  const res = await metaFetch("/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SAM,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: concept }, { type: "input_image", image_url: dataUrl }] }],
    }),
  });
  if (!res.ok) await fail(res);
  const body = await res.json();
  const text: string = (body.output ?? []).flatMap((o: { content?: { text?: string }[] }) => o.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
  return { boxes: parseSam(text).get(0) ?? [], ms: Date.now() - started };
}
