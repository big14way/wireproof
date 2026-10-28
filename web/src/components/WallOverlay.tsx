import type { WallMap } from "@/lib/wallmap";

export const NO_DRILL_CM = 15;

/** The mapped runs drawn over the wall photo, or over the plastered render as an X-ray. */
export function WallOverlay({ map, width: W, height: H, xray }: { map: WallMap; width: number; height: number; xray?: boolean }) {
  const band = map.cmPerPx ? (2 * NO_DRILL_CM) / map.cmPerPx.x : 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full">
      {map.runs.map((r) => {
        const bad = r.orientation === "diagonal";
        const [x1, y1, x2, y2] = [r.img.x1 * W, r.img.y1 * H, r.img.x2 * W, r.img.y2 * H];
        return (
          <g key={r.id}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={bad ? "#c62828" : "#f59e0b"} strokeOpacity={xray ? 0.22 : 0.18} strokeWidth={band} strokeLinecap="round" />
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={bad ? "#c62828" : xray ? "#b4652a" : "#fde68a"} strokeWidth={W / 260} strokeDasharray={bad ? `${W / 80} ${W / 120}` : undefined} strokeLinecap="round" />
            <text x={(x1 + x2) / 2 + W / 90} y={(y1 + y2) / 2} fontSize={W / 45} fontWeight={700} fill={bad ? "#c62828" : xray ? "#7c3f12" : "#fff"} stroke={xray ? "none" : "#0b1220"} strokeWidth={W / 900} paintOrder="stroke">
              {r.id} · {r.lengthCm} cm
            </text>
          </g>
        );
      })}
    </svg>
  );
}
