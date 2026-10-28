import { describe, expect, it } from "vitest";
import { decide, hedged, parseVerdict } from "./gate";

const base = { scene: "cable_print", people_visible: false, faces_visible: false, private_text_visible: false, usable: true, issue: "" } as const;

describe("privacy gate", () => {
  it("reads a verdict wrapped in prose and a code fence", () => {
    const v = parseVerdict('Here is my answer:\n```json\n{"scene":"distribution_board","people_visible":false,"faces_visible":false,"private_text_visible":false,"usable":true,"issue":""}\n```');
    expect(v?.scene).toBe("distribution_board");
  });

  it("returns null when there is no JSON", () => {
    expect(parseVerdict("I can't see the image")).toBeNull();
  });

  it("blocks faces, people and private text", () => {
    expect(decide({ ...base, faces_visible: true }).status).toBe("block");
    expect(decide({ ...base, people_visible: true }).status).toBe("block");
    expect(decide({ ...base, private_text_visible: true }).status).toBe("block");
  });

  it("warns on a blurry photo or the wrong scene, passes a good one", () => {
    expect(decide({ ...base, usable: false, issue: "motion blur" }).reasons[0]).toContain("motion blur");
    expect(decide({ ...base, scene: "chased_wall" }, "cable_print").status).toBe("warn");
    expect(decide(base, "cable_print").status).toBe("pass");
  });
});

/** A fake model call: answers `value` (or fails) after `ms`, and stops early if its signal aborts. */
function slow<T>(ms: number, value: T, fail = false) {
  return (signal: AbortSignal) =>
    new Promise<T>((resolve, reject) => {
      const t = setTimeout(() => (fail ? reject(new Error(String(value))) : resolve(value)), ms);
      signal.addEventListener("abort", () => { clearTimeout(t); reject(signal.reason); });
    });
}

describe("hedged request", () => {
  it("uses the first answer when it comes before the hedge", async () => {
    let calls = 0;
    const out = await hedged((s) => (calls++, slow(5, "a")(s)), 30, 1000);
    expect([out, calls]).toEqual(["a", 1]);
  });

  it("starts a second call when the first stalls, takes the faster one and aborts the other", async () => {
    const answers = [slow(500, "stalled"), slow(5, "second")];
    const signals: AbortSignal[] = [];
    const out = await hedged((s) => (signals.push(s), answers[signals.length - 1](s)), 20, 1000);
    expect(out).toBe("second");
    expect(signals[0].aborted).toBe(true);
  });

  it("still succeeds when only the first call fails after the hedge started", async () => {
    const answers = [slow(40, "boom", true), slow(60, "second")];
    let i = 0;
    await expect(hedged((s) => answers[i++](s), 20, 1000)).resolves.toBe("second");
  });

  it("fails when every call fails, or at the time limit", async () => {
    await expect(hedged(slow(5, "down", true), 20, 1000)).rejects.toThrow("down");
    await expect(hedged(slow(500, "late"), undefined, 30)).rejects.toThrow();
  });
});
