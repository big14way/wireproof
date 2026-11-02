import { connection } from "next/server";
import { relayTokenOk, saveRelay } from "@/lib/meta/upstream";

/** The relay (relay/meta-relay.mjs) posts its current tunnel address here every minute, signed with META_RELAY_TOKEN. */
export async function POST(request: Request) {
  await connection();
  if (!relayTokenOk(request.headers.get("x-relay-token"))) return Response.json({ ok: false, error: "bad relay token" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const base = typeof body?.base === "string" ? body.base.replace(/\/+$/, "") : "";
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(base)) return Response.json({ ok: false, error: "base must be an https origin" }, { status: 400 });
  const state = await saveRelay(base);
  return Response.json({ ok: true, at: state.at }, { headers: { "Cache-Control": "no-store" } });
}
