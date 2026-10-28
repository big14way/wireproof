import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataSwitch } from "@/components/DataSwitch";
import { EvidenceTag, StatusChip, PageSkeleton } from "@/components/ui";
import { WallOverlay } from "@/components/WallOverlay";
import { mediaUrl } from "@/lib/agent/case";
import { jobData } from "@/lib/agent/jobdata";
import type { CaseRecord } from "@/lib/agent/types";
import { TOOL_LABEL } from "@/lib/agent/view";
import { getJob } from "@/lib/jobs";
import { summariseBoard } from "@/lib/summary";

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

/** Has the electrician signed this off? The owner sees the answer before anything else. */
function SignOff({ c, electrician }: { c: CaseRecord; electrician: string }) {
  const memo = c.memo;
  if (memo?.status === "confirmed") {
    return <p className="mt-4 rounded-lg bg-pass-soft px-4 py-2 text-sm font-semibold text-pass">✓ Confirmed by {electrician} in the app, {when(memo.confirmedAt!)}</p>;
  }
  if (memo) return <p className="mt-4 rounded-lg bg-warn-soft px-4 py-2 text-sm font-semibold text-warn">Draft: the electrician has not confirmed this report yet.</p>;
  return <p className="mt-4 rounded-lg bg-paper px-4 py-2 text-sm text-muted">In progress: the electrician is still capturing this job.</p>;
}

function Walls({ c }: { c: CaseRecord }) {
  const verified = new Set(c.evidence.filter((e) => e.verified).map((e) => e.id));
  const walls = (c.walls ?? []).filter((w) => verified.has(w.evidenceId));
  if (!walls.length) {
    return <p className="mt-2 rounded-lg border border-dashed border-line bg-paper p-6 text-center text-sm text-muted">No walls mapped yet. The electrician photographs each chased wall before it is plastered.</p>;
  }
  return (
    <div className="mt-2 space-y-6">
      {walls.map((w) => (
        <div key={w.id}>
          <div className="grid gap-3 sm:grid-cols-2">
            <figure>
              <div className="relative overflow-hidden rounded-lg border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={mediaUrl(c.jobId, w.mediaId)} alt={`Wall ${w.id} before plaster`} className="block w-full" />
                <WallOverlay map={w.map} width={w.width} height={w.height} />
              </div>
              <figcaption className="mt-1 text-xs text-muted">Before plaster: runs traced by SAM 3.1 [{w.evidenceId}]</figcaption>
            </figure>
            {w.renderMediaId && (
              <figure>
                <div className="relative overflow-hidden rounded-lg border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(c.jobId, w.renderMediaId)} alt={`Wall ${w.id} after plaster, with the cables shown`} className="block w-full" />
                  <WallOverlay map={w.map} width={w.width} height={w.height} xray />
                </div>
                <figcaption className="mt-1 text-xs text-muted">After plaster, X-ray. The render (Muse Image) is an illustration; the lines are the measured map.</figcaption>
              </figure>
            )}
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {w.map.runs.map((r) => (
              <li key={r.id} className={r.orientation === "diagonal" ? "text-fail" : ""}>
                <span className="font-mono">{r.id}</span> {r.orientation}, {r.lengthCm} cm, from {r.from.x} cm across and {r.from.y} cm up to {r.to.x}, {r.to.y} cm
              </li>
            ))}
          </ul>
          {w.map.findings.filter((f) => f.status !== "pass").map((f) => (
            <p key={f.ruleId + f.title} className="mt-1 text-sm"><StatusChip status={f.status} /> {f.title}. <span className="text-xs text-muted">({f.citation})</span></p>
          ))}
        </div>
      ))}
      <p className="text-xs text-muted">Keep nails and drills 15 cm clear of every line.</p>
    </div>
  );
}

/** Every photo and clip a verified reading came from. */
function Photos({ c }: { c: CaseRecord }) {
  const used = c.evidence.filter((e) => e.verified && e.mediaId);
  if (!used.length) return null;
  return (
    <>
      <h2 className="mt-6 font-semibold">The photos behind this report</h2>
      <div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {used.map((e) => {
          const m = c.media.find((x) => x.id === e.mediaId)!;
          const poster = m.posterId ?? (m.kind === "photo" ? m.id : undefined);
          return (
            <a key={e.id} href={mediaUrl(c.jobId, m.id)} target="_blank" rel="noreferrer" className="block rounded-lg border border-line p-1 hover:border-copper">
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(c.jobId, poster)} alt={e.summary} className="aspect-[4/3] w-full rounded object-cover" />
              ) : (
                <div className="grid aspect-[4/3] place-items-center rounded bg-paper text-2xl">▶</div>
              )}
              <p className="mt-1 px-1 text-xs"><span className="font-mono">{e.id}</span> · {TOOL_LABEL[e.tool] ?? e.tool}{e.circuitId ? ` · ${e.circuitId}` : ""}</p>
              <p className="line-clamp-2 px-1 text-xs text-muted">{e.summary}</p>
            </a>
          );
        })}
      </div>
    </>
  );
}

async function ReportView(props: PageProps<"/jobs/[id]/report">) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  const { source, board: b, walls, live } = await jobData(job, (await props.searchParams).data);
  const { board, fixes, counts } = summariseBoard(b, walls);
  const isLive = source === "live";
  const memo = isLive ? live.memo : undefined;
  const confirmed = memo?.status === "confirmed";

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-4 print:hidden"><DataSwitch href={`/jobs/${job.id}/report`} source={source} verified={live.evidence.filter((e) => e.verified).length} /></div>
      <div className="rounded-xl border border-line bg-card p-6">
        <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-copper">WireProof report · pre-inspection pack{isLive ? "" : " · sample"}</p>
            <h1 className="mt-1 text-2xl font-semibold">{job.title}</h1>
            <p className="text-sm text-muted">{job.address} · {isLive ? when(live.createdAt) : job.createdAt}</p>
          </div>
          <div className="text-right text-xs text-muted">
            <div>Owner: {job.owner.name}</div>
            <div>Electrician: {job.electrician.name}</div>
            <div>{job.electrician.licence}</div>
          </div>
        </div>

        {isLive && <SignOff c={live} electrician={job.electrician.name} />}

        <div className={`mt-5 rounded-lg p-4 ${counts.fail ? "bg-fail-soft" : counts.warn ? "bg-warn-soft" : "bg-pass-soft"}`}>
          <div className={`text-lg font-semibold ${counts.fail ? "text-fail" : counts.warn ? "text-warn" : "text-pass"}`}>
            {counts.fail ? "Do not plaster yet" : counts.warn ? "Not finished yet" : "Ready to plaster"}
          </div>
          <p className="mt-1 text-sm text-ink-2">
            {counts.fail
              ? `${counts.fail} problems must be fixed while the wiring is still visible. ${fixes.length} fixes clear all of them.`
              : counts.warn
                ? `${counts.warn} checks still need a photo, a clip or the electrician's word before this job can pass.`
                : "Every circuit passed. Keep this report: it records where each cable runs inside your walls."}
          </p>
        </div>

        {memo && (
          <div className="mt-5 border-l-4 border-copper pl-4">
            <p className="text-sm">{memo.summary}</p>
            <p className="mt-1 text-xs text-muted">
              Summary written by Muse Spark{confirmed ? ", confirmed by the electrician" : ", not yet confirmed"}.
              {memo.summaryCheck.ok ? "" : ` These numbers came from no reading: ${memo.summaryCheck.unknown.join(", ")}.`}
            </p>
          </div>
        )}

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
                  <li key={`${f.circuitId ?? f.where}-${f.ruleId}-${f.title}`}>
                    <span className="font-medium">{f.circuitId ? board.circuits.find((c) => c.circuit.id === f.circuitId)?.circuit.name : f.where ?? job.board.name}:</span>{" "}
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
        {isLive ? (
          <Walls c={live} />
        ) : (
          <div className="mt-2 grid h-40 place-items-center rounded-lg border border-dashed border-line bg-paper p-4 text-center text-sm text-muted">
            The cable map appears here once the chased walls are photographed (SAM 3.1 on the block grid). See the live case or the Wall map.
          </div>
        )}

        {isLive && <Photos c={live} />}

        <div className="mt-6 grid grid-cols-2 gap-6 border-t border-line pt-4 text-sm">
          <div>
            <div className="text-muted">Confirmed by electrician</div>
            {confirmed ? <div className="mt-2 font-semibold text-pass">✓ In the app, {when(memo!.confirmedAt!)}</div> : <div className="mt-6 border-b border-ink" />}
            <div className="mt-1 text-xs text-muted">{job.electrician.name}</div>
          </div>
          <div>
            <div className="text-muted">Received by owner</div>
            <div className="mt-6 border-b border-ink" />
            <div className="mt-1 text-xs text-muted">{job.owner.name}</div>
          </div>
        </div>
        <p className="mt-4 text-xs text-muted">
          Screening report, not a certificate. Readings come from photos and clips read by Meta&apos;s models and checked by
          code; every decision is made by fixed rules from the IET Wiring Regulations (BS 7671), cited beside each item.
          NEMSA inspection and certification still apply.
        </p>
      </div>
    </div>
  );
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function ReportPage(props: PageProps<"/jobs/[id]/report">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ReportView {...props} />
    </Suspense>
  );
}
