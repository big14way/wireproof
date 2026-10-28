import "server-only";
import { decodeMaskToRaster, parseImageStream, recordsOfKind, type ResponsesEvent } from "@meta-sam/parser";
import { buildWallMap } from "@/lib/wallmap";
import { MetaApiError, SAM } from "./client";

const BASE = "https://api.meta.ai/v1";

export interface SamObject {
  id: string;
  /** Source-pixel box: left/top inclusive, right/bottom exclusive. */
  box: { left: number; top: number; right: number; bottom: number };
  confidence?: number;
  /** Straight runs fitted through the mask, in source pixels (only when asked for lines). */
  lines?: FittedLine[];
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

export interface FittedLine { x1: number; y1: number; x2: number; y2: number; thickness: number; angleDeg: number }

/** Principal axis of a point set: its direction, centre and spread across the axis. */
function principal(xs: number[], ys: number[], idx: number[]) {
  let mx = 0, my = 0;
  for (const i of idx) { mx += xs[i]; my += ys[i]; }
  mx /= idx.length; my /= idx.length;
  let cxx = 0, cyy = 0, cxy = 0;
  for (const i of idx) { const dx = xs[i] - mx, dy = ys[i] - my; cxx += dx * dx; cyy += dy * dy; cxy += dx * dy; }
  cxx /= idx.length; cyy /= idx.length; cxy /= idx.length;
  const theta = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
  const minor = (cxx + cyy) / 2 - Math.sqrt(((cxx - cyy) / 2) ** 2 + cxy ** 2);
  return { mx, my, ux: Math.cos(theta), uy: Math.sin(theta), theta, spread: Math.sqrt(Math.max(minor, 0)) };
}

/**
 * Split one mask into straight runs. A conduit that goes up from a switch box and then off at an angle comes
 * back from SAM as one connected object; RANSAC pulls out the strongest straight run, removes it, and repeats.
 */
function fitLines(raster: Uint8Array, w: number, h: number, left: number, top: number): { lines: FittedLine[]; area: number } {
  const stride = Math.max(1, Math.floor(Math.sqrt((w * h) / 6000)));
  const xs: number[] = [], ys: number[] = [];
  for (let y = 0; y < h; y += stride) for (let x = 0; x < w; x += stride) if (raster[y * w + x]) { xs.push(x + left); ys.push(y + top); }
  const area = xs.length * stride * stride;
  const tol = Math.max(5, 0.012 * Math.hypot(w, h));
  let remaining = xs.map((_, i) => i);
  const lines: FittedLine[] = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647); // deterministic: same mask, same lines

  while (remaining.length >= Math.max(30, 0.08 * xs.length) && lines.length < 4) {
    let best: number[] = [];
    for (let k = 0; k < 250; k++) {
      const a = remaining[Math.floor(rand() * remaining.length)], b = remaining[Math.floor(rand() * remaining.length)];
      const dx = xs[b] - xs[a], dy = ys[b] - ys[a], len = Math.hypot(dx, dy);
      if (len < 4 * tol) continue;
      const nx = -dy / len, ny = dx / len;
      const inliers = remaining.filter((i) => Math.abs((xs[i] - xs[a]) * nx + (ys[i] - ys[a]) * ny) <= tol);
      if (inliers.length > best.length) best = inliers;
    }
    if (best.length < 20) break;
    // Keep the longest unbroken stretch along the line, so a run doesn't jump a gap to an unrelated blob.
    const p = principal(xs, ys, best);
    const proj = best.map((i) => ({ i, t: (xs[i] - p.mx) * p.ux + (ys[i] - p.my) * p.uy })).sort((u, v) => u.t - v.t);
    let runStart = 0, bestStart = 0, bestEnd = 0;
    for (let j = 1; j <= proj.length; j++) {
      if (j === proj.length || proj[j].t - proj[j - 1].t > 3 * tol) {
        if (j - runStart > bestEnd - bestStart) { bestStart = runStart; bestEnd = j; }
        runStart = j;
      }
    }
    const seg = proj.slice(bestStart, bestEnd).map((q) => q.i);
    if (seg.length < 20) break;
    const q = principal(xs, ys, seg);
    let tmin = Infinity, tmax = -Infinity;
    for (const i of seg) { const t = (xs[i] - q.mx) * q.ux + (ys[i] - q.my) * q.uy; tmin = Math.min(tmin, t); tmax = Math.max(tmax, t); }
    if (tmax - tmin > 3 * Math.max(4 * q.spread, 4)) {
      lines.push({
        x1: q.mx + q.ux * tmin, y1: q.my + q.uy * tmin, x2: q.mx + q.ux * tmax, y2: q.my + q.uy * tmax,
        thickness: 4 * q.spread, angleDeg: ((q.theta * 180) / Math.PI + 180) % 180,
      });
    }
    const used = new Set(best);
    remaining = remaining.filter((i) => !used.has(i));
  }
  return { lines, area };
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
    const fit = opts.lines ? fitLines(decodeMaskToRaster(m.mask), m.mask.width, m.mask.height, b.left, b.top) : undefined;
    return {
      id: m.objectId,
      box: { left: b.left, top: b.top, right: b.right, bottom: b.bottom },
      confidence: m.confidence ?? boxes.get(m.objectId)?.confidence,
      lines: fit?.lines,
      areaPx: fit?.area ?? (b.right - b.left) * (b.bottom - b.top),
    };
  });
  return { width, height, objects, ms: Date.now() - started };
}

/**
 * Map the cable runs in a chased, unplastered wall. SAM 3.1 segments the conduit and the blocks;
 * the block grid turns pixels into centimetres; the rules check the safe zones.
 */
export async function traceWall(dataUrl: string) {
  const [blocks, first] = await Promise.all([samImage(dataUrl, "concrete block"), samImage(dataUrl, "conduit", { lines: true })]);
  // "conduit" is the precise word; "pipe" catches PVC conduit SAM doesn't know by name.
  const conduits = first.objects.length ? first : await samImage(dataUrl, "pipe", { lines: true });
  const width = conduits.width || blocks.width;
  const height = conduits.height || blocks.height;
  return {
    width, height, blocks,
    concept: first.objects.length ? "conduit" : "pipe",
    map: buildWallMap({ width, height, conduits: conduits.objects, blocks: blocks.objects }),
    ms: Math.max(blocks.ms, first.ms) + (conduits === first ? 0 : conduits.ms),
  };
}
