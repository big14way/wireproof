import { connection } from "next/server";
import { readEgress } from "@/lib/egress";
import { glimmerConfigured, glimmerHost, GLIMMER_MODEL } from "@/lib/meta/glimmer";

/** What left for Meta's hosted models, what Glimmer stopped, and whether the gate is on. */
export async function GET() {
  await connection(); // always fresh: the log changes with every request
  return Response.json({
    glimmer: { configured: glimmerConfigured(), model: GLIMMER_MODEL, host: glimmerHost() },
    entries: await readEgress(50),
  });
}
