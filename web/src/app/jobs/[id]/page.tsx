import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataSwitch } from "@/components/DataSwitch";
import { ButtonLink, FindingCard, Section, Stat, StatusChip, PageSkeleton } from "@/components/ui";
import { jobData } from "@/lib/agent/jobdata";
import { getJob } from "@/lib/jobs";
import { summariseBoard } from "@/lib/summary";

const r1 = (n?: number) => (n == null ? "—" : (Math.round(n * 10) / 10).toString());

async function JobView(props: PageProps<"/jobs/[id]">) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  const { source, board: b, walls, live } = await jobData(job, (await props.searchParams).data);
  const { board, fixes, counts, verdict } = summariseBoard(b, walls);
  const checklist = source === "live" ? live.checklist : job.checklist;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-muted">{job.address} · {job.createdAt}</p>
          <h1 className="text-3xl font-semibold tracking-tight">{job.title}</h1>
          <p className="mt-1 text-sm text-ink-2">{job.stage}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/jobs/${job.id}/copilot`} variant="ghost">Copilot</ButtonLink>
          <ButtonLink href={`/jobs/${job.id}/walls`} variant="ghost">Wall map</ButtonLink>
          <ButtonLink href={`/jobs/${job.id}/console`} variant="ghost">Agent console</ButtonLink>
          <ButtonLink href={`/jobs/${job.id}/report?data=${source}`}>Owner report</ButtonLink>
        </div>
      </div>
      <div className="mt-4"><DataSwitch href={`/jobs/${job.id}`} source={source} verified={live.evidence.filter((e) => e.verified).length} /></div>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={String(board.circuits.length)} label="Circuits checked" />
        <Stat value={String(counts.fail)} label="Must fix before plaster" tone="fail" />
        <Stat value={String(counts.warn)} label="To check" tone="warn" />
        <Stat value={String(fixes.length)} label="Distinct fixes" tone="ink" />
      </div>

      <Section title="Fix before plaster" aside={<StatusChip status={verdict} label={verdict === "pass" || verdict === "info" ? "Ready to plaster" : "Not ready to plaster"} />}>
        <ol className="space-y-2">
          {fixes.map((g, i) => (
            <li key={g.fix} className="flex items-start gap-3 rounded-lg border border-line bg-card p-3">
              <span className="font-mono text-sm text-muted">{String(i + 1).padStart(2, "0")}</span>
              <div className="flex-1">
                <div className="font-medium">{g.fix}</div>
                <div className="mt-0.5 text-xs text-muted">
                  Clears {g.findings.length} flag{g.findings.length > 1 ? "s" : ""}: {[...new Set(g.findings.map((f) => f.circuitId ? board.circuits.find((c) => c.circuit.id === f.circuitId)?.circuit.name : f.where ?? "Board"))].join(", ")}
                </div>
              </div>
              <StatusChip status={g.status} />
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Circuits">
        <div className="overflow-x-auto rounded-lg border border-line bg-card">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">Circuit</th>
                <th className="px-4 py-3">Cable</th>
                <th className="px-4 py-3">Breaker</th>
                <th className="px-4 py-3">Load Ib</th>
                <th className="px-4 py-3">Capacity Iz</th>
                <th className="px-4 py-3">Volt drop</th>
                <th className="px-4 py-3">Verdict</th>
              </tr>
            </thead>
            <tbody>
              {board.circuits.map(({ circuit: c, verdict, numbers: n }) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-paper">
                  <td className="px-4 py-3 font-medium">
                    <Link href={`/jobs/${job.id}/circuits/${c.id}?data=${source}`} className="hover:text-copper">{c.name}</Link>
                  </td>
                  <td className="px-4 py-3">{c.cable.printedSize?.value ?? "?"} mm²{c.cable.printedSize && c.cable.printedSize.value !== c.designSize && <span className="text-fail"> (paid for {c.designSize})</span>}</td>
                  <td className="px-4 py-3">{c.device ? `${c.device.value.curve ?? ""}${c.device.value.ratingA} A` : "?"}</td>
                  <td className="px-4 py-3 tabular-nums">{n.designCurrentA == null ? "—" : `${r1(n.designCurrentA)} A`}</td>
                  <td className="px-4 py-3 tabular-nums">{r1(n.correctedCapacityA)} A</td>
                  <td className="px-4 py-3 tabular-nums">{n.voltDropPct != null ? `${r1(n.voltDropPct * 100)}%` : "—"}</td>
                  <td className="px-4 py-3"><StatusChip status={verdict} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {board.findings.length > 0 && (
        <Section title={`Board: ${job.board.name}`}>
          <div className="grid gap-3 md:grid-cols-2">
            {board.findings.map((f) => <FindingCard key={f.ruleId} f={f} />)}
          </div>
        </Section>
      )}

      <Section title="Capture checklist">
        <ul className="grid gap-2 sm:grid-cols-2">
          {checklist.map((k) => (
            <li key={k.id} className="flex items-center gap-2 rounded-md border border-line bg-card px-3 py-2 text-sm">
              <span aria-hidden className={k.done ? "text-pass" : "text-muted"}>{k.done ? "☑" : "☐"}</span>
              {k.label}
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function JobPage(props: PageProps<"/jobs/[id]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobView {...props} />
    </Suspense>
  );
}
