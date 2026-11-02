import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DataSwitch } from "@/components/DataSwitch";
import { PageSkeleton, StatusChip } from "@/components/ui";
import { WallOverlay } from "@/components/WallOverlay";
import { WhatsAppShare } from "@/components/WhatsAppShare";
import { ACCESS_HEADER } from "@/lib/access";
import { mediaUrl } from "@/lib/agent/case";
import { jobData } from "@/lib/agent/jobdata";
import type { CaseRecord } from "@/lib/agent/types";
import { getJob, type Job } from "@/lib/jobs";
import { PASSCODE, shareToken } from "@/lib/passcode";
import type { CircuitResult, Evidence, Finding } from "@/lib/rules";
import { summariseBoard, type FixGroup } from "@/lib/summary";

/*
 * The owner's report. It is read on a phone, in WhatsApp, by someone who is not an electrician, so it answers
 * their questions in order: can they plaster, what must be fixed, what is the proof, who signed it. The
 * regulation behind each item stays on the page for the inspector, one tap away.
 */

const when = (iso: string) => new Date(iso).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

type Counts = ReturnType<typeof summariseBoard>["counts"];
type Circuits = CircuitResult[];

/** The verdict at the top of the report, and the first line of the WhatsApp message. */
function headline(counts: Counts, fixes: FixGroup[]) {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  // Only the fixes that clear a failure; the rest are checks still to do.
  const failFixes = fixes.filter((g) => g.status === "fail").length;
  if (counts.fail) {
    return {
      title: "Do not plaster yet",
      detail: `${n(counts.fail, "problem", "problems")} must be fixed while the wiring is still visible. ${failFixes === 1 ? "1 fix clears" : `${failFixes} fixes clear`} ${counts.fail === 1 ? "it" : "them all"}.`,
    };
  }
  if (counts.warn) return { title: "Not finished yet", detail: `${n(counts.warn, "check still needs", "checks still need")} a photo, a clip or the electrician's word before this job can pass.` };
  return { title: "Ready to plaster", detail: "Every circuit passed. Keep this report: it records where each cable runs inside your walls." };
}

/** "Lighting", "Kitchen sockets" or "Main distribution board": where a finding was made, in the owner's words. */
function placeName(f: Finding, circuits: Circuits, boardName: string) {
  if (f.circuitId) return circuits.find((c) => c.circuit.id === f.circuitId)?.circuit.name ?? f.circuitId;
  return f.where ?? boardName;
}

/** Every place a fix applies, for the WhatsApp line: "Replace with 1.5 mm² cable (Lighting, whole house)". */
function fixLine(g: FixGroup, circuits: Circuits, boardName: string) {
  const places = [...new Set(g.findings.map((f) => placeName(f, circuits, boardName)))];
  const fix = g.fix.replace(/\.$/, "");
  return places.length <= 3 ? `${fix} (${places.join(", ")})` : `${fix} (${places.length} places)`;
}

/** What the owner reads in WhatsApp before opening the link: the verdict, the first fixes and whether it's signed off. */
function whatsAppText(job: Job, counts: Counts, fixes: FixGroup[], circuits: Circuits, c: CaseRecord | undefined, sample: boolean) {
  const h = headline(counts, fixes);
  const memo = c?.memo;
  const status = memo?.status === "confirmed"
    ? `✓ Confirmed by ${job.electrician.name} in the app, ${when(memo.confirmedAt!)}.`
    : memo ? "Draft: the electrician has not confirmed this report yet." : "In progress: the electrician is still capturing this job.";
  const must = fixes.filter((g) => g.status === "fail");
  return [
    `*WireProof report*${sample ? " (sample data)" : ""} · ${job.title}`,
    `*${h.title}.* ${h.detail}`,
    ...must.slice(0, 3).map((g, i) => `${i + 1}. ${fixLine(g, circuits, job.board.name)}`),
    ...(must.length > 3 ? [`…and ${must.length - 3} more in the report.`] : []),
    sample ? "" : status,
    "Screening report, not a certificate. Open it for the photo behind every reading and the map of your cables:",
  ].filter(Boolean).join("\n");
}

/** WhatsApp wants the number as digits with the country code; a masked or partial number leaves the contact to pick. */
const waNumber = (phone: string) => {
  const digits = phone.replace(/[\s()+-]/g, "");
  return /^\d{10,15}$/.test(digits) ? digits : undefined;
};

/** The memo is drafted before the electrician confirms it, so its "confirm in app" tail is stale once they have. */
const memoText = (summary: string, confirmed: boolean) =>
  confirmed ? summary.replace(/\s*[^.]*\b(confirm in (the )?app|still unverified)\b[^.]*\.?/gi, "").trim() : summary;

/** The proof beside a finding: the photo itself when there is one, the electrician's words when it was said. */
function Proof({ ev }: { ev: Evidence }) {
  if (ev.src && ev.kind !== "voice") {
    return (
      <a href={ev.src} target="_blank" rel="noreferrer" className="flex items-center gap-3 rounded-lg border border-line bg-paper p-1.5 pr-3 hover:border-copper" title="Open the photo">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ev.src} alt="" className="h-14 w-14 shrink-0 rounded-md object-cover" />
        <span className="min-w-0 text-xs text-ink-2">
          <span className="block font-medium text-ink">{ev.kind === "clip" ? "Clip" : "Photo"} behind this reading</span>
          <span className="block truncate text-muted">{ev.note}</span>
        </span>
      </a>
    );
  }
  if (ev.kind === "voice") return <p className="rounded-lg border border-line bg-paper px-3 py-2 text-xs text-ink-2"><span aria-hidden className="mr-1 text-copper">🎙</span>The electrician said: <span className="italic">{ev.note}</span></p>;
  return <p className="text-xs text-muted">{ev.note}</p>;
}

/** One fix the electrician must make, with each place it applies and the photo that proves it. */
function MustFix({ g, i, circuits, boardName }: { g: FixGroup; i: number; circuits: Circuits; boardName: string }) {
  const rules = [...new Set(g.findings.flatMap((f) => f.citation.split("; ")))];
  // One board fix covers every circuit on it: say so in one line rather than five regulation-speak ones.
  const perCircuit = g.findings.filter((f) => f.ruleId === "RCD-30MA");
  const lines = g.findings.filter((f) => f.ruleId !== "RCD-30MA");
  // The same photo often proves several lines (one board photo, five circuits): show it once.
  const seen = new Set<string>();
  return (
    <li className="rounded-xl border border-line bg-card p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-fail text-sm font-bold text-white">{i + 1}</span>
        <h3 className="text-base font-semibold leading-snug">{g.fix.replace(/\.$/, "")}</h3>
      </div>
      <ul className="mt-3 space-y-2.5 border-l-2 border-fail-soft pl-3 text-sm text-ink-2">
        {lines.map((f) => {
          const ev = f.evidence?.[0];
          const key = ev?.src ?? ev?.id;
          const show = ev && key && !seen.has(key);
          if (key) seen.add(key);
          return (
            <li key={`${f.circuitId ?? f.where}-${f.ruleId}-${f.title}`}>
              <span className="font-semibold text-ink">{placeName(f, circuits, boardName)}:</span> {f.detail}
              {show && <div className="mt-2"><Proof ev={ev} /></div>}
            </li>
          );
        })}
        {perCircuit.length > 0 && (
          <li>
            <span className="font-semibold text-ink">Protects:</span> {perCircuit.map((f) => placeName(f, circuits, boardName)).join(", ")}.
            {lines.length === 0 && perCircuit[0].evidence?.[0] && <div className="mt-2"><Proof ev={perCircuit[0].evidence[0]} /></div>}
          </li>
        )}
      </ul>
      <p className="mt-3 text-xs text-muted">Rule: {rules.join("; ")}</p>
    </li>
  );
}

/** Checks the electrician still has to do: one line each, so five identical cards become one row. */
function StillToCheck({ groups, circuits, boardName }: { groups: FixGroup[]; circuits: Circuits; boardName: string }) {
  if (!groups.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Still to check before sign-off</h2>
      <p className="mt-0.5 text-sm text-muted">Not problems yet: readings the electrician has not captured. Each needs a photo, a clip or their word.</p>
      <ul className="mt-3 divide-y divide-line rounded-xl border border-line bg-card">
        {groups.map((g) => {
          const places = [...new Set(g.findings.map((f) => placeName(f, circuits, boardName)))];
          return (
            <li key={g.fix} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
              <div>
                <div className="font-medium">{g.findings[0].title.replace(/\.$/, "")}</div>
                <div className="text-xs text-muted">{places.length > 2 ? `${places.length} circuits` : places.join(" · ")}</div>
              </div>
              <StatusChip status="warn" />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Every circuit on the board: what cable, what breaker, and whether it passed, as cards a thumb can read. */
function CircuitCards({ circuits }: { circuits: Circuits }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Your circuits</h2>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {circuits.map(({ circuit: c, verdict, findings }) => {
          const worst = findings.find((f) => f.status === "fail") ?? findings.find((f) => f.status === "warn");
          const size = c.cable.printedSize?.value;
          return (
            <li key={c.id} className="rounded-xl border border-line bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="font-medium leading-snug">{c.name}</div>
                <StatusChip status={verdict} label={verdict === "pass" ? "Pass" : verdict === "fail" ? "Fix" : "Check"} />
              </div>
              <div className="mt-1 text-xs text-muted">
                Cable {size != null ? `${size} mm²` : "not read yet"} · breaker {c.device ? `${c.device.value.ratingA} A` : "not identified"}
              </div>
              {worst && <p className="mt-1.5 text-xs text-ink-2">{worst.title.replace(/\.$/, "")}</p>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const ORIENTATION = { vertical: "straight up and down", horizontal: "straight across", diagonal: "diagonal" } as const;

function Walls({ c }: { c: CaseRecord }) {
  const verified = new Set(c.evidence.filter((e) => e.verified).map((e) => e.id));
  const walls = (c.walls ?? []).filter((w) => verified.has(w.evidenceId));
  if (!walls.length) {
    return <p className="mt-3 rounded-xl border border-dashed border-line bg-card p-6 text-center text-sm text-muted">No walls mapped yet. The electrician photographs each chased wall before it is plastered.</p>;
  }
  return (
    <div className="mt-3 space-y-6">
      {walls.map((w) => {
        const bad = w.map.findings.filter((f) => f.status !== "pass");
        return (
          <div key={w.id} className="rounded-xl border border-line bg-card p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <figure>
                <div className="relative overflow-hidden rounded-lg">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={mediaUrl(c.jobId, w.mediaId)} alt={`Wall ${w.id} before plaster`} className="block w-full" />
                  <WallOverlay map={w.map} width={w.width} height={w.height} />
                </div>
                <figcaption className="mt-1 text-xs text-muted">Before plaster. Runs traced by SAM 3.1.</figcaption>
              </figure>
              {w.renderMediaId && (
                <figure>
                  <div className="relative overflow-hidden rounded-lg">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={mediaUrl(c.jobId, w.renderMediaId)} alt={`Wall ${w.id} after plaster, with the cables shown`} className="block w-full" />
                    <WallOverlay map={w.map} width={w.width} height={w.height} xray />
                  </div>
                  <figcaption className="mt-1 text-xs text-muted">After plaster: where the cables will be. The lines are measured; the plastered wall is an illustration.</figcaption>
                </figure>
              )}
            </div>
            <ul className="mt-3 space-y-1 text-sm">
              {w.map.runs.map((r) => (
                <li key={r.id} className="flex items-start gap-2">
                  <span aria-hidden className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${r.orientation === "diagonal" ? "bg-fail" : "bg-pass"}`} />
                  <span>A {ORIENTATION[r.orientation]} run of {r.lengthCm} cm{r.orientation === "diagonal" ? ": cables must run straight, so anyone drilling later knows where they are" : ""}.</span>
                </li>
              ))}
            </ul>
            {bad.map((f) => <p key={f.ruleId + f.title} className="mt-2 text-sm"><StatusChip status={f.status} /> {f.fix ?? f.title}</p>)}
            <details className="mt-2 text-xs text-muted">
              <summary className="cursor-pointer">Measurements and rule</summary>
              <ul className="mt-1 space-y-0.5 font-mono">
                {w.map.runs.map((r) => <li key={r.id}>{r.id} {r.orientation}, {r.lengthCm} cm, from ({r.from.x}, {r.from.y}) cm to ({r.to.x}, {r.to.y}) cm</li>)}
              </ul>
              {bad.map((f) => <p key={f.ruleId} className="mt-1 font-sans">{f.citation}</p>)}
            </details>
          </div>
        );
      })}
      <p className="text-sm font-medium">Keep nails and drills 15 cm clear of every line.</p>
    </div>
  );
}

const PROOF_LABEL: Record<string, string> = { read_board: "Distribution board", read_cable_print: "Cable print", magnet_test: "Magnet test", map_wall: "Wall before plaster" };

/** Every photo and clip a verified reading came from, labelled the way the owner thinks of them. */
function Photos({ c, circuits }: { c: CaseRecord; circuits: Circuits }) {
  const used = c.evidence.filter((e) => e.verified && e.mediaId);
  if (!used.length) return null;
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">The photos behind this report</h2>
      <p className="mt-0.5 text-sm text-muted">Tap any one to open it full size. Every reading above comes from one of these.</p>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {used.map((e) => {
          const m = c.media.find((x) => x.id === e.mediaId)!;
          const poster = m.posterId ?? (m.kind === "photo" ? m.id : undefined);
          const circuit = e.circuitId ? circuits.find((k) => k.circuit.id === e.circuitId)?.circuit.name : undefined;
          return (
            <a key={e.id} href={mediaUrl(c.jobId, m.id)} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-line bg-card hover:border-copper">
              {poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={mediaUrl(c.jobId, poster)} alt={e.summary} className="aspect-square w-full object-cover" />
              ) : (
                <div className="grid aspect-square place-items-center bg-paper text-2xl">▶</div>
              )}
              <div className="p-2">
                <p className="text-xs font-medium leading-snug">{PROOF_LABEL[e.tool] ?? e.tool}{circuit ? ` · ${circuit}` : ""}</p>
                <p className="mt-0.5 line-clamp-2 text-[11px] text-muted">{e.summary}</p>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

async function ReportView(props: PageProps<"/jobs/[id]/report">) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  const want = (await props.searchParams).data;
  const { source, board: b, walls, live } = await jobData(job, want);
  const { board, fixes, counts } = summariseBoard(b, walls);
  const isLive = source === "live";
  const memo = isLive ? live.memo : undefined;
  const confirmed = memo?.status === "confirmed";
  const verdict = headline(counts, fixes);
  const must = fixes.filter((g) => g.status === "fail");
  const checks = fixes.filter((g) => g.status !== "fail");
  const passed = board.circuits.filter((c) => c.verdict === "pass").length;
  const tone = counts.fail ? "fail" : counts.warn ? "warn" : "pass";
  const toneText = { fail: "text-fail", warn: "text-warn", pass: "text-pass" }[tone];
  const toneBg = { fail: "bg-fail-soft", warn: "bg-warn-soft", pass: "bg-pass-soft" }[tone];

  // The link opens without the passcode, but only this report. The owner forwards it; the electrician sends it to the owner.
  const owner = (await headers()).get(ACCESS_HEADER) === "share";
  const query = new URLSearchParams();
  if (PASSCODE) query.set("share", shareToken(job.id, PASSCODE));
  if (want === "live" || want === "sample") query.set("data", want);
  const sharePath = `/jobs/${job.id}/report${query.size ? `?${query}` : ""}`;
  const share = (
    <WhatsAppShare
      text={whatsAppText(job, counts, fixes, board.circuits, isLive ? live : undefined, !isLive)}
      path={sharePath}
      phone={owner ? undefined : waNumber(job.owner.phone)}
      label={owner ? "Forward on WhatsApp" : "Send to the owner on WhatsApp"}
    />
  );

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 print:hidden">
        <DataSwitch href={`/jobs/${job.id}/report`} source={source} verified={live.evidence.filter((e) => e.verified).length} />
        {share}
      </div>

      {/* The verdict: the one thing the owner came for. */}
      <header className="overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
        <div className={`px-5 pb-5 pt-6 ${toneBg}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-copper">WireProof report{isLive ? "" : " · sample"}</p>
          <h1 className={`mt-2 text-3xl font-bold leading-tight ${toneText}`}>{verdict.title}</h1>
          <p className="mt-2 max-w-prose text-base text-ink-2">{verdict.detail}</p>
          <dl className="mt-5 grid grid-cols-3 gap-2">
            {[
              [String(counts.fail), counts.fail === 1 ? "problem to fix" : "problems to fix"],
              [String(must.length), must.length === 1 ? "fix clears them" : "fixes clear them"],
              [`${passed}/${board.circuits.length}`, "circuits pass"],
            ].map(([v, l]) => (
              <div key={l} className="rounded-lg bg-card/70 px-3 py-2">
                <dt className="text-[11px] uppercase tracking-wide text-muted">{l}</dt>
                <dd className="text-xl font-bold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h2 className="text-lg font-semibold">{job.title}</h2>
            <p className="text-sm text-muted">{job.address} · {isLive ? when(live.createdAt) : job.createdAt}</p>
          </div>
          {isLive && (
            confirmed
              ? <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-pass"><span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-pass text-xs text-white">✓</span>Confirmed by {job.electrician.name}, {when(memo!.confirmedAt!)}</p>
              : memo
                ? <p className="mt-3 text-sm font-semibold text-warn">Draft: the electrician has not confirmed this report yet.</p>
                : <p className="mt-3 text-sm text-muted">In progress: the electrician is still capturing this job.</p>
          )}
          {memo && (
            <p className="mt-3 border-l-2 border-copper pl-3 text-sm text-ink-2">
              {memoText(memo.summary, confirmed)}
              <span className="block text-xs text-muted">Written by Muse Spark from the readings{confirmed ? "; confirmed by the electrician" : ""}.{memo.summaryCheck.ok ? "" : ` Numbers no reading produced: ${memo.summaryCheck.unknown.join(", ")}.`}</span>
            </p>
          )}
        </div>
      </header>

      {must.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">What must be fixed before plastering</h2>
          <p className="mt-0.5 text-sm text-muted">In order. Each one shows where, and the photo it was found in.</p>
          <ol className="mt-3 space-y-3">
            {must.map((g, i) => <MustFix key={g.fix} g={g} i={i} circuits={board.circuits} boardName={job.board.name} />)}
          </ol>
        </section>
      )}

      <StillToCheck groups={checks} circuits={board.circuits} boardName={job.board.name} />
      <CircuitCards circuits={board.circuits} />

      <section className="mt-8">
        <h2 className="text-lg font-semibold">Where your cables run</h2>
        <p className="mt-0.5 text-sm text-muted">Keep this. Once the wall is plastered, this is the only map of what is inside it.</p>
        {isLive ? (
          <Walls c={live} />
        ) : (
          <div className="mt-3 grid h-40 place-items-center rounded-xl border border-dashed border-line bg-card p-4 text-center text-sm text-muted">
            The cable map appears here once the chased walls are photographed (SAM 3.1 on the block grid). See the live case or the Wall map.
          </div>
        )}
      </section>

      {isLive && <Photos c={live} circuits={board.circuits} />}

      <section className="mt-8 rounded-xl border border-line bg-card p-4">
        <div className="grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Electrician</div>
            {confirmed ? <div className="mt-2 font-semibold text-pass">✓ Confirmed in the app<br /><span className="text-xs font-normal text-muted">{when(memo!.confirmedAt!)}</span></div> : <div className="mt-7 border-b border-ink" />}
            <div className="mt-1 text-xs text-muted">{job.electrician.name} · {job.electrician.licence}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-muted">Owner</div>
            <div className="mt-7 border-b border-ink" />
            <div className="mt-1 text-xs text-muted">{job.owner.name}</div>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          Screening report, not a certificate. Readings come from photos and clips read by Meta&apos;s models and checked by
          code; every decision is made by fixed rules from the IET Wiring Regulations (BS 7671), cited beside each item.
          NEMSA inspection and certification still apply.
        </p>
      </section>

      <div className="mt-6 flex justify-center print:hidden">{share}</div>
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
