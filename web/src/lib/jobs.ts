import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { DATA_DIR } from "./paths";
import { airConditioner, designCircuit, PRACTICE_MIN_SIZE, pump, type Board, type CableSize, type Circuit, type CircuitKind, type Evidence } from "./rules";

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

// ---------- Jobs an electrician starts on the phone ----------
// One JSON file per job under DATA_DIR/jobs, read once at first use and kept in memory; the case record and the
// captured media for it live beside the other jobs' under DATA_DIR/cases.

const JOBS_DIR = path.join(DATA_DIR, "jobs");
let saved: Map<string, Job> | null = null;

function savedJobs(): Map<string, Job> {
  if (saved) return saved;
  saved = new Map();
  try {
    for (const f of readdirSync(JOBS_DIR)) {
      if (!f.endsWith(".json")) continue;
      try {
        const j = JSON.parse(readFileSync(path.join(JOBS_DIR, f), "utf8")) as Job;
        saved.set(j.id, j);
      } catch {
        // a half-written file is skipped, not fatal
      }
    }
  } catch {
    // no jobs started on this machine yet
  }
  return saved;
}

export function getJob(id: string): Job | undefined {
  return JOBS[id] ?? savedJobs().get(id);
}

/** Every job on this machine, newest first; the demo last. */
export function listJobs(): Job[] {
  const mine = [...savedJobs().values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return [...mine, ...Object.values(JOBS)];
}

/** What an electrician can put on a new job's board. Loads and run lengths are typical starting values; the electrician corrects them by voice on site. */
export const CIRCUIT_TEMPLATES = {
  lighting: { name: "Lighting, whole house", kind: "lighting" as CircuitKind, loadW: 320, lengthM: 28 },
  "kitchen-ring": { name: "Kitchen sockets (ring)", kind: "sockets-ring" as CircuitKind, lengthM: 42 },
  "sockets-radial": { name: "Bedroom sockets", kind: "sockets-radial" as CircuitKind, lengthM: 30 },
  ac: { name: "Air conditioner", kind: "air-conditioner" as CircuitKind, lengthM: 18, param: "hp" as const },
  heater: { name: "Water heater", kind: "water-heater" as CircuitKind, lengthM: 12, param: "kw" as const },
  pump: { name: "Pumping machine", kind: "pump" as CircuitKind, lengthM: 25, param: "hp" as const },
  cooker: { name: "Cooker", kind: "cooker" as CircuitKind, loadW: 6000, lengthM: 15 },
} as const;
export type TemplateId = keyof typeof CIRCUIT_TEMPLATES;

export interface NewJobInput {
  title: string;
  address: string;
  owner: { name: string; phone: string };
  electrician: { name: string; licence: string };
  /** Each circuit on the board: a template plus its size (HP for an AC or pump, kW for a heater) and an optional room name. */
  circuits: { template: TemplateId; size?: number; label?: string }[];
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "job";
const clean = (s: unknown, max = 80) => String(s ?? "").trim().slice(0, max);

/** Build the job from the templates: the design size per circuit comes from the same rules the checks use. */
export function createJob(input: NewJobInput): Job {
  const title = clean(input.title) || "New job";
  const id = `${slug(title)}-${randomBytes(2).toString("hex")}`;
  const counts: Record<string, number> = {};
  const circuits: Circuit[] = input.circuits.slice(0, 16).map((c) => {
    const t = CIRCUIT_TEMPLATES[c.template];
    if (!t) throw new Error(`Unknown circuit template: ${c.template}`);
    const n = (counts[c.template] = (counts[c.template] ?? 0) + 1);
    const size = Number(c.size) || undefined;
    let loadW: number | undefined = "loadW" in t ? t.loadW : undefined;
    let powerFactor: number | undefined;
    let name = clean(c.label, 40) ? `${clean(c.label, 40)} ${t.name.toLowerCase()}` : t.name;
    if ("param" in t && t.param === "hp" && size) {
      const p = t.kind === "pump" ? pump(size) : airConditioner(size);
      loadW = p.watts; powerFactor = p.powerFactor; name = `${name} (${size} HP)`;
    } else if ("param" in t && t.param === "kw" && size) {
      loadW = Math.round(size * 1000); name = `${name} (${size} kW)`;
    }
    const designed = loadW ? designCircuit({ kind: t.kind, loadW, powerFactor, lengthM: t.lengthM }) : undefined;
    const designSize: CableSize = designed?.cableSize ?? PRACTICE_MIN_SIZE[t.kind];
    return {
      id: n > 1 ? `${c.template}-${n}` : c.template, name, kind: t.kind, loadW, powerFactor, lengthM: t.lengthM, designSize,
      cable: {}, domestic: true,
    };
  });
  if (!circuits.length) throw new Error("Pick at least one circuit");
  const job: Job = {
    id, title, address: clean(input.address) || "Address not given", stage: "First fix: conduits and cables in, walls not yet plastered",
    owner: { name: clean(input.owner?.name) || "Owner", phone: clean(input.owner?.phone, 24) },
    electrician: { name: clean(input.electrician?.name) || "Electrician", licence: clean(input.electrician?.licence, 40) },
    createdAt: new Date().toISOString().slice(0, 10),
    board: { id: "db1", name: "Main distribution board", circuits },
    checklist: [
      { id: "k1", label: "Photograph the distribution board, cover off", done: false },
      { id: "k2", label: "Cable print and magnet test for each circuit", done: false },
      { id: "k3", label: "Earth conductor visible in each conduit", done: false },
      { id: "k4", label: "Film every conduit run before plastering", done: false },
      { id: "k5", label: "Electrician confirms the report", done: false },
    ],
  };
  if (!existsSync(JOBS_DIR)) mkdirSync(JOBS_DIR, { recursive: true });
  writeFileSync(path.join(JOBS_DIR, `${id}.json`), JSON.stringify(job, null, 1));
  savedJobs().set(id, job);
  return job;
}
