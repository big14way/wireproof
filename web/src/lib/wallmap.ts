import type { Finding } from "./rules";

/** Block face 450 × 225 mm plus a ~10 mm mortar joint: the grid every unplastered wall carries. */
export const BLOCK_PITCH_CM = { x: 46, y: 23.5 };
export const SAFE_ZONE_CITATION = "BS 7671 Reg. 522.6.202 (prescribed zones for cables concealed in walls)";

interface Box { left: number; top: number; right: number; bottom: number }
interface Line { x1: number; y1: number; x2: number; y2: number; thickness: number; angleDeg: number }
export interface SegmentedObject { id: string; box: Box; line?: Line; confidence?: number }

export interface WallRun {
  id: string;
  orientation: "vertical" | "horizontal" | "diagonal";
  /** Endpoints in cm: x from the wall's left edge, y as height above the lowest block course. */
  from: { x: number; y: number };
  to: { x: number; y: number };
  lengthCm: number;
  /** Endpoints as fractions of the photo, for drawing overlays on this photo or a render of it. */
  img: { x1: number; y1: number; x2: number; y2: number };
  confidence?: number;
}

export interface WallMap {
  calibrated: boolean;
  blocksUsed: number;
  cmPerPx?: { x: number; y: number };
  wall?: { widthCm: number; heightCm: number };
  runs: WallRun[];
  findings: Finding[];
}

const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const r0 = (n: number) => Math.round(n);

export function buildWallMap(input: { width: number; height: number; conduits: SegmentedObject[]; blocks: SegmentedObject[] }): WallMap {
  const { width, height } = input;
  // Blocks seen face-on are about 2:1; perspective and partial blocks fall outside this band.
  const blocks = input.blocks.filter((b) => {
    const w = b.box.right - b.box.left, h = b.box.bottom - b.box.top;
    return h > 0 && w / h > 1.4 && w / h < 2.8;
  });
  const calibrated = blocks.length >= 3;
  const cmPerPx = calibrated
    ? { x: BLOCK_PITCH_CM.x / median(blocks.map((b) => b.box.right - b.box.left)), y: BLOCK_PITCH_CM.y / median(blocks.map((b) => b.box.bottom - b.box.top)) }
    : undefined;
  const left = calibrated ? Math.min(...blocks.map((b) => b.box.left)) : 0;
  const floor = calibrated ? Math.max(...blocks.map((b) => b.box.bottom)) : height;
  const top = calibrated ? Math.min(...blocks.map((b) => b.box.top)) : 0;
  const toCm = (x: number, y: number) => cmPerPx ? { x: r0((x - left) * cmPerPx.x), y: r0((floor - y) * cmPerPx.y) } : { x: r0(x), y: r0(height - y) };

  const runs: WallRun[] = [];
  for (const c of input.conduits) {
    const l = c.line;
    if (!l) continue;
    const lenPx = Math.hypot(l.x2 - l.x1, l.y2 - l.y1);
    if (lenPx < 3 * Math.max(l.thickness, 4)) continue; // a blob, not a run
    const a = l.angleDeg;
    const orientation = a < 12 || a > 168 ? "horizontal" : Math.abs(a - 90) < 12 ? "vertical" : "diagonal";
    const from = toCm(l.x1, l.y1), to = toCm(l.x2, l.y2);
    runs.push({
      id: c.id, orientation, from, to, lengthCm: r0(Math.hypot(to.x - from.x, to.y - from.y)),
      img: { x1: l.x1 / width, y1: l.y1 / height, x2: l.x2 / width, y2: l.y2 / height }, confidence: c.confidence,
    });
  }

  const findings: Finding[] = [];
  if (!calibrated) {
    findings.push({ ruleId: "WALL-SCALE", status: "warn", title: "Wall not calibrated", detail: "Fewer than three whole blocks were found, so positions are in pixels, not centimetres.", fix: "Photograph the wall front-on with whole blocks visible around the conduit.", citation: SAFE_ZONE_CITATION });
  }
  const wallTopCm = cmPerPx ? r0((floor - top) * cmPerPx.y) : undefined;
  for (const run of runs) {
    if (run.orientation === "diagonal") {
      findings.push({
        ruleId: "WALL-DIAGONAL", status: "fail", title: `Diagonal cable run (${run.lengthCm} ${cmPerPx ? "cm" : "px"})`,
        detail: "Concealed cables must run straight up, down or across from a switch or socket, or within 150 mm of the top of the wall or a corner. A diagonal run is where a drill later finds a live cable.",
        fix: "Re-route this conduit vertically or horizontally to its accessory before plastering.", citation: SAFE_ZONE_CITATION,
      });
    } else if (run.orientation === "horizontal" && wallTopCm != null && wallTopCm - Math.max(run.from.y, run.to.y) > 15) {
      findings.push({
        ruleId: "WALL-HORIZONTAL", status: "warn", title: `Horizontal run ${Math.max(run.from.y, run.to.y)} cm above the floor`,
        detail: "A horizontal run away from the top of the wall is only allowed in line with a switch or socket.",
        fix: "Confirm it lines up with an accessory, or move it within 150 mm of the top of the wall.", citation: SAFE_ZONE_CITATION,
      });
    }
  }
  if (runs.length > 0 && !findings.some((f) => f.status === "fail")) {
    findings.push({ ruleId: "WALL-ZONES", status: "pass", title: `${runs.length} run${runs.length > 1 ? "s" : ""} mapped in straight lines`, detail: "Every run found is vertical or horizontal. Keep drilling 15 cm clear of the mapped lines.", citation: SAFE_ZONE_CITATION });
  }
  return {
    calibrated, blocksUsed: blocks.length, cmPerPx,
    wall: cmPerPx ? { widthCm: r0((Math.max(...blocks.map((b) => b.box.right)) - left) * cmPerPx.x), heightCm: wallTopCm! } : undefined,
    runs, findings,
  };
}
