import { SPARK } from "@/lib/meta/client";
import { guarded } from "@/lib/meta/guard";
import { readBoard } from "@/lib/meta/readers";
import { panelFindings } from "@/lib/panel";
import { checkDataUrl, errorResponse } from "../_errors";

/** "Read a breaker panel": the privacy gate checks the photo, Muse Spark reads the devices, the rules judge the board. */
export async function POST(request: Request) {
  try {
    const { media } = await request.json();
    const dataUrl = checkDataUrl(media, "image");
    const { result, gate } = await guarded({ route: "panel", model: SPARK, media: dataUrl, expected: "distribution_board" }, () => readBoard({ kind: "image", dataUrl }));
    return Response.json({ ok: true, ...result, gate, findings: panelFindings(result.value) });
  } catch (e) {
    return errorResponse(e);
  }
}
