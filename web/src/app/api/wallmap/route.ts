import { SAM } from "@/lib/meta/client";
import { guarded } from "@/lib/meta/guard";
import { traceWall } from "@/lib/meta/sam";
import { checkDataUrl, errorResponse } from "../_errors";

/** Map the cable runs in a chased, unplastered wall photo (see traceWall). */
export async function POST(request: Request) {
  try {
    const { media } = await request.json();
    const dataUrl = checkDataUrl(media, "image");
    const { result: t, gate } = await guarded({ route: "wallmap", model: SAM, media: dataUrl, expected: "chased_wall" }, () => traceWall(dataUrl));
    return Response.json({
      ok: true, width: t.width, height: t.height, map: t.map, gate, concept: t.concept, ms: t.ms,
      blocks: t.blocks.objects.map((b) => ({ ...b.box })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
