import { describe, expect, it } from "vitest";
import type { EvidenceRecord } from "./types";
import { canTick, checkNumbers, initialChecklist, numbersIn, saidNumber } from "./verify";

const tool = "2.5 mm² cable on a 10 A type C breaker — voltage drop 0.7% over 15 m.";

describe("numbersIn", () => {
  it("reads digits and spoken numbers with units", () => {
    expect(numbersIn("Use 2.5 square millimetre cable on a 10 amp breaker")).toEqual([2.5, 10]);
    expect(numbersIn("two point five square millimetre on a ten amp breaker")).toEqual([2.5, 10]);
    expect(numbersIn("1,200 W")).toEqual([1200]);
    expect(numbersIn("2.5 mm2 cable")).toEqual([2.5]);
  });
  it("ignores number words that aren't quantities", () => {
    expect(numbersIn("Take one more photo of the print")).toEqual([]);
  });
});

describe("checkNumbers", () => {
  it("passes a reply whose numbers all came from a tool", () => {
    expect(checkNumbers("Use 2.5 square millimetre cable on a 10 amp type C breaker.", [tool])).toEqual({ ok: true, unknown: [] });
  });
  it("flags a number no tool produced", () => {
    expect(checkNumbers("Use 2 point 5 square millimetre cable on a 16 amp breaker.", [tool])).toEqual({ ok: false, unknown: ["16"] });
  });
  it("counts what the electrician said as a source", () => {
    expect(checkNumbers("A 1.5 HP AC on 15 m needs 2.5 mm².", [tool, "what cable for a one point five horsepower AC"]).ok).toBe(true);
  });
});

describe("saidNumber", () => {
  it("only accepts numbers the electrician actually said", () => {
    expect(saidNumber("pump is on twenty five metres", 25)).toBe(true);
    expect(saidNumber("pump is on twenty five metres", 30)).toBe(false);
  });
});

describe("checklist", () => {
  const ev = (o: Partial<EvidenceRecord>): EvidenceRecord => ({ id: "e1", at: "", tool: "read_cable_print", by: "muse-spark-1.3", summary: "", verified: true, problems: [], proves: [], ...o });

  it("has four checks per circuit plus board, walls, memo and sign-off", () => {
    const list = initialChecklist([{ id: "pump", name: "Pump" }, { id: "heater", name: "Heater" }]);
    expect(list).toHaveLength(12);
    expect(list.map((i) => i.id)).toContain("magnet:heater");
  });
  it("ticks only with verified evidence that proves the item", () => {
    const evidence = [ev({ id: "e1", proves: ["cable:pump"] }), ev({ id: "e2", verified: false, problems: ["Low confidence."] })];
    expect(canTick("cable:pump", ["e1"], evidence)).toEqual({ ok: true, ids: ["e1"] });
    expect(canTick("cable:pump", ["e2"], evidence)).toMatchObject({ ok: false, reason: expect.stringContaining("not verified") });
    expect(canTick("magnet:pump", ["e1"], evidence)).toMatchObject({ ok: false, reason: expect.stringContaining("proves cable:pump") });
    expect(canTick("cable:pump", ["e9"], evidence)).toMatchObject({ ok: false, reason: expect.stringContaining("e9") });
  });
  it("never lets the agent sign off for the electrician", () => {
    expect(canTick("confirm", ["e1"], [ev({ proves: ["confirm"] })]).ok).toBe(false);
  });
});
