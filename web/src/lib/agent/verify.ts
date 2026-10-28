// Deterministic checks on what the agent claims. The model proposes; these decide. No model, no I/O.
import { normaliseSpeech } from "../copilot";
import type { CaseChecklistItem, EvidenceRecord, NumberCheck } from "./types";

const UNIT = String.raw`(?:mm|square|sq|amps?|amperes?|metres?|meters?|m|percent|per cent|kw|kilowatts?|watts?|w|hp|horsepower|volts?|v|ma|milliamps?|seconds?|s)\b`;
const key = (n: number) => String(Math.round(n * 1e6) / 1e6);

/**
 * Numbers a piece of text states: anything written in digits, plus number words followed by a unit
 * ("ten amps", "two point five square millimetre"). "One more photo" states no number.
 */
export function numbersIn(text: string): number[] {
  const plain = text.replace(/(\d),(\d{3})\b/g, "$1$2").replace(/\b(\d+) point (\d+)\b/gi, "$1.$2");
  const out = new Set([...plain.matchAll(/\d+(?:\.\d+)?/g)].map((m) => key(Number(m[0]))));
  for (const m of normaliseSpeech(plain).matchAll(new RegExp(String.raw`(\d+(?:\.\d+)?)\s*${UNIT}`, "g"))) out.add(key(Number(m[1])));
  return [...out].map(Number);
}

/** Every number in `text` must appear in one of the sources: a tool result, the case record, or what the electrician said. */
export function checkNumbers(text: string, sources: string[]): NumberCheck {
  const known = new Set(sources.flatMap(numbersIn).map(key));
  const unknown = numbersIn(text).filter((n) => !known.has(key(n))).map(String);
  return { ok: unknown.length === 0, unknown };
}

/** True when the electrician actually said this number. Stops the model filling in a length or load it imagined. */
export function saidNumber(said: string, n: number): boolean {
  return numbersIn(said).some((x) => key(x) === key(n));
}

/** The case checklist: the board, then four checks per circuit, then the memo and the electrician's sign-off. */
export function initialChecklist(circuits: { id: string; name: string }[]): CaseChecklistItem[] {
  const item = (id: string, label: string, circuitId?: string): CaseChecklistItem => ({ id, label, circuitId, done: false, evidenceIds: [] });
  return [
    item("board", "Distribution board read, cover off"),
    ...circuits.flatMap((c) => [
      item(`cable:${c.id}`, `${c.name}: cable print read`, c.id),
      item(`magnet:${c.id}`, `${c.name}: magnet test`, c.id),
      item(`breaker:${c.id}`, `${c.name}: breaker identified`, c.id),
      item(`earth:${c.id}`, `${c.name}: earth conductor checked`, c.id),
    ]),
    item("memo", "Owner memo drafted"),
    item("confirm", "Electrician confirms the memo"),
  ];
}

/** The agent may tick an item only by citing verified evidence that proves it. */
export function canTick(itemId: string, evidenceIds: string[], evidence: EvidenceRecord[]): { ok: true; ids: string[] } | { ok: false; reason: string } {
  if (itemId === "confirm") return { ok: false, reason: "Only the electrician can confirm the memo, in the app." };
  if (itemId === "memo") return { ok: false, reason: "This is ticked when you submit the memo." };
  const cited = evidenceIds.map((id) => evidence.find((e) => e.id === id));
  const missing = evidenceIds.filter((_, i) => !cited[i]);
  if (missing.length) return { ok: false, reason: `No evidence with id ${missing.join(", ")}.` };
  const proving = cited.filter((e): e is EvidenceRecord => !!e && e.verified && e.proves.includes(itemId));
  if (proving.length) return { ok: true, ids: proving.map((e) => e.id) };
  const unverified = cited.find((e) => e && !e.verified);
  if (unverified) return { ok: false, reason: `${unverified.id} is not verified: ${unverified.problems.join(" ") || "the checks did not pass"}.` };
  if (!cited.length) return { ok: false, reason: "Cite the evidence id that proves this item." };
  return { ok: false, reason: `${cited.map((e) => `${e!.id} proves ${e!.proves.join(", ") || "nothing on the checklist"}`).join("; ")}, not ${itemId}.` };
}
