import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { connection } from "next/server";
import { SAM, SPARK, VOICE } from "@/lib/meta/client";
import { gateInfo } from "@/lib/meta/gatemodel";
import { MUSE_IMAGE } from "@/lib/meta/image";
import { DATA_DIR, HOSTED } from "@/lib/paths";

const NEEDED = [SPARK, SAM, VOICE, MUSE_IMAGE];

/**
 * Run this from the deploy host before trusting it: some cloud regions get an empty model list (and 404 on every
 * call) from Meta's API with a key that works elsewhere. Listing models spends no credits. Open without the passcode;
 * it shows model ids and yes/no answers, never a key.
 */
export async function GET() {
  await connection();
  const meta: { reachable: boolean; status?: number; models: string[]; missing: string[]; error?: string } = { reachable: false, models: [], missing: NEEDED };
  const key = process.env.MODEL_API_KEY;
  if (!key) meta.error = "MODEL_API_KEY is not set";
  else {
    try {
      const res = await fetch("https://api.meta.ai/v1/models", { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(10_000) });
      meta.status = res.status;
      const body = await res.json().catch(() => ({}));
      meta.models = ((body?.data ?? []) as { id: string }[]).map((m) => m.id).sort();
      meta.missing = NEEDED.filter((m) => !meta.models.includes(m));
      meta.reachable = res.ok;
      if (!res.ok) meta.error = body?.error?.message ?? `${res.status} ${res.statusText}`;
    } catch (e) {
      meta.error = e instanceof Error ? e.message : String(e);
    }
  }

  let dataWritable = false;
  try {
    await mkdir(DATA_DIR, { recursive: true });
    const probe = path.join(DATA_DIR, `.health-${process.pid}`);
    await writeFile(probe, "ok");
    await rm(probe);
    dataWritable = true;
  } catch {
    // read-only host: cases and media last only as long as the process
  }

  const gate = gateInfo();
  const ok = meta.reachable && meta.missing.length === 0;
  return Response.json(
    { ok, meta, privacyGate: gate, dataWritable, hosted: HOSTED, passcode: Boolean(process.env.SITE_PASSCODE?.trim()) },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
