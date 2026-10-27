import {
  ambientFactor, CABLE_SIZES, CAPACITY_4D1A, CITATIONS, DEFAULT_AMBIENT_C, groupingFactor, MCB_RATINGS,
  NOMINAL_VOLTAGE, VOLT_DROP_4D1B, VOLT_DROP_LIMIT, type CableSize, type InstallMethod,
} from "./tables";
import type { CircuitKind } from "./types";

export interface DesignInput {
  kind: CircuitKind;
  loadW?: number;
  powerFactor?: number;
  /** Design current in amps, when it's known directly (overrides loadW). */
  designCurrentA?: number;
  lengthM: number;
  method?: InstallMethod;
  ambientC?: number;
  groupedWith?: number;
  curve?: "B" | "C";
}

/**
 * Smallest cable an electrician here would run for each kind of circuit. BS 7671 Table 52.3 allows
 * 1.0 mm² copper; Nigerian practice is 1.5 mm² for lighting and 2.5 mm² for sockets and appliances.
 * Used only when proposing a design, never to fail an existing installation.
 */
export const PRACTICE_MIN_SIZE: Record<CircuitKind, CableSize> = {
  lighting: 1.5,
  "sockets-radial": 2.5,
  "sockets-ring": 2.5,
  "air-conditioner": 2.5,
  "water-heater": 2.5,
  cooker: 6,
  pump: 2.5,
  other: 1.5,
};

export interface DesignStep {
  label: string;
  value: string;
  citation?: string;
}

export interface DesignResult {
  ok: boolean;
  cableSize?: CableSize;
  breakerA?: number;
  curve: "B" | "C";
  designCurrentA: number;
  correctedCapacityA?: number;
  voltDropV?: number;
  voltDropPct?: number;
  /** One line the copilot can say or show. */
  answer: string;
  steps: DesignStep[];
}

const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

export function designCurrent(input: DesignInput): number {
  if (input.designCurrentA != null) return input.designCurrentA;
  if (input.loadW == null) return 0;
  return input.loadW / (NOMINAL_VOLTAGE * (input.powerFactor ?? 1));
}

export function voltDrop(size: CableSize, amps: number, lengthM: number, ring = false) {
  // A ring with evenly spread load sees about a quarter of the end-to-end drop.
  const volts = (VOLT_DROP_4D1B[size] * amps * lengthM) / 1000 / (ring ? 4 : 1);
  return { volts, pct: volts / NOMINAL_VOLTAGE };
}

/**
 * Pick the breaker and the smallest cable that satisfies Ib ≤ In ≤ Iz and the voltage-drop limit.
 * Socket circuits use the standard arrangements (32 A ring or 20 A radial) unless told otherwise.
 */
export function designCircuit(input: DesignInput): DesignResult {
  const method = input.method ?? "B";
  const ca = ambientFactor(input.ambientC ?? DEFAULT_AMBIENT_C);
  const cg = groupingFactor(input.groupedWith ?? 1);
  const ring = input.kind === "sockets-ring";
  const lighting = input.kind === "lighting";
  const curve = input.curve ?? (input.kind === "air-conditioner" || input.kind === "pump" ? "C" : "B");

  let ib = designCurrent(input);
  if (ring && !ib) ib = 32 * 0.67;
  if (input.kind === "sockets-radial" && !ib) ib = 20;

  const steps: DesignStep[] = [
    { label: "Design current Ib", value: `${round(ib)} A`, citation: input.loadW ? `I = P / (230 V × pf ${input.powerFactor ?? 1})` : undefined },
    { label: "Correction factors", value: `ambient ${ca} × grouping ${cg}`, citation: `${CITATIONS.ambient}; ${CITATIONS.grouping}` },
  ];

  const breakerA = ring ? 32 : MCB_RATINGS.find((r) => r >= ib && (!lighting || r <= 16)) ?? null;
  if (breakerA == null) {
    return { ok: false, curve, designCurrentA: ib, answer: `${round(ib)} A is beyond a single-phase final circuit — call the engineer.`, steps };
  }
  steps.push({ label: "Breaker In", value: `${breakerA} A type ${curve}`, citation: CITATIONS.coordination });

  const limit = lighting ? VOLT_DROP_LIMIT.lighting : VOLT_DROP_LIMIT.other;
  for (const size of CABLE_SIZES) {
    if (size < PRACTICE_MIN_SIZE[input.kind]) continue;
    const iz = CAPACITY_4D1A[method][size] * ca * cg;
    const needed = ring ? 0.67 * breakerA : breakerA;
    if (iz < needed) continue;
    const vd = voltDrop(size, ib, input.lengthM, ring);
    if (vd.pct > limit) continue;
    steps.push(
      { label: "Cable capacity Iz", value: `${round(iz)} A (${size} mm², method ${method})`, citation: ring ? CITATIONS.ringFinal : CITATIONS.capacity },
      { label: "Voltage drop", value: `${round(vd.volts, 2)} V = ${round(vd.pct * 100)}% (limit ${limit * 100}%)`, citation: CITATIONS.voltDrop },
    );
    return {
      ok: true, cableSize: size, breakerA, curve, designCurrentA: ib, correctedCapacityA: iz,
      voltDropV: vd.volts, voltDropPct: vd.pct, steps,
      answer: `${size} mm² cable on a ${breakerA} A type ${curve} breaker — voltage drop ${round(vd.pct * 100)}% over ${input.lengthM} m.`,
    };
  }
  return {
    ok: false, breakerA, curve, designCurrentA: ib, steps,
    answer: `No standard cable up to 25 mm² meets ${breakerA} A over ${input.lengthM} m — shorten the run or split the load.`,
  };
}
