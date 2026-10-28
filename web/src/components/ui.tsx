import Link from "next/link";
import type { ReactNode } from "react";
import type { Evidence, Finding, Status } from "@/lib/rules";

const STATUS_STYLE: Record<Status, { label: string; chip: string; bar: string }> = {
  pass: { label: "Pass", chip: "bg-pass-soft text-pass", bar: "border-l-pass" },
  fail: { label: "Fix before plaster", chip: "bg-fail-soft text-fail", bar: "border-l-fail" },
  warn: { label: "Check", chip: "bg-warn-soft text-warn", bar: "border-l-warn" },
  info: { label: "Advice", chip: "bg-info-soft text-info", bar: "border-l-info" },
};

export function StatusChip({ status, label }: { status: Status; label?: string }) {
  const s = STATUS_STYLE[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.chip}`}>
      <span aria-hidden>{status === "pass" ? "✓" : status === "fail" ? "✕" : status === "warn" ? "!" : "i"}</span>
      {label ?? s.label}
    </span>
  );
}

export function EvidenceTag({ ev }: { ev: Evidence }) {
  const icon = ev.kind === "clip" ? "▶" : ev.kind === "voice" ? "🎙" : ev.kind === "manual" ? "✎" : "◧";
  const Tag = ev.src ? "a" : "span";
  return (
    <Tag
      {...(ev.src ? { href: ev.src, target: "_blank", rel: "noreferrer" } : {})}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-md border border-line bg-paper px-2 py-1 text-xs text-ink-2 ${ev.src ? "hover:border-copper" : ""}`}
      title={ev.src ? `Open the ${ev.kind === "clip" ? "clip" : "photo"}: ${ev.note ?? ""}` : ev.note}
    >
      <span aria-hidden className="text-copper">{icon}</span>
      <span className="font-mono">{ev.id}</span>
      {ev.at != null && <span className="text-muted">@{ev.at.toFixed(1)}s</span>}
      <span className="truncate text-muted">· {ev.note}</span>
      {ev.confidence != null && <span className="text-muted">· {Math.round(ev.confidence * 100)}%</span>}
    </Tag>
  );
}

export function FindingCard({ f }: { f: Finding }) {
  return (
    <div className={`rounded-lg border border-line border-l-4 bg-card p-4 ${STATUS_STYLE[f.status].bar}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h4 className="font-semibold">{f.title}</h4>
        <StatusChip status={f.status} />
      </div>
      <p className="mt-1 text-sm text-ink-2">{f.detail}</p>
      {f.fix && <p className="mt-2 text-sm font-medium text-ink">→ {f.fix}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {f.evidence?.map((ev) => <EvidenceTag key={ev.id + f.ruleId} ev={ev} />)}
        <span className="text-xs text-muted">{f.citation}</span>
      </div>
    </div>
  );
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-4">
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Stat({ value, label, tone = "ink" }: { value: string; label: string; tone?: "ink" | "fail" | "warn" | "pass" }) {
  const color = { ink: "text-ink", fail: "text-fail", warn: "text-warn", pass: "text-pass" }[tone];
  return (
    <div className="rounded-lg border border-line bg-card p-4">
      <div className={`text-2xl font-semibold tabular-nums ${color}`}>{value}</div>
      <div className="mt-1 text-xs text-muted">{label}</div>
    </div>
  );
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: ReactNode; variant?: "primary" | "ghost" }) {
  const cls = variant === "primary"
    ? "bg-copper text-white hover:bg-copper/90"
    : "border border-line bg-card text-ink hover:border-copper";
  return (
    <Link href={href} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${cls}`}>
      {children}
    </Link>
  );
}

export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-6xl animate-pulse px-4 py-8" aria-busy>
      <div className="h-4 w-40 rounded bg-line" />
      <div className="mt-3 h-8 w-80 rounded bg-line" />
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-20 rounded-lg bg-line/70" />)}
      </div>
      <div className="mt-8 h-48 rounded-lg bg-line/60" />
    </div>
  );
}

export interface GateInfo {
  status: "pass" | "warn" | "block" | "off";
  reasons?: string[];
  ms?: number;
  name?: string;
}

/** Shows what the privacy gate said before a photo went to Meta's hosted models. */
export function GateBadge({ gate }: { gate?: GateInfo }) {
  if (!gate) return null;
  const style = { pass: "text-pass", warn: "text-warn", block: "text-fail", off: "text-muted" }[gate.status];
  const label = { pass: "passed", warn: "passed with a warning", block: "blocked", off: "off (not connected)" }[gate.status];
  return (
    <span className={`text-xs ${style}`} title={gate.reasons?.join(" ")}>
      Privacy gate {label}{gate.name ? ` · ${gate.name}` : ""}{gate.ms != null ? ` · ${(gate.ms / 1000).toFixed(1)} s` : ""}{gate.reasons?.length ? ` · ${gate.reasons[0]}` : ""}
    </span>
  );
}
