import { connection } from "next/server";
import { readEgress } from "@/lib/egress";
import { gateInfo } from "@/lib/meta/gatemodel";

/** What left for Meta's hosted models, what the privacy gate stopped, and whether the gate is on. */
export async function GET() {
  await connection(); // always fresh: the log changes with every request
  return Response.json({ gate: gateInfo(), entries: await readEgress(50) });
}
