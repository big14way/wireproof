// Run every cable photo through the app's own reader (Muse Spark + the code checks in cablecheck.ts) and score it.
//   cd web && set -a && . ./.env.local && set +a && npx vite-node --config ../probe/app/vite.config.ts ../probe/app/cables.ts ../probe/cable ../probe/cable_truth.csv
import fs from "node:fs";
import path from "node:path";
import { readCable } from "@/lib/meta/readers";

const dir = process.argv[2];
const truth = Object.fromEntries(fs.readFileSync(process.argv[3], "utf8").trim().split("\n").slice(1).map((l) => l.split(",")).map(([f, s]) => [f, Number(s)]));
const files = Object.keys(truth);
const rows: { file: string; truth: number; size: number | null; verified: boolean; conf: number; print: string; problems: string }[] = [];
let next = 0;
async function worker() {
  while (next < files.length) {
    const file = files[next++];
    const dataUrl = `data:image/jpeg;base64,${fs.readFileSync(path.join(dir, file)).toString("base64")}`;
    const r = await readCable({ kind: "image", dataUrl });
    const raw = r.raw as { print_text: string; confidence: number };
    rows.push({ file, truth: truth[file], size: r.value.printedSize?.value ?? null, verified: r.verified, conf: raw.confidence, print: raw.print_text, problems: r.problems.join(" ") });
    console.error(`${file} done`);
  }
}
await Promise.all([worker(), worker(), worker()]);
rows.sort((a, b) => a.file.localeCompare(b.file));
for (const r of rows) console.log(`${r.file.padEnd(22)} truth=${String(r.truth).padEnd(5)} size=${String(r.size).padEnd(5)} verified=${String(r.verified).padEnd(5)} conf=${r.conf.toFixed(2)}  “${r.print}”  ${r.problems}`);
const right = rows.filter((r) => r.size === r.truth).length;
const ver = rows.filter((r) => r.verified);
const verRight = ver.filter((r) => r.size === r.truth).length;
const wrong = rows.filter((r) => r.size !== r.truth);
console.log(`\nsize read right: ${right}/${rows.length}`);
console.log(`verified by code checks: ${ver.length}/${rows.length}, of which right: ${verRight}/${ver.length}`);
console.log(`wrong reads caught (not verified): ${wrong.filter((r) => !r.verified).length}/${wrong.length}`);
fs.writeFileSync(path.join(dir, "..", "out", "app-cable.json"), JSON.stringify(rows, null, 2));
