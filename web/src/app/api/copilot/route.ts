import { answer } from "@/lib/copilot";
import { transcribe } from "@/lib/meta/client";
import { errorResponse } from "../_errors";

// Words the electrician says that a general speech model might mishear.
const KEYWORDS = ["MCB", "RCD", "RCBO", "mm", "amps", "conduit", "earth", "neutral", "breaker", "distribution board", "horsepower", "pumping machine"];

/** Push-to-talk: Muse Voice Transcribe hears the question; the rules engine answers it. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const audio = form.get("audio");
    if (!(audio instanceof Blob) || audio.size === 0) {
      return Response.json({ ok: false, error: "Send the recording as an 'audio' WAV file" }, { status: 400 });
    }
    if (audio.size > 30_000_000) return Response.json({ ok: false, error: "Recording too long" }, { status: 413 });
    const heard = await transcribe(audio, KEYWORDS);
    return Response.json({ ok: true, transcript: heard.transcript, ms: heard.ms, answer: answer(heard.transcript) });
  } catch (e) {
    return errorResponse(e);
  }
}
