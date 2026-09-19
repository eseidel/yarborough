// Translated from python/core/tests/test_call.py, plus the parts of call.py
// the Python tests do not reach.

import { describe, it, expect } from "vitest";
import { Call, Pass, compareCalls, sortCalls } from "../call";
import { CLUBS, HEARTS, NOTRUMP, SPADES } from "../suit";

describe("Call", () => {
  it("sorts passes, doubles and then contracts", () => {
    const calls = [
      new Call("6N"),
      new Call("2C"),
      new Call("X"),
      new Call("1D"),
      new Call("P"),
      new Call("XX"),
      new Call("7N"),
      new Call("1H"),
      new Call("1N"),
      new Call("1S"),
    ];
    const expectedSort = [
      "P",
      "X",
      "XX",
      "1D",
      "1H",
      "1S",
      "1N",
      "2C",
      "6N",
      "7N",
    ];
    expect(sortCalls(calls).map((call) => call.name)).toEqual(expectedSort);
    expect(compareCalls(new Call("P"), new Call("P"))).toBe(0);
    expect(compareCalls(new Call("1N"), new Call("2C"))).toBeLessThan(0);
    expect(compareCalls(new Call("1S"), new Call("1H"))).toBeGreaterThan(0);
    expect(compareCalls(new Call("X"), new Call("1C"))).toBeLessThan(0);
    expect(compareCalls(new Call("1C"), new Call("XX"))).toBeGreaterThan(0);
  });

  it("upper-cases its name", () => {
    expect(new Call("p").equals(new Call("P"))).toBe(true);
    expect(Call.fromString("1c").name).toBe("1C");
    expect(Call.fromString("1c")).toBe(Call.fromString("1C"));
  });

  it("is equal by name and cached by name", () => {
    expect(new Call("P").equals(new Call("P"))).toBe(true);
    expect(new Call("P").equals(new Call("X"))).toBe(false);
    expect(new Call("P").equals(null)).toBe(false);
    expect(Call.fromString("P")).toBe(Call.fromString("P"));
    expect(Call.fromString("1C")).toBe(Call.fromString("1C"));
    expect(Call.fromLevelAndStrain(1, CLUBS)).toBe(Call.fromString("1C"));
    expect(Call.fromLevelAndStrain(7, NOTRUMP).name).toBe("7N");
  });

  it("lists the names between two calls", () => {
    expect(Call.suitedNamesBetween("1C", "1H")).toEqual(["1C", "1D", "1H"]);
    expect(Call.suitedNamesBetween("2D", "4H")).toEqual([
      "2D",
      "2H",
      "2S",
      "3C",
      "3D",
      "3H",
      "3S",
      "4C",
      "4D",
      "4H",
    ]);
    expect(Call.notrumpNamesBetween("1N", "7N")).toEqual([
      "1N",
      "2N",
      "3N",
      "4N",
      "5N",
      "6N",
      "7N",
    ]);
    expect(Call.notrumpNamesBetween("3N", "5N")).toEqual(["3N", "4N", "5N"]);
    expect(Call.suitedNames()).toHaveLength(28);
    expect(Call.notrumpNames()).toHaveLength(7);
    // The stop is checked on every name, including the ones before the start,
    // so a backwards range stops at once and a name that is not suited never
    // starts the range at all.
    expect(Call.suitedNamesBetween("7S", "1C")).toEqual([]);
    expect(Call.suitedNamesBetween("1N", "2C")).toEqual([]);
  });

  it("knows what kind of call it is", () => {
    const pass = Call.fromString("P");
    expect([
      pass.isPass(),
      pass.isDouble(),
      pass.isRedouble(),
      pass.isContract(),
    ]).toEqual([true, false, false, false]);
    const double = Call.fromString("X");
    expect([
      double.isPass(),
      double.isDouble(),
      double.isRedouble(),
      double.isContract(),
    ]).toEqual([false, true, false, false]);
    const redouble = Call.fromString("XX");
    expect([
      redouble.isPass(),
      redouble.isDouble(),
      redouble.isRedouble(),
      redouble.isContract(),
    ]).toEqual([false, false, true, false]);
    const contract = Call.fromString("4S");
    expect(contract.isContract()).toBe(true);
    expect(contract.level).toBe(4);
    expect(contract.strain).toBe(SPADES);
    expect(`${contract}`).toBe("4S");
    expect(contract.repr()).toBe("Call('4S')");
    expect(Call.fromString("P").strain).toBeNull();
    expect(Call.fromString("P").level).toBeNull();
    expect(new Pass().name).toBe("P");
    expect(Call.fromLevelAndStrain(2, HEARTS).strain).toBe(HEARTS);
  });

  it("refuses names it cannot parse", () => {
    expect(() => new Call("1")).toThrow();
    expect(() => new Call("1Q")).toThrow();
    expect(() => new Call("XXX")).toThrow();
    expect(() => new Call("8C")).toThrow();
    expect(() => new Call("")).toThrow();
    // Python validates the level against range(8), so level zero is accepted.
    expect(new Call("0C").level).toBe(0);
  });
});
