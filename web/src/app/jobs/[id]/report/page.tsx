import { notFound } from "next/navigation";
import { Suspense } from "react";
import { EvidenceTag, StatusChip, PageSkeleton } from "@/components/ui";
import { getJob } from "@/lib/jobs";
import { summarise } from "@/lib/summary";

async function ReportView(props: { params: PageProps<"/jobs/[id]/report">["params"] }) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  const { board, fixes, counts } = summarise(job);
  const ready = board.verdict === "pass" || board.verdict === "info";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="rounded-xl border border-line bg-card p-6">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-copper">WireProof report · pre-inspection pack</p>
            <h1 className="mt-1 text-2xl font-semibold">{job.title}</h1>
            <p className="text-sm text-muted">{job.address} · {job.createdAt}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <div>Owner: {job.owner.name}</div>
            <div>Electrician: {job.electrician.name}</div>
            <div>{job.electrician.licence}</div>
          </div>
        </div>

        <div className={`mt-5 rounded-lg p-4 ${ready ? "bg-pass-soft" : "bg-fail-soft"}`}>
          <div className={`text-lg font-semibold ${ready ? "text-pass" : "text-fail"}`}>
            {ready ? "Ready to plaster" : "Do not plaster yet"}
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {ready
              ? "Every circuit passed. Keep this report: it records where each cable runs inside your walls."
              : `${counts.fail} problems must be fixed while the wiring is still visible. ${fixes.length} fixes clear all of them.`}
          </p>
        </div>

        <h2 className="mt-6 font-semibold">Fixes, in order</h2>
        <ol className="mt-2 space-y-2">
          {fixes.map((g, i) => (
            <li key={g.fix} className="rounded-lg border border-line p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="font-medium">{i + 1}. {g.fix}</div>
                <StatusChip status={g.status} />
              </div>
              <ul className="mt-2 space-y-1 text-sm text-ink-2">
                {g.findings.map((f) => (
                  <li key={`${f.circuitId}-${f.ruleId}`}>
                    <span className="font-medium">{f.circuitId ? board.circuits.find((c) => c.circuit.id === f.circuitId)?.circuit.name : job.board.name}:</span>{" "}
                    {f.title}. <span className="text-xs text-muted">({f.citation})</span>
                    {f.evidence?.[0] && <div className="mt-1"><EvidenceTag ev={f.evidence[0]} /></div>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>

        <h2 className="mt-6 font-semibold">Every circuit</h2>
        <table className="mt-2 w-full text-sm">
          <tbody>
            {board.circuits.map(({ circuit: c, verdict }) => (
              <tr key={c.id} className="border-b border-line last:border-0">
                <td className="py-2">{c.name}</td>
                <td className="py-2 text-muted">{c.cable.printedSize?.value ?? "?"} mm² · {c.device ? `${c.device.value.ratingA} A` : "?"}</td>
                <td className="py-2 text-right"><StatusChip status={verdict} /></td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 font-semibold">Where your cables run</h2>
        <div className="mt-2 grid h-40 place-items-center rounded-lg border border-dashed border-line bg-paper text-sm text-muted">
          Cable map appears here once the conduit runs are photographed (SAM 3.1 on the block grid, see Wall map).
        </div>

        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-line pt-4 text-sm">
          <div>
            <div className="text-muted">Confirmed by electrician</div>
            <div className="mt-6 border-b border-ink" />
            <div className="mt-1 text-xs text-muted">{job.electrician.name}</div>
          </div>
          <div>
            <div className="text-muted">Received by owner</div>
            <div className="mt-6 border-b border-ink" />
            <div className="mt-1 text-xs text-muted">{job.owner.name}</div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          Screening report, not a certificate. Readings come from photos and clips read by Meta&apos;s models; every
          decision is made by fixed rules from the IET Wiring Regulations (BS 7671), cited beside each item. NEMSA
          inspection and certification still apply.
        </p>
      </div>
    </div>
  );
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function ReportPage(props: PageProps<"/jobs/[id]/report">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportView params={props.params} />
    </Suspense>
  );
}
