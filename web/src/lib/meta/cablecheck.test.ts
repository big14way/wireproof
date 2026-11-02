import { describe, expect, it } from "vitest";
import { cableProblems } from "./cablecheck";

describe("cableProblems", () => {
  it("accepts a house-wiring print", () => {
    expect(cableProblems("2.5", "NIGERCHIN 2.5mm² 450/750V NIS", 0.95)).toEqual({ size: 2.5, problems: [] });
  });
  // Appliance and extension cords print the core count straight before the size.
  it("reads a cord's size after its core count", () => {
    expect(cableProblems("1.5", "H05VV-F 3x1.5mm2", 0.9)).toEqual({ size: 1.5, problems: [] });
    expect(cableProblems("3G0.75", "H05VV-F 3G0,75 mm²", 0.9)).toEqual({ size: 0.75, problems: [] });
    expect(cableProblems("1,5", "2 X 1,5 MM²", 0.9)).toEqual({ size: 1.5, problems: [] });
    expect(cableProblems("1.25", "BS6500 3X1.25mm² ZHEJIANG", 0.9)).toEqual({ size: 1.25, problems: [] });
    expect(cableProblems("1.0", "WIRE AND CABLE 1.0MMX2C", 0.9)).toEqual({ size: 1, problems: [] });
  });
  it("rejects a size the print doesn't show", () => {
    expect(cableProblems("2.5", "COPPERLINE 1.5mm²", 0.9).problems).toEqual(["The size is not in the copied print text."]);
    expect(cableProblems("1.5", "21.5 mm", 0.9).problems).toEqual(["The size is not in the copied print text."]);
  });
  it("rejects a size cable isn't made in, and an empty read", () => {
    expect(cableProblems("3", "3mm", 0.9)).toEqual({ size: null, problems: ["“3” is not a standard cable size."] });
    expect(cableProblems("", "", 0.2).problems).toEqual(["No size printed or readable.", "Low confidence: film the print closer and in better light."]);
  });
});
