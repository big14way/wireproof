import { describe, expect, it } from "vitest";
import { airConditioner, checkBoard, checkCircuit, designCircuit, parseLoad, pump, type Circuit } from ".";

const base = (over: Partial<Circuit>): Circuit => ({
  id: "c1", name: "Test", kind: "sockets-radial", lengthM: 15, designSize: 2.5,
  cable: { printedSize: { value: 2.5 }, magnetAttaches: { value: false }, cpcPresent: { value: true }, sonMark: { value: "NIS 1" } },
  device: { value: { type: "MCB", ratingA: 20, curve: "B" } },
  rcd30mA: { value: true },
  ...over,
});

describe("design", () => {
  it("sizes a 1.5 HP split AC on a 15 m run", () => {
    const ac = airConditioner(1.5);
    const d = designCircuit({ kind: "air-conditioner", loadW: ac.watts, powerFactor: ac.powerFactor, lengthM: 15 });
    expect(d.ok).toBe(true);
    expect(d.curve).toBe("C");
    expect(d.breakerA).toBe(10); // 1200 W / (230 × 0.85) = 6.1 A
    expect(d.cableSize).toBe(2.5); // practice minimum for appliance circuits
    expect(d.voltDropPct!).toBeLessThan(0.05);
  });

  it("gives a 32 A ring 2.5 mm² cable", () => {
    const d = designCircuit({ kind: "sockets-ring", lengthM: 50 });
    expect(d.breakerA).toBe(32);
    expect(d.cableSize).toBe(2.5);
  });

  it("steps up the cable when the run is long", () => {
    const d = designCircuit({ kind: "water-heater", loadW: 3000, lengthM: 60 });
    expect(d.breakerA).toBe(16); // 13 A
    expect(d.cableSize).toBe(4); // 2.5 mm² would drop 18 × 13 × 60 = 14.1 V = 6.1%; 4 mm² drops 3.7%
  });

  it("parses spoken loads", () => {
    expect(parseLoad("1.5hp AC")?.watts).toBe(1200);
    expect(parseLoad("one pumping machine 1 hp")?.kind).toBe("pump");
    expect(parseLoad("3kW water heater")?.watts).toBe(3000);
    expect(parseLoad("no numbers here")).toBeNull();
  });
});

describe("checks", () => {
  it("passes a correct radial", () => {
    const r = checkCircuit(base({ loadW: 3000 }));
    expect(r.verdict).toBe("pass");
  });

  it("fails copper-coated iron", () => {
    const r = checkCircuit(base({ cable: { ...base({}).cable, magnetAttaches: { value: true } } }));
    expect(r.findings.find((f) => f.ruleId === "CABLE-MAGNET")?.status).toBe("fail");
    expect(r.verdict).toBe("fail");
  });

  it("fails a 20 A breaker on 1.5 mm² (pumping machine)", () => {
    const p = pump(1);
    const r = checkCircuit(base({ kind: "pump", loadW: p.watts, powerFactor: p.powerFactor, designSize: 1.5, cable: { ...base({}).cable, printedSize: { value: 1.5 } }, device: { value: { type: "MCB", ratingA: 20, curve: "C" } } }));
    const f = r.findings.find((x) => x.ruleId === "PROT-OVERLOAD")!;
    expect(f.status).toBe("fail");
    expect(r.numbers.correctedCapacityA).toBeCloseTo(17.5 * 0.94, 5);
    expect(f.fix).toContain("16 A");
  });

  it("fails undersized print against the design", () => {
    const r = checkCircuit(base({ designSize: 4, cable: { ...base({}).cable, printedSize: { value: 2.5 } } }));
    expect(r.findings.find((f) => f.ruleId === "CABLE-PRINT")?.status).toBe("fail");
  });

  it("fails a SON-alert brand", () => {
    const r = checkCircuit(base({ cable: { ...base({}).cable, brand: { value: "Sunrise Cables" } } }));
    expect(r.findings.find((f) => f.ruleId === "CABLE-BRAND")?.status).toBe("fail");
  });

  it("allows a 32 A ring on 2.5 mm², but not when grouped", () => {
    const ring = base({ kind: "sockets-ring", lengthM: 50, device: { value: { type: "MCB", ratingA: 32, curve: "B" } } });
    expect(checkCircuit(ring).findings.find((f) => f.ruleId === "PROT-OVERLOAD")?.status).toBe("pass");
    expect(checkCircuit({ ...ring, groupedWith: 2 }).findings.find((f) => f.ruleId === "PROT-OVERLOAD")?.status).toBe("fail");
  });

  it("fails excessive voltage drop", () => {
    const r = checkCircuit(base({ loadW: 4600, lengthM: 40 }));
    expect(r.findings.find((f) => f.ruleId === "VOLT-DROP")?.status).toBe("fail"); // 18 × 20 × 40 = 14.4 V = 6.3%
  });

  it("requires RCD for domestic lighting", () => {
    const r = checkCircuit(base({ kind: "lighting", designSize: 1.5, cable: { ...base({}).cable, printedSize: { value: 1.5 } }, device: { value: { type: "MCB", ratingA: 10 } }, rcd30mA: { value: false } }));
    expect(r.findings.find((f) => f.ruleId === "RCD-30MA")?.status).toBe("fail");
  });

  it("flags a missing earth conductor", () => {
    const r = checkCircuit(base({ cable: { ...base({}).cable, cpcPresent: { value: false } } }));
    expect(r.findings.find((f) => f.ruleId === "EARTH-CPC")?.status).toBe("fail");
  });

  it("rolls the board up to its worst finding", () => {
    const b = checkBoard({ id: "b", name: "DB", rcdPresent: { value: false }, circuits: [base({ rcd30mA: { value: false } })] });
    expect(b.findings.find((f) => f.ruleId === "BOARD-RCD")?.status).toBe("fail");
    expect(b.verdict).toBe("fail");
  });
});
