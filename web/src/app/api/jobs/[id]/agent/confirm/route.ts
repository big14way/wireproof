import { getCase, saveCase } from "@/lib/agent/case";
import { getJob } from "@/lib/jobs";

/** The human step: the electrician reads the memo and signs it off. The agent can't do this for them. */
export async function POST(_request: Request, ctx: RouteContext<"/api/jobs/[id]/agent/confirm">) {
  const job = getJob((await ctx.params).id);
  if (!job) return Response.json({ ok: false, error: "No such job" }, { status: 404 });
  const c = await getCase(job);
  if (!c.memo) return Response.json({ ok: false, error: "There is no memo to confirm yet" }, { status: 409 });
  c.memo = { ...c.memo, status: "confirmed", confirmedAt: new Date().toISOString() };
  for (const item of c.checklist) if (item.id === "confirm") Object.assign(item, { done: true, by: "electrician" });
  await saveCase(c);
  return Response.json({ ok: true, case: c });
}
