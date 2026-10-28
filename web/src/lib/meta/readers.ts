import "server-only";
import { CABLE_SIZES, MCB_RATINGS, type CableReading, type CableSize, type Evidence, type ProtectiveDevice } from "@/lib/rules";
import { sparkJSON, type Media } from "./client";

const S = { type: "string" } as const;
const B = { type: "boolean" } as const;
const N = { type: "number" } as const;
const obj = (properties: Record<string, object>) => ({
  type: "object", additionalProperties: false, required: Object.keys(properties), properties,
});

const evidenceId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** A model answer is only "verified" when deterministic checks agree with it; otherwise ask for a reshoot. */
export interface Checked<T> {
  value: T;
  verified: boolean;
  problems: string[];
  evidence: Evidence;
  raw: unknown;
}

// ---------- Cable print ----------

const CABLE_PROMPT = `You are reading the printed marking on the sheath of an electrical cable in a photo taken on a building site.
Copy the printed text exactly as it appears in print_text. Then report the conductor size in mm² (for example "2.5"),
the number of cores, the brand, any SON registration number, and any standard marked (such as NIS, BS 6004 or IEC 60227).
Use an empty string for anything you cannot read clearly. Do not guess from colour or thickness: only from printed text.
confidence is your confidence from 0 to 1 that print_text is read correctly.`;

const CABLE_SCHEMA = obj({
  print_text: S, size_mm2: S, cores: S, brand: S, son_number: S, standard: S, legible: B, confidence: N,
});

interface CableRaw { print_text: string; size_mm2: string; cores: string; brand: string; son_number: string; standard: string; legible: boolean; confidence: number }

export async function readCable(media: Media): Promise<Checked<CableReading>> {
  const r = await sparkJSON<CableRaw>({ prompt: CABLE_PROMPT, media, schema: CABLE_SCHEMA, name: "cable_print" });
  const d = r.data;
  const evidence: Evidence = { id: evidenceId("ev-cable"), kind: media.kind === "image" ? "photo" : "clip", by: r.model, confidence: d.confidence, note: d.print_text ? `“${d.print_text}”` : "No legible print" };
  const problems: string[] = [];

  const size = Number(d.size_mm2.replace(/[^\d.]/g, ""));
  const known = CABLE_SIZES.includes(size as CableSize);
  if (!d.size_mm2) problems.push("No size printed or readable.");
  else if (!known) problems.push(`“${d.size_mm2}” is not a standard cable size.`);
  // The size must literally appear in the copied print, or the model is guessing.
  if (known && d.print_text && !new RegExp(`\\b${String(size).replace(".", "[.,]")}\\s*(mm|sq|²)`, "i").test(d.print_text)) {
    problems.push("The size is not in the copied print text.");
  }
  if (d.confidence < 0.6) problems.push("Low confidence: film the print closer and in better light.");

  return {
    value: {
      printedSize: { value: known ? (size as CableSize) : null, evidence },
      brand: d.brand ? { value: d.brand, evidence } : undefined,
      sonMark: d.son_number || d.standard ? { value: [d.son_number, d.standard].filter(Boolean).join(" · "), evidence } : undefined,
    },
    verified: problems.length === 0 && d.legible,
    problems,
    evidence,
    raw: d,
  };
}

// ---------- Magnet test ----------

const MAGNET_PROMPT = `This short clip shows a magnet being held against the bare metal conductor of an electrical cable.
Copper and aluminium are not attracted to a magnet; iron and steel are. Decide whether the magnet visibly sticks to, snaps onto,
or pulls the conductor. If the magnet never touches the bare conductor, set touched to false.
Give the time in seconds when it sticks (or -1), and describe what you saw in one sentence.`;

const MAGNET_SCHEMA = obj({ touched: B, magnet_attaches: B, at_seconds: N, confidence: N, observation: S });
interface MagnetRaw { touched: boolean; magnet_attaches: boolean; at_seconds: number; confidence: number; observation: string }

export async function readMagnet(media: Media): Promise<Checked<boolean | null>> {
  const r = await sparkJSON<MagnetRaw>({ prompt: MAGNET_PROMPT, media, schema: MAGNET_SCHEMA, name: "magnet_test" });
  const d = r.data;
  const evidence: Evidence = { id: evidenceId("ev-magnet"), kind: "clip", by: r.model, confidence: d.confidence, at: d.at_seconds >= 0 ? d.at_seconds : undefined, note: d.observation };
  const problems: string[] = [];
  if (!d.touched) problems.push("The magnet never touched the bare conductor: strip the end and repeat.");
  if (d.confidence < 0.7) problems.push("Unclear result: repeat the test closer to the camera.");
  return { value: d.touched ? d.magnet_attaches : null, verified: problems.length === 0, problems, evidence, raw: d };
}

// ---------- Distribution board ----------

const BOARD_PROMPT = `This is a photo of an electrical distribution board (consumer unit or breaker panel) with the cover off.
List every protective device from left to right (top row first). For each: copy all the text printed on the device itself
into printed_text (exactly, e.g. "C20 20A 6000"), then give its type (MCB, RCD, RCBO, isolator/main switch, fuse, SPD or unknown),
its current rating in amps (0 if unreadable), its trip curve letter if printed (B, C or D, otherwise empty), any RCD sensitivity
in mA (0 if none), and the circuit label if one is written next to it.
Also say whether a main switch, an RCD or RCBO, a surge protection device and an earth bar are visible, and whether circuits are labelled.`;

const DEVICE = obj({ printed_text: S, type: S, rating_a: N, curve: S, sensitivity_ma: N, label: S });
const BOARD_SCHEMA = obj({
  devices: { type: "array", items: DEVICE },
  main_switch_visible: B, rcd_visible: B, spd_visible: B, earth_bar_visible: B, labelled: B, confidence: N,
});
interface DeviceRaw { printed_text: string; type: string; rating_a: number; curve: string; sensitivity_ma: number; label: string }
interface BoardRaw { devices: DeviceRaw[]; main_switch_visible: boolean; rcd_visible: boolean; spd_visible: boolean; earth_bar_visible: boolean; labelled: boolean; confidence: number }

export interface BoardReading {
  devices: (ProtectiveDevice & { kind: string; label: string; sensitivityMA: number; position: number })[];
  mainSwitch: boolean;
  rcd: boolean;
  spd: boolean;
  earthBar: boolean;
  labelled: boolean;
}

export async function readBoard(media: Media): Promise<Checked<BoardReading>> {
  const r = await sparkJSON<BoardRaw>({ prompt: BOARD_PROMPT, media, schema: BOARD_SCHEMA, name: "distribution_board" });
  const d = r.data;
  const problems: string[] = [];
  const devices = d.devices.map((x, i) => {
    const kind = x.type.toUpperCase();
    const type: ProtectiveDevice["type"] = kind.includes("RCBO") ? "RCBO" : kind.includes("FUSE") ? "fuse" : "MCB";
    const curve = (["B", "C", "D"].includes(x.curve.toUpperCase()) ? x.curve.toUpperCase() : undefined) as ProtectiveDevice["curve"];
    if ((kind.includes("MCB") || kind.includes("RCBO")) && x.rating_a > 0 && !(MCB_RATINGS as readonly number[]).includes(x.rating_a)) {
      problems.push(`Device ${i + 1}: ${x.rating_a} A is not a standard breaker rating.`);
    }
    if ((kind.includes("MCB") || kind.includes("RCBO")) && x.rating_a === 0) problems.push(`Device ${i + 1}: rating unreadable.`);
    // Cross-check the rating against the text copied off the device: a breaker marked "B20" and "30A" is ambiguous.
    const amps = new Set([...x.printed_text.toUpperCase().matchAll(/\b(?:[BCD](\d{1,3})|(\d{1,3})\s?A)\b/g)].map((m) => Number(m[1] ?? m[2])));
    if (amps.size > 1) problems.push(`Device ${i + 1}: printed text shows ${[...amps].map((a) => `${a} A`).join(" and ")}; check the breaker by eye.`);
    else if (x.rating_a > 0 && amps.size === 1 && !amps.has(x.rating_a)) problems.push(`Device ${i + 1}: rating ${x.rating_a} A is not in its printed text.`);
    return { position: i + 1, kind, type, ratingA: x.rating_a, curve, sensitivityMA: x.sensitivity_ma, label: x.label };
  });
  const rcdSeen = devices.some((x) => x.kind.includes("RCD") || x.kind.includes("RCBO") || x.sensitivityMA > 0);
  if (d.rcd_visible !== rcdSeen) problems.push("RCD answer disagrees with the device list.");
  if (devices.length === 0) problems.push("No devices found: photograph the board front-on with the cover off.");
  if (d.confidence < 0.6) problems.push("Low confidence: take the photo closer and straighter.");

  const evidence: Evidence = {
    id: evidenceId("ev-board"), kind: "photo", by: r.model, confidence: d.confidence,
    note: devices.map((x) => `${x.kind} ${x.curve ?? ""}${x.ratingA || "?"}A`).join(", ") || "No devices read",
  };
  return {
    value: { devices, mainSwitch: d.main_switch_visible, rcd: rcdSeen, spd: d.spd_visible, earthBar: d.earth_bar_visible, labelled: d.labelled },
    verified: problems.length === 0,
    problems,
    evidence,
    raw: d,
  };
}
