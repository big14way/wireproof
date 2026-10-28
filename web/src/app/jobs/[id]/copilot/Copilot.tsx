"use client";

import { useEffect, useRef, useState } from "react";
import { answer, type CopilotAnswer } from "@/lib/copilot";
import { GateBadge, type GateInfo } from "@/components/ui";
import { blobToDataUrl, imageToJpegDataUrl, PushToTalk } from "@/lib/media";

const SUGGESTIONS = [
  "What cable for a 1.5 HP AC on 15 metres?",
  "3 kW water heater, 12 m run",
  "1 HP pumping machine on 25 m",
  "Kitchen ring, 42 m",
];

interface Reading {
  verified: boolean;
  problems: string[];
  evidence: { id: string; by: string; note?: string; confidence?: number; at?: number };
  value: unknown;
  gate?: GateInfo;
}

type Item =
  | { kind: "answer"; data: CopilotAnswer; heard?: boolean; ms?: number }
  | { kind: "reading"; task: "cable" | "board" | "magnet"; data: Reading; ms: number }
  | { kind: "error"; message: string };

const TASK_LABEL = { cable: "Cable print", board: "Distribution board", magnet: "Magnet test" } as const;

function summary(task: Item & { kind: "reading" }): string {
  const v = task.data.value as Record<string, unknown> | boolean | null;
  if (task.task === "magnet") return v === true ? "Magnet sticks: NOT copper" : v === false ? "No attraction: copper" : "Inconclusive";
  if (task.task === "cable") {
    const c = v as { printedSize?: { value: number | null }; brand?: { value: string }; sonMark?: { value: string } };
    return `${c.printedSize?.value ?? "?"} mm² · ${c.brand?.value ?? "brand unreadable"} · ${c.sonMark?.value ?? "no standard marking"}`;
  }
  const b = v as { devices: { kind: string; ratingA: number; curve?: string }[]; rcd: boolean };
  return `${b.devices.map((d) => `${d.curve ?? ""}${d.ratingA || "?"}A`).join(" · ")} — ${b.rcd ? "RCD present" : "no RCD"}`;
}

export default function Copilot({ jobTitle }: { jobTitle: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ptt = useRef<PushToTalk | null>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [breakerOff, setBreakerOff] = useState(false);
  const [question, setQuestion] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    return () => (video?.srcObject as MediaStream | null)?.getTracks().forEach((t) => t.stop());
  }, []);

  const push = (item: Item) => setItems((prev) => [item, ...prev]);

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
      setCameraError("Camera not available. Allow camera access in the browser.");
    }
  }

  function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    push({ kind: "answer", data: answer(text) });
    setQuestion("");
  }

  async function talk() {
    if (!recording) {
      try {
        ptt.current = new PushToTalk();
        await ptt.current.start();
        setRecording(true);
      } catch {
        push({ kind: "error", message: "Microphone not available. Allow microphone access." });
      }
      return;
    }
    setRecording(false);
    setBusy("Listening with Muse Voice Transcribe…");
    try {
      const wav = await ptt.current!.stop();
      const form = new FormData();
      form.set("audio", wav, "speech.wav");
      const res = await fetch("/api/copilot", { method: "POST", body: form });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      push({ kind: "answer", data: body.answer, heard: true, ms: body.ms });
    } catch (e) {
      push({ kind: "error", message: e instanceof Error ? e.message : "Could not transcribe" });
    } finally {
      setBusy(null);
    }
  }

  async function read(task: "cable" | "board") {
    if (!videoRef.current || !cameraOn) return push({ kind: "error", message: "Start the camera and point it at the " + (task === "cable" ? "cable print." : "board.") });
    setBusy(`Reading the ${task === "cable" ? "cable print" : "board"} with Muse Spark…`);
    const started = Date.now();
    try {
      const media = await imageToJpegDataUrl(videoRef.current);
      const res = await fetch("/api/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task, media }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      push({ kind: "reading", task, data: body, ms: Date.now() - started });
    } catch (e) {
      push({ kind: "error", message: e instanceof Error ? e.message : "Reading failed" });
    } finally {
      setBusy(null);
    }
  }

  async function magnetTest() {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    if (!stream || !cameraOn) return push({ kind: "error", message: "Start the camera, then hold the magnet to the bare conductor." });
    const type = ["video/mp4;codecs=avc1", "video/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!type) return push({ kind: "error", message: "This browser can't record MP4. Record the magnet test with the phone camera and upload it from the job page." });
    setBusy("Recording 5 s magnet test…");
    const started = Date.now();
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
      setBusy("Judging the magnet test with Muse Spark…");
      const media = await blobToDataUrl(new Blob(chunks, { type: "video/mp4" }));
      const res = await fetch("/api/read", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: "magnet", media, poster }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      push({ kind: "reading", task: "magnet", data: body, ms: Date.now() - started });
    } catch (e) {
      push({ kind: "error", message: e instanceof Error ? e.message : "Magnet test failed" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1.1fr_1fr]">
      <div>
        <p className="text-sm text-muted">{jobTitle}</p>
        <h1 className="text-2xl font-semibold tracking-tight">Copilot</h1>

        <div className="relative mt-4 aspect-[4/3] overflow-hidden rounded-xl bg-ink">
          <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
          {!cameraOn && (
            <div className="absolute inset-0 grid place-items-center p-6 text-center">
              <div>
                <p className="text-white/80">Point the phone at the board, a cable print or the conduit run. Keep people out of the frame.</p>
                <button onClick={startCamera} className="mt-4 rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white">Start camera</button>
                {cameraError && <p className="mt-3 text-sm text-warn-soft">{cameraError}</p>}
              </div>
            </div>
          )}
          <div className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${breakerOff ? "bg-pass text-white" : "bg-fail text-white"}`}>
            {breakerOff ? "Breaker OFF · hands-on steps allowed" : "Circuit may be LIVE"}
          </div>
          {busy && <div className="absolute inset-x-3 bottom-3 rounded-lg bg-ink/80 px-3 py-2 text-sm text-white">{busy}</div>}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          <button onClick={() => read("cable")} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Read cable print</button>
          <button onClick={() => read("board")} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Read board</button>
          <button onClick={magnetTest} disabled={!!busy} className="rounded-lg border border-line bg-card py-3 text-sm font-semibold hover:border-copper disabled:opacity-50">Magnet test (5 s)</button>
        </div>

        <label className="mt-3 flex items-center gap-3 rounded-lg border border-line bg-card p-3 text-sm">
          <input type="checkbox" checked={breakerOff} onChange={(e) => setBreakerOff(e.target.checked)} className="h-5 w-5 accent-copper" />
          I have switched off and locked the breaker for this circuit.
        </label>
        <p className="mt-2 text-xs text-muted">WireProof answers sizing questions any time, but refuses to guide hands-on steps until this is ticked.</p>
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
              placeholder="…or type: what cable for a 1.5 HP AC on 15 m?"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-copper"
            />
            <button type="submit" className="rounded-lg border border-line px-4 py-2 text-sm font-semibold">Ask</button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-copper">{s}</button>
            ))}
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {items.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">Answers appear here, biggest first, readable at arm&apos;s length.</p>
          )}
          {items.map((it, i) => {
            if (it.kind === "error") return <p key={i} className="rounded-xl border border-fail/30 bg-fail-soft p-4 text-sm text-fail">{it.message}</p>;
            if (it.kind === "reading") {
              return (
                <div key={i} className="rounded-xl border border-line bg-card p-4">
                  <div className="flex items-center justify-between text-xs text-muted">
                    <span>{TASK_LABEL[it.task]} · {it.data.evidence.by} · {(it.ms / 1000).toFixed(1)} s</span>
                    <span className={it.data.verified ? "font-semibold text-pass" : "font-semibold text-warn"}>{it.data.verified ? "Verified" : "Needs a better shot"}</span>
                  </div>
                  <p className={`mt-1 text-xl font-semibold leading-snug ${it.task === "magnet" && it.data.value === true ? "text-fail" : ""}`}>{summary(it)}</p>
                  {it.data.evidence.note && <p className="mt-1 text-sm text-ink-2">{it.data.evidence.note}</p>}
                  <div className="mt-1"><GateBadge gate={it.data.gate} /></div>
                  {it.data.problems.length > 0 && (
                    <ul className="mt-2 list-disc pl-5 text-sm text-warn">{it.data.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                  )}
                </div>
              );
            }
            const a = it.data;
            return (
              <div key={i} className="rounded-xl border border-line bg-card p-4">
                <p className="text-xs text-muted">{it.heard ? `Heard by Muse Voice Transcribe${it.ms ? ` · ${(it.ms / 1000).toFixed(1)} s` : ""}: ` : ""}“{a.question}”</p>
                {a.result ? (
                  <>
                    <p className={`mt-1 text-xl font-semibold leading-snug ${a.result.ok ? "text-ink" : "text-fail"}`}>{a.result.answer}</p>
                    <dl className="mt-3 grid gap-1 text-sm">
                      {a.result.steps.map((s) => (
                        <div key={s.label} className="flex flex-wrap justify-between gap-2 border-t border-line pt-1">
                          <dt className="text-muted">{s.label}</dt>
                          <dd className="font-medium">{s.value}{s.citation && <span className="ml-2 text-xs font-normal text-muted">{s.citation}</span>}</dd>
                        </div>
                      ))}
                    </dl>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-warn">{a.hint}</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
