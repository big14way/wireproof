// Pure logic for the privacy gate, kept separate so it can be tested without a model.

export type Scene = "cable_print" | "distribution_board" | "chased_wall" | "other";

export interface GateVerdict {
  scene: Scene;
  people_visible: boolean;
  faces_visible: boolean;
  private_text_visible: boolean;
  usable: boolean;
  issue: string;
}

export interface GateDecision {
  status: "pass" | "warn" | "block";
  reasons: string[];
}

/** Pull the JSON object out of a model reply that may wrap it in prose or a code fence. */
export function parseVerdict(text: string): GateVerdict | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(text.slice(start, end + 1));
    const scenes: Scene[] = ["cable_print", "distribution_board", "chased_wall", "other"];
    return {
      scene: scenes.includes(v.scene) ? v.scene : "other",
      people_visible: v.people_visible === true,
      faces_visible: v.faces_visible === true,
      private_text_visible: v.private_text_visible === true,
      usable: v.usable !== false,
      issue: typeof v.issue === "string" ? v.issue : "",
    };
  } catch {
    return null;
  }
}

/** Code decides: anything that identifies a person or a home never leaves for the hosted API. */
export function decide(v: GateVerdict, expected?: Scene): GateDecision {
  const block: string[] = [];
  if (v.faces_visible) block.push("A face is visible.");
  else if (v.people_visible) block.push("A person is visible.");
  if (v.private_text_visible) block.push("Private text is visible (a name, phone number, address or document).");
  if (block.length) return { status: "block", reasons: [...block, "Reframe or crop the photo, then try again."] };

  const warn: string[] = [];
  if (!v.usable) warn.push(v.issue ? `Hard to read: ${v.issue}.` : "Hard to read: retake closer and steadier.");
  if (expected && v.scene !== expected && v.scene !== "other") warn.push(`This looks like a ${v.scene.replace("_", " ")}, not a ${expected.replace("_", " ")}.`);
  return { status: warn.length ? "warn" : "pass", reasons: warn };
}

/**
 * Run `call`; if it hasn't settled after `after` ms, start a second identical call. The first to succeed wins and
 * the other is aborted. It fails when every started call has failed, or when `limit` ms have passed.
 */
export function hedged<T>(call: (signal: AbortSignal) => Promise<T>, after: number | undefined, limit: number): Promise<T> {
  const won = new AbortController();
  const signal = AbortSignal.any([won.signal, AbortSignal.timeout(limit)]);
  return new Promise<T>((resolve, reject) => {
    let pending = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      pending++;
      call(signal).then(
        (v) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          won.abort();
          resolve(v);
        },
        (e) => {
          if (--pending > 0 || settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e);
        },
      );
    };
    start();
    if (after != null) timer = setTimeout(start, after);
  });
}
