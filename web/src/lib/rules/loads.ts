import type { CircuitKind } from "./types";

/**
 * Typical input power for loads an electrician meets in a Nigerian home. Split air conditioners are
 * sold by compressor "horsepower"; input watts assume an efficiency of about 10 BTU/h per watt.
 * These are estimates for planning — the nameplate always wins.
 */
export const AC_INPUT_W_BY_HP: Record<string, number> = {
  "0.75": 700,
  "1": 850,
  "1.5": 1200,
  "2": 1800,
  "2.5": 2400,
  "3": 2900,
};

export interface LoadProfile {
  kind: CircuitKind;
  watts: number;
  powerFactor: number;
  /** Breaker trip curve that tolerates the start-up surge. */
  curve: "B" | "C";
  note: string;
}

export function airConditioner(hp: number): LoadProfile {
  const key = String(hp);
  const watts = AC_INPUT_W_BY_HP[key] ?? Math.round(hp * 800);
  return {
    kind: "air-conditioner",
    watts,
    powerFactor: 0.85,
    curve: "C",
    note: `${hp} HP split AC ≈ ${watts} W input; compressor start needs a C-curve breaker.`,
  };
}

export function pump(hp: number): LoadProfile {
  const watts = Math.round(hp * 1050);
  return {
    kind: "pump",
    watts,
    powerFactor: 0.8,
    curve: "C",
    note: `${hp} HP surface pump ("pumping machine") ≈ ${watts} W input; motors draw 5–7× at start.`,
  };
}

export function waterHeater(watts = 3000): LoadProfile {
  return { kind: "water-heater", watts, powerFactor: 1, curve: "B", note: `${watts} W heater element.` };
}

/** Cooker diversity from the IET On-Site Guide: 10 A + 30% of the remainder (+5 A with a socket). */
export function cookerDesignCurrent(watts: number, hasSocket = false, volts = 230): number {
  const full = watts / volts;
  const diversified = full <= 10 ? full : 10 + 0.3 * (full - 10);
  return diversified + (hasSocket ? 5 : 0);
}

/** Parse loose phrases like "1.5hp", "1.5 horsepower", "3kW", "2000 W" into a load profile. */
export function parseLoad(text: string): LoadProfile | null {
  const t = text.toLowerCase();
  const hp = t.match(/(\d+(?:\.\d+)?)\s*(?:hp|horse\s*power|horsepower)/);
  if (hp) {
    const n = Number(hp[1]);
    return /pump|pumping/.test(t) ? pump(n) : airConditioner(n);
  }
  const kw = t.match(/(\d+(?:\.\d+)?)\s*(?:kw|kilowatts?)\b/);
  const w = t.match(/(\d+(?:\.\d+)?)\s*(?:w|watts?)\b/);
  const watts = kw ? Number(kw[1]) * 1000 : w ? Number(w[1]) : null;
  if (watts == null) return null;
  if (/heater|geyser/.test(t)) return waterHeater(watts);
  return { kind: "other", watts, powerFactor: 1, curve: "B", note: `${watts} W load.` };
}
