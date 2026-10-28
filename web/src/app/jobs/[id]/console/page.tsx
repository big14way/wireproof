import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { getJob } from "@/lib/jobs";
import EgressLog from "./EgressLog";

async function ConsoleView(props: { params: PageProps<"/jobs/[id]/console">["params"] }) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  const done = job.checklist.filter((k) => k.done).length;

  return (
    <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 lg:grid-cols-[1fr_320px]">
      <div>
        <Link href={`/jobs/${job.id}`} className="text-sm text-muted hover:text-copper">← {job.title}</Link>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Agent console</h1>
        <p className="mt-1 text-sm text-ink-2">
          Every turn is plan → act → observe. Models read the media; the rules engine makes the calls; the
          electrician confirms before the owner sees anything.
        </p>
        <ol className="mt-6 space-y-3">
          {job.trace.map((t) => (
            <li key={t.n} className="rounded-lg border border-line bg-card">
              <details open={t.n >= job.trace.length - 2}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3">
                  <span className="font-mono text-xs text-muted">turn {String(t.n).padStart(2, "0")}</span>
                  <span className="rounded bg-ink px-2 py-0.5 font-mono text-xs text-white">{t.tool}</span>
                  {t.model && <span className="rounded bg-copper-soft px-2 py-0.5 font-mono text-xs text-copper">{t.model}</span>}
                  <span className="flex-1 truncate text-sm">{t.plan}</span>
                  {t.ms != null && <span className="font-mono text-xs text-muted">{t.ms >= 1000 ? `${(t.ms / 1000).toFixed(1)} s` : `${t.ms} ms`}</span>}
                </summary>
                <div className="grid gap-3 border-t border-line px-4 py-3 text-sm sm:grid-cols-3">
                  <div><div className="text-xs font-semibold uppercase text-muted">Plan</div><p className="mt-1">{t.plan}</p></div>
                  <div>
                    <div className="text-xs font-semibold uppercase text-muted">Act</div>
                    <pre className="mt-1 overflow-x-auto rounded bg-paper p-2 font-mono text-xs">{`${t.tool}(${t.args ? JSON.stringify(t.args) : ""})`}</pre>
                  </div>
                  <div><div className="text-xs font-semibold uppercase text-muted">Observe</div><p className="mt-1">{t.observation}</p></div>
                </div>
              </details>
            </li>
          ))}
        </ol>
      </div>

      <aside className="space-y-4">
        <EgressLog />
        <div className="rounded-lg border border-line bg-card p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Checklist</h2>
            <span className="text-xs text-muted">{done}/{job.checklist.length}</span>
          </div>
          <ul className="mt-3 space-y-2 text-sm">
            {job.checklist.map((k) => (
              <li key={k.id} className="flex gap-2">
                <span aria-hidden className={k.done ? "text-pass" : "text-muted"}>{k.done ? "☑" : "☐"}</span>
                <span className={k.done ? "text-ink-2" : ""}>{k.label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-line bg-ink p-4 text-sm text-white/85">
          <h2 className="font-semibold text-white">Ground rules</h2>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>No reading without a frame to point at.</li>
            <li>Code applies the regulations; the model never passes or fails a circuit.</li>
            <li>Unsure? Ask for another shot instead of guessing.</li>
            <li>Never guide work on a live circuit.</li>
          </ul>
        </div>
      </aside>
    </div>
  );
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function ConsolePage(props: PageProps<"/jobs/[id]/console">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ConsoleView params={props.params} />
    </Suspense>
  );
}
