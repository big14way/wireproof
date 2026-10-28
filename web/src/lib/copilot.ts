import { designCircuit, parseLoad, type CircuitKind, type DesignInput, type DesignResult } from "./rules";

const UNITS = "zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen".split(" ");
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Speech comes back as words ("one point five", "twenty five metres"); the parser wants digits. */
export function normaliseSpeech(text: string): string {
  let s = ` ${text.toLowerCase().replace(/[^a-z0-9.² ]+/g, " ")} `;
  s = s.replace(/\bhorse power\b/g, "horsepower").replace(/\ba c\b/g, "ac");
  s = s.replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})[ -](${UNITS.slice(1, 10).join("|")})\\b`, "g"), (_, t, u) => String(TENS[t] + UNITS.indexOf(u)));
  s = s.replace(new RegExp(`\\b(${Object.keys(TENS).join("|")})\\b`, "g"), (t) => String(TENS[t]));
  s = s.replace(new RegExp(`\\b(${UNITS.join("|")})\\b`, "g"), (u) => String(UNITS.indexOf(u)));
  s = s.replace(/\b(\d+) point (\d+)\b/g, "$1.$2").replace(/\bhundred\b/g, "00");
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Turn an electrician's question into a sizing request. Muse Voice Transcribe supplies the words;
 * this parser and the rules engine supply the answer, so the number never comes from the model.
 */
export function parseQuestion(text: string): DesignInput | null {
  const t = normaliseSpeech(text);
  const len = t.match(/(\d+(?:\.\d+)?)\s*(?:m|metres?|meters?)\b/);
  const lengthM = len ? Number(len[1]) : null;
  const load = parseLoad(t);

  let kind: CircuitKind | null = load?.kind ?? null;
  if (/\bring\b/.test(t)) kind = "sockets-ring";
  else if (/socket/.test(t)) kind = "sockets-radial";
  else if (/light|bulb|lamp/.test(t)) kind = "lighting";
  else if (/cooker|oven/.test(t)) kind = "cooker";
  else if (/heater|geyser/.test(t)) kind = "water-heater";
  else if (/pump|pumping/.test(t)) kind = "pump";
  if (!kind || lengthM == null) return null;

  return {
    kind,
    lengthM,
    loadW: load?.watts ?? (kind === "lighting" ? 300 : undefined),
    powerFactor: load?.powerFactor,
    curve: load?.curve,
  };
}

export interface CopilotAnswer {
  question: string;
  input: DesignInput | null;
  result: DesignResult | null;
  hint?: string;
}

export function answer(question: string): CopilotAnswer {
  const input = parseQuestion(question);
  if (!input) {
    return {
      question, input: null, result: null,
      hint: "Say the load and the run length, e.g. “1.5 HP AC on 15 metres” or “3 kW heater, 12 m”.",
    };
  }
  return { question, input, result: designCircuit(input) };
}
