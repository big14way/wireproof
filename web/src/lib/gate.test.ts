import { describe, expect, it } from "vitest";
import { decide, parseVerdict } from "./gate";

const base = { scene: "cable_print", people_visible: false, faces_visible: false, private_text_visible: false, usable: true, issue: "" } as const;

describe("Glimmer gate", () => {
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
