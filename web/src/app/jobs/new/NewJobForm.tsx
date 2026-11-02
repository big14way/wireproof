"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const CIRCUITS = [
  { template: "lighting", name: "Lighting, whole house", on: true },
  { template: "kitchen-ring", name: "Kitchen sockets (ring)", on: true },
  { template: "sockets-radial", name: "Bedroom sockets", on: true },
  { template: "ac", name: "Air conditioner", size: 1.5, unit: "HP", choices: [1, 1.5, 2, 2.5] },
  { template: "heater", name: "Water heater", size: 3, unit: "kW", choices: [1.5, 2, 3, 4.5] },
  { template: "pump", name: "Pumping machine", size: 1, unit: "HP", choices: [0.5, 1, 1.5, 2] },
  { template: "cooker", name: "Cooker", on: false },
] as const;

type Row = { template: string; on: boolean; size?: number; qty: number };

export function NewJobForm() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(CIRCUITS.map((c) => ({ template: c.template, on: "on" in c ? c.on : true, size: "size" in c ? c.size : undefined, qty: 1 })));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (i: number, patch: Partial<Row>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true); setError(null);
    const f = new FormData(e.currentTarget);
    const circuits = rows.filter((r) => r.on).flatMap((r) => Array.from({ length: r.qty }, (_, k) => ({ template: r.template, size: r.size, label: r.qty > 1 ? ["Master bedroom", "Second bedroom", "Third bedroom", "Living room"][k] : undefined })));
    const body = {
      title: f.get("title"), address: f.get("address"),
      owner: { name: f.get("ownerName"), phone: f.get("ownerPhone") },
      electrician: { name: f.get("electricianName"), licence: f.get("licence") },
      circuits,
    };
    const res = await fetch("/api/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    if (!d.ok) { setError(d.error ?? "Could not start the job"); setBusy(false); return; }
    router.push(`/jobs/${d.id}/copilot`);
  }

  const input = "mt-1 w-full rounded-lg border border-line bg-card px-3 py-2 text-base";
  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">The house</h2>
        <label className="mt-3 block text-sm">Job name<input name="title" required placeholder="3-bedroom bungalow, Agbor" className={input} /></label>
        <label className="mt-3 block text-sm">Address or area<input name="address" placeholder="Ikorodu, Lagos" className={input} /></label>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Who</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="mt-3 block text-sm">Owner&apos;s name<input name="ownerName" placeholder="Mrs Okafor" className={input} /></label>
          <label className="mt-3 block text-sm">Owner&apos;s WhatsApp number<input name="ownerPhone" inputMode="tel" placeholder="+234 803 000 0000" className={input} /></label>
          <label className="mt-3 block text-sm">Electrician<input name="electricianName" placeholder="Your name" className={input} /></label>
          <label className="mt-3 block text-sm">Licence (optional)<input name="licence" placeholder="NEMSA licence number" className={input} /></label>
        </div>
      </section>
      <section className="rounded-xl border border-line bg-card p-4">
        <h2 className="font-semibold">Circuits on the board</h2>
        <p className="mt-0.5 text-xs text-muted">Tick what the house has. The copilot sizes each one from the load and the run.</p>
        <ul className="mt-3 divide-y divide-line">
          {CIRCUITS.map((c, i) => (
            <li key={c.template} className="flex flex-wrap items-center gap-3 py-2.5">
              <label className="flex min-w-[12rem] flex-1 items-center gap-2 text-sm">
                <input type="checkbox" checked={rows[i].on} onChange={(e) => set(i, { on: e.target.checked })} className="h-5 w-5 accent-copper" />
                {c.name}
              </label>
              {"choices" in c && (
                <select value={rows[i].size} onChange={(e) => set(i, { size: Number(e.target.value) })} disabled={!rows[i].on} className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm disabled:opacity-40">
                  {c.choices.map((v) => <option key={v} value={v}>{v} {c.unit}</option>)}
                </select>
              )}
              {(c.template === "ac" || c.template === "sockets-radial") && (
                <select value={rows[i].qty} onChange={(e) => set(i, { qty: Number(e.target.value) })} disabled={!rows[i].on} className="rounded-lg border border-line bg-card px-2 py-1.5 text-sm disabled:opacity-40">
                  {[1, 2, 3, 4].map((v) => <option key={v} value={v}>× {v}</option>)}
                </select>
              )}
            </li>
          ))}
        </ul>
      </section>
      {error && <p className="rounded-lg bg-fail-soft px-4 py-2 text-sm text-fail">{error}</p>}
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-copper py-3 text-base font-semibold text-white disabled:opacity-50 sm:w-auto sm:px-8">
        {busy ? "Starting…" : "Start the job and open the copilot"}
      </button>
    </form>
  );
}
