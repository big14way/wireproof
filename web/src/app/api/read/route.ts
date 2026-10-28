import { readBoard, readCable, readMagnet } from "@/lib/meta/readers";
import { checkDataUrl, errorResponse } from "../_errors";

/** Read one photo or clip: a cable print, a distribution board, or a magnet test. */
export async function POST(request: Request) {
  try {
    const { task, media } = await request.json();
    if (task === "cable") return Response.json({ ok: true, task, ...(await readCable({ kind: "image", dataUrl: checkDataUrl(media, "image") })) });
    if (task === "board") return Response.json({ ok: true, task, ...(await readBoard({ kind: "image", dataUrl: checkDataUrl(media, "image") })) });
    if (task === "magnet") return Response.json({ ok: true, task, ...(await readMagnet({ kind: "video", dataUrl: checkDataUrl(media, "video") })) });
    return Response.json({ ok: false, error: "task must be cable, board or magnet" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
