import { guarded } from "@/lib/meta/guard";
import { editImage, MUSE_IMAGE, RENDERS, type RenderKind } from "@/lib/meta/image";
import { checkDataUrl, errorResponse } from "../_errors";

/** Muse Image renders on the owner's own photo: the wall after plaster, or the board after the fix. */
export async function POST(request: Request) {
  try {
    const { media, kind } = await request.json();
    if (!(kind in RENDERS)) return Response.json({ ok: false, error: `kind must be one of ${Object.keys(RENDERS).join(", ")}` }, { status: 400 });
    const dataUrl = checkDataUrl(media, "image");
    const expected = kind === "wall-plastered" ? "chased_wall" : "distribution_board";
    const { result: out, gate } = await guarded({ route: `render/${kind}`, model: MUSE_IMAGE, media: dataUrl, expected }, () => editImage(dataUrl, RENDERS[kind as RenderKind]));
    return Response.json({ ok: true, kind, image: out.dataUrl, ms: out.ms, model: MUSE_IMAGE, gate });
  } catch (e) {
    return errorResponse(e);
  }
}
