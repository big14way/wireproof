import "server-only";
import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

/** One record per piece of media that left for Meta's hosted API, or was stopped before it could. */
export interface EgressEntry {
  at: string;
  route: string;
  model: string;
  bytes: number;
  /** First 16 hex chars of the SHA-256 of what was sent, so a photo can be matched without storing it. */
  digest: string;
  gate: "pass" | "warn" | "block" | "off" | "error";
  reasons?: string[];
  gateMs?: number;
  sent: boolean;
}

const FILE = path.join(process.cwd(), ".data", "egress.jsonl");

export function digest(media: string): string {
  return createHash("sha256").update(media).digest("hex").slice(0, 16);
}

export async function logEgress(entry: Omit<EgressEntry, "at">): Promise<EgressEntry> {
  const full: EgressEntry = { at: new Date().toISOString(), ...entry };
  try {
    await mkdir(path.dirname(FILE), { recursive: true });
    await appendFile(FILE, JSON.stringify(full) + "\n");
  } catch (e) {
    // A read-only host (serverless) can't keep the file; the request itself must not fail for that.
    console.warn("egress log not written:", e instanceof Error ? e.message : e);
  }
  return full;
}

export async function readEgress(limit = 50): Promise<EgressEntry[]> {
  try {
    const lines = (await readFile(FILE, "utf8")).trim().split("\n").filter(Boolean);
    return lines.slice(-limit).reverse().map((l) => JSON.parse(l) as EgressEntry);
  } catch {
    return [];
  }
}
