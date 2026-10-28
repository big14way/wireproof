import { connection } from "next/server";
import { addMedia, getCase, resetCase } from "@/lib/agent/case";
import { runAgent } from "@/lib/agent/loop";
import type { AgentEvent, MediaRef } from "@/lib/agent/types";
import { getJob } from "@/lib/jobs";
import { transcribe, VOICE } from "@/lib/meta/client";
import { checkDataUrl, errorResponse } from "../../../_errors";

// Words the electrician says that a general speech model might mishear.
const KEYWORDS = ["MCB", "RCD", "RCBO", "mm", "amps", "conduit", "earth", "neutral", "breaker", "distribution board", "horsepower", "pumping machine"];
const HINTS = ["cable", "board", "magnet"] as const;
const DEFAULT_SAID = { cable: "Read this cable print.", board: "Read this distribution board.", magnet: "Here is the magnet test." } as const;

const noJob = () => Response.json({ ok: false, error: "No such job" }, { status: 404 });

/** The case record for the console: every run, turn, reading and checklist tick. */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]/agent">) {
  await connection(); // always fresh: a run may be writing to it right now
  const job = getJob((await ctx.params).id);
  if (!job) return noJob();
  return Response.json({ ok: true, case: await getCase(job) });
}

/** Start the job's case again from the design, with no readings. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/jobs/[id]/agent">) {
  const job = getJob((await ctx.params).id);
  if (!job) return noJob();
  return Response.json({ ok: true, case: await resetCase(job) });
}

/**
 * The electrician speaks, types or captures something; the agent works on it. The reply streams back as
 * newline-delimited JSON, one event per tool call, so the copilot shows each step as it happens.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/jobs/[id]/agent">) {
  try {
    const job = getJob((await ctx.params).id);
    if (!job) return noJob();
    const form = await request.formData();
    const hintRaw = form.get("hint");
    const hint = HINTS.find((h) => h === hintRaw);
    const selectedRaw = form.get("circuitId");
    const selected = job.board.circuits.find((k) => k.id === selectedRaw)?.id;
    const breakerOff = form.get("breakerOff") === "1";

    let said = String(form.get("text") ?? "").trim();
    let heard: { transcript: string; ms: number } | undefined;
    const audio = form.get("audio");
    if (audio instanceof Blob && audio.size > 0) {
      if (audio.size > 30_000_000) return Response.json({ ok: false, error: "Recording too long" }, { status: 413 });
      heard = await transcribe(audio, KEYWORDS);
      said = heard.transcript.trim();
      if (!said) return Response.json({ ok: false, error: "Didn't catch that. Hold the phone closer and try again." }, { status: 422 });
    }

    const c = await getCase(job);
    let attached: MediaRef | undefined;
    const media = form.get("media");
    if (typeof media === "string" && media) {
      if (hint === "magnet") {
        const clip = checkDataUrl(media, "video");
        const still = form.get("poster");
        const poster = typeof still === "string" && still ? await addMedia(c, checkDataUrl(still, "image"), { circuitId: selected }) : undefined;
        attached = await addMedia(c, clip, { hint, circuitId: selected, posterId: poster?.id });
      } else {
        attached = await addMedia(c, checkDataUrl(media, "image"), { hint, circuitId: selected });
      }
    }
    if (!said && hint) said = DEFAULT_SAID[hint];
    if (!said) return Response.json({ ok: false, error: "Say or type what you need" }, { status: 400 });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (e: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
        try {
          if (heard) send({ type: "heard", said, ms: heard.ms });
          for await (const e of runAgent(job, { said, heardBy: heard ? VOICE : undefined, heardMs: heard?.ms, attached, selected, breakerOff })) send(e);
        } catch (e) {
          send({ type: "error", message: e instanceof Error ? e.message : "The agent failed" });
        }
        controller.close();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
