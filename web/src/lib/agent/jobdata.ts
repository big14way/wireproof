import "server-only";
import type { Job } from "@/lib/jobs";
import type { Board, Finding } from "@/lib/rules";
import { getCase, wallFindings } from "./case";
import type { CaseRecord } from "./types";

export type DataSource = "live" | "sample";

/**
 * What a job page shows: the live case once anything has been captured, otherwise the filled-in sample job.
 * `?data=live` or `?data=sample` picks one, so a complete example stays one click away from the live case.
 */
export async function jobData(job: Job, want?: string | string[]): Promise<{ source: DataSource; board: Board; walls: Finding[]; live: CaseRecord }> {
  const live = await getCase(job);
  const source: DataSource = want === "live" || want === "sample" ? want : live.evidence.length ? "live" : "sample";
  return source === "live" ? { source, board: live.board, walls: wallFindings(live), live } : { source, board: job.board, walls: [], live };
}
