import Link from "next/link";
import { Suspense } from "react";
import { ButtonLink, PageSkeleton } from "@/components/ui";
import { listJobs } from "@/lib/jobs";

async function JobList() {
  const jobs = listJobs();
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Jobs</h1>
          <p className="mt-1 text-sm text-muted">Every house on this copilot. Start one on the phone before the first conduit goes in.</p>
        </div>
        <ButtonLink href="/jobs/new">Start a job</ButtonLink>
      </div>
      <ul className="mt-6 space-y-2">
        {jobs.map((j) => (
          <li key={j.id}>
            <Link href={`/jobs/${j.id}`} className="block rounded-xl border border-line bg-card p-4 hover:border-copper">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-semibold">{j.title}</span>
                <span className="text-xs text-muted">{j.createdAt}</span>
              </div>
              <div className="mt-0.5 text-sm text-muted">{j.address} · {j.board.circuits.length} circuits{j.id === "demo" ? " · sample" : ""}</div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function JobsPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <JobList />
    </Suspense>
  );
}
