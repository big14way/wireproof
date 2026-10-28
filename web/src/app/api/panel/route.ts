import { readBoard } from "@/lib/meta/readers";
import { panelFindings } from "@/lib/panel";
import { checkDataUrl, errorResponse } from "../_errors";

/** "Read a breaker panel": Muse Spark reads the devices, the rules engine judges the board. */
export async function POST(request: Request) {
  try {
    const { media } = await request.json();
    const reading = await readBoard({ kind: "image", dataUrl: checkDataUrl(media, "image") });
    return Response.json({ ok: true, ...reading, findings: panelFindings(reading.value) });
  } catch (e) {
    return errorResponse(e);
  }
}
