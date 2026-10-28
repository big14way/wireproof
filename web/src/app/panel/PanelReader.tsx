"use client";

import { useState } from "react";
import { imageToJpegDataUrl } from "@/lib/media";
import type { PanelDevice } from "@/lib/panel";
import type { Finding, Status } from "@/lib/rules";

const tone: Record<Status, string> = { pass: "text-pass", fail: "text-fail", warn: "text-warn", info: "text-info" };

interface Result {
  devices: PanelDevice[];
  findings: Finding[];
  verified: boolean;
  problems: string[];
  model?: string;
  ms?: number;
}

export default function PanelReader({ sample }: { sample: Result }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<Result>(sample);
  const [live, setLive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fixed, setFixed] = useState<{ image: string; ms: number } | null>(null);
  const [rendering, setRendering] = useState(false);
  const [isSample, setIsSample] = useState(false);

  async function useSample() {
    const blob = await (await fetch("/samples/board-sample.jpg")).blob();
    const f = new File([blob], "board-sample.jpg", { type: "image/jpeg" });
    setFile(f); setPreview(URL.createObjectURL(f)); setIsSample(true); setFixed(null);
  }

  async function showFixed() {
    if (!file) return;
    setRendering(true);
    setError(null);
    try {
      const media = await imageToJpegDataUrl(file);
      const res = await fetch("/api/render", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media, kind: "board-fixed" }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      setFixed({ image: body.image, ms: body.ms });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Render failed");
    } finally {
      setRendering(false);
    }
  }

  async function readPanel() {
    if (!file) return;
    setBusy(true);
    setError(null);
    const started = Date.now();
    try {
      const media = await imageToJpegDataUrl(file);
      const res = await fetch("/api/panel", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ media }) });
      const body = await res.json();
      if (!body.ok) throw new Error(body.error);
      setResult({ devices: body.value.devices, findings: body.findings, verified: body.verified, problems: body.problems, model: body.evidence.by, ms: Date.now() - started });
      setLive(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reading failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Read a breaker panel</h1>
        <p className="mt-2 text-sm text-ink-2">
          Photograph any distribution board or breaker panel with the cover off. Muse Spark reads every device and its
          rating; the rules engine checks isolation, RCD protection, surge protection and labelling.
        </p>
        <label className="mt-4 grid aspect-[4/3] cursor-pointer place-items-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-card text-center text-sm text-muted hover:border-copper">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Your panel" className="h-full w-full object-contain" />
          ) : (
            <span>Tap to choose a photo of your panel</span>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) { setFile(f); setPreview(URL.createObjectURL(f)); setIsSample(false); setFixed(null); }
            }}
          />
        </label>
        <button onClick={useSample} className="mt-3 w-full rounded-lg border border-line bg-card py-2 text-sm hover:border-copper">Use the sample board</button>
        {isSample && <p className="mt-1 text-xs text-warn">Sample board is an AI-generated test photo (Muse Image); one breaker is deliberately mislabelled.</p>}
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={readPanel} disabled={!file || busy} className="rounded-lg bg-copper py-3 text-sm font-semibold text-white disabled:opacity-40">
            {busy ? "Reading…" : "Read with Muse Spark"}
          </button>
          <button onClick={showFixed} disabled={!file || rendering} className="rounded-lg bg-ink py-3 text-sm font-semibold text-white disabled:opacity-40">
            {rendering ? "Rendering…" : "Show it fixed (Muse Image)"}
          </button>
        </div>
        {fixed && (
          <figure className="mt-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={fixed.image} alt="The same board with an RCD, surge protection and labels" className="w-full rounded-xl border border-line" />
            <figcaption className="mt-1 text-xs text-muted">Muse Image · {(fixed.ms / 1000).toFixed(1)} s · an illustration of the fix on your own board, not a wiring design.</figcaption>
          </figure>
        )}
        {error && <p className="mt-2 text-sm text-fail">{error}</p>}
        <p className="mt-2 text-xs text-muted">Photos are sent to Meta&apos;s Model API. Keep people and addresses out of the frame.</p>
      </div>

      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold">{live ? "Your panel" : "Example reading: demo job board"}</h2>
          {live && (
            <span className={`text-xs font-semibold ${result.verified ? "text-pass" : "text-warn"}`}>
              {result.verified ? "Verified" : "Needs a better photo"} · {result.model} · {((result.ms ?? 0) / 1000).toFixed(1)} s
            </span>
          )}
        </div>
        <table className="mt-3 w-full rounded-lg border border-line bg-card text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Rating</th><th className="px-3 py-2">Label</th></tr>
          </thead>
          <tbody>
            {result.devices.map((d) => (
              <tr key={d.position} className="border-t border-line">
                <td className="px-3 py-2 font-mono text-muted">{d.position}</td>
                <td className="px-3 py-2">{d.kind}{d.sensitivityMA ? ` ${d.sensitivityMA} mA` : ""}</td>
                <td className="px-3 py-2 font-medium">{d.ratingA ? `${d.curve ?? ""}${d.ratingA} A` : "?"}</td>
                <td className="px-3 py-2 text-ink-2">{d.label || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {result.problems.length > 0 && (
          <ul className="mt-3 list-disc pl-5 text-sm text-warn">{result.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        <ul className="mt-4 space-y-2">
          {result.findings.map((f) => (
            <li key={f.ruleId} className="rounded-lg border border-line bg-card p-3 text-sm">
              <span className={`font-semibold ${tone[f.status]}`}>{f.title}.</span> {f.detail}
              <div className="mt-1 text-xs text-muted">{f.citation}</div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
