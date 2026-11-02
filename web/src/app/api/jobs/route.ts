import { connection } from "next/server";
import { createJob, listJobs, type NewJobInput } from "@/lib/jobs";

/** The jobs on this machine, and the form that starts a new one. Behind the passcode like every other job route. */
export async function GET() {
  await connection();
  return Response.json({ ok: true, jobs: listJobs().map((j) => ({ id: j.id, title: j.title, address: j.address, createdAt: j.createdAt, circuits: j.board.circuits.length })) });
}

export async function POST(request: Request) {
  try {
    const input = (await request.json()) as NewJobInput;
    if (!Array.isArray(input?.circuits)) return Response.json({ ok: false, error: "Pick the circuits on the board" }, { status: 400 });
    const job = createJob(input);
    return Response.json({ ok: true, id: job.id, circuits: job.board.circuits.map((c) => ({ id: c.id, name: c.name, designSize: c.designSize })) });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "Could not start the job" }, { status: 400 });
  }
}
