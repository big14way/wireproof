import type { CableSize, InstallMethod } from "./tables";

/** Where a value came from. Every reading the AI makes points back at a frame the owner can see. */
export interface Evidence {
  id: string;
  kind: "photo" | "clip" | "voice" | "manual";
  /** Media URL or path, plus a timestamp for clips (seconds). */
  src?: string;
  at?: number;
  /** Which model produced the reading, or "electrician" for a manual entry. */
  by: string;
  confidence?: number;
  note?: string;
}

/** A value read from the job, with its evidence. */
export interface Reading<T> {
  value: T;
  evidence?: Evidence;
}

export type CircuitKind =
  | "lighting"
  | "sockets-radial"
  | "sockets-ring"
  | "air-conditioner"
  | "water-heater"
  | "cooker"
  | "pump"
  | "other";

export interface CableReading {
  /** Size printed on the cable sheath, mm². Empty when the print can't be read. */
  printedSize?: Reading<CableSize | null>;
  brand?: Reading<string>;
  /** SON registration / MANCAP number or NIS marking printed on the cable. */
  sonMark?: Reading<string>;
  /** Result of holding a magnet to the bare conductor. Copper does not attract a magnet. */
  magnetAttaches?: Reading<boolean>;
  /** Green-and-yellow protective conductor seen in the run. */
  cpcPresent?: Reading<boolean>;
  cpcSize?: Reading<CableSize | null>;
}

export interface ProtectiveDevice {
  type: "MCB" | "RCBO" | "fuse";
  ratingA: number;
  curve?: "B" | "C" | "D";
}

export interface Circuit {
  id: string;
  name: string;
  kind: CircuitKind;
  /** Design load in watts (nameplate or estimate). */
  loadW?: number;
  powerFactor?: number;
  /** Route length from the board to the furthest point, metres. For a ring, the whole ring. */
  lengthM: number;
  /** The cable size the circuit was designed for (what the electrician says / the drawing says). */
  designSize: CableSize;
  cable: CableReading;
  device?: Reading<ProtectiveDevice>;
  /** True when a 30 mA RCD or RCBO protects this circuit. */
  rcd30mA?: Reading<boolean>;
  method?: InstallMethod;
  /** Number of circuits sharing the same conduit (for grouping). */
  groupedWith?: number;
  ambientC?: number;
  /** Cable concealed in a wall less than 50 mm deep without earthed metal covering. */
  concealedShallow?: boolean;
  servesBathroom?: boolean;
  domestic?: boolean;
}

export interface Board {
  id: string;
  name: string;
  mainSwitch?: Reading<boolean>;
  rcdPresent?: Reading<boolean>;
  spdPresent?: Reading<boolean>;
  labelled?: Reading<boolean>;
  circuits: Circuit[];
}

export type Status = "pass" | "fail" | "warn" | "info";

export interface Finding {
  ruleId: string;
  status: Status;
  title: string;
  detail: string;
  /** What to do about it, in plain words for the electrician. */
  fix?: string;
  citation: string;
  evidence?: Evidence[];
  circuitId?: string;
}

export interface CircuitResult {
  circuit: Circuit;
  findings: Finding[];
  /** Worst status among the findings. */
  verdict: Status;
  numbers: {
    designCurrentA?: number;
    capacityA: number;
    correctedCapacityA: number;
    voltDropV?: number;
    voltDropPct?: number;
    factors: { ambient: number; grouping: number };
  };
}
