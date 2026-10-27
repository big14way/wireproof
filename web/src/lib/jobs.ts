import type { Board, Evidence } from "./rules";

export interface TraceTurn {
  n: number;
  plan: string;
  tool: string;
  args?: Record<string, unknown>;
  observation: string;
  model?: string;
  ms?: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  circuitId?: string;
  done: boolean;
}

export interface Job {
  id: string;
  title: string;
  address: string;
  stage: string;
  owner: { name: string; phone: string };
  electrician: { name: string; licence: string };
  createdAt: string;
  board: Board;
  checklist: ChecklistItem[];
  trace: TraceTurn[];
}

const spark = "muse-spark-1.3";
const e = (id: string, kind: Evidence["kind"], note: string, extra: Partial<Evidence> = {}): Evidence => ({
  id, kind, by: spark, note, ...extra,
});

// A first-fix wiring job in a three-bedroom bungalow, before plastering. The people and the cable
// brand are made up; the faults are the ones electricians and SON report most often.
const demo: Job = {
  id: "demo",
  title: "3-bedroom bungalow, first fix",
  address: "Ikorodu, Lagos",
  stage: "Conduits and cables in, walls not yet plastered",
  owner: { name: "Mrs Adeyemi (sample)", phone: "+234 ••• ••• 4471" },
  electrician: { name: "Tunde O. (sample)", licence: "NEMSA licence ••• 2291" },
  createdAt: "2026-10-30",
  board: {
    id: "db1",
    name: "Main distribution board",
    mainSwitch: { value: true, evidence: e("ev-board", "photo", "63 A double-pole main switch, top left", { confidence: 0.95 }) },
    rcdPresent: { value: false, evidence: e("ev-board", "photo", "No RCD or RCBO among the 5 devices", { confidence: 0.93 }) },
    spdPresent: { value: false },
    labelled: { value: false, evidence: e("ev-board", "photo", "No circuit labels on the cover", { confidence: 0.9 }) },
    circuits: [
      {
        id: "lighting", name: "Lighting, whole house", kind: "lighting", loadW: 320, lengthM: 28, designSize: 1.5,
        cable: {
          printedSize: { value: 1.5, evidence: e("ev-l1", "photo", "Sheath: “COPPERLINE 1.5mm² 450/750V NIS”", { confidence: 0.96 }) },
          brand: { value: "COPPERLINE" }, sonMark: { value: "NIS 1:2019" },
          magnetAttaches: { value: false, evidence: e("ev-l2", "clip", "Magnet does not move toward the conductor", { at: 2.1, confidence: 0.95 }) },
          cpcPresent: { value: true, evidence: e("ev-l3", "photo", "Green-and-yellow conductor in the conduit", { confidence: 0.92 }) },
          cpcSize: { value: 1.5 },
        },
        device: { value: { type: "MCB", ratingA: 10, curve: "B" }, evidence: e("ev-board", "photo", "Breaker 1: B10", { confidence: 0.91 }) },
        rcd30mA: { value: false }, domestic: true,
      },
      {
        id: "kitchen", name: "Kitchen sockets (ring)", kind: "sockets-ring", lengthM: 42, designSize: 2.5,
        cable: {
          printedSize: { value: 2.5, evidence: e("ev-k1", "photo", "Sheath: “COPPERLINE 2.5mm² 450/750V NIS”", { confidence: 0.97 }) },
          brand: { value: "COPPERLINE" }, sonMark: { value: "NIS 1:2019" },
          magnetAttaches: { value: false, evidence: e("ev-k2", "clip", "No attraction", { at: 1.4, confidence: 0.96 }) },
          cpcPresent: { value: true, evidence: e("ev-k3", "photo", "Earth conductor present at both ends of the ring", { confidence: 0.9 }) },
          cpcSize: { value: 2.5 },
        },
        device: { value: { type: "MCB", ratingA: 32, curve: "B" }, evidence: e("ev-board", "photo", "Breaker 2: B32", { confidence: 0.94 }) },
        rcd30mA: { value: false }, domestic: true,
      },
      {
        id: "ac-master", name: "Master bedroom AC (1.5 HP)", kind: "air-conditioner", loadW: 1200, powerFactor: 0.85, lengthM: 18, designSize: 2.5,
        cable: {
          printedSize: { value: 2.5, evidence: e("ev-a1", "photo", "Sheath: “COPPERLINE 2.5mm²”", { confidence: 0.95 }) },
          brand: { value: "COPPERLINE" }, sonMark: { value: "NIS 1:2019" },
          magnetAttaches: { value: false, evidence: e("ev-a2", "clip", "No attraction", { at: 1.8, confidence: 0.94 }) },
          cpcPresent: { value: true }, cpcSize: { value: 2.5 },
        },
        device: { value: { type: "MCB", ratingA: 20, curve: "C" }, evidence: e("ev-board", "photo", "Breaker 3: C20", { confidence: 0.93 }) },
        rcd30mA: { value: false }, domestic: true,
      },
      {
        id: "heater", name: "Bathroom water heater (3 kW)", kind: "water-heater", loadW: 3000, lengthM: 12, designSize: 2.5, servesBathroom: true,
        cable: {
          printedSize: { value: 2.5, evidence: e("ev-h1", "photo", "Sheath: “BRIGHTSTAR 2.5mm²”, no standard marking", { confidence: 0.88 }) },
          brand: { value: "BRIGHTSTAR (sample brand)" },
          magnetAttaches: { value: true, evidence: e("ev-h2", "clip", "Magnet snaps onto the conductor at 0:03", { at: 3.2, confidence: 0.97 }) },
          cpcPresent: { value: true }, cpcSize: { value: 1.5 },
        },
        device: { value: { type: "MCB", ratingA: 20, curve: "B" }, evidence: e("ev-board", "photo", "Breaker 4: B20", { confidence: 0.92 }) },
        rcd30mA: { value: false }, domestic: true,
      },
      {
        id: "pump", name: "Pumping machine (1 HP)", kind: "pump", loadW: 1050, powerFactor: 0.8, lengthM: 25, designSize: 2.5,
        cable: {
          printedSize: { value: 1.5, evidence: e("ev-p1", "photo", "Sheath reads 1.5mm² on a run quoted as 2.5mm²", { confidence: 0.93 }) },
          brand: { value: "COPPERLINE" }, sonMark: { value: "NIS 1:2019" },
          magnetAttaches: { value: false, evidence: e("ev-p2", "clip", "No attraction", { at: 1.1, confidence: 0.95 }) },
          cpcPresent: { value: false, evidence: e("ev-p3", "photo", "Only brown and blue conductors in this conduit", { confidence: 0.89 }) },
        },
        device: { value: { type: "MCB", ratingA: 20, curve: "C" }, evidence: e("ev-board", "photo", "Breaker 5: C20", { confidence: 0.92 }) },
        rcd30mA: { value: false }, domestic: true,
      },
    ],
  },
  checklist: [
    { id: "k1", label: "Photograph the distribution board, cover off", done: true },
    { id: "k2", label: "Read every breaker rating", done: true },
    { id: "k3", label: "Cable print for each circuit", done: true },
    { id: "k4", label: "Magnet test on each cable", done: true },
    { id: "k5", label: "Earth conductor visible in each conduit", done: true },
    { id: "k6", label: "Film every conduit run before plastering", done: false },
    { id: "k7", label: "Electrician confirms flagged items", done: false },
  ],
  trace: [
    { n: 1, plan: "See what was captured for this job before deciding anything.", tool: "list_media", observation: "14 photos, 6 clips, 3 voice notes across 5 circuits and 1 board.", ms: 40 },
    { n: 2, plan: "Turn the job into a checklist so nothing is skipped.", tool: "set_checklist", args: { circuits: 5, checks_per_circuit: 5 }, observation: "25 checks plus 4 board checks recorded.", ms: 12 },
    { n: 3, plan: "Read the board first: every circuit hangs off it.", tool: "read_board", args: { photo: "ev-board" }, observation: "Main switch 63 A. Breakers B10, B32, C20, B20, C20. No RCD or RCBO. No labels.", model: spark, ms: 4100 },
    { n: 4, plan: "Read the heater cable print; the brand is unfamiliar.", tool: "read_cable_print", args: { photo: "ev-h1" }, observation: "BRIGHTSTAR 2.5mm². No NIS or SON marking. Confidence 0.88.", model: spark, ms: 3600 },
    { n: 5, plan: "An unmarked cable needs the magnet test before anything else.", tool: "judge_magnet_clip", args: { clip: "ev-h2" }, observation: "Magnet attaches at 0:03 (confidence 0.97). Conductor is ferrous.", model: spark, ms: 5200 },
    { n: 6, plan: "The pump run was quoted as 2.5 mm²; check the print.", tool: "read_cable_print", args: { photo: "ev-p1" }, observation: "Sheath reads 1.5mm². Only brown and blue visible: no earth conductor.", model: spark, ms: 3900 },
    { n: 7, plan: "Map where each conduit runs before the walls are closed.", tool: "trace_conduit", args: { clip: "ev-wall", concept: "conduit" }, observation: "3 runs tracked; positions recorded in block courses (450 × 225 mm grid).", model: "sam-3.1", ms: 21000 },
    { n: 8, plan: "Readings are in. Let the rules decide, not me.", tool: "run_rules", args: { circuits: 5 }, observation: "Board FAIL. Circuits: 2 FAIL on cable, 5 need 30 mA RCD. Every flag cites a frame and a regulation.", ms: 8 },
    { n: 9, plan: "Hand the electrician the flags to confirm before the owner sees them.", tool: "request_confirmation", args: { flags: 9 }, observation: "Waiting for the electrician's confirmation.", ms: 5 },
  ],
};

const JOBS: Record<string, Job> = { demo };

export function getJob(id: string): Job | undefined {
  return JOBS[id];
}
