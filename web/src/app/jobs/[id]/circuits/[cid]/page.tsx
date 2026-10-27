import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EvidenceTag, FindingCard, Section, Stat, StatusChip, PageSkeleton } from "@/components/ui";
import { getJob } from "@/lib/jobs";
import { checkCircuit, CITATIONS, INSTALL_METHOD_LABEL, type Reading } from "@/lib/rules";

const r1 = (n?: number) => (n == null ? "—" : (Math.round(n * 10) / 10).toString());

function Row<T>({ label, reading, show }: { label: string; reading?: Reading<T>; show: (v: T) => string }) {
  return (
    <div className="flex flex-col gap-1 border-b border-line py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted">{label}</div>
      <div className="flex flex-wrap items-center gap-2 sm:justify-end">
        <span className="font-medium">{reading ? show(reading.value) : "Not captured"}</span>
        {reading?.evidence && <EvidenceTag ev={reading.evidence} />}
      </div>
    </div>
  );
}

async function CircuitView(props: { params: PageProps<"/jobs/[id]/circuits/[cid]">["params"] }) {
  const { id, cid } = await props.params;
  const job = getJob(id);
  const circuit = job?.board.circuits.find((c) => c.id === cid);
  if (!job || !circuit) notFound();
  const { findings, verdict, numbers: n } = checkCircuit(circuit);
  const order = { fail: 0, warn: 1, info: 2, pass: 3 } as const;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <Link href={`/jobs/${job.id}`} className="text-sm text-muted hover:text-copper">← {job.title}</Link>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold tracking-tight">{circuit.name}</h1>
        <StatusChip status={verdict} />
      </div>
      <p className="mt-1 text-sm text-ink-2">
        {INSTALL_METHOD_LABEL[circuit.method ?? "B"]} · {circuit.lengthM} m run · designed for {circuit.designSize} mm²
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={n.designCurrentA == null ? "—" : `${r1(n.designCurrentA)} A`} label="Design current Ib" />
        <Stat value={`${r1(n.correctedCapacityA)} A`} label={`Cable capacity Iz (${n.capacityA} A × ${n.factors.ambient} × ${n.factors.grouping})`} />
        <Stat value={circuit.device ? `${circuit.device.value.ratingA} A` : "—"} label="Breaker In" />
        <Stat value={n.voltDropPct != null ? `${r1(n.voltDropPct * 100)}%` : "—"} label="Voltage drop at the far end" />
      </div>

      <Section title="What WireProof read">
        <div className="rounded-lg border border-line bg-card px-4">
          <Row label="Cable print" reading={circuit.cable.printedSize} show={(v) => (v == null ? "Unreadable" : `${v} mm²`)} />
          <Row label="Brand" reading={circuit.cable.brand} show={(v) => v} />
          <Row label="Standard marking" reading={circuit.cable.sonMark} show={(v) => v || "None"} />
          <Row label="Magnet test" reading={circuit.cable.magnetAttaches} show={(v) => (v ? "Magnet sticks — not copper" : "No attraction — copper")} />
          <Row label="Earth conductor" reading={circuit.cable.cpcPresent} show={(v) => (v ? "Present" : "Missing")} />
          <Row label="Breaker" reading={circuit.device} show={(v) => `${v.type} ${v.curve ?? ""}${v.ratingA} A`} />
          <Row label="30 mA RCD" reading={circuit.rcd30mA} show={(v) => (v ? "Protected" : "Not protected")} />
        </div>
      </Section>

      <Section title="Rules applied" aside={<span className="text-xs text-muted">{CITATIONS.coordination}</span>}>
        <div className="space-y-3">
          {[...findings].sort((a, b) => order[a.status] - order[b.status]).map((f) => <FindingCard key={f.ruleId} f={f} />)}
        </div>
      </Section>
    </div>
  );
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function CircuitPage(props: PageProps<"/jobs/[id]/circuits/[cid]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CircuitView params={props.params} />
    </Suspense>
  );
}
