import { designCircuit, parseLoad, type CircuitKind, type DesignInput, type DesignResult } from "./rules";

/**
 * Turn an electrician's question into a sizing request. Muse Voice Transcribe supplies the words;
 * this parser and the rules engine supply the answer, so the number never comes from the model.
 */
export function parseQuestion(text: string): DesignInput | null {
  const t = text.toLowerCase();
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
