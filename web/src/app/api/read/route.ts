import { SPARK } from "@/lib/meta/client";
import { guarded } from "@/lib/meta/guard";
import { readBoard, readCable, readMagnet } from "@/lib/meta/readers";
import { checkDataUrl, errorResponse } from "../_errors";

/** Read one photo or clip: a cable print, a distribution board, or a magnet test. Glimmer gates it first. */
export async function POST(request: Request) {
  try {
    const { task, media, poster } = await request.json();
    if (task === "cable") {
      const dataUrl = checkDataUrl(media, "image");
      const { result, gate } = await guarded({ route: "read/cable", model: SPARK, media: dataUrl, expected: "cable_print" }, () => readCable({ kind: "image", dataUrl }));
      return Response.json({ ok: true, task, ...result, gate });
    }
    if (task === "board") {
      const dataUrl = checkDataUrl(media, "image");
      const { result, gate } = await guarded({ route: "read/board", model: SPARK, media: dataUrl, expected: "distribution_board" }, () => readBoard({ kind: "image", dataUrl }));
      return Response.json({ ok: true, task, ...result, gate });
    }
    if (task === "magnet") {
      const clip = checkDataUrl(media, "video");
      // Glimmer reads stills, so the gate checks a frame from the clip; the clip itself goes to Muse Spark.
      const still = poster ? checkDataUrl(poster, "image") : null;
      const run = () => readMagnet({ kind: "video", dataUrl: clip });
      const out = still ? await guarded({ route: "read/magnet", model: SPARK, media: still, expected: "cable_print" }, run) : { result: await run(), gate: { status: "off" as const } };
      return Response.json({ ok: true, task, ...out.result, gate: out.gate });
    }
    return Response.json({ ok: false, error: "task must be cable, board or magnet" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
