// Translated from python/core/tests/test_callexplorer.py, plus the calls
// `possible_calls_over` offers over a few auctions (the values come from
// running the Python).

import { describe, it, expect } from "vitest";
import { CallExplorer } from "../callexplorer";
import { CallHistory } from "../callhistory";

const CONTRACTS = [
  "1C",
  "1D",
  "1H",
  "1S",
  "1N",
  "2C",
  "2D",
  "2H",
  "2S",
  "2N",
  "3C",
  "3D",
  "3H",
  "3S",
  "3N",
  "4C",
  "4D",
  "4H",
  "4S",
  "4N",
  "5C",
  "5D",
  "5H",
  "5S",
  "5N",
  "6C",
  "6D",
  "6H",
  "6S",
  "6N",
  "7C",
  "7D",
  "7H",
  "7S",
  "7N",
];

function contractsFrom(name: string): string[] {
  return CONTRACTS.slice(CONTRACTS.indexOf(name));
}

function possibleCalls(historyString: string): string[] {
  const explorer = new CallExplorer();
  return explorer
    .possibleCallsOver(CallHistory.fromString(historyString))
    .map((call) => call.name);
}

describe("CallExplorer", () => {
  function assertHistories(globString: string, histories: string[]): void {
    const explorer = new CallExplorer();
    expect(
      explorer
        .historyGlob(globString)
        .map((history) => history.callsString())
        .sort(),
    ).toEqual([...histories].sort());
  }

  it("globs a history", () => {
    assertHistories("", []);
    assertHistories(" ", []);
    assertHistories("P", ["P"]);
    assertHistories(" P ", ["P"]);
    assertHistories("P  1C", ["P 1C"]);
    assertHistories("* 1C", ["P 1C"]);
    assertHistories("1C * 1H", ["1C 1D 1H", "1C X 1H", "1C P 1H"]);
    assertHistories("* 1C * 1D", ["P 1C X 1D", "P 1C P 1D"]);
    // Only non-pass options should be considered.
    assertHistories("P P P * 1D", ["P P P 1C 1D"]);
  });

  it("offers every legal call over an auction", () => {
    expect(possibleCalls("")).toEqual(["P", ...CONTRACTS]);
    expect(possibleCalls("P")).toEqual(["P", ...CONTRACTS]);
    expect(possibleCalls("P P P")).toEqual(["P", ...CONTRACTS]);
    expect(possibleCalls("1N")).toEqual(["P", "X", ...contractsFrom("2C")]);
    expect(possibleCalls("1N X")).toEqual(["P", "XX", ...contractsFrom("2C")]);
    expect(possibleCalls("1S 2H 2S")).toEqual([
      "P",
      "X",
      ...contractsFrom("2N"),
    ]);
    expect(possibleCalls("P 1D 2S P")).toEqual(["P", ...contractsFrom("2N")]);
    expect(possibleCalls("1C P 1S X")).toEqual([
      "P",
      "XX",
      ...contractsFrom("1N"),
    ]);
    expect(possibleCalls("1C P 1S XX")).toEqual(["P", ...contractsFrom("1N")]);
    expect(possibleCalls("7N X")).toEqual(["P", "XX"]);
    // A finished auction offers nothing.
    expect(possibleCalls("P P P P")).toEqual([]);
  });

  it("lists the histories one call further on", () => {
    const explorer = new CallExplorer();
    const history = CallHistory.fromString("1N X", "E", "Both");
    const futures = explorer.possibleFutures(history);
    expect(futures).toHaveLength(32);
    expect(futures[0].callsString()).toBe("1N X P");
    expect(futures[1].callsString()).toBe("1N X XX");
    expect(futures[0].dealer).toBe(history.dealer);
    expect(futures[0].vulnerability).toBe(history.vulnerability);
    // The history it started from is untouched.
    expect(history.callsString()).toBe("1N X");
  });
});
