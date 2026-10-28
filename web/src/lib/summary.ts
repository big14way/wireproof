import type { Job } from "./jobs";
import { checkBoard, type Board, type Finding, type Status } from "./rules";

export interface FixGroup {
  fix: string;
  status: Status;
  findings: Finding[];
}

/** Run the rules over a whole job and group the actions so one fix that clears many flags reads as one. */
export function summarise(job: Job) {
  return summariseBoard(job.board);
}

export function summariseBoard(b: Board) {
  const board = checkBoard(b);
  const all = [...board.findings, ...board.circuits.flatMap((c) => c.findings)];
  const count = (s: Status) => all.filter((f) => f.status === s).length;

  const groups = new Map<string, FixGroup>();
  for (const f of all) {
    if (f.status !== "fail" && f.status !== "warn") continue;
    // Every circuit missing an RCD is solved by the same fix on the board.
    const key = f.ruleId === "RCD-30MA" || f.ruleId === "BOARD-RCD" ? "Fit a 30 mA RCD (or RCBOs) on the board" : f.fix ?? f.title;
    const g = groups.get(key) ?? { fix: key, status: f.status, findings: [] };
    g.findings.push(f);
    if (f.status === "fail") g.status = "fail";
    groups.set(key, g);
  }
  const fixes = [...groups.values()].sort((a, b) => (a.status === b.status ? b.findings.length - a.findings.length : a.status === "fail" ? -1 : 1));

  return { board, all, fixes, counts: { fail: count("fail"), warn: count("warn"), pass: count("pass"), info: count("info") } };
}
