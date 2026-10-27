// Reference data for the rules engine. Values follow BS 7671:2018 (IET Wiring Regulations),
// the basis of Nigerian wiring practice under NEMSA's NESIS rules. Every number carries the table it
// came from so a report can cite it. Verify against the printed tables before relying on a result.

export type CableSize = 1 | 1.5 | 2.5 | 4 | 6 | 10 | 16 | 25;
export const CABLE_SIZES: CableSize[] = [1, 1.5, 2.5, 4, 6, 10, 16, 25];

/** How the cable is installed, as BS 7671 Appendix 4 reference methods. */
export type InstallMethod = "A" | "B" | "C";

export const INSTALL_METHOD_LABEL: Record<InstallMethod, string> = {
  A: "In conduit in a thermally insulating wall",
  B: "In conduit in masonry or on a wall (typical chased block wall)",
  C: "Clipped direct to a surface",
};

/**
 * Current-carrying capacity It (A), single-core 70 °C thermoplastic (PVC) copper cables,
 * two cables single-phase a.c. — BS 7671 Table 4D1A, columns 2 (A), 4 (B) and 6 (C).
 */
export const CAPACITY_4D1A: Record<InstallMethod, Record<CableSize, number>> = {
  A: { 1: 11, 1.5: 14.5, 2.5: 19.5, 4: 26, 6: 34, 10: 46, 16: 61, 25: 80 },
  B: { 1: 13.5, 1.5: 17.5, 2.5: 24, 4: 32, 6: 41, 10: 57, 16: 76, 25: 101 },
  C: { 1: 15.5, 1.5: 20, 2.5: 27, 4: 37, 6: 47, 10: 65, 16: 87, 25: 114 },
};

/** Voltage drop (mV per amp per metre), two cables single-phase a.c. — BS 7671 Table 4D1B. */
export const VOLT_DROP_4D1B: Record<CableSize, number> = {
  1: 44, 1.5: 29, 2.5: 18, 4: 11, 6: 7.3, 10: 4.4, 16: 2.8, 25: 1.75,
};

/** Ambient temperature correction Ca for 70 °C thermoplastic insulation — BS 7671 Table 4B1. */
export const AMBIENT_4B1: [number, number][] = [
  [25, 1.03], [30, 1.0], [35, 0.94], [40, 0.87], [45, 0.79], [50, 0.71],
];

/** Grouping correction Cg, circuits bunched or enclosed together — BS 7671 Table 4C1, row 1. */
export const GROUPING_4C1: Record<number, number> = {
  1: 1.0, 2: 0.8, 3: 0.7, 4: 0.65, 5: 0.6, 6: 0.57, 7: 0.54, 8: 0.52, 9: 0.5,
};

/** Preferred ratings of BS EN 60898 circuit breakers (A). */
export const MCB_RATINGS = [6, 10, 16, 20, 25, 32, 40, 50, 63] as const;

/** Nominal supply voltage (V). Nigeria: 230 V single phase, 50 Hz. */
export const NOMINAL_VOLTAGE = 230;

/** Voltage-drop limits as a fraction of nominal — BS 7671 Appendix 4, 6.4 (public LV supply). */
export const VOLT_DROP_LIMIT = { lighting: 0.03, other: 0.05 } as const;

/** Typical Lagos ambient used when the job doesn't say otherwise (°C). */
export const DEFAULT_AMBIENT_C = 35;

export const CITATIONS = {
  capacity: "BS 7671 Table 4D1A",
  voltDrop: "BS 7671 Table 4D1B; Appendix 4 §6.4",
  ambient: "BS 7671 Table 4B1",
  grouping: "BS 7671 Table 4C1",
  coordination: "BS 7671 Reg. 433.1.1 (Ib ≤ In ≤ Iz)",
  ringFinal: "BS 7671 Appendix 15 (ring final: Iz ≥ 0.67 In)",
  rcdSockets: "BS 7671 Reg. 411.3.3 (30 mA RCD for socket-outlets ≤ 32 A)",
  rcdLighting: "BS 7671 Reg. 411.3.4 (30 mA RCD for domestic lighting circuits)",
  rcdConcealed: "BS 7671 Reg. 522.6.202 (cables concealed < 50 mm deep in a wall)",
  rcdBathroom: "BS 7671 Reg. 701.411.3.3 (all circuits serving a bathroom)",
  cpcPresent: "BS 7671 Reg. 411.3.1.1 (protective conductor to every point)",
  cpcSize: "BS 7671 Table 54.7 / Reg. 543.1.3",
  spd: "BS 7671 Section 443 (surge protection)",
  sonCable: "SON alerts on substandard cable (copper-coated iron/steel, high resistance)",
  isolation: "BS 7671 Reg. 537.1 (main switch / isolator)",
} as const;

export function ambientFactor(celsius: number): number {
  for (const [t, f] of AMBIENT_4B1) if (celsius <= t) return f;
  return AMBIENT_4B1[AMBIENT_4B1.length - 1][1];
}

export function groupingFactor(circuits: number): number {
  const n = Math.max(1, Math.round(circuits));
  return GROUPING_4C1[Math.min(n, 9)];
}
