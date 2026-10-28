import { samImage } from "@/lib/meta/sam";
import { buildWallMap } from "@/lib/wallmap";
import { checkDataUrl, errorResponse } from "../_errors";

/**
 * Map the cable runs in a chased, unplastered wall. SAM 3.1 segments the conduit and the blocks;
 * the block grid turns pixels into centimetres; the rules check the safe zones.
 */
export async function POST(request: Request) {
  try {
    const { media } = await request.json();
    const dataUrl = checkDataUrl(media, "image");
    const [blocks, conduitFirst] = await Promise.all([
      samImage(dataUrl, "concrete block"),
      samImage(dataUrl, "conduit", { lines: true }),
    ]);
    // "conduit" is the precise word; "pipe" catches PVC conduit SAM doesn't know by name.
    const conduits = conduitFirst.objects.length ? conduitFirst : await samImage(dataUrl, "pipe", { lines: true });
    const width = conduits.width || blocks.width;
    const height = conduits.height || blocks.height;
    const map = buildWallMap({ width, height, conduits: conduits.objects, blocks: blocks.objects });
    return Response.json({
      ok: true, width, height, map,
      concept: conduitFirst.objects.length ? "conduit" : "pipe",
      blocks: blocks.objects.map((b) => ({ ...b.box })),
      ms: Math.max(blocks.ms, conduitFirst.ms) + (conduits === conduitFirst ? 0 : conduits.ms),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
