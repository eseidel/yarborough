import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BiddingInputError,
  dispatch,
  getCallInterpretations,
  getHandAnalysis,
  type HandAnalysis,
  type HandCallAnalysis,
} from "../../adapter";
import { Call } from "../../core/call";
import { Hand } from "../../core/hand";
import { _solverPool, setBidderLog } from "../../z3b/bidder";
import * as model from "../../z3b/model";
import { z3 } from "../../z3b/z3";
import { CallHistory } from "../../core/callhistory";
import { _boundsOf, _lastSuitFor, _missesFor } from "../hand";

// Hands are C.D.H.S, the way the repository writes them.
// ♠AQ982 ♥K5 ♦A973 ♣42: thirteen points and five spades, so SAYC opens 1♠.
const OPENER = "42.A973.K5.AQ982";
// ♠KJ74 ♥Q83 ♦A52 ♣963: ten points and three hearts, over partner's 1♥.
const RESPONDER = "963.A52.Q83.KJ74";

let restoreLog: ReturnType<typeof setBidderLog>;
beforeAll(() => {
  restoreLog = setBidderLog(() => {});
});
afterAll(() => {
  setBidderLog(restoreLog);
});

function analysisFor(hand: string, calls = "", dealer = "N") {
  const analysis = getHandAnalysis(hand, calls, dealer, "None");
  const byCall = new Map<string, HandCallAnalysis>(
    analysis.calls.map((call) => [call.call_name, call]),
  );
  return { analysis, byCall };
}

describe("the hand-aware analysis", () => {
  it("marks the call z3b makes, and only that one", () => {
    const { analysis, byCall } = analysisFor(OPENER);
    expect(analysis.call_name).toBe("1S");
    expect(analysis.category).toEqual([
      "Opening",
      "One of a suit",
      "One Level Suit Opening",
    ]);
    expect(byCall.get("1S")!.fit).toBe("chosen");
    expect(analysis.calls.filter((call) => call.fit === "chosen")).toHaveLength(
      1,
    );
  });

  it("keeps the interpretations get_call_interpretations gives", () => {
    const { analysis } = analysisFor(OPENER);
    expect(
      analysis.calls.map(
        ({ call_name, rule_name, description, knowledge_string }) => ({
          call_name,
          rule_name,
          description,
          knowledge_string,
        }),
      ),
    ).toEqual(getCallInterpretations("", "N", "None"));
  });

  it("says a call lost on purpose when it is for something less important", () => {
    const { byCall } = analysisFor(OPENER);
    expect(byCall.get("P")!.fit).toBe("possible");
    expect(byCall.get("P")!.preference).toEqual({
      kind: "purpose",
      over: "1S",
      purpose: "Forced",
      over_purpose: "MajorDiscovery",
      entry: null,
    });
  });

  it("names the prefer entry when one rule makes both calls", () => {
    const { byCall } = analysisFor(OPENER);
    // One-level suit openings: a five-card major, the longer first, comes
    // before any minor.
    expect(byCall.get("1D")!.preference).toEqual({
      kind: "rule",
      over: "1S",
      purpose: "MajorDiscovery",
      over_purpose: "MajorDiscovery",
      entry: { kind: "longest", calls: ["1H", "1S"] },
    });
  });

  it("puts raising partner's major ahead of a new suit or 1NT", () => {
    const { analysis, byCall } = analysisFor(RESPONDER, "1H P");
    expect(analysis.call_name).toBe("3H");
    for (const name of ["1S", "1N"]) {
      expect(byCall.get(name)!.fit, name).toBe("possible");
      expect(byCall.get(name)!.preference).toMatchObject({
        kind: "purpose",
        over: "3H",
        over_purpose: "SupportMajors",
      });
    }
  });

  it("says what an unfitting call wants of the suit it names", () => {
    const { byCall } = analysisFor(OPENER);
    expect(byCall.get("1H")!.fit).toBe("unfit");
    expect(byCall.get("1H")!.misses).toEqual([
      { kind: "length", suit: "H", min: 5, max: 13, actual: 2 },
    ]);
  });

  it("puts the points first, then the shape", () => {
    const { byCall } = analysisFor(OPENER);
    expect(byCall.get("1N")!.misses).toEqual([
      {
        kind: "points",
        min: 15,
        max: 17,
        actual: 13,
        with_shape: false,
        shape: null,
      },
      { kind: "balanced" },
    ]);
  });

  it("counts the points with the hand's own shape", () => {
    const { byCall } = analysisFor(RESPONDER, "1H P");
    expect(byCall.get("2H")!.misses).toEqual([
      {
        kind: "points",
        min: 6,
        max: 9,
        actual: 10,
        with_shape: true,
        shape: { kind: "shortest", length: 3 },
      },
    ]);
    // Support points count shortness, which this 4-3-3-3 hand has none of.
    // Over 1♠, a takeout double with five hearts and a doubleton spade needs
    // a much stronger hand than one short in spades does.
    const overcall = analysisFor("J96.A52.KQJ74.83", "1S").byCall;
    expect(overcall.get("X")!.misses).toEqual([
      {
        kind: "points",
        min: 18,
        max: 35,
        actual: 11,
        with_shape: true,
        shape: {
          kind: "lengths",
          lengths: [
            { suit: "H", length: 5, bid_by: null },
            { suit: "S", length: 2, bid_by: "opponents" },
          ],
        },
      },
    ]);
  });

  it("names the part of the shape that sets the points", () => {
    // ♠AQT63 ♥84 ♦63 ♣J852 after P P 1♣: four cards in the opener's clubs,
    // which the fact names as their suit,
    // so a 1♠ overcall needs 18+ (overcalls.ts StandardDirectOvercall).
    const overcall = analysisFor("J852.63.84.AQT63", "P P 1C").byCall;
    expect(overcall.get("1S")!.misses).toEqual([
      {
        kind: "points",
        min: 18,
        max: 34,
        actual: 7,
        with_shape: true,
        shape: {
          kind: "lengths",
          lengths: [{ suit: "C", length: 4, bid_by: "opponents" }],
        },
      },
    ]);
    // Unbalanced, a 2♣ opening needs 22+.
    expect(analysisFor(OPENER).byCall.get("2C")!.misses[0]).toMatchObject({
      kind: "points",
      min: 22,
      shape: { kind: "balanced", balanced: false },
    });
  });

  it("knows who bid the suit of the last contract", () => {
    const lastSuit = (calls: string) =>
      _lastSuitFor(CallHistory.fromString(calls, "N", "None"));
    expect(lastSuit("P P 1C")).toEqual({ suit: "C", bid_by: "opponents" });
    expect(lastSuit("1H P")).toEqual({ suit: "H", bid_by: "partner" });
    expect(lastSuit("1H X")).toEqual({ suit: "H", bid_by: "partner" });
    expect(lastSuit("1N P")).toBeNull();
    expect(lastSuit("")).toBeNull();
    expect(lastSuit("1D P 1H P 1S P")).toEqual({
      suit: "S",
      bid_by: "partner",
    });
    expect(lastSuit("1D 1H P P")).toEqual({ suit: "H", bid_by: "opponents" });
    // The player's own suit is nobody else's.
    expect(lastSuit("1D X XX X")).toBeNull();
  });

  it("marks a call only a plan makes", () => {
    const { byCall } = analysisFor(RESPONDER, "1H P");
    expect(byCall.get("4N")!.fit).toBe("planned");
    expect(byCall.get("4N")!.misses).toEqual([]);
    expect(byCall.get("4N")!.preference).toBeNull();
  });

  it("says when no SAYC rule makes a call", () => {
    const { byCall } = analysisFor(OPENER, "1S");
    expect(byCall.get("7C")!.fit).toBe("no_rule");
    expect(byCall.get("7C")!.misses).toEqual([]);
  });

  it("has nothing to say about a finished auction", () => {
    expect(getHandAnalysis(OPENER, "P P P P", "N", "None")).toEqual({
      call_name: null,
      category: null,
      calls: [],
    });
  });

  it("rejects a hand it cannot read", () => {
    expect(() => getHandAnalysis(null, "", "N", "None")).toThrow(
      BiddingInputError,
    );
    // Twelve cards.
    expect(() => getHandAnalysis("42.A973.K5.AQ98", "", "N", "None")).toThrow(
      "invalid hand",
    );
    // Thirteen cards, the four of clubs twice.
    expect(() => getHandAnalysis("442.A973.K5.AQ82", "", "N", "None")).toThrow(
      "invalid hand",
    );
  });

  it("answers through dispatch", () => {
    const result = dispatch("get_hand_analysis", {
      hand: OPENER,
      calls: "",
      dealer: "N",
      vulnerability: "None",
    }) as HandAnalysis;
    expect(result.call_name).toBe("1S");
  });

  it("returns every solver it borrows", () => {
    getHandAnalysis(OPENER, "1H P", "N", "None");
    const idle = _solverPool.idle;
    for (let repeat = 0; repeat < 2; repeat += 1) {
      getHandAnalysis(OPENER, "1H P", "N", "None");
      expect(_solverPool.idle, `repeat ${repeat}`).toBe(idle);
    }
  });
});

describe("the misses of one meaning", () => {
  const hand = Hand.fromCdhsString(OPENER);

  it("finds the bounds a solver allows", () => {
    const solver = _solverPool.borrow();
    try {
      solver.add(model.highCardPoints.ge(11), model.highCardPoints.le(14));
      expect(_boundsOf(solver, model.highCardPoints, 0, 37)).toEqual([11, 14]);
    } finally {
      _solverPool.restore(solver);
    }
  });

  it("blames the honors when the shape and the points fit", () => {
    // A stopper in hearts: the king needs a second card, and K5 has one,
    // so ask for the ace instead.
    const meaning = z3.And(model.aceOfHearts.eq(1), model.hearts.ge(2));
    expect(_missesFor(meaning, hand, Call.fromString("1N"))).toEqual([
      { kind: "honors", suit: "H" },
    ]);
  });

  it("says nothing of a meaning no hand has", () => {
    const meaning = z3.And(model.spades.ge(7), model.hearts.ge(7));
    expect(_missesFor(meaning, hand, Call.fromString("2S"))).toEqual([]);
  });

  it("calls the shape wrong when every length is allowed alone", () => {
    // Five of both majors: two hearts is short, and four diamonds too many.
    const meaning = z3.And(model.spades.ge(5), model.hearts.ge(5));
    expect(_missesFor(meaning, hand, Call.fromString("2S"))).toEqual([
      { kind: "length", suit: "D", min: 0, max: 3, actual: 4 },
      { kind: "length", suit: "H", min: 5, max: 8, actual: 2 },
    ]);
    // Five spades with at most three diamonds, or four diamonds with at
    // most four spades: this hand's five spades and four diamonds are each
    // allowed, but not together.
    const either = z3.Or(
      z3.And(model.spades.eq(5), model.diamonds.le(3)),
      z3.And(model.spades.le(4), model.diamonds.eq(4)),
    );
    expect(_missesFor(either, hand, Call.fromString("2S"))).toEqual([
      { kind: "shape" },
    ]);
  });
});
