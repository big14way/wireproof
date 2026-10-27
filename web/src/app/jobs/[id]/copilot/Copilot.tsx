"use client";

import { useEffect, useRef, useState } from "react";
import { answer, type CopilotAnswer } from "@/lib/copilot";

const SUGGESTIONS = [
  "What cable for a 1.5 HP AC on 15 metres?",
  "3 kW water heater, 12 m run",
  "1 HP pumping machine on 25 m",
  "Kitchen ring, 42 m",
];

export default function Copilot({ jobTitle }: { jobTitle: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [breakerOff, setBreakerOff] = useState(false);
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<CopilotAnswer[]>([]);

  useEffect(() => {
    const video = videoRef.current;
    return () => {
      const stream = video?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  async function startCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);
    } catch {
      setCameraError("Camera not available. Allow camera access, or upload photos from the job page.");
    }
  }

  function ask(q: string) {
    const text = q.trim();
    if (!text) return;
    setAnswers((prev) => [answer(text), ...prev]);
    setQuestion("");
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
                <p className="text-white/80">Point the phone at the board, a cable print or the conduit run.</p>
                <button onClick={startCamera} className="mt-4 rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white">
                  Start camera
                </button>
                {cameraError && <p className="mt-3 text-sm text-warn-soft">{cameraError}</p>}
              </div>
            </div>
          )}
          <div className={`absolute left-3 top-3 rounded-full px-3 py-1 text-xs font-semibold ${breakerOff ? "bg-pass text-white" : "bg-fail text-white"}`}>
            {breakerOff ? "Breaker OFF · hands-on steps allowed" : "Circuit may be LIVE"}
          </div>
        </div>

        <label className="mt-4 flex items-center gap-3 rounded-lg border border-line bg-card p-3 text-sm">
          <input type="checkbox" checked={breakerOff} onChange={(e) => setBreakerOff(e.target.checked)} className="h-5 w-5 accent-copper" />
          I have switched off and locked the breaker for this circuit.
        </label>
        <p className="mt-2 text-xs text-muted">
          WireProof answers sizing questions any time, but refuses to guide hands-on steps until this is ticked.
        </p>
      </div>

      <div className="flex flex-col">
        <form
          onSubmit={(e) => { e.preventDefault(); ask(question); }}
          className="rounded-xl border border-line bg-card p-3"
        >
          <div className="flex gap-2">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask: what cable for a 1.5 HP AC on 15 m?"
              className="min-w-0 flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-copper"
            />
            <button type="submit" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Ask</button>
          </div>
          <button
            type="button"
            disabled
            title="Push-to-talk uses Muse Voice Transcribe; it switches on when API credits are active."
            className="mt-2 w-full rounded-lg border border-dashed border-line py-3 text-sm font-semibold text-muted"
          >
            🎙 Hold to talk (Muse Voice Transcribe, coming online)
          </button>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} className="rounded-full border border-line px-3 py-1 text-xs hover:border-copper">
                {s}
              </button>
            ))}
          </div>
        </form>

        <div className="mt-4 space-y-3">
          {answers.length === 0 && (
            <p className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
              Answers appear here, biggest first, readable at arm&apos;s length.
            </p>
          )}
          {answers.map((a, i) => (
            <div key={i} className="rounded-xl border border-line bg-card p-4">
              <p className="text-xs text-muted">“{a.question}”</p>
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
          ))}
        </div>
      </div>
    </div>
  );
}
