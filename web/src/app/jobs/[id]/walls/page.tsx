import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/ui";
import { getJob } from "@/lib/jobs";
import WallMapper from "./WallMapper";

async function WallsView(props: { params: PageProps<"/jobs/[id]/walls">["params"] }) {
  const { id } = await props.params;
  if (!getJob(id)) notFound();
  return <WallMapper />;
}

// Reading params suspends; the skeleton keeps the page shell instant (Next 16 Cache Components).
export default function WallsPage(props: PageProps<"/jobs/[id]/walls">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <WallsView params={props.params} />
    </Suspense>
  );
}
