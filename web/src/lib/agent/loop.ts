import "server-only";
import type { Job } from "@/lib/jobs";
import { sparkTurn, type ResponseItem } from "@/lib/meta/client";
import { caseBrief, getCase, saveCase } from "./case";
import { runTool, TOOLS } from "./tools";
import type { AgentEvent, MediaRef, Run, Turn } from "./types";
import { checkNumbers } from "./verify";

/** Model calls per request. A cable read and its follow-ups take three; more means the agent is lost. */
const MAX_MODEL_CALLS = 6;
const EFFORT = (process.env.AGENT_EFFORT ?? "low") as "minimal" | "low" | "medium";

const INSTRUCTIONS = `You are WireProof, a copilot for an electrician doing first-fix wiring in a Nigerian house before the walls are plastered. You work only through tools, and every step lands in a case record that a person will check.

How you work:
- Each request gives you the case as text and what the electrician just said. You cannot see photos or clips; read them only with tools, by media id.
- Plan, act, observe: call the tool that answers the request, read what it returns, then decide the next step. Fill in "why" on every call in a few words.
- A photo from the Read cable print button goes to read_cable_print for the selected circuit; if no circuit is selected and the electrician didn't name one, ask which. Read board goes to read_board. Magnet test goes to magnet_test.
- After a VERIFIED reading, call check_circuit on that circuit and tick_checklist with the evidence id. If a reading is NOT VERIFIED, tick nothing and tell the electrician exactly what to reshoot, using the problems the tool gave.
- If the board reading is NOT VERIFIED because a rating is unclear, ask the electrician to check that device by eye; when they tell you, call correct_board_device.
- When the electrician says what they checked (the earth conductor, a run length, a load, which breaker feeds a circuit), record it with record_observation or assign_breaker in their own words and numbers, then tick what it proves.
- Never invent a number. Every number you say must come from a tool result, the case, or the electrician's own words, written as digits exactly as given.
- Safety: if the breaker is not confirmed off, never guide hands-on work on conductors (stripping, the magnet test, pulling cable). Tell them to switch off and lock the breaker and tick the box in the app first.
- Call submit_memo only when the electrician asks for the report or the memo, and say it stays unverified until they confirm it in the app.
- If a tool refuses, do what its message says; don't call it again with the same arguments.

Your final answer is read aloud on a noisy site: plain text, no markdown, no lists, at most two short sentences. Give the result first, then the next thing to capture.`;

interface FunctionCall {
  type: "function_call";
  name: string;
  call_id: string;
  arguments: string;
}

// Replayed items must not carry server ids: nothing is stored on Meta's side to refer back to.
const forReplay = (o: ResponseItem): ResponseItem => Object.fromEntries(Object.entries(o).filter(([k]) => k !== "id" && k !== "status")) as ResponseItem;

const textOf = (output: ResponseItem[]) =>
  output.filter((o) => o.type === "message").flatMap((o) => (o.content as { text?: string }[]) ?? []).map((c) => c.text ?? "").join("").trim();

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/**
 * One request from the electrician: plan → act → observe until Muse Spark answers in words. Every tool call is
 * saved to the case as it happens, so the console shows the run live and a person can step through it later.
 */
export async function* runAgent(
  job: Job,
  input: { said: string; heardBy?: string; heardMs?: number; attached?: MediaRef; selected?: string; breakerOff: boolean },
): AsyncGenerator<AgentEvent> {
  const c = await getCase(job);
  const started = Date.now();
  const brief = caseBrief(c, input);
  const run: Run = {
    id: `r${c.runs.length + 1}`, at: new Date().toISOString(), said: input.said, heardBy: input.heardBy, heardMs: input.heardMs,
    mediaId: input.attached?.id, breakerOff: input.breakerOff, turns: [], modelCalls: 0, status: "running",
  };
  c.runs.push(run);
  await saveCase(c);
  yield { type: "run", run };

  const items: ResponseItem[] = [{ type: "message", role: "user", content: [{ type: "input_text", text: brief }] }];
  const repeats = new Map<string, number>();
  try {
    while (run.reply == null) {
      if (run.modelCalls >= MAX_MODEL_CALLS) {
        run.reply = "That took too many steps. Ask me one thing at a time.";
        break;
      }
      const r = await sparkTurn({ instructions: INSTRUCTIONS, input: items, tools: TOOLS, effort: EFFORT });
      run.modelCalls++;
      const calls = r.output.filter((o): o is ResponseItem & FunctionCall => o.type === "function_call");
      if (!calls.length) {
        run.reply = textOf(r.output) || "Done.";
        break;
      }
      items.push(...r.output.map(forReplay));
      for (const call of calls) {
        const { why, ...args } = parseArgs(call.arguments);
        const sig = call.name + JSON.stringify(args);
        const n = (repeats.get(sig) ?? 0) + 1;
        repeats.set(sig, n);
        const t0 = Date.now();
        const res = n >= 3
          ? { ok: false, observation: "Same call a third time: stopped. Tell the electrician what is blocking you." }
          : await runTool({ c, run }, call.name, args);
        const turn: Turn = {
          n: run.turns.length + 1, at: new Date().toISOString(), tool: call.name, why: String(why ?? ""), args,
          ...res, ms: Date.now() - t0,
        };
        run.turns.push(turn);
        items.push({ type: "function_call_output", call_id: call.call_id, output: JSON.stringify({ ok: res.ok, result: res.observation }) });
        await saveCase(c);
        yield { type: "turn", turn };
      }
    }
    run.replyCheck = checkNumbers(run.reply, [brief, ...run.turns.map((t) => t.observation)]);
    run.status = "done";
  } catch (e) {
    run.status = "error";
    run.error = e instanceof Error ? e.message : String(e);
  }
  run.ms = Date.now() - started;
  await saveCase(c);
  yield run.status === "done" ? { type: "done", run } : { type: "error", message: run.error ?? "The agent failed" };
}
