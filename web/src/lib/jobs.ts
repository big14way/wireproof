import type { Board, Evidence } from "./rules";

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
};

const JOBS: Record<string, Job> = { demo };

export function getJob(id: string): Job | undefined {
  return JOBS[id];
}
