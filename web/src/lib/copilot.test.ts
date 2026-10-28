import { describe, expect, it } from "vitest";
import { answer, normaliseSpeech, parseQuestion } from "./copilot";

describe("copilot parsing", () => {
  it("turns spoken numbers into digits", () => {
    expect(normaliseSpeech("one point five horsepower air conditioner on fifteen meters")).toBe("1.5 horsepower air conditioner on 15 meters");
    expect(normaliseSpeech("twenty five metres")).toBe("25 metres");
    expect(normaliseSpeech("three kilowatt heater, forty two m")).toBe("3 kilowatt heater 42 m");
  });

  it("answers the question exactly as Voice Transcribe heard it", () => {
    const a = answer("What cable should I use for I use for a one point five horsepower air conditioner on fifteen meters?");
    expect(a.result?.cableSize).toBe(2.5);
    expect(a.result?.breakerA).toBe(10);
  });

  it("understands kilowatts and watts in words", () => {
    expect(answer("three kilowatt water heater on twelve metres").result?.breakerA).toBe(16);
    expect(parseQuestion("2000 watts heater, 10 m")?.loadW).toBe(2000);
  });

  it("reads digits too", () => {
    expect(parseQuestion("1 HP pumping machine on 25 m")?.kind).toBe("pump");
    expect(parseQuestion("kitchen ring, 42 m")?.kind).toBe("sockets-ring");
    expect(parseQuestion("what's the weather")).toBeNull();
  });
});
