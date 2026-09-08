import { describe, expect, it } from "vitest";
import type { CallHistory } from "../../bridge/types";
import {
  buildVerdicts,
  callIndicesFor,
  callsEqual,
  prefixKey,
  seatForCall,
  summarizeVerdicts,
} from "../verdicts";

// Dealer North: N 1♠, E P, S 3♠, W P, N 4♠, E P, S P, W P.
const HISTORY: CallHistory = {
  dealer: "N",
  calls: [
    { type: "bid", level: 1, strain: "S" },
    { type: "pass" },
    { type: "bid", level: 3, strain: "S" },
    { type: "pass" },
    { type: "bid", level: 4, strain: "S" },
    { type: "pass" },
    { type: "pass" },
    { type: "pass" },
  ],
};

describe("verdicts", () => {
  it("knows which seat made each call", () => {
    expect(seatForCall(HISTORY, 0)).toBe("N");
    expect(seatForCall(HISTORY, 2)).toBe("S");
    expect(seatForCall({ dealer: "W", calls: [] }, 1)).toBe("N");
  });

  it("finds the user's calls and the auction before each", () => {
    expect(callIndicesFor(HISTORY, "S")).toEqual([2, 6]);
    expect(prefixKey(HISTORY, 2)).toBe("1S,P");
    expect(prefixKey(HISTORY, 0)).toBe("");
  });

  it("compares calls structurally", () => {
    expect(
      callsEqual(
        { type: "bid", level: 1, strain: "S" },
        { type: "bid", level: 1, strain: "S" },
      ),
    ).toBe(true);
    expect(callsEqual({ type: "pass" }, { type: "double" })).toBe(false);
  });

  it("builds a verdict for every user call the engine has answered", () => {
    const verdicts = buildVerdicts(
      HISTORY,
      "S",
      {
        "1S,P": {
          call: { type: "bid", level: 4, strain: "S" },
          ruleName: "Jump Raise",
        },
      },
      new Set(["1S,P"]),
    );
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({
      index: 2,
      matched: false,
      assisted: true,
    });
    expect(verdicts[0].sayc.ruleName).toBe("Jump Raise");

    const complete = buildVerdicts(
      HISTORY,
      "S",
      {
        "1S,P": { call: { type: "bid", level: 3, strain: "S" } },
        "1S,P,3S,P,4S,P": { call: { type: "pass" } },
      },
      new Set(),
    );
    expect(complete.map((v) => v.matched)).toEqual([true, true]);
  });

  it("summarizes matches, misses, and help", () => {
    const sayc = { call: { type: "pass" as const } };
    const summary = summarizeVerdicts([
      {
        index: 0,
        call: { type: "pass" },
        sayc,
        matched: true,
        assisted: false,
      },
      {
        index: 4,
        call: { type: "double" },
        sayc,
        matched: false,
        assisted: false,
      },
      { index: 8, call: { type: "pass" }, sayc, matched: true, assisted: true },
    ]);
    expect(summary).toMatchObject({
      total: 3,
      matched: 2,
      assisted: 1,
      onSystem: false,
    });
    expect(summary.missed.map((v) => v.index)).toEqual([4]);

    expect(
      summarizeVerdicts([
        {
          index: 0,
          call: { type: "pass" },
          sayc,
          matched: true,
          assisted: false,
        },
      ]).onSystem,
    ).toBe(true);
    expect(summarizeVerdicts([]).onSystem).toBe(false);
  });
});
