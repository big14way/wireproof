"use client";

import { useState } from "react";
import type { Finding, Status } from "@/lib/rules";

export interface SampleDevice {
  position: number;
  label: string;
  type: string;
  ratingA: number;
  curve?: string;
}

const tone: Record<Status, string> = {
  pass: "text-pass", fail: "text-fail", warn: "text-warn", info: "text-info",
};

export default function PanelReader({ sample, findings }: { sample: SampleDevice[]; findings: Finding[] }) {
  const [preview, setPreview] = useState<string | null>(null);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-2">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Read a breaker panel</h1>
        <p className="mt-2 text-sm text-ink-2">
          Photograph any distribution board or breaker panel with the cover off. Muse Spark reads every device and its
          rating; the rules engine checks RCD protection and labelling.
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
              const file = e.target.files?.[0];
              if (file) setPreview(URL.createObjectURL(file));
            }}
          />
        </label>
        <button
          disabled
          title="Reading your photo uses Muse Spark; it switches on when API credits are active."
          className="mt-3 w-full rounded-lg bg-ink/40 py-3 text-sm font-semibold text-white"
        >
          Read with Muse Spark (coming online)
        </button>
      </div>

      <div>
        <h2 className="text-lg font-semibold">Example reading: demo job board</h2>
        <table className="mt-3 w-full rounded-lg border border-line bg-card text-sm">
          <thead className="text-left text-xs uppercase text-muted">
            <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Device</th><th className="px-3 py-2">Rating</th><th className="px-3 py-2">Feeds</th></tr>
          </thead>
          <tbody>
            {sample.map((d) => (
              <tr key={d.position} className="border-t border-line">
                <td className="px-3 py-2 font-mono text-muted">{d.position}</td>
                <td className="px-3 py-2">{d.type}</td>
                <td className="px-3 py-2 font-medium">{d.curve ?? ""}{d.ratingA} A</td>
                <td className="px-3 py-2 text-ink-2">{d.label}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="mt-4 space-y-2">
          {findings.map((f) => (
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
