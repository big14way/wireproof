import "server-only";
import { MetaApiError } from "./client";

const BASE = "https://api.meta.ai/v1";
export const MUSE_IMAGE = "muse-image-1.0";

/** Edit a photo with Muse Image and return the result as a JPEG data URL. */
export async function editImage(dataUrl: string, prompt: string): Promise<{ dataUrl: string; ms: number }> {
  const started = Date.now();
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new MetaApiError(500, "missing_key", "MODEL_API_KEY is not set on the server");
  const res = await fetch(`${BASE}/images/edits`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MUSE_IMAGE,
      prompt,
      images: [{ image_url: dataUrl }],
      n: 1,
      output_format: "jpeg",
      // One pass is enough for an illustrative render and keeps the wait short.
      reasoning_strength: "low",
      // The edit must stay on this photo: no outside references.
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MetaApiError(res.status, body?.error?.code, body?.error?.message ?? `Muse Image ${res.status}`);
  }
  const body = await res.json();
  const b64: string | undefined = body.data?.[0]?.b64_json;
  if (!b64) throw new MetaApiError(502, "empty_output", "Muse Image returned no image");
  return { dataUrl: `data:image/jpeg;base64,${b64}`, ms: Date.now() - started };
}

/** Renders WireProof offers. Each one keeps the owner's own photo and camera angle. */
export const RENDERS = {
  "wall-plastered":
    "Show this exact same wall after it has been plastered smooth and painted off-white. Keep the camera position, framing, " +
    "lighting, wall edges, openings and floor exactly the same. Keep every switch and socket box where it is, now fitted with a white " +
    "faceplate. Do not add furniture, people or text. Photorealistic.",
  "board-fixed":
    "Show this same distribution board installed correctly: add a 30 mA RCD protecting the circuit breakers, a surge " +
    "protection device, and neat printed labels under every breaker. Keep the camera angle, wall, enclosure and wiring the " +
    "same. Photorealistic, like a photo taken after the fix.",
} as const;
export type RenderKind = keyof typeof RENDERS;
