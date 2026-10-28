import type { Board, ProtectiveDevice, Status } from "@/lib/rules";
import type { WallMap } from "@/lib/wallmap";

/** A photo or clip the electrician captured. It stays on our server; only a tool sends it to a model. */
export interface MediaRef {
  id: string;
  kind: "photo" | "clip";
  mime: string;
  bytes: number;
  digest: string;
  at: string;
  /** The capture button used: what the electrician meant to show. */
  hint?: "cable" | "board" | "magnet" | "wall";
  /** Made by a model (the Muse Image render of a plastered wall), not captured on site. */
  generated?: boolean;
  circuitId?: string;
  /** For a clip: the still the privacy gate checks before the clip may leave. */
  posterId?: string;
}

/** One reading or statement in the case record. Only verified evidence changes a circuit or ticks the checklist. */
export interface EvidenceRecord {
  id: string;
  at: string;
  tool: string;
  /** Model id, or "electrician" for something they said. */
  by: string;
  mediaId?: string;
  circuitId?: string;
  summary: string;
  verified: boolean;
  problems: string[];
  /** Checklist items this evidence proves. Empty unless verified. */
  proves: string[];
}

export interface CaseChecklistItem {
  id: string;
  label: string;
  circuitId?: string;
  done: boolean;
  evidenceIds: string[];
  by?: "agent" | "electrician";
}

/** One tool call: the model's plan, the call, and what came back. */
export interface Turn {
  n: number;
  at: string;
  tool: string;
  why: string;
  args: Record<string, unknown>;
  ok: boolean;
  observation: string;
  evidenceId?: string;
  verified?: boolean;
  model?: string;
  ms: number;
  gate?: { status: string; reasons?: string[]; ms?: number; name?: string };
}

/** Numbers in model-written text that no tool, reading or electrician produced. */
export interface NumberCheck {
  ok: boolean;
  unknown: string[];
}

/** One request from the electrician and everything the agent did about it. */
export interface Run {
  id: string;
  at: string;
  said: string;
  heardBy?: string;
  heardMs?: number;
  mediaId?: string;
  breakerOff: boolean;
  turns: Turn[];
  modelCalls: number;
  reply?: string;
  replyCheck?: NumberCheck;
  status: "running" | "done" | "error";
  error?: string;
  ms?: number;
}

export interface Memo {
  at: string;
  status: "unverified" | "confirmed";
  /** Written by Muse Spark; checked for numbers no tool produced. */
  summary: string;
  summaryCheck: NumberCheck;
  verdict: Status;
  fixes: { fix: string; status: Status; count: number }[];
  open: string[];
  evidenceIds: string[];
  confirmedAt?: string;
}

export interface BoardDevice extends ProtectiveDevice {
  position: number;
  kind: string;
  sensitivityMA: number;
  label: string;
}

/** A chased wall mapped before plaster: SAM 3.1 runs on the block grid, and Muse Image's plastered render of the same photo. */
export interface WallRecord {
  id: string;
  mediaId: string;
  renderMediaId?: string;
  evidenceId: string;
  width: number;
  height: number;
  map: WallMap;
}

export interface CaseRecord {
  jobId: string;
  title: string;
  createdAt: string;
  board: Board;
  /** The latest board reading, verified or not. It only reaches the board once verified (by code, or after the electrician's corrections). */
  boardRead?: {
    evidenceId: string;
    by: string;
    devices: BoardDevice[];
    mainSwitch: boolean;
    rcd: boolean;
    spd: boolean;
    labelled: boolean;
    verified: boolean;
    problems: string[];
  };
  checklist: CaseChecklistItem[];
  media: MediaRef[];
  evidence: EvidenceRecord[];
  runs: Run[];
  walls?: WallRecord[];
  memo?: Memo;
}

/** Streamed to the copilot as newline-delimited JSON while a run is in progress. */
export type AgentEvent =
  | { type: "heard"; said: string; ms: number }
  | { type: "run"; run: Run }
  | { type: "turn"; turn: Turn }
  | { type: "done"; run: Run }
  | { type: "error"; message: string };
