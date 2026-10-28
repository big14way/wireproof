import "server-only";
import { decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from "@meta-sam/parser";
import { MetaApiError, SAM } from "./client";

const BASE = "https://api.meta.ai/v1";

export interface SamObject {
  id: string;
  /** Source-pixel box: left/top inclusive, right/bottom exclusive. */
  box: { left: number; top: number; right: number; bottom: number };
  confidence?: number;
  /** Straight line fitted through the mask (principal axis), in source pixels. */
  line?: { x1: number; y1: number; x2: number; y2: number; thickness: number; angleDeg: number };
  areaPx: number;
}

export interface SamImageResult {
  width: number;
  height: number;
  objects: SamObject[];
  ms: number;
}

async function* once(text: string): AsyncIterable<ResponsesEvent> {
  yield { type: "response.output_text.delta", item_id: "m", output_index: 0, content_index: 0, delta: text } as ResponsesEvent;
  yield { type: "response.output_text.done", item_id: "m", output_index: 0, content_index: 0, text } as ResponsesEvent;
  yield { type: "response.completed" } as ResponsesEvent;
}

/** Fit a line through the mask's pixels with principal-component analysis. */
function fitLine(raster: Uint8Array, w: number, h: number, left: number, top: number) {
  const stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 20000)));
  let n = 0, sx = 0, sy = 0;
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) {
    if (raster[y * w + x]) { xs.push(x + left); ys.push(y + top); sx += x + left; sy += y + top; n++; }
  }
  if (n < 3) return { line: undefined, area: n * stride * stride };
  const mx = sx / n, my = sy / n;
  let cxx = 0, cyy = 0, cxy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  cxx /= n; cyy /= n; cxy /= n;
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const ux = Math.cos(theta), uy = Math.sin(theta);
  let tmin = Infinity, tmax = -Infinity;
  for (let i = 0; i < n; i++) { const t = (xs[i] - mx) * ux + (ys[i] - my) * uy; if (t < tmin) tmin = t; if (t > tmax) tmax = t; }
  const minor = (cxx + cyy) / 2 - Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy ** 2);
  const angleDeg = ((theta * 180) / Math.PI + 180) % 180;
  return {
    line: { x1: mx + ux * tmin, y1: my + uy * tmin, x2: mx + ux * tmax, y2: my + uy * tmax, thickness: 4 * Math.sqrt(Math.max(minor, 0)), angleDeg },
    area: n * stride * stride,
  };
}

/** Segment every instance of a short noun phrase in one photo with SAM 3.1, with masks and fitted lines. */
export async function samImage(dataUrl: string, concept: string, opts: { lines?: boolean } = {}): Promise<SamImageResult> {
  const started = Date.now();
  const key = process.env.MODEL_API_KEY;
  if (!key) throw new MetaApiError(500, "missing_key", "MODEL_API_KEY is not set on the server");
  const res = await fetch(`${BASE}/responses`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: SAM,
      metadata: { mask_encoding: "one_bit", include_confidence: "true" },
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: concept }, { type: "input_image", image_url: dataUrl }] }],
    }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new MetaApiError(res.status, body?.error?.code, body?.error?.message ?? `SAM ${res.status}`);
  }
  const body = await res.json();
  const text: string = (body.output ?? []).flatMap((o: { content?: { text?: string }[] }) => o.content ?? []).map((c: { text?: string }) => c.text ?? "").join("\n");
  const size = text.match(/;w=(\d+);h=(\d+)/);
  const width = size ? +size[1] : 0;
  const height = size ? +size[2] : 0;
  if (!text.trim()) return { width, height, objects: [], ms: Date.now() - started };

  const result = await parseImageStream(once(text)).finalResult;
  const boxes = new Map(recordsOfKind(result.records, "box").map((b) => [b.objectId, b]));
  const objects: SamObject[] = recordsOfKind(result.records, "mask").map((m) => {
    const b = m.bounds;
    const fit = opts.lines ? fitLine(decodeMaskToRaster(m.mask), m.mask.width, m.mask.height, b.left, b.top) : undefined;
    return {
      id: m.objectId,
      box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      confidence: m.confidence ?? boxes.get(m.objectId)?.confidence,
      line: fit?.line,
      areaPx: fit?.area ?? (b.right - b.left) * (b.bottom - b.top),
    };
  });
  return { width, height, objects, ms: Date.now() - started };
}
