"use client";

import { useEffect, useState } from "react";

interface Entry { at: string; route: string; model: string; bytes: number; digest: string; gate: string; reasons?: string[]; gateMs?: number; sent: boolean }
interface Data { gate: { configured: boolean; name: string | null; host: string | null; where: string | null }; entries: Entry[] }

/** Everything that left for Meta's hosted models, and everything the privacy gate stopped before it could. */
export default function EgressLog() {
  const [data, setData] = useState<Data | null>(null);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/egress").then((r) => r.json()).then((d) => live && setData(d)).catch(() => {});
    load();
    const t = setInterval(load, 5000);
    return () => { live = false; clearInterval(t); };
  }, []);

  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Egress log</h2>
        <span className={`text-xs ${data?.gate.configured ? "text-pass" : "text-muted"}`}>
          {data?.gate.configured ? `Privacy gate on · ${data.gate.host}` : "Privacy gate off"}
        </span>
      </div>
      <p className="mt-1 text-xs text-muted">
        {!data || data.gate.configured
          ? `Every photo is checked by ${data?.gate.name ?? "an open-weights model"} (open weights, ${data?.gate.where ?? "our server"}) before it may go to Meta's hosted models.`
          : "No privacy gate is connected, so photos go to Meta's hosted models unchecked."}
      </p>
      <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto text-xs">
        {!data?.entries.length && <li className="text-muted">Nothing sent yet.</li>}
        {data?.entries.map((e) => (
          <li key={e.at + e.digest} className="rounded border border-line p-2">
            <div className="flex justify-between gap-2">
              <span className="font-mono">{e.route}</span>
              <span className={e.sent ? "text-ink-2" : "font-semibold text-fail"}>{e.sent ? `sent → ${e.model}` : e.gate === "error" ? "gate down, not sent" : "blocked, not sent"}</span>
            </div>
            <div className="mt-0.5 text-muted">
              {new Date(e.at).toLocaleTimeString()} · {(e.bytes / 1024).toFixed(0)} KB · sha256 {e.digest} · gate {e.gate}{e.gateMs ? ` (${(e.gateMs / 1000).toFixed(1)} s)` : ""}
            </div>
            {e.reasons?.length ? <div className="mt-0.5 text-warn">{e.reasons.join(" ")}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
