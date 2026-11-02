#!/usr/bin/env node
// Save this machine's live case as the seed a fresh deploy starts from: `npm run seed:save [jobId] [--all]`.
// The seed is committed to a public repo, so by default only media that a reading actually used is copied
// (anything the privacy gate blocked never produced a reading). `--all` copies everything: check it first.
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const all = args.includes("--all");
const jobId = args.find((a) => !a.startsWith("--")) ?? "demo";
const root = process.cwd();
const from = path.join(process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, ".data"), "cases");
const to = path.join(root, "seed", "cases");

const c = JSON.parse(await readFile(path.join(from, `${jobId}.json`), "utf8"));
const used = new Set();
for (const e of c.evidence) {
  if (!e.mediaId) continue;
  used.add(e.mediaId);
  const poster = c.media.find((m) => m.id === e.mediaId)?.posterId;
  if (poster) used.add(poster);
}
for (const w of c.walls ?? []) {
  used.add(w.mediaId);
  if (w.renderMediaId) used.add(w.renderMediaId);
}

await rm(path.join(to, jobId), { recursive: true, force: true });
await mkdir(path.join(to, jobId), { recursive: true });
const skipped = [];
for (const m of c.media) {
  if (!all && !used.has(m.id)) {
    skipped.push(m.id);
    continue;
  }
  const name = `${m.id}.${m.mime.split("/")[1]}`;
  await copyFile(path.join(from, jobId, name), path.join(to, jobId, name));
}
await writeFile(path.join(to, `${jobId}.json`), JSON.stringify(c, null, 1));

console.log(`Seed saved: seed/cases/${jobId}.json and ${c.media.length - skipped.length} media files.`);
console.log(`${c.evidence.filter((e) => e.verified).length} verified readings, memo ${c.memo?.status ?? "not drafted"}.`);
if (skipped.length) {
  console.log(`Not copied (no reading used them, e.g. blocked by the privacy gate): ${skipped.join(", ")}.`);
  console.log("The console shows these as missing. Look at them, then rerun with --all if they are safe to publish.");
}
