import "server-only";
import { sparkTurn } from "@/lib/meta/client";
import { sameNumbers } from "./verify";

/** The reply languages the copilot can speak. English is what the agent writes; Pidgin is rendered from it. */
export const REPLY_LANGS = ["en", "pidgin"] as const;
export type ReplyLang = (typeof REPLY_LANGS)[number];

const INSTRUCTIONS = `You turn an electrician's copilot reply into Nigerian Pidgin, so an electrician who does not follow English well understands it when it is read aloud on a noisy site.
Rules: keep the meaning exactly; keep every number as digits, exactly as written (2.5, 10, 100); keep units and trade words the electrician uses (mm², amps, breaker, RCD, earth, conduit, type C); plain text, no markdown, at most two short sentences. Reply with the Pidgin only.`;

/**
 * Render a verified English reply in Nigerian Pidgin. The English stays the record; the Pidgin is only used if every
 * number in it is the same as in the English, so the translation can't change a size or a rating. Returns undefined
 * when it can't be trusted, and the copilot falls back to the English.
 */
export async function toPidgin(reply: string): Promise<{ text?: string; ms: number }> {
  const started = Date.now();
  const r = await sparkTurn({
    instructions: INSTRUCTIONS,
    input: [{ type: "message", role: "user", content: [{ type: "input_text", text: reply }] }],
    tools: [],
    effort: "minimal",
  });
  const text = r.output
    .filter((o) => o.type === "message")
    .flatMap((o) => (o.content as { text?: string }[]) ?? [])
    .map((c) => c.text ?? "")
    .join("")
    .trim();
  const ms = Date.now() - started;
  if (!text || text.length > reply.length * 3 || !sameNumbers(text, reply)) return { ms };
  return { text, ms };
}
