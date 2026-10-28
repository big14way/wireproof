"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { GateBadge, StatusChip, type GateInfo } from "@/components/ui";
import type { CaseRecord, Run } from "@/lib/agent/types";
import { TOOL_LABEL } from "@/lib/agent/view";
import EgressLog from "./EgressLog";

const secs = (ms: number) => (ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`);
const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function RunCard({ run, open }: { run: Run; open: boolean }) {
  return (
    <li className="rounded-lg border border-line bg-card">
      <details open={open}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <span className="font-mono text-xs text-muted">{run.id}</span>
          <span className="min-w-0 flex-1 truncate text-sm">“{run.said}”</span>
          <span className="font-mono text-xs text-muted">
            {run.status === "running" ? "running…" : `${count(run.modelCalls, "model call")} · ${count(run.turns.length, "tool")}${run.ms != null ? ` · ${secs(run.ms)}` : ""}`}
          </span>
          {run.status === "error" && <StatusChip status="fail" label="Error" />}
        </summary>
        <div className="border-t border-line px-4 py-3">
          <p className="text-xs text-muted">
            {run.heardBy ? `Heard by ${run.heardBy}` : "Typed or captured"}
            {run.mediaId && ` · media ${run.mediaId}`} · breaker {run.breakerOff ? "confirmed off" : "not confirmed off"} · {new Date(run.at).toLocaleTimeString()}
          </p>
          <ol className="mt-3 space-y-2">
            {run.turns.map((t) => (
              <li key={t.n} className="rounded-md border border-line">
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
                  <span className="font-mono text-xs text-muted">turn {String(t.n).padStart(2, "0")}</span>
                  <span className="rounded bg-ink px-2 py-0.5 font-mono text-xs text-white">{t.tool}</span>
                  {t.model && <span className="rounded bg-copper-soft px-2 py-0.5 font-mono text-xs text-copper">{t.model}</span>}
                  {!t.ok && <StatusChip status="fail" label="Refused" />}
                  {t.ok && t.verified === false && <StatusChip status="warn" label="Not verified" />}
                  {t.ok && t.verified && <StatusChip status="pass" label="Verified" />}
                  <span className="ml-auto font-mono text-xs text-muted">{secs(t.ms)}</span>
                </div>
                <div className="grid gap-3 px-3 py-2 text-sm sm:grid-cols-3">
                  <div><div className="text-xs font-semibold uppercase text-muted">Plan</div><p className="mt-1">{t.why || TOOL_LABEL[t.tool]}</p></div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted">Act</div>
                    <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded bg-paper p-2 font-mono text-xs">{`${t.tool}(${JSON.stringify(t.args)})`}</pre>
                  </div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted">Observe</div>
                    <p className="mt-1">{t.observation}</p>
                    {t.gate && <div className="mt-1"><GateBadge gate={t.gate as GateInfo} /></div>}
                  </div>
                </div>
              </li>
            ))}
          </ol>
          {run.reply && (
            <div className="mt-3 rounded-md bg-paper p-3">
              <div className="text-xs font-semibold uppercase text-muted">Reply</div>
              <p className="mt-1">{run.reply}</p>
              <p className={`mt-1 text-xs ${run.replyCheck?.ok ? "text-pass" : "text-warn"}`}>
                {run.replyCheck?.ok ? "Every number came from a tool, the case or the electrician." : `Numbers no tool produced: ${run.replyCheck?.unknown.join(", ")}`}
              </p>
            </div>
          )}
          {run.error && <p className="mt-3 text-sm text-fail">{run.error}</p>}
        </div>
      </details>
    </li>
  );
}

export default function AgentConsole({ jobId }: { jobId: string }) {
  const [data, setData] = useState<CaseRecord | null>(null);
  const [armed, setArmed] = useState(false);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => fetch(`/api/jobs/${jobId}/agent`).then((r) => r.json()).then((d) => d.ok && setData(d.case)).catch(() => {}), [jobId]);
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 2500);
    return () => clearInterval(t);
  }, [load]);

  async function act(method: "DELETE" | "POST", url: string) {
    setWorking(true);
    const d = await fetch(url, { method }).then((r) => r.json()).catch(() => null);
    if (d?.ok) setData(d.case);
    setWorking(false);
    setArmed(false);
  }

  if (!data) return <p className="mt-6 text-sm text-muted">Loading the case…</p>;
  const runs = [...data.runs].reverse();
  const done = data.checklist.filter((k) => k.done).length;
  const memo = data.memo;

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
      <div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-ink-2">
          <span>{count(data.runs.length, "request")}</span>·<span>{count(data.runs.reduce((n, r) => n + r.modelCalls, 0), "Muse Spark call")}</span>·
          <span>{count(data.evidence.length, "piece", "pieces")} of evidence</span>
          <button
            onClick={() => (armed ? act("DELETE", `/api/jobs/${jobId}/agent`) : setArmed(true))}
            disabled={working}
            className={`ml-auto rounded-lg border px-3 py-1 text-xs font-semibold ${armed ? "border-fail text-fail" : "border-line hover:border-copper"}`}
          >
            {armed ? "Tap again to clear the case" : "Reset case"}
          </button>
        </div>
        {runs.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line p-8 text-center text-sm text-muted">
            No turns yet. Open the <Link href={`/jobs/${jobId}/copilot`} className="font-semibold text-copper">copilot</Link> and talk, type or capture.
          </p>
        ) : (
          <ol className="mt-4 space-y-3">{runs.map((r, i) => <RunCard key={r.id} run={r} open={i === 0} />)}</ol>
        )}

        <h2 className="mt-8 font-semibold">Case record</h2>
        <p className="mt-1 text-xs text-muted">Every reading and statement. Only verified evidence changes a circuit or ticks the checklist.</p>
        <ul className="mt-3 space-y-2 text-sm">
          {data.evidence.length === 0 && <li className="text-muted">Nothing recorded yet.</li>}
          {[...data.evidence].reverse().map((e) => (
            <li key={e.id} className="rounded-md border border-line bg-card px-3 py-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{e.id}</span>
                <span className="text-xs text-muted">{TOOL_LABEL[e.tool] ?? e.tool} · {e.by}{e.circuitId ? ` · ${e.circuitId}` : ""}{e.mediaId ? ` · ${e.mediaId}` : ""}</span>
                <span className="ml-auto">{e.verified ? <StatusChip status="pass" label="Verified" /> : <StatusChip status="warn" label="Not verified" />}</span>
              </div>
              <p className="mt-1 text-ink-2">{e.summary}</p>
              {e.problems.length > 0 && <p className="mt-1 text-xs text-warn">{e.problems.join(" ")}</p>}
            </li>
          ))}
        </ul>
      </div>

      <aside className="space-y-4">
        <div className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Owner memo</h2>
            {memo && <StatusChip status={memo.status === "confirmed" ? "pass" : "warn"} label={memo.status === "confirmed" ? "Confirmed by electrician" : "Unverified"} />}
          </div>
          {!memo ? (
            <p className="mt-2 text-sm text-muted">Not drafted. Ask the copilot for the report when the checks are in.</p>
          ) : (
            <>
              <p className="mt-2 text-sm">{memo.summary}</p>
              <p className={`mt-1 text-xs ${memo.summaryCheck.ok ? "text-muted" : "text-warn"}`}>
                Written by Muse Spark.{memo.summaryCheck.ok ? " Every number checked." : ` Numbers no tool produced: ${memo.summaryCheck.unknown.join(", ")}.`}
              </p>
              <div className="mt-3 flex items-center gap-2 text-sm"><span className="text-muted">Verdict</span><StatusChip status={memo.verdict} /></div>
              <ul className="mt-2 space-y-1 text-sm">
                {memo.fixes.map((f) => (
                  <li key={f.fix} className="flex gap-2"><span className={f.status === "fail" ? "text-fail" : "text-warn"}>{f.status === "fail" ? "✕" : "!"}</span><span>{f.fix}{f.count > 1 ? ` (${f.count})` : ""}</span></li>
                ))}
              </ul>
              {memo.open.length > 0 && <p className="mt-2 text-xs text-muted">{memo.open.length} checks still open when drafted.</p>}
              {memo.status === "unverified" && (
                <button onClick={() => act("POST", `/api/jobs/${jobId}/agent/confirm`)} disabled={working} className="mt-3 w-full rounded-lg bg-copper py-2 text-sm font-semibold text-white disabled:opacity-50">
                  I&apos;m the electrician: confirm this memo
                </button>
              )}
              <p className="mt-2 text-xs text-muted">The agent can draft it; only the electrician can sign it off.</p>
            </>
          )}
        </div>

        <div className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Checklist</h2>
            <span className="text-xs text-muted">{done}/{data.checklist.length}</span>
          </div>
          <ul className="mt-3 max-h-96 space-y-1.5 overflow-y-auto text-sm">
            {data.checklist.map((k) => (
              <li key={k.id} className="flex gap-2">
                <span aria-hidden className={k.done ? "text-pass" : "text-muted"}>{k.done ? "☑" : "☐"}</span>
                <span className={`flex-1 ${k.done ? "text-ink-2" : ""}`}>{k.label}</span>
                {k.done && <span className="font-mono text-xs text-muted">{k.by === "electrician" ? "signed" : k.evidenceIds.join(",")}</span>}
              </li>
            ))}
          </ul>
        </div>

        <EgressLog />
      </aside>
    </div>
  );
}
