"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { GateBadge, type GateInfo } from "@/components/ui";
import type { NumberCheck, Turn } from "@/lib/agent/types";
import { readEvents, shortName, TOOL_LABEL } from "@/lib/agent/view";
import { blobToDataUrl, imageToJpegDataUrl, posterFromClip, PushToTalk } from "@/lib/media";

const SUGGESTIONS = [
  "What cable for a 1.5 HP AC on 15 metres?",
  "Breaker 3 feeds the kitchen ring, and the earth is in.",
  "What's still missing on this job?",
  "Draft the report for the homeowner.",
];

type Hint = "cable" | "board" | "magnet" | "wall";

interface RunView {
  key: number;
  said?: string;
  heardMs?: number;
  turns: Turn[];
  reply?: string;
  check?: NumberCheck;
  error?: string;
  running: boolean;
  ms?: number;
  modelCalls?: number;
}

function Step({ t }: { t: Turn }) {
  const mark = !t.ok ? "✕" : t.verified === false ? "!" : "✓";
  const color = !t.ok ? "text-fail" : t.verified === false ? "text-warn" : "text-pass";
  return (
    <li>
      <details className="group rounded-lg border border-line bg-paper px-3 py-2">
        <summary className="flex cursor-pointer list-none items-start gap-2 text-sm">
          <span aria-hidden className={`font-semibold ${color}`}>{mark}</span>
          <span className="min-w-0 flex-1">
            <span className="font-semibold">{TOOL_LABEL[t.tool] ?? t.tool}</span>
            <span className="text-ink-2"> · </span>
            <span className="text-ink-2 group-open:hidden">{t.observation.length > 120 ? `${t.observation.slice(0, 120)}…` : t.observation}</span>
          </span>
          <span className="font-mono text-xs text-muted">{t.ms >= 1000 ? `${(t.ms / 1000).toFixed(1)} s` : `${t.ms} ms`}</span>
        </summary>
        <div className="mt-2 space-y-1 text-sm">
          <p><span className="text-muted">Plan:</span> {t.why}</p>
          <p className="font-mono text-xs text-ink-2">{t.tool}({JSON.stringify(t.args)})</p>
          <p><span className="text-muted">Observed:</span> {t.observation}</p>
          {t.gate && <GateBadge gate={t.gate as GateInfo} />}
        </div>
      </details>
    </li>
  );
}

export default function Copilot({ jobId, jobTitle, circuits }: { jobId: string; jobTitle: string; circuits: { id: string; name: string }[] }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingHint = useRef<Hint>("cable");
  const ptt = useRef<PushToTalk | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [breakerOff, setBreakerOff] = useState(false);
  const [speak, setSpeak] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [runs, setRuns] = useState<RunView[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const video = videoRef.current;
    return () => (video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment", width: { ideal: 1920 } }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera not available. Allow camera access, or use the buttons to pick a photo.");
    }
  }

  /** Everything goes to the agent: words, a photo, a clip. Each tool call streams back as it happens. */
  async function send(form: FormData, status: string) {
    setNotice(null);
    form.set("breakerOff", breakerOff ? "1" : "0");
    if (selected) form.set("circuitId", selected);
    const key = Date.now();
    const update = (fn: (r: RunView) => RunView) => setRuns((prev) => prev.map((r) => (r.key === key ? fn(r) : r)));
    setRuns((prev) => [{ key, said: (form.get("text") as string) || undefined, turns: [], running: true }, ...prev]);
    setBusy(status);
    try {
      const res = await fetch(`/api/jobs/${jobId}/agent`, { method: "POST", body: form });
      if (!res.headers.get("content-type")?.includes("ndjson")) throw new Error((await res.json()).error ?? "Request failed");
      for await (const e of readEvents(res)) {
        if (e.type === "heard") {
          update((r) => ({ ...r, said: e.said, heardMs: e.ms }));
          setBusy("Muse Spark is planning…");
        } else if (e.type === "run") {
          update((r) => ({ ...r, said: e.run.said }));
          setBusy("Muse Spark is planning…");
        } else if (e.type === "turn") {
          update((r) => ({ ...r, turns: [...r.turns, e.turn] }));
          setBusy(`${TOOL_LABEL[e.turn.tool] ?? e.turn.tool} done · Muse Spark is deciding the next step…`);
        } else if (e.type === "done") {
          update((r) => ({ ...r, reply: e.run.reply, check: e.run.replyCheck, ms: e.run.ms, modelCalls: e.run.modelCalls, running: false }));
          if (speak && e.run.reply && "speechSynthesis" in window) speechSynthesis.speak(new SpeechSynthesisUtterance(e.run.reply));
        } else if (e.type === "error") {
          update((r) => ({ ...r, error: e.message, running: false }));
        }
      }
    } catch (e) {
      update((r) => ({ ...r, error: e instanceof Error ? e.message : "Request failed", running: false }));
    } finally {
      update((r) => ({ ...r, running: false }));
      setBusy(null);
    }
  }

  function ask(q: string) {
    const text = q.trim();
    if (!text || busy) return;
    const form = new FormData();
    form.set("text", text);
    setQuestion("");
    send(form, "Muse Spark is planning…");
  }

  async function talk() {
    if (!recording) {
      try {
        ptt.current = new PushToTalk();
        await ptt.current.start();
        setRecording(true);
      } catch {
        setNotice("Microphone not available. Allow microphone access.");
      }
      return;
    }
    setRecording(false);
    const form = new FormData();
    form.set("audio", await ptt.current!.stop(), "speech.wav");
    send(form, "Listening with Muse Voice Transcribe…");
  }

  async function sendMedia(hint: Hint, media: string, poster?: string) {
    const form = new FormData();
    form.set("hint", hint);
    form.set("media", media);
    if (poster) form.set("poster", poster);
    const status = { cable: "Reading the cable print…", board: "Reading the board…", magnet: "Judging the magnet test…", wall: "Tracing the conduit runs with SAM 3.1…" }[hint];
    await send(form, status);
  }

  function capture(hint: Hint) {
    if (hint === "magnet" && !breakerOff) return setNotice("Switch off and lock the breaker for this circuit, tick the box below, then do the magnet test.");
    if ((hint === "cable" || hint === "magnet") && !selected) return setNotice("Pick the circuit first, so the reading lands on the right one.");
    if (!cameraOn) {
      pendingHint.current = hint;
      if (fileRef.current) {
        fileRef.current.accept = hint === "magnet" ? "video/mp4" : "image/*";
        fileRef.current.click();
      }
      return;
    }
    if (hint === "magnet") return recordMagnet();
    imageToJpegDataUrl(videoRef.current!).then((media) => sendMedia(hint, media), () => setNotice("The camera has no picture yet."));
  }

  async function picked(file: File | undefined) {
    if (!file) return;
    const hint = pendingHint.current;
    try {
      if (hint === "magnet") {
        if (file.type !== "video/mp4") return setNotice("The magnet test needs an MP4 clip.");
        await sendMedia(hint, await blobToDataUrl(file), await posterFromClip(file));
      } else {
        await sendMedia(hint, await imageToJpegDataUrl(file));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not open that file.");
    }
  }

  async function recordMagnet() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const type = ["video/mp4;codecs=avc1", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!stream || !type) return setNotice("This browser can't record MP4 here. Pick a clip filmed on the phone instead.");
    setBusy("Recording 5 s magnet test…");
    try {
      const poster = await imageToJpegDataUrl(videoRef.current!);
      const rec = new MediaRecorder(stream, { mimeType: type });
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise<void>((r) => (rec.onstop = () => r()));
      rec.start();
      await new Promise((r) => setTimeout(r, 5000));
      rec.stop();
      await stopped;
      await sendMedia("magnet", await blobToDataUrl(new Blob(chunks, { type: "video/mp4" })), poster);
    } catch (e) {
      setBusy(null);
      setNotice(e instanceof Error ? e.message : "Magnet test failed");
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="text-sm text-muted">{jobTitle}</p>
            <h1 className="text-2xl font-semibold tracking-tight">Copilot</h1>
          </div>
          <Link href={`/jobs/${jobId}/console`} className="text-sm font-semibold text-copper hover:underline">Agent console →</Link>
        </div>

        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-ink">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {!cameraOn && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <p className="text-white/80">Point the phone at the board, a cable print or the conduit run. Keep people out of the frame.</p>
                <button onClick={startCamera} className="mt-4 rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white">Start camera</button>
                <p className="mt-3 text-xs text-white/60">No camera? The buttons below let you pick a photo or clip instead.</p>
                {cameraError && <p className="mt-3 text-sm text-warn-soft">{cameraError}</p>}
              </div>
            </div>
          )}
          <div className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${breakerOff ? "bg-pass text-white" : "bg-fail text-white"}`}>
            {breakerOff ? "Breaker OFF · hands-on steps allowed" : "Circuit may be LIVE"}
          </div>
          {busy && <div className="absolute inset-x-3 bottom-3 rounded-lg bg-ink/80 px-3 py-2 text-sm text-white">{busy}</div>}
        </div>

        <div className="mt-3">
          <p className="text-xs font-semibold uppercase text-muted">Circuit</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {circuits.map((k) => (
              <button
                key={k.id}
                onClick={() => setSelected(selected === k.id ? null : k.id)}
                className={`rounded-full border px-3 py-1 text-sm ${selected === k.id ? "border-copper bg-copper text-white" : "border-line bg-card hover:border-copper"}`}
              >
                {shortName(k.name)}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button onClick={() => capture("cable")} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Read cable print</button>
          <button onClick={() => capture("board")} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Read board</button>
          <button onClick={() => capture("magnet")} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Magnet test{cameraOn ? " (5 s)" : ""}</button>
          <button onClick={() => capture("wall")} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Map wall</button>
        </div>
        <input ref={fileRef} type="file" className="hidden" onChange={(e) => { picked(e.target.files?.[0]); e.target.value = ""; }} />
        {notice && <p className="mt-2 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">{notice}</p>}

        <label className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-card p-3 text-sm">
          <input type="checkbox" checked={breakerOff} onChange={(e) => setBreakerOff(e.target.checked)} className="h-5 w-5 accent-copper" />
          I have switched off and locked the breaker for this circuit.
        </label>
        <p className="mt-2 text-xs text-muted">WireProof answers questions any time, but won&apos;t guide hands-on steps, like the magnet test, until this is ticked.</p>
      </div>

      <div className="flex flex-col">
        <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="rounded-xl border border-line bg-card p-3">
          <button
            type="button"
            onClick={talk}
            disabled={!!busy && !recording}
            className={`w-full rounded-lg py-4 text-base font-semibold text-white ${recording ? "animate-pulse bg-fail" : "bg-ink"} disabled:opacity-50`}
          >
            {recording ? "● Listening — tap to send" : "🎙 Tap to talk"}
          </button>
          <div className="mt-2 flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="…or type: breaker 3 feeds the kitchen ring"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-copper"
            />
            <button type="submit" disabled={!!busy} className="rounded-lg border border-line px-4 py-2 text-sm font-semibold disabled:opacity-50">Ask</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} disabled={!!busy} className="rounded-full border border-line px-3 py-1 text-xs hover:border-copper disabled:opacity-50">{s}</button>
            ))}
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={speak} onChange={(e) => setSpeak(e.target.checked)} className="accent-copper" />
            Read replies aloud
          </label>
        </form>

        <div className="mt-4 space-y-3">
          {runs.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Talk, type or capture. Muse Spark plans each step, the tools do the work, and code checks every reading before it counts.
            </p>
          )}
          {runs.map((r) => (
            <div key={r.key} className="rounded-xl border border-line bg-card p-4">
              {r.said && (
                <p className="text-xs text-muted">
                  {r.heardMs != null ? `Heard by Muse Voice Transcribe · ${(r.heardMs / 1000).toFixed(1)} s: ` : "You: "}“{r.said}”
                </p>
              )}
              {r.turns.length > 0 && <ol className="mt-2 space-y-1.5">{r.turns.map((t) => <Step key={t.n} t={t} />)}</ol>}
              {r.running && <p className="mt-2 animate-pulse text-sm text-muted">Working…</p>}
              {r.reply && <p className="mt-3 text-xl font-semibold leading-snug">{r.reply}</p>}
              {r.check && !r.check.ok && (
                <p className="mt-1 text-sm text-warn">Unverified: {r.check.unknown.join(", ")} didn&apos;t come from any tool or reading. Trust the steps above, not this number.</p>
              )}
              {r.error && <p className="mt-2 text-sm text-fail">{r.error}</p>}
              {r.ms != null && (
                <p className="mt-2 text-xs text-muted">
                  {r.modelCalls} Muse Spark {r.modelCalls === 1 ? "call" : "calls"} · {r.turns.length} tool {r.turns.length === 1 ? "call" : "calls"} · {(r.ms / 1000).toFixed(1)} s
                  {r.check?.ok && " · every number checked against the tools"}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
