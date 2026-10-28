import { editImage, RENDERS, type RenderKind } from "@/lib/meta/image";
import { checkDataUrl, errorResponse } from "../_errors";

/** Muse Image renders on the owner's own photo: the wall after plaster, or the board after the fix. */
export async function POST(request: Request) {
  try {
    const { media, kind } = await request.json();
    if (!(kind in RENDERS)) return Response.json({ ok: false, error: `kind must be one of ${Object.keys(RENDERS).join(", ")}` }, { status: 400 });
    const out = await editImage(checkDataUrl(media, "image"), RENDERS[kind as RenderKind]);
    return Response.json({ ok: true, kind, image: out.dataUrl, ms: out.ms, model: "muse-image-1.0" });
  } catch (e) {
    return errorResponse(e);
  }
}
