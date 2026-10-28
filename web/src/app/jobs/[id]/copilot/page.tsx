import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { getJob } from "@/lib/jobs";
import Copilot from "./Copilot";

async function CopilotView(props: { params: PageProps<"/jobs/[id]/copilot">["params"] }) {
  const { id } = await props.params;
  const job = getJob(id);
  if (!job) notFound();
  return <Copilot jobId={job.id} jobTitle={`${job.title} · ${job.address}`} circuits={job.board.circuits.map(({ id, name }) => ({ id, name }))} />;
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function CopilotPage(props: PageProps<"/jobs/[id]/copilot">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <CopilotView params={props.params} />
    </Suspense>
  );
}
