import { getCase, mediaDataUrl } from "@/lib/agent/case";
import { getJob } from "@/lib/jobs";

/** A photo or clip from the case, so the owner can see the frame behind every reading. */
export async function GET(_request: Request, ctx: RouteContext<"/api/jobs/[id]/media/[mid]">) {
  const { id, mid } = await ctx.params;
  const job = getJob(id);
  const c = job && (await getCase(job));
  const ref = c?.media.find((m) => m.id === mid);
  if (!c || !ref) return new Response("Not found", { status: 404 });
  try {
    const url = await mediaDataUrl(c, ref);
    // Ids restart when a case is reset, so never let a browser keep an old frame under the same id.
    return new Response(Buffer.from(url.slice(url.indexOf(",") + 1), "base64"), { headers: { "Content-Type": ref.mime, "Cache-Control": "no-store" } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
