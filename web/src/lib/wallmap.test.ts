import { describe, expect, it } from "vitest";
import { buildWallMap, type SegmentedObject } from "./wallmap";

// A synthetic 1000 × 800 photo: blocks 92 × 47 px, so 0.5 cm per px both ways.
const blocks: SegmentedObject[] = Array.from({ length: 12 }, (_, i) => {
  const col = i % 4, row = Math.floor(i / 4);
  const left = 100 + col * 92, bottom = 700 - row * 47;
  return { id: `b${i}`, box: { left, top: bottom - 47, right: left + 92, bottom } };
});
const conduit = (id: string, x1: number, y1: number, x2: number, y2: number): SegmentedObject => ({
  id, box: { left: Math.min(x1, x2), top: Math.min(y1, y2), right: Math.max(x1, x2), bottom: Math.max(y1, y2) },
  lines: [{ x1, y1, x2, y2, thickness: 8, angleDeg: ((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI + 180) % 180 }],
});

describe("wall map", () => {
  it("calibrates from the block grid", () => {
    const m = buildWallMap({ width: 1000, height: 800, conduits: [], blocks });
    expect(m.calibrated).toBe(true);
    expect(m.cmPerPx!.x).toBeCloseTo(0.5, 2);
    expect(m.cmPerPx!.y).toBeCloseTo(0.5, 2);
  });

  it("maps a vertical run in centimetres and passes it", () => {
    const m = buildWallMap({ width: 1000, height: 800, conduits: [conduit("v", 200, 700, 200, 560)], blocks });
    expect(m.runs[0].orientation).toBe("vertical");
    expect(m.runs[0].from.x).toBe(50);
    expect(m.runs[0].lengthCm).toBe(70);
    expect(m.findings.find((f) => f.ruleId === "WALL-ZONES")?.status).toBe("pass");
  });

  it("fails a diagonal run", () => {
    const m = buildWallMap({ width: 1000, height: 800, conduits: [conduit("d", 150, 690, 400, 580)], blocks });
    expect(m.runs[0].orientation).toBe("diagonal");
    expect(m.findings.find((f) => f.ruleId === "WALL-DIAGONAL")?.status).toBe("fail");
  });

  it("warns without enough blocks to calibrate", () => {
    const m = buildWallMap({ width: 1000, height: 800, conduits: [conduit("v", 200, 700, 200, 560)], blocks: blocks.slice(0, 2) });
    expect(m.calibrated).toBe(false);
    expect(m.findings.find((f) => f.ruleId === "WALL-SCALE")?.status).toBe("warn");
  });
});
