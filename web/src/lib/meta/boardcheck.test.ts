import { describe, expect, it } from "vitest";
import { MARKET_RATINGS, MCB_RATINGS } from "../rules";
import { deviceProblems } from "./boardcheck";

describe("deviceProblems", () => {
  // Read off a real Nigerian home's board: old-style 30 A breakers are sold and fitted everywhere.
  it("accepts a 30 A breaker whose print says 30A", () => {
    expect(deviceProblems(3, "MCB", 30, "30A A B BRAVO ELECTRIC 1P 10kA 124/240VAC")).toEqual([]);
  });
  it("accepts a 100 A main breaker", () => {
    expect(deviceProblems(4, "MCB", 100, "Schneider Electric C 100A 500V C60H-DC Multi9 I-ON")).toEqual([]);
  });
  it("rejects a rating no breaker is sold in", () => {
    expect(deviceProblems(2, "MCB", 28, "28A")).toEqual(["Device 2: 28 A is not a rating breakers are sold in."]);
  });
  it("rejects a rating that isn't in the printed text", () => {
    expect(deviceProblems(1, "MCB", 20, "30A 1P 10kA")).toEqual(["Device 1: rating 20 A is not in its printed text."]);
  });
  it("sends an ambiguous print back to the electrician", () => {
    expect(deviceProblems(5, "MCB", 20, "B20 32A")).toEqual(["Device 5: printed text shows 20 A and 32 A; check the breaker by eye."]);
  });
  it("flags an unreadable breaker but not a surge protector with no rating", () => {
    expect(deviceProblems(6, "MCB", 0, "")).toEqual(["Device 6: rating unreadable."]);
    expect(deviceProblems(7, "SPD", 0, "Surge Protective Device QCQ-40 In: 40kA(8/20)")).toEqual([]);
    // Read off the solar box: Spark took "40kA" as 40 A. The kA figure is not a rating, so nothing to check.
    expect(deviceProblems(7, "SPD", 40, "Surge Protective Device QCQ-40 In: 40kA(8/20)")).toEqual([]);
  });
});

describe("MARKET_RATINGS", () => {
  it("includes every rating the rules recommend", () => {
    for (const r of MCB_RATINGS) expect(MARKET_RATINGS).toContain(r);
  });
});
