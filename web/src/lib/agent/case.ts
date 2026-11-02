import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { digest } from "@/lib/egress";
import type { Job } from "@/lib/jobs";
import { SAM } from "@/lib/meta/client";
import { DATA_DIR, HOSTED, SEED_DIR } from "@/lib/paths";
import type { Circuit, Finding } from "@/lib/rules";
import type { CaseRecord, EvidenceRecord, MediaRef } from "./types";
import { initialChecklist } from "./verify";

/**
 * The case record: everything the agent has read, heard and decided on one job, kept so a person can
 * check every step. One JSON file per job, plus the captured media beside it. A job with no saved case
 * starts from its seed, if one is committed, and the seed's media is read from there.
 */
const DIR = path.join(DATA_DIR, "cases");
const SEED = path.join(SEED_DIR, "cases");
const cases = new Map<string, CaseRecord>();
// Media also lives in memory so a read-only host (serverless) still works for the length of a demo.
const media = new Map<string, string>();

// Runtime data, not code: the ignore comments keep the build from bundling the whole project into the server.
const file = (jobId: string, dir = DIR) => path.join(/*turbopackIgnore: true*/ dir, `${jobId}.json`);
const mediaFile = (jobId: string, ref: MediaRef, dir = DIR) => path.join(/*turbopackIgnore: true*/ dir, jobId, `${ref.id}.${ref.mime.split("/")[1]}`);

async function seedCase(jobId: string): Promise<CaseRecord | null> {
  try {
    return JSON.parse(await readFile(file(jobId, SEED), "utf8"));
  } catch {
    return null;
  }
}

/** A fresh case starts from the job's design: circuits, loads and lengths, but no readings yet. */
export function newCase(job: Job): CaseRecord {
  const circuits: Circuit[] = job.board.circuits.map((c) => ({
    id: c.id, name: c.name, kind: c.kind, loadW: c.loadW, powerFactor: c.powerFactor, lengthM: c.lengthM,
    designSize: c.designSize, method: c.method, groupedWith: c.groupedWith, ambientC: c.ambientC,
    concealedShallow: c.concealedShallow, servesBathroom: c.servesBathroom, domestic: c.domestic, cable: {},
  }));
  return {
    jobId: job.id, title: job.title, createdAt: new Date().toISOString(),
    board: { id: job.board.id, name: job.board.name, circuits },
    checklist: initialChecklist(circuits), media: [], evidence: [], runs: [],
  };
}

export async function getCase(job: Job): Promise<CaseRecord> {
  const cached = cases.get(job.id);
  if (cached) return cached;
  let c: CaseRecord;
  try {
    c = JSON.parse(await readFile(file(job.id), "utf8"));
  } catch {
    c = (await seedCase(job.id)) ?? newCase(job);
  }
  cases.set(job.id, c);
  return c;
}

export async function saveCase(c: CaseRecord): Promise<void> {
  try {
    await mkdir(DIR, { recursive: true });
    await writeFile(file(c.jobId), JSON.stringify(c, null, 1));
  } catch (e) {
    console.warn("case not written:", e instanceof Error ? e.message : e);
  }
}

export async function resetCase(job: Job): Promise<CaseRecord> {
  const c = (HOSTED && (await seedCase(job.id))) || newCase(job);
  cases.set(job.id, c);
  for (const k of [...media.keys()]) if (k.startsWith(`${job.id}/`)) media.delete(k);
  await rm(path.join(DIR, job.id), { recursive: true, force: true }).catch(() => {});
  await saveCase(c);
  return c;
}

export async function addMedia(c: CaseRecord, dataUrl: string, extra: Pick<MediaRef, "hint" | "circuitId" | "posterId" | "generated"> = {}): Promise<MediaRef> {
  const mime = dataUrl.slice(5, dataUrl.indexOf(";"));
  const ref: MediaRef = {
    id: `m${c.media.length + 1}`, kind: mime.startsWith("video/") ? "clip" : "photo", mime,
    bytes: Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4), digest: digest(dataUrl),
    at: new Date().toISOString(), ...extra,
  };
  c.media.push(ref);
  media.set(`${c.jobId}/${ref.id}`, dataUrl);
  try {
    await mkdir(path.join(DIR, c.jobId), { recursive: true });
    await writeFile(mediaFile(c.jobId, ref), Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"));
  } catch (e) {
    console.warn("media not written:", e instanceof Error ? e.message : e);
  }
  return ref;
}

export async function mediaDataUrl(c: CaseRecord, ref: MediaRef): Promise<string> {
  const hit = media.get(`${c.jobId}/${ref.id}`);
  if (hit) return hit;
  const bytes = await readFile(/*turbopackIgnore: true*/ mediaFile(c.jobId, ref)).catch(() => readFile(/*turbopackIgnore: true*/ mediaFile(c.jobId, ref, SEED)));
  const url = `data:${ref.mime};base64,${bytes.toString("base64")}`;
  media.set(`${c.jobId}/${ref.id}`, url);
  return url;
}

/** The photos and clips the owner's report shows: verified readings (with their stills) and verified wall maps. */
export function reportMediaIds(c: CaseRecord): Set<string> {
  const verified = c.evidence.filter((e) => e.verified);
  const ids = new Set<string>();
  for (const e of verified) {
    if (!e.mediaId) continue;
    ids.add(e.mediaId);
    const poster = c.media.find((m) => m.id === e.mediaId)?.posterId;
    if (poster) ids.add(poster);
  }
  const verifiedIds = new Set(verified.map((e) => e.id));
  for (const w of c.walls ?? []) {
    if (!verifiedIds.has(w.evidenceId)) continue;
    ids.add(w.mediaId);
    if (w.renderMediaId) ids.add(w.renderMediaId);
  }
  return ids;
}

export function addEvidence(c: CaseRecord, e: Omit<EvidenceRecord, "id" | "at">): EvidenceRecord {
  const rec: EvidenceRecord = { id: `e${c.evidence.length + 1}`, at: new Date().toISOString(), ...e };
  c.evidence.push(rec);
  return rec;
}

/** Safe-zone failures and warnings from every verified wall map, labelled with the wall they came from. */
export function wallFindings(c: CaseRecord): Finding[] {
  const verified = new Set(c.evidence.filter((e) => e.verified).map((e) => e.id));
  return (c.walls ?? []).filter((w) => verified.has(w.evidenceId)).flatMap((w) =>
    w.map.findings.filter((f) => f.status === "fail" || f.status === "warn").map((f) => ({
      ...f, where: `Wall ${w.id}`,
      evidence: [{ id: w.evidenceId, kind: "photo" as const, by: SAM, note: `Wall ${w.id} before plaster`, src: mediaUrl(c.jobId, w.mediaId) }],
    })),
  );
}

const HINT = { cable: "Read cable print", board: "Read board", magnet: "Magnet test", wall: "Map wall" } as const;

/** Where the browser can fetch a captured photo or clip. */
export const mediaUrl = (jobId: string, mediaId: string) => `/api/jobs/${jobId}/media/${mediaId}`;

function circuitLine(k: Circuit): string {
  const cab = k.cable;
  const ref = (id?: string) => (id ? ` [${id}]` : "");
  const parts = [
    cab.printedSize ? `cable ${cab.printedSize.value} mm² ${cab.brand?.value ?? ""} ${cab.sonMark?.value ?? "no standard marking"}${ref(cab.printedSize.evidence?.id)}` : "cable print: not read",
    cab.magnetAttaches ? `magnet: ${cab.magnetAttaches.value ? "STICKS (not copper)" : "no attraction"}${ref(cab.magnetAttaches.evidence?.id)}` : "magnet: not tested",
    k.device ? `breaker: ${k.device.value.curve ?? ""}${k.device.value.ratingA} A${ref(k.device.evidence?.id)}` : "breaker: not identified",
    cab.cpcPresent ? `earth: ${cab.cpcPresent.value ? "present" : "MISSING"}${cab.cpcSize ? ` ${cab.cpcSize.value} mm²` : ""}${ref(cab.cpcPresent.evidence?.id)}` : "earth: not checked",
  ];
  const load = k.loadW != null ? `, load ${k.loadW} W` : "";
  return `- ${k.id}: ${k.name} (${k.kind}), designed ${k.designSize} mm², run ${k.lengthM} m${load}\n  ${parts.join(" | ")}`;
}

/**
 * What Muse Spark sees at the start of a run: the case as text. No photos, no names, no address:
 * the model reads media only through tools, and every photo passes the privacy gate first.
 */
export function caseBrief(c: CaseRecord, opts: { said: string; breakerOff: boolean; attached?: MediaRef; selected?: string }): string {
  const open = c.checklist.filter((i) => !i.done).map((i) => i.id);
  const board = c.boardRead
    ? `read [${c.boardRead.evidenceId}], ${c.boardRead.verified ? "VERIFIED" : `NOT VERIFIED (${c.boardRead.problems.join(" ")})`}: ${c.boardRead.devices.map((d) => `#${d.position} ${d.kind} ${d.curve ?? ""}${d.ratingA || "?"}A${d.sensitivityMA ? ` ${d.sensitivityMA}mA` : ""}${d.label ? ` "${d.label}"` : ""}`).join("; ")}. RCD on board: ${c.boardRead.rcd ? "yes" : "no"}`
    : "not read yet";
  const recent = c.media.filter((m) => !m.generated).slice(-6).map((m) => `${m.id} ${m.kind}${m.hint ? ` (${HINT[m.hint]} button)` : ""}${m.circuitId ? `, circuit ${m.circuitId}` : ""}${m.posterId ? `, still ${m.posterId}` : ""}`);
  const history = c.runs.filter((r) => r.status === "done").slice(-3).map((r) => `Electrician: "${r.said}" → You: "${r.reply ?? ""}"`);
  const attached = opts.attached
    ? `${opts.attached.id}: a ${opts.attached.kind} taken with the ${opts.attached.hint ? HINT[opts.attached.hint] : "camera"} button${opts.attached.posterId ? ` (the privacy gate checks still ${opts.attached.posterId})` : ""}`
    : "nothing";
  return [
    `JOB: ${c.title}`,
    `BREAKER: ${opts.breakerOff ? "the electrician has confirmed this circuit's breaker is OFF and locked" : "NOT confirmed off: treat conductors as live"}`,
    `SELECTED CIRCUIT IN THE APP: ${opts.selected ?? "none"}`,
    `CIRCUITS:\n${c.board.circuits.map(circuitLine).join("\n")}`,
    `BOARD: ${board}`,
    `WALLS MAPPED: ${(c.walls ?? []).map((w) => `${w.id} from ${w.mediaId} [${w.evidenceId}]: ${w.map.runs.length} runs, ${w.map.findings.filter((f) => f.status === "fail").length} failing`).join("; ") || "none"}`,
    `CHECKLIST: ${c.checklist.length - open.length} of ${c.checklist.length} done. Open: ${open.join(", ") || "none"}`,
    `MEMO: ${c.memo ? `${c.memo.status} (${c.memo.at})` : "not drafted"}`,
    `RECENT MEDIA: ${recent.join("; ") || "none"}`,
    history.length ? `EARLIER IN THIS JOB:\n${history.join("\n")}` : "",
    `ATTACHED NOW: ${attached}`,
    `THE ELECTRICIAN SAYS: "${opts.said}"`,
  ].filter(Boolean).join("\n");
}
