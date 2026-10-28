import { MetaApiError } from "@/lib/meta/client";

/** Turn a Meta API failure into a JSON response the UI can show in plain words. */
export function errorResponse(e: unknown): Response {
  if (e instanceof MetaApiError) {
    const hint = e.code === "billing_not_configured" ? "The Meta account's billing needs attention." : undefined;
    return Response.json({ ok: false, error: e.message, code: e.code, hint }, { status: e.status >= 400 ? e.status : 502 });
  }
  console.error(e);
  return Response.json({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }, { status: 500 });
}

const DATA_URL = /^data:(image\/(jpeg|png|webp)|video\/mp4);base64,/;

export function checkDataUrl(v: unknown, kind: "image" | "video"): string {
  if (typeof v !== "string" || !DATA_URL.test(v)) throw new MetaApiError(400, "bad_media", `Expected a base64 ${kind} data URL`);
  if (kind === "image" && !v.startsWith("data:image/")) throw new MetaApiError(400, "bad_media", "Expected an image");
  if (kind === "video" && !v.startsWith("data:video/mp4")) throw new MetaApiError(400, "bad_media", "Expected an MP4 clip");
  // Inline media is capped at 50 MB by the API; base64 adds a third.
  if (v.length > 48_000_000) throw new MetaApiError(413, "too_large", "Clip too large: keep it under about 30 MB");
  return v;
}
