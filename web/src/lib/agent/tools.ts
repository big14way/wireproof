import "server-only";
import { MetaApiError, SAM, SPARK } from "@/lib/meta/client";
import { gateConfigured, type GateResult } from "@/lib/meta/gatemodel";
import { guarded } from "@/lib/meta/guard";
import { editImage, MUSE_IMAGE, RENDERS } from "@/lib/meta/image";
import { readBoard, readCable, readMagnet } from "@/lib/meta/readers";
import { traceWall } from "@/lib/meta/sam";
import { CABLE_SIZES, checkCircuit, designCircuit, MCB_RATINGS, parseLoad, type CableSize, type Circuit, type CircuitKind, type Evidence } from "@/lib/rules";
import { summariseBoard } from "@/lib/summary";
import { addEvidence, addMedia, mediaDataUrl, mediaUrl, wallFindings } from "./case";
import type { CaseRecord, MediaRef, Run, Turn } from "./types";
import { canTick, checkNumbers, numbersIn, saidNumber } from "./verify";

export interface ToolContext {
  c: CaseRecord;
  run: Run;
}

export interface ToolResult {
  ok: boolean;
  observation: string;
  evidenceId?: string;
  verified?: boolean;
  model?: string;
  gate?: Turn["gate"];
}

/** A refusal or a bad argument. The message goes back to the model so it can ask the electrician. */
class ToolError extends Error {}

const S = { type: "string" } as const;
const KINDS: CircuitKind[] = ["lighting", "sockets-radial", "sockets-ring", "air-conditioner", "water-heater", "cooker", "pump", "other"];

const fn = (name: string, description: string, properties: Record<string, object>) => ({
  type: "function", name, description, strict: true,
  parameters: {
    type: "object", additionalProperties: false, required: ["why", ...Object.keys(properties)],
    properties: { why: { type: "string", description: "A few words: why this step, now." }, ...properties },
  },
});

export const TOOLS = [
  fn("read_cable_print", "Read the size, brand and standard printed on a cable sheath in a photo, for one circuit. Code verifies the reading; an unverified reading is kept as evidence but does not change the circuit.", {
    media_id: { type: "string", description: "Photo id, e.g. m3" }, circuit_id: S,
  }),
  fn("read_board", "Read every device on a photo of the distribution board with the cover off. Numbers each device by position for assign_breaker.", {
    media_id: { type: "string", description: "Photo id" },
  }),
  fn("correct_board_device", "Apply the electrician's correction to one device on the latest board reading, after they checked it by eye. Use it when a board reading is NOT VERIFIED because a rating is unclear. The position and rating must be what they said.", {
    position: { type: "integer" }, rating_a: { type: "integer" }, curve: { type: "string", enum: ["B", "C", "D", ""], description: "Trip curve letter if they said it, else empty" },
  }),
  fn("magnet_test", "Judge a clip of a magnet held to the bare conductor: copper does not attract a magnet. A hands-on test, so it is refused unless the breaker is confirmed off.", {
    media_id: { type: "string", description: "Clip id" }, circuit_id: S,
  }),
  fn("map_wall", "Map the conduit runs in a photo of a chased wall before plaster: SAM 3.1 traces the runs on the block grid and the rules check the safe zones. Also renders the wall plastered, for the owner's X-ray.", {
    media_id: { type: "string", description: "Photo id" },
  }),
  fn("assign_breaker", "Record which breaker on the board (position number from the latest board read) feeds a circuit. Only when the electrician said the position, or the device's label names the circuit.", {
    circuit_id: S, position: { type: "integer" },
  }),
  fn("record_observation", "Record something the electrician says they checked: whether the green-and-yellow earth conductor is in the run, its size, the run length, or the load. The value must be what they said.", {
    circuit_id: S,
    field: { type: "string", enum: ["earth_present", "earth_size_mm2", "run_length_m", "load"] },
    value: { type: "string", description: 'earth_present: "yes" or "no". Otherwise the number as said, with its unit: "2.5", "25 m", "1.5 HP".' },
  }),
  fn("check_circuit", "Run the BS 7671 rules on one circuit using only the verified readings in the case. Returns the verdict and every failed or missing check.", {
    circuit_id: S,
  }),
  fn("size_cable", "Size a new circuit with the rules engine: cable, breaker and voltage drop. Pass the load and run length exactly as the electrician said them.", {
    kind: { type: "string", enum: KINDS },
    load: { type: "string", description: 'As said, e.g. "1.5 HP", "3 kW", "1200 W". Empty for sockets and lighting.' },
    length_m: { type: "number" },
  }),
  fn("tick_checklist", "Tick a checklist item, citing the evidence ids that prove it. Code checks the evidence and refuses a tick without proof.", {
    item_id: S, evidence_ids: { type: "array", items: S },
  }),
  fn("submit_memo", "Draft the homeowner's memo from the case. Code adds the verdict, the fixes and the open checks; you write a short plain summary. It stays UNVERIFIED until the electrician confirms it in the app.", {
    summary: S,
  }),
];

const circuitOf = (c: CaseRecord, id: unknown): Circuit => {
  const k = c.board.circuits.find((x) => x.id === id);
  if (!k) throw new ToolError(`No circuit "${id}". Circuits: ${c.board.circuits.map((x) => x.id).join(", ")}.`);
  return k;
};

const mediaOf = (c: CaseRecord, id: unknown, kind: MediaRef["kind"]): MediaRef => {
  const m = c.media.find((x) => x.id === id);
  if (!m) throw new ToolError(`No media "${id}". Media: ${c.media.map((x) => x.id).join(", ") || "none yet"}.`);
  if (m.kind !== kind) throw new ToolError(`${m.id} is a ${m.kind}; this tool needs a ${kind}.`);
  return m;
};

const gateInfo = (g: GateResult): Turn["gate"] => (g.status === "off" ? { status: "off" } : { status: g.status, reasons: g.reasons, ms: g.ms, name: g.name });
const device = (d: { curve?: string; ratingA: number }) => `${d.curve ?? ""}${d.ratingA || "?"} A`;

/** Numbers the case already holds: design lengths and loads. A sizing question about an existing circuit may use them. */
const caseNumber = (c: CaseRecord, n: number) => c.board.circuits.some((k) => k.lengthM === n || k.loadW === n);

/** Does a board label name this circuit? "AC" matches "Master bedroom AC", "LIGHTS" matches "Lighting". */
function labelNames(label: string, k: Circuit): boolean {
  const target = `${k.name} ${k.id} ${k.kind}`.toLowerCase();
  return label.toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 2)
    .some((w) => (w.length >= 5 ? target.includes(w.slice(0, 5)) : new RegExp(`\\b${w}\\b`).test(target)));
}

async function readCablePrint({ c }: ToolContext, a: Record<string, unknown>): Promise<ToolResult> {
  const k = circuitOf(c, a.circuit_id);
  const m = mediaOf(c, a.media_id, "photo");
  const dataUrl = await mediaDataUrl(c, m);
  const { result: r, gate } = await guarded({ route: "agent/read_cable_print", model: SPARK, media: dataUrl, expected: "cable_print" }, () => readCable({ kind: "image", dataUrl }));
  const print = (r.raw as { print_text: string }).print_text;
  const summary = print
    ? `“${print}” → ${r.value.printedSize?.value ?? "?"} mm², ${r.value.brand?.value ?? "brand unreadable"}, ${r.value.sonMark?.value ?? "no standard marking"}`
    : "No legible print";
  const ev = addEvidence(c, { tool: "read_cable_print", by: r.evidence.by, mediaId: m.id, circuitId: k.id, summary, verified: r.verified, problems: r.problems, proves: r.verified ? [`cable:${k.id}`] : [] });
  if (r.verified) {
    const evidence: Evidence = { ...r.evidence, id: ev.id, src: mediaUrl(c.jobId, m.id) };
    k.cable = {
      ...k.cable,
      printedSize: { value: r.value.printedSize!.value, evidence },
      brand: r.value.brand && { value: r.value.brand.value, evidence },
      sonMark: r.value.sonMark && { value: r.value.sonMark.value, evidence },
    };
  }
  return {
    ok: true, evidenceId: ev.id, verified: r.verified, model: r.evidence.by, gate: gateInfo(gate),
    observation: `${r.verified ? "VERIFIED" : "NOT VERIFIED"} [${ev.id}] ${summary}.${r.problems.length ? ` Problems: ${r.problems.join(" ")}` : ""} ${r.verified ? `Recorded on ${k.id}.` : "Not recorded: ask for a better photo."}`,
  };
}

async function readBoardPhoto({ c }: ToolContext, a: Record<string, unknown>): Promise<ToolResult> {
  const m = mediaOf(c, a.media_id, "photo");
  const dataUrl = await mediaDataUrl(c, m);
  const { result: r, gate } = await guarded({ route: "agent/read_board", model: SPARK, media: dataUrl, expected: "distribution_board" }, () => readBoard({ kind: "image", dataUrl }));
  const v = r.value;
  const list = v.devices.map((d) => `#${d.position} ${d.kind} ${device(d)}${d.sensitivityMA ? ` ${d.sensitivityMA} mA` : ""}${d.label ? ` "${d.label}"` : ""}`).join("; ");
  const summary = `${list || "no devices"}. Main switch ${v.mainSwitch ? "yes" : "no"}, RCD ${v.rcd ? "yes" : "no"}, surge protection ${v.spd ? "yes" : "no"}, labels ${v.labelled ? "yes" : "no"}`;
  const ev = addEvidence(c, { tool: "read_board", by: r.evidence.by, mediaId: m.id, summary, verified: r.verified, problems: r.problems, proves: r.verified ? ["board"] : [] });
  c.boardRead = { evidenceId: ev.id, by: r.evidence.by, devices: v.devices, mainSwitch: v.mainSwitch, rcd: v.rcd, spd: v.spd, labelled: v.labelled, verified: r.verified, problems: r.problems };
  if (r.verified) applyBoard(c, { ...r.evidence, id: ev.id, src: mediaUrl(c.jobId, m.id) });
  return {
    ok: true, evidenceId: ev.id, verified: r.verified, model: r.evidence.by, gate: gateInfo(gate),
    observation: `${r.verified ? "VERIFIED" : "NOT VERIFIED"} [${ev.id}] ${summary}.${r.problems.length ? ` Problems: ${r.problems.join(" ")}` : ""}`,
  };
}

/** A verified board reading becomes the board's record. */
function applyBoard(c: CaseRecord, evidence: Evidence) {
  const b = c.boardRead!;
  c.board.mainSwitch = { value: b.mainSwitch, evidence };
  c.board.rcdPresent = { value: b.rcd, evidence };
  c.board.spdPresent = { value: b.spd, evidence };
  c.board.labelled = { value: b.labelled, evidence };
}

function correctBoardDevice({ c, run }: ToolContext, a: Record<string, unknown>): ToolResult {
  const b = c.boardRead;
  if (!b) throw new ToolError("No board reading to correct. Ask for a photo of the board with the cover off.");
  const position = Number(a.position);
  const rating = Number(a.rating_a);
  const curve = String(a.curve ?? "").toUpperCase();
  const d = b.devices.find((x) => x.position === position);
  if (!d) throw new ToolError(`No device at position ${position}. Positions: ${b.devices.map((x) => x.position).join(", ")}.`);
  if (!saidNumber(run.said, position) || !saidNumber(run.said, rating)) throw new ToolError(`The electrician didn't say device ${position} is ${rating} A. Ask them to check it by eye.`);
  if (!(MCB_RATINGS as readonly number[]).includes(rating)) throw new ToolError(`${rating} A is not a standard breaker rating. Ask them to read it again.`);
  if (curve && !new RegExp(`\\b${curve}\\s?${rating}\\b|\\btype ${curve}\\b|\\b${curve} curve\\b`, "i").test(run.said)) throw new ToolError(`The electrician didn't say curve ${curve}. Leave curve empty or ask.`);
  d.ratingA = rating;
  if (curve) d.curve = curve as "B" | "C" | "D";
  b.problems = b.problems.filter((p) => !p.startsWith(`Device ${position}:`));
  const nowVerified = !b.verified && b.problems.length === 0;
  const ev = addEvidence(c, {
    tool: "correct_board_device", by: "electrician", mediaId: c.evidence.find((e) => e.id === b.evidenceId)?.mediaId, summary: `Board #${position} checked by eye: ${device(d)}: “${run.said}”`,
    verified: true, problems: [], proves: nowVerified ? ["board"] : [],
  });
  if (nowVerified) {
    b.verified = true;
    applyBoard(c, { id: ev.id, kind: "photo", by: `${b.by} + electrician`, note: `Board read ${b.evidenceId}, corrected by eye`, src: ev.mediaId && mediaUrl(c.jobId, ev.mediaId) });
  }
  const state = b.verified ? (nowVerified ? "The board reading is now VERIFIED." : "") : `Still NOT VERIFIED: ${b.problems.join(" ")}`;
  return { ok: true, evidenceId: ev.id, verified: true, observation: `[${ev.id}] #${position} set to ${device(d)}. ${state}`.trim() };
}

async function magnetTest({ c, run }: ToolContext, a: Record<string, unknown>): Promise<ToolResult> {
  if (!run.breakerOff) {
    throw new ToolError("Refused: the breaker is not confirmed off, and a magnet test means touching the bare conductor. Ask the electrician to switch off and lock the breaker, tick the box in the app, then film the test again.");
  }
  const k = circuitOf(c, a.circuit_id);
  const m = mediaOf(c, a.media_id, "clip");
  const poster = m.posterId ? c.media.find((x) => x.id === m.posterId) : undefined;
  if (!poster && gateConfigured()) throw new ToolError(`${m.id} has no still for the privacy gate to check, so it can't be sent. Film the test again from the app.`);
  const clip = await mediaDataUrl(c, m);
  const judge = () => readMagnet({ kind: "video", dataUrl: clip });
  // The gate reads stills, so it checks a frame from the clip; the clip itself goes to Muse Spark.
  const { result: r, gate } = poster
    ? await guarded({ route: "agent/magnet_test", model: SPARK, media: await mediaDataUrl(c, poster), expected: "cable_print" }, judge)
    : { result: await judge(), gate: { status: "off" } as GateResult };
  const at = r.evidence.at != null ? ` at ${r.evidence.at} s` : "";
  const summary = `${r.value === true ? `Magnet sticks${at}: NOT copper` : r.value === false ? "No attraction: copper" : "Inconclusive"}. ${r.evidence.note ?? ""}`.trim();
  const ev = addEvidence(c, { tool: "magnet_test", by: r.evidence.by, mediaId: m.id, circuitId: k.id, summary, verified: r.verified, problems: r.problems, proves: r.verified ? [`magnet:${k.id}`] : [] });
  if (r.verified && r.value != null) k.cable = { ...k.cable, magnetAttaches: { value: r.value, evidence: { ...r.evidence, id: ev.id, src: mediaUrl(c.jobId, m.id) } } };
  return {
    ok: true, evidenceId: ev.id, verified: r.verified, model: r.evidence.by, gate: gateInfo(gate),
    observation: `${r.verified ? "VERIFIED" : "NOT VERIFIED"} [${ev.id}] ${summary}${r.problems.length ? ` Problems: ${r.problems.join(" ")}` : ""}`,
  };
}

async function mapWall({ c }: ToolContext, a: Record<string, unknown>): Promise<ToolResult> {
  const m = mediaOf(c, a.media_id, "photo");
  const dataUrl = await mediaDataUrl(c, m);
  // SAM traces while Muse Image plasters the same photo; a failed render never costs the map.
  const { result: [t, render], gate } = await guarded({ route: "agent/map_wall", model: `${SAM} + ${MUSE_IMAGE}`, media: dataUrl, expected: "chased_wall" }, () =>
    Promise.all([
      traceWall(dataUrl),
      editImage(dataUrl, RENDERS["wall-plastered"]).catch((e: Error) => {
        console.warn("wall render failed:", e.message);
        return null;
      }),
    ]));
  const { map } = t;
  const problems: string[] = [];
  if (!map.calibrated) problems.push("Fewer than three whole blocks found: photograph the wall front-on with whole blocks around the conduit.");
  if (!map.runs.length) problems.push("No conduit runs found: get the whole run in frame, in good light.");
  const verified = problems.length === 0;
  const fails = map.findings.filter((f) => f.status === "fail");
  const id = `w${(c.walls?.length ?? 0) + 1}`;
  const summary = `Wall ${id}: ${map.runs.length} runs (${map.runs.map((r) => `${r.id} ${r.orientation} ${r.lengthCm} ${map.calibrated ? "cm" : "px"}`).join("; ") || "none"}). ${fails.length ? fails.map((f) => f.title).join("; ") : "Every run in the safe zones"}`;
  const ev = addEvidence(c, { tool: "map_wall", by: SAM, mediaId: m.id, summary, verified, problems, proves: verified ? ["walls"] : [] });
  const rendered = render ? await addMedia(c, render.dataUrl, { generated: true }) : undefined;
  (c.walls ??= []).push({ id, mediaId: m.id, renderMediaId: rendered?.id, evidenceId: ev.id, width: t.width, height: t.height, map });
  return {
    ok: true, evidenceId: ev.id, verified, model: SAM, gate: gateInfo(gate),
    observation: `${verified ? "VERIFIED" : "NOT VERIFIED"} [${ev.id}] ${summary}.${map.calibrated ? ` Calibrated on ${map.blocksUsed} blocks.` : ""}${problems.length ? ` Problems: ${problems.join(" ")}` : ""} ${rendered ? "Plastered render saved for the owner's X-ray." : "No render this time."}`,
  };
}

function assignBreaker({ c, run }: ToolContext, a: Record<string, unknown>): ToolResult {
  const k = circuitOf(c, a.circuit_id);
  if (!c.boardRead) throw new ToolError("No board reading yet. Ask for a photo of the board with the cover off.");
  if (!c.boardRead.verified) throw new ToolError(`The board reading is not verified: ${c.boardRead.problems.join(" ")} Resolve that first.`);
  const d = c.boardRead.devices.find((x) => x.position === Number(a.position));
  if (!d) throw new ToolError(`No device at position ${a.position}. Positions: ${c.boardRead.devices.map((x) => x.position).join(", ")}.`);
  if (!/MCB|RCBO|FUSE/.test(d.kind) || d.ratingA <= 0) throw new ToolError(`#${d.position} is a ${d.kind}, not a circuit breaker.`);
  const said = saidNumber(run.said, d.position);
  if (!said && !(d.label && labelNames(d.label, k))) {
    throw new ToolError(`The electrician didn't say breaker ${d.position} feeds ${k.id}, and its label doesn't name it. Ask which breaker feeds ${k.name}.`);
  }
  const ev = addEvidence(c, {
    tool: "assign_breaker", by: said ? "electrician" : `board label, read by ${c.boardRead.by}`, circuitId: k.id,
    summary: `Breaker #${d.position} (${device(d)}) feeds ${k.name}${said ? `: “${run.said}”` : `: labelled “${d.label}”`}`,
    verified: true, problems: [], proves: [`breaker:${k.id}`],
  });
  const boardPhoto = c.evidence.find((e) => e.id === c.boardRead!.evidenceId)?.mediaId;
  const evidence: Evidence = { id: ev.id, kind: "photo", by: c.boardRead.by, note: `Breaker #${d.position}: ${device(d)}`, src: boardPhoto && mediaUrl(c.jobId, boardPhoto) };
  k.device = { value: { type: d.type, ratingA: d.ratingA, curve: d.curve }, evidence };
  // An RCBO protects its own circuit. A plain MCB is covered only if the board has an RCD; on a split board that
  // depends on which side it sits, so leave it unconfirmed rather than guess.
  k.rcd30mA = d.type === "RCBO" || d.sensitivityMA > 0 ? { value: true, evidence } : c.board.rcdPresent?.value === false ? { value: false, evidence } : undefined;
  const twice = c.evidence.find((e) => e.tool === "assign_breaker" && e.circuitId !== k.id && e.summary.startsWith(`Breaker #${d.position} `));
  return { ok: true, evidenceId: ev.id, verified: true, observation: `[${ev.id}] ${ev.summary}.${twice ? ` Note: #${d.position} was also given to ${twice.circuitId}.` : ""}` };
}

function recordObservation({ c, run }: ToolContext, a: Record<string, unknown>): ToolResult {
  const k = circuitOf(c, a.circuit_id);
  const v = String(a.value ?? "").trim();
  const n = numbersIn(v)[0];
  const proves: string[] = [];
  let apply: (evidence: Evidence) => void;

  if (a.field === "earth_present") {
    if (!/\b(earth|green|yellow|cpc|protective)\b/i.test(run.said)) throw new ToolError("The electrician didn't mention the earth conductor. Ask them.");
    const value = /^(yes|true|present)$/i.test(v) ? true : /^(no|false|absent|missing)$/i.test(v) ? false : null;
    if (value === null) throw new ToolError('value must be "yes" or "no".');
    const negated = /\b(no|not|without|missing|isn'?t)\b[^.]{0,25}\b(earth|green|cpc)\b/i.test(run.said) || /\b(earth|cpc)\b[^.]{0,15}\b(missing|absent|not there)\b/i.test(run.said);
    if (value === negated) throw new ToolError(`That isn't what the electrician said: “${run.said}”.`);
    proves.push(`earth:${k.id}`);
    apply = (evidence) => (k.cable = { ...k.cable, cpcPresent: { value, evidence } });
  } else if (a.field === "earth_size_mm2") {
    if (!CABLE_SIZES.includes(n as CableSize)) throw new ToolError(`"${v}" is not a standard conductor size.`);
    if (!saidNumber(run.said, n)) throw new ToolError(`The electrician didn't say ${n}. Ask for the earth size.`);
    apply = (evidence) => (k.cable = { ...k.cable, cpcSize: { value: n as CableSize, evidence } });
  } else if (a.field === "run_length_m") {
    if (!(n > 0) || !saidNumber(run.said, n)) throw new ToolError(`The electrician didn't say a run length of ${v}. Ask for it.`);
    apply = () => (k.lengthM = n);
  } else if (a.field === "load") {
    if (n == null || !saidNumber(run.said, n)) throw new ToolError(`The electrician didn't say a load of ${v}. Ask for it.`);
    const p = parseLoad(`${v} ${k.kind === "pump" ? "pump" : k.kind === "water-heater" ? "heater" : ""}`);
    if (!p) throw new ToolError('Give the load with its unit, e.g. "1.5 HP", "3 kW" or "1200 W".');
    apply = () => {
      k.loadW = p.watts;
      k.powerFactor = p.powerFactor;
    };
  } else {
    throw new ToolError(`Unknown field "${a.field}".`);
  }

  const ev = addEvidence(c, { tool: "record_observation", by: "electrician", circuitId: k.id, summary: `${k.id} ${a.field} = ${v}: “${run.said}”`, verified: true, problems: [], proves });
  apply({ id: ev.id, kind: "voice", by: "electrician", note: `“${run.said}”` });
  return { ok: true, evidenceId: ev.id, verified: true, observation: `[${ev.id}] Recorded ${a.field} = ${v} on ${k.id}.` };
}

function checkOne({ c }: ToolContext, a: Record<string, unknown>): ToolResult {
  const k = circuitOf(c, a.circuit_id);
  const r = checkCircuit(k);
  const bad = r.findings.filter((f) => f.status === "fail" || f.status === "warn");
  const pass = r.findings.filter((f) => f.status === "pass").length;
  const lines = bad.map((f) => `${f.status === "fail" ? "FAIL" : "OPEN"} ${f.ruleId}: ${f.title}${f.fix ? ` (fix: ${f.fix})` : ""}`);
  return { ok: true, observation: `${k.id}: ${r.verdict.toUpperCase()}. ${lines.join("; ")}${lines.length ? ". " : ""}${pass} checks pass.` };
}

function sizeCable({ c, run }: ToolContext, a: Record<string, unknown>): ToolResult {
  const kind = a.kind as CircuitKind;
  if (!KINDS.includes(kind)) throw new ToolError(`kind must be one of ${KINDS.join(", ")}.`);
  const lengthM = Number(a.length_m);
  if (!(lengthM > 0) || (!saidNumber(run.said, lengthM) && !caseNumber(c, lengthM))) throw new ToolError(`No one said a run of ${a.length_m} m. Ask for the run length.`);
  const load = String(a.load ?? "").trim();
  let p = null;
  if (load) {
    const n = numbersIn(load)[0];
    if (n == null || (!saidNumber(run.said, n) && !caseNumber(c, n))) throw new ToolError(`No one said a load of ${load}. Ask for it.`);
    p = parseLoad(`${load} ${kind === "pump" ? "pump" : kind === "water-heater" ? "heater" : ""}`);
    if (!p) throw new ToolError('Give the load with its unit, e.g. "1.5 HP", "3 kW" or "1200 W".');
  }
  const r = designCircuit({ kind, lengthM, loadW: p?.watts ?? (kind === "lighting" ? 300 : undefined), powerFactor: p?.powerFactor, curve: p?.curve });
  return { ok: true, observation: `${r.answer} Working: ${r.steps.map((s) => `${s.label} ${s.value}`).join("; ")}.` };
}

function tick({ c }: ToolContext, a: Record<string, unknown>): ToolResult {
  const item = c.checklist.find((i) => i.id === a.item_id);
  if (!item) throw new ToolError(`No checklist item "${a.item_id}".`);
  const r = canTick(item.id, Array.isArray(a.evidence_ids) ? a.evidence_ids.map(String) : [], c.evidence);
  if (!r.ok) throw new ToolError(`Refused: ${r.reason}`);
  Object.assign(item, { done: true, evidenceIds: r.ids, by: "agent" });
  return { ok: true, observation: `Ticked ${item.id} with ${r.ids.join(", ")}. ${c.checklist.filter((i) => i.done).length} of ${c.checklist.length} done.` };
}

function submitMemo({ c }: ToolContext, a: Record<string, unknown>): ToolResult {
  const summary = String(a.summary ?? "").trim();
  if (!summary) throw new ToolError("Write a short summary for the homeowner.");
  const s = summariseBoard(c.board, wallFindings(c));
  const facts = [
    ...c.evidence.map((e) => e.summary),
    ...s.all.map((f) => `${f.title}. ${f.detail} ${f.fix ?? ""}`),
    ...c.board.circuits.map((k) => `${k.name} ${k.designSize} mm² ${k.lengthM} m ${k.loadW ?? ""} W`),
  ];
  const open = c.checklist.filter((i) => !i.done && i.id !== "memo" && i.id !== "confirm").map((i) => i.label);
  c.memo = {
    at: new Date().toISOString(), status: "unverified", summary, summaryCheck: checkNumbers(summary, facts),
    verdict: s.verdict, fixes: s.fixes.map((f) => ({ fix: f.fix, status: f.status, count: f.findings.length })),
    open, evidenceIds: c.evidence.filter((e) => e.verified).map((e) => e.id),
  };
  for (const item of c.checklist) {
    if (item.id === "memo") Object.assign(item, { done: true, by: "agent" });
    // A new memo needs a new sign-off.
    if (item.id === "confirm") Object.assign(item, { done: false, by: undefined });
  }
  const check = c.memo.summaryCheck.ok ? "" : ` Your summary has numbers no tool produced (${c.memo.summaryCheck.unknown.join(", ")}); they are flagged to the reader.`;
  return { ok: true, observation: `Memo saved, UNVERIFIED until the electrician confirms it in the app. Verdict ${s.verdict.toUpperCase()}, ${s.fixes.length} fixes, ${open.length} checks still open.${check}` };
}

const RUN: Record<string, (ctx: ToolContext, a: Record<string, unknown>) => ToolResult | Promise<ToolResult>> = {
  read_cable_print: readCablePrint,
  read_board: readBoardPhoto,
  correct_board_device: correctBoardDevice,
  magnet_test: magnetTest,
  map_wall: mapWall,
  assign_breaker: assignBreaker,
  record_observation: recordObservation,
  check_circuit: checkOne,
  size_cable: sizeCable,
  tick_checklist: tick,
  submit_memo: submitMemo,
};

export async function runTool(ctx: ToolContext, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  const run = RUN[name];
  if (!run) return { ok: false, observation: `No tool called ${name}.` };
  try {
    return await run(ctx, args);
  } catch (e) {
    if (e instanceof ToolError) return { ok: false, observation: e.message };
    if (e instanceof MetaApiError && e.code === "privacy_block") {
      return { ok: false, gate: { status: "block", reasons: [e.message] }, observation: `The privacy gate blocked the photo before it left: ${e.message} Ask for a new shot without people or private details.` };
    }
    if (e instanceof MetaApiError) return { ok: false, observation: `${e.code === "gate_unavailable" ? "Privacy gate" : "Meta API"} error: ${e.message}` };
    console.error(`tool ${name} failed`, e);
    return { ok: false, observation: `${name} failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}
