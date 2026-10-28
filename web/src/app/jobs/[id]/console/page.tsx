import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { getJob } from "@/lib/jobs";
import AgentConsole from "./AgentConsole";

async function ConsoleView(props: { params: PageProps<"/jobs/[id]/console">["params"] }) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href={`/jobs/${job.id}`} className="text-sm text-muted hover:text-copper">← {job.title}</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Agent console</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Every request is plan → act → observe. Muse Spark picks the tools; the tools read the media and run the
            regulations; code checks every reading, tick and number; the electrician signs off before the owner sees anything.
          </p>
        </div>
        <ul className="rounded-lg border border-line bg-ink p-3 text-xs text-white/85">
          <li>No reading without a frame to point at.</li>
          <li>Code applies the regulations; the model never passes or fails a circuit.</li>
          <li>Unsure? Ask for another shot instead of guessing.</li>
          <li>Never guide work on a live circuit.</li>
        </ul>
      </div>
      <AgentConsole jobId={job.id} />
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
