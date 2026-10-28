"use client";

import { useState } from "react";
import { FindingCard, GateBadge, type GateInfo } from "@/components/ui";
import { NO_DRILL_CM, WallOverlay } from "@/components/WallOverlay";
import { imageToJpegDataUrl } from "@/lib/media";
import type { WallMap } from "@/lib/wallmap";

const SAMPLE = "/samples/wall-sample.jpg";

interface Mapped {
  map: WallMap;
  width: number;
  height: number;
  ms: number;
  concept: string;
  gate?: GateInfo;
}

export default function WallMapper() {
  const [photo, setPhoto] = useState<string | null>(null);
  const [isSample, setIsSample] = useState(false);
  const [mapped, setMapped] = useState<Mapped | null>(null);
  const [render, setRender] = useState<{ image: string; ms: number } | null>(null);
  const [xray, setXray] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(file: Blob, sample = false) {
    setError(null); setMapped(null); setRender(null); setIsSample(sample);
    setPhoto(await imageToJpegDataUrl(file, 1600, 0.88));
  }

  async function call<T>(path: string, body: object, label: string): Promise<T | null> {
    setBusy(label); setError(null);
    try {
      const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      return json as T;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function mapWall() {
    if (!photo) return;
    const r = await call<Mapped>("/api/wallmap", { media: photo }, "SAM 3.1 is tracing the conduit and the block grid…");
    if (r) setMapped(r);
  }

  async function plaster() {
    if (!photo) return;
    const r = await call<{ image: string; ms: number }>("/api/render", { media: photo, kind: "wall-plastered" }, "Muse Image is plastering the wall…");
    if (r) setRender({ image: r.image, ms: r.ms });
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-3xl font-semibold tracking-tight">Wall map</h1>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Photograph a chased wall before it is plastered, front-on with whole blocks in view. SAM 3.1 finds every conduit run and
        every block; the 450 × 225 mm block grid turns the photo into centimetres; the rules check that every run stays in the safe
        zones. After plastering, the map is the only record of where the cables are.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <label className="cursor-pointer rounded-lg border border-line bg-card px-4 py-2 text-sm font-semibold hover:border-copper">
          Choose a wall photo
          <input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && choose(e.target.files[0])} />
        </label>
        <button onClick={async () => choose(await (await fetch(SAMPLE)).blob(), true)} className="rounded-lg border border-line bg-card px-4 py-2 text-sm hover:border-copper">
          Use the sample wall
        </button>
        <button onClick={mapWall} disabled={!photo || !!busy} className="rounded-lg bg-copper px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Map cables (SAM 3.1)</button>
        <button onClick={plaster} disabled={!photo || !!busy} className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Show after plaster (Muse Image)</button>
      </div>
      {isSample && <p className="mt-2 text-xs text-warn">Sample wall is an AI-generated test photo (Muse Image), used until real site photos are added.</p>}
      {busy && <p className="mt-3 text-sm text-copper">{busy}</p>}
      {error && <p className="mt-3 text-sm text-fail">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <figure>
          <figcaption className="mb-2 text-sm font-semibold">Before plaster {mapped && <span className="font-normal text-muted">· SAM 3.1 “{mapped.concept}” · {(mapped.ms / 1000).toFixed(1)} s</span>}</figcaption>
          <div className="relative overflow-hidden rounded-xl border border-line bg-card">
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo} alt="Wall before plaster" className="block w-full" />
            ) : (
              <div className="grid aspect-[3/2] place-items-center text-sm text-muted">Choose a photo or use the sample</div>
            )}
            {photo && mapped && <WallOverlay map={mapped.map} width={mapped.width} height={mapped.height} />}
          </div>
          {mapped && <div className="mt-1"><GateBadge gate={mapped.gate} /></div>}
        </figure>
        <figure>
          <figcaption className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>After plaster {render && <span className="font-normal text-muted">· Muse Image render · {(render.ms / 1000).toFixed(1)} s</span>}</span>
            {render && mapped && (
              <label className="flex items-center gap-2 font-normal">
                <input type="checkbox" checked={xray} onChange={(e) => setXray(e.target.checked)} className="accent-copper" /> X-ray
              </label>
            )}
          </figcaption>
          <div className="relative overflow-hidden rounded-xl border border-line bg-card">
            {render ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={render.image} alt="Rendered wall after plaster" className="block w-full" />
            ) : (
              <div className="grid aspect-[3/2] place-items-center p-6 text-center text-sm text-muted">The finished wall, with the mapped cables shown through it</div>
            )}
            {render && mapped && xray && <WallOverlay map={mapped.map} width={mapped.width} height={mapped.height} xray />}
          </div>
          {render && <p className="mt-1 text-xs text-muted">Render is an illustration; the lines come from the measured map, not the render.</p>}
        </figure>
      </div>

      {mapped && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">Cable runs</h2>
            <p className="text-xs text-muted">
              {mapped.map.calibrated
                ? `Calibrated on ${mapped.map.blocksUsed} blocks: ${mapped.map.cmPerPx!.x.toFixed(3)} cm/px across, ${mapped.map.cmPerPx!.y.toFixed(3)} cm/px up. Wall ${mapped.map.wall!.widthCm} × ${mapped.map.wall!.heightCm} cm.`
                : "Not calibrated: positions are in pixels."}
            </p>
            <table className="mt-3 w-full rounded-lg border border-line bg-card text-sm">
              <thead className="text-left text-xs uppercase text-muted">
                <tr><th className="px-3 py-2">Run</th><th className="px-3 py-2">Direction</th><th className="px-3 py-2">From (x, height)</th><th className="px-3 py-2">To</th><th className="px-3 py-2">Length</th></tr>
              </thead>
              <tbody>
                {mapped.map.runs.map((r) => (
                  <tr key={r.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono">{r.id}</td>
                    <td className={`px-3 py-2 ${r.orientation === "diagonal" ? "font-semibold text-fail" : ""}`}>{r.orientation}</td>
                    <td className="px-3 py-2 tabular-nums">{r.from.x}, {r.from.y} cm</td>
                    <td className="px-3 py-2 tabular-nums">{r.to.x}, {r.to.y} cm</td>
                    <td className="px-3 py-2 tabular-nums">{r.lengthCm} cm</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">Shaded band: keep drills and nails {NO_DRILL_CM} cm clear of every run.</p>
          </div>
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Safe-zone checks</h2>
            {mapped.map.findings.map((f, i) => <FindingCard key={f.ruleId + i} f={f} />)}
          </div>
        </div>
      )}
    </div>
  );
}

