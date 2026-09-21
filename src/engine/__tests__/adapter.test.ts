// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// A translation of python/tests/test_yarborough_z3b.py, of the
// `OpeningLeadAdapterTest` part of python/tests/test_leads.py, and of
// python/tests/test_z3b_golden_cases.py, which is the same file of recorded
// answers (tests/z3b_golden_cases.json) the Python reads.
//
// `patch.object(api, "_selection_for_board", ...)` becomes
// `setSelectionForBoard`, the adapter's one seam: it swaps the selection step
// and hands back the previous one, so a test restores it in a `finally`.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  _board,
  _categoryForSelection,
  _formatRuleName,
  _matchesFocus,
  _matchesTarget,
  _normalizeVulnerability,
  _openingLeadForBoard,
  _selectionResult,
  type AdapterRule,
  type AdapterSelection,
  BiddingInputError,
  ConstraintsSerializer,
  dispatch,
  dispatchJson,
  FocusGenerationError,
  generateAdaptiveBoard,
  generateFilteredBoard,
  getCallInterpretations,
  getFullAutobid,
  getNextCall,
  getOpeningLead,
  getHandAnalysis,
  getSuggestedCall,
  type HandAnalysis,
  MAX_FOCUS_ATTEMPTS,
  setSelectionForBoard,
  _unfitReason,
} from "../adapter";
import { LEVEL_ONE } from "../categories";
import { Board } from "../core/board";
import { Call } from "../core/call";
import { CallHistory } from "../core/callhistory";
import { Deal } from "../core/deal";
import { Hand } from "../core/hand";
import { _solverPool, setBidderLog } from "../z3b/bidder";
import { Rule, type RuleClass } from "../z3b/rule_compiler";
import * as rules from "../z3b/rules";
import goldenCasesText from "../../../tests/z3b_golden_cases.json?raw";

/** One case of tests/z3b_golden_cases.json. */
interface GoldenCase {
  identifier: string;
  call_name: string;
  rule_name: string | null;
  description: string | null;
  knowledge_string: string | null;
  category: string[];
}

const goldenCases = JSON.parse(goldenCasesText) as GoldenCase[];

// --- the fakes python/tests/test_yarborough_z3b.py builds by hand ----------

/**
 * `_NamedRule`: a rule with a name and no explanation.  `dslRule` is what
 * TypeScript wants of a rule and the Python fake leaves out: the cases that
 * name a rule never ask what class it is, so the base class stands in.
 */
class NamedRule implements AdapterRule {
  readonly name: string;
  readonly dslRule: RuleClass;

  constructor(name: string, dslRule: RuleClass = Rule) {
    this.name = name;
    this.dslRule = dslRule;
  }

  explanationForBid(): string | null {
    return null;
  }
}

/** `_Selection`: a selection by the rule class `dslRule`. */
function selectionOf(dslRule: RuleClass): AdapterSelection {
  return { call: null, rule: new NamedRule(dslRule.name, dslRule) };
}

/** `_NamedSelection`: a selection of `callName` by the rule class `ruleName`. */
function namedSelection(callName: string, ruleName: string): AdapterSelection {
  return { call: Call.fromString(callName), rule: new NamedRule(ruleName) };
}

/** `_board` of python/tests/test_leads.py: hands are C.D.H.S, N E S W. */
function boardOf(cdhsHands: string[], auction: string, number = 1): Board {
  const deal = new Deal(cdhsHands.map((hand) => Hand.fromCdhsString(hand)));
  return new Board(number, deal, CallHistory.fromString(auction));
}

let restoreLog: ReturnType<typeof setBidderLog>;
beforeAll(() => {
  // The kernel prints its WARNING and COLLISION lines; no test reads them.
  restoreLog = setBidderLog(() => {});
});
afterAll(() => {
  setBidderLog(restoreLog);
});

describe("the JSON adapter", () => {
  it("accepts all frontend vulnerability names", () => {
    for (const [frontendName, z3bName] of Object.entries({
      NS: "N-S",
      EW: "E-W",
      None: "None",
      Both: "Both",
    })) {
      expect(_normalizeVulnerability(frontendName), frontendName).toBe(z3bName);
      expect(
        getCallInterpretations("", "N", frontendName).length,
        frontendName,
      ).toBeGreaterThan(0);
    }
  });

  it("rejects invalid frontend values", () => {
    expect(() => getCallInterpretations("", "Q", "None")).toThrow(
      BiddingInputError,
    );
    expect(() => getCallInterpretations("", "N", "Everyone")).toThrow(
      BiddingInputError,
    );
    expect(() => getNextCall("not-a-board")).toThrow(BiddingInputError);
  });

  it("formats a rule name", () => {
    expect(_formatRuleName("OneLevelSuitOpening")).toBe(
      "One Level Suit Opening",
    );
    expect(_formatRuleName("StrongTwoClubs")).toBe("Strong Two Clubs");
    expect(_formatRuleName("Jacoby2N")).toBe("Jacoby 2NT");
    expect(_formatRuleName("Opening1N")).toBe("Opening 1NT");
    expect(_formatRuleName("RHOOpeningPreempt")).toBe("RHO Opening Preempt");
    expect(_formatRuleName(null)).toBeNull();
  });

  it("interprets every legal opening call", () => {
    const interpretations = getCallInterpretations("", "N", "None");

    const names = new Set(
      interpretations.map((interpretation) => interpretation.call_name),
    );
    expect(names).toContain("P");
    expect(names).toContain("1C");
    expect(names).toContain("1N");
    expect(interpretations).toContainEqual({
      call_name: "4N",
      rule_name: null,
      description: null,
      knowledge_string: null,
    });

    const open1h = interpretations.find(
      (interpretation) => interpretation.call_name === "1H",
    )!;
    expect(open1h.rule_name).toBe("One Level Suit Opening");
    expect(open1h.knowledge_string).toBe("12-21 hcp, 5+H");

    const open1nt = interpretations.find(
      (interpretation) => interpretation.call_name === "1N",
    )!;
    expect(open1nt.rule_name).toBe("Notrump Opening");
    expect(open1nt.knowledge_string).toBe(
      "15-17 hcp, 2-5C 2-5D 2-5H 2-5S NotrumpSystemsOn",
    );
  });

  it("suggests the call it would make next", () => {
    const identifier = Board.random().identifier;

    const suggestion = getSuggestedCall(identifier);

    expect(getNextCall(identifier)).toBe(suggestion.call_name);
    expect(
      suggestion.description === null ||
        typeof suggestion.description === "string",
    ).toBe(true);
    expect(suggestion).toHaveProperty("knowledge_string");
    // Every suggestion, rule or no rule, is categorized (see categories.ts).
    expect(suggestion.category).toHaveLength(3);
    expect(LEVEL_ONE).toContain(suggestion.category![0]);
  });

  it("takes the suggestion's category from the rule", () => {
    const board = Board.random();
    const previous = setSelectionForBoard(() =>
      namedSelection("1N", "NotrumpOpening"),
    );
    let suggestion;
    try {
      suggestion = getSuggestedCall(board.identifier);
    } finally {
      setSelectionForBoard(previous);
    }
    expect(suggestion.category).toEqual([
      "Opening",
      "1NT, 2NT and 3NT",
      "Notrump Opening",
    ]);
    expect(suggestion.rule_name).toBe("Notrump Opening");
  });

  it("defaults an unresolved selection to a pass", () => {
    const result = _selectionResult(null);
    expect(result.call_name).toBe("P");
    expect(result.rule_name).toBeNull();
    expect(result.description).toBeNull();
    expect(result.knowledge_string).toBeNull();
    expect(result.category).toBeNull();
  });

  it("matches a focus by the z3b rule classes", () => {
    expect(_matchesFocus(selectionOf(rules.NotrumpOpening), "Notrump")).toBe(
      true,
    );
    expect(_matchesFocus(selectionOf(rules.PreemptiveOpen), "Preempt")).toBe(
      true,
    );
    expect(_matchesFocus(selectionOf(rules.StrongTwoClubs), "Strong2C")).toBe(
      true,
    );
    expect(_matchesFocus(selectionOf(rules.NotrumpOpening), "Preempt")).toBe(
      false,
    );
  });

  it("retries the focus generator until the rule matches", () => {
    const board = Board.random();
    const mismatched = selectionOf(rules.NotrumpOpening);
    const matched = selectionOf(rules.PreemptiveOpen);

    const sideEffect = [mismatched, matched];
    const previous = setSelectionForBoard(() => sideEffect.shift()!);
    try {
      expect(generateFilteredBoard("Preempt", () => board, 2)).toBe(
        board.identifier,
      );
    } finally {
      setSelectionForBoard(previous);
    }
  });

  it("reports focus exhaustion", () => {
    const board = Board.random();

    const previous = setSelectionForBoard(() =>
      selectionOf(rules.NotrumpOpening),
    );
    try {
      expect(() => generateFilteredBoard("Strong2C", () => board, 2)).toThrow(
        FocusGenerationError,
      );
    } finally {
      setSelectionForBoard(previous);
    }
  });

  it("dispatches the public methods over JSON", () => {
    const response = dispatchJson(
      JSON.stringify({
        method: "get_call_interpretations",
        arguments: { calls: "", dealer: "N", vulnerability: "None" },
      }),
    );

    expect(Array.isArray(JSON.parse(response))).toBe(true);
  });

  it("rejects an unknown method over JSON", () => {
    expect(() =>
      dispatchJson(JSON.stringify({ method: "missing", arguments: {} })),
    ).toThrow(BiddingInputError);
  });

  it("matches an adaptive target by prefix", () => {
    expect(
      _matchesTarget(
        ["Responding to an opening", "To 1NT", "Stayman"],
        [["Responding to an opening", "To 1NT"]],
      ),
    ).toBe(true);
    expect(
      _matchesTarget(["Opening", "Preempts", "Preemptive Open"], [["Opening"]]),
    ).toBe(true);
    expect(
      _matchesTarget(
        ["Opening", "Preempts", "Preemptive Open"],
        [["Responding to an opening", "To 1NT"], ["Slam bidding"]],
      ),
    ).toBe(false);
  });

  it("finds an adaptive board for a common target", () => {
    // Every deal has an opening or a pass as the dealer's first call, and
    // South opens or passes in first or second seat often enough that a
    // handful of attempts finds one.
    const result = generateAdaptiveBoard([["Opening"]], 10);
    expect(result).not.toBeNull();
    expect(result!.category[0]).toBe("Opening");
    // The identifier is the bare board, without the auction it was found by.
    expect(result!.identifier).not.toContain(":");
    const board = Board.fromIdentifier(result!.identifier);
    expect(board.callHistory.calls).toEqual([]);
  });

  it("gives up quietly when no board matches", () => {
    // No engine call is ever in a category that does not exist.
    expect(generateAdaptiveBoard([["No such thing"]], 2)).toBeNull();
  });

  it("rejects bad adaptive input", () => {
    expect(() => generateAdaptiveBoard([], 1)).toThrow(BiddingInputError);
    expect(() => generateAdaptiveBoard([["Opening", 3]], 1)).toThrow(
      BiddingInputError,
    );
    expect(() => generateAdaptiveBoard([["Opening"]], 0)).toThrow(
      BiddingInputError,
    );
    expect(() => generateAdaptiveBoard([["Opening"]], 1, "Q")).toThrow(
      BiddingInputError,
    );
  });

  it("dispatches adaptive generation over JSON", () => {
    const response = dispatchJson(
      JSON.stringify({
        method: "generate_adaptive_board",
        arguments: { targets: [["No such thing"]], max_attempts: 1 },
      }),
    );
    expect(JSON.parse(response)).toBeNull();
  });

  it("bids a full auction", () => {
    const board = Board.random();
    const calls = getFullAutobid(board.identifier);
    expect(Array.isArray(calls)).toBe(true);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.slice(-3)).toEqual(["P", "P", "P"]);
  });
});

// --- the parts of the adapter the Python tests reach only indirectly -------

describe("the adapter's smaller pieces", () => {
  it("bounds focus generation", () => {
    expect(MAX_FOCUS_ATTEMPTS).toBe(5000);
    expect(() => generateFilteredBoard("Nonsense")).toThrow(
      "unknown practice focus: Nonsense",
    );
    expect(() => generateFilteredBoard(7)).toThrow("focus must be a string");
    expect(() =>
      generateFilteredBoard("Random", () => Board.random(), 0),
    ).toThrow("max_attempts must be a positive integer");
    // "Random" accepts the first board without bidding it at all.
    const board = Board.random();
    expect(generateFilteredBoard("Random", () => board)).toBe(board.identifier);
  });

  it("says why a board identifier or an auction is unusable", () => {
    expect(() => _board(3)).toThrow("identifier must be a string");
    expect(() => _board("not-a-board")).toThrow(
      "invalid board identifier: not-a-board",
    );
    expect(() => getCallInterpretations(3, "N", "None")).toThrow(
      "calls must be a string",
    );
    expect(() => getCallInterpretations("", "N", 3)).toThrow(
      "vulnerability must be a string",
    );
    expect(() => getCallInterpretations("1S ZZ", "N", "None")).toThrow(
      "invalid call history: 1S ZZ",
    );
    expect(() => getCallInterpretations("", "Q", "None")).toThrow(
      "dealer must be one of N, E, S, W",
    );
    expect(() => _normalizeVulnerability("Everyone")).toThrow(
      "vulnerability must be one of None, NS, N-S, EW, E-W, Both",
    );
  });

  it("reads nothing out of a complete auction", () => {
    expect(getCallInterpretations("P P P P", "N", "None")).toEqual([]);
    const board = boardOf(OPENING_LEAD_HANDS, "1N P 3N P P P");
    expect(() => getNextCall(board.identifier)).toThrow(
      "cannot select a call after the auction is complete",
    );
  });

  it("serializes an unconstrained hand as a question mark", () => {
    expect(
      new ConstraintsSerializer({
        minPoints: 0,
        maxPoints: 37,
        minLength: () => 0,
        maxLength: () => 13,
      }).exploreString(),
    ).toBe("?");
    // A known singleton reads as a count, an open-ended holding as "n+", and
    // a suit nothing is known about is left out.
    expect(
      new ConstraintsSerializer({
        minPoints: 12,
        maxPoints: 37,
        minLength: (suit) => [1, 6, 0, 2][suit.index],
        maxLength: (suit) => [1, 13, 13, 4][suit.index],
      }).exploreString(),
    ).toBe("12+ hcp, 1C 6+D 2-4S");
  });

  it("returns every solver a request borrows", () => {
    // The branch histories `getCallInterpretations` extends off the auction to
    // read each call's meaning are released (`History.releaseBranch`), so a
    // request leaves the pool as it found it instead of draining it.
    getCallInterpretations("1H P", "N", "None");
    const idle = _solverPool.idle;
    for (let repeat = 0; repeat < 3; repeat += 1) {
      getCallInterpretations("1H P", "N", "None");
      expect(_solverPool.idle, `repeat ${repeat}`).toBe(idle);
    }
    getSuggestedCall(Board.random().identifier);
    expect(_solverPool.idle).toBe(idle);
  });

  it("categorizes a call-less selection as a pass", () => {
    const history = CallHistory.fromString("1S P", "N", "None");
    expect(_categoryForSelection(null, history)).toEqual([
      "Responding to an opening",
      "Passing",
      "Pass",
    ]);
    expect(
      _categoryForSelection({ call: null, rule: new NamedRule("X") }, history),
    ).toEqual(["Responding to an opening", "Passing", "Pass"]);
  });

  it("dispatches by method name", () => {
    expect(() => dispatch(3, {})).toThrow("method must be a string");
    expect(() => dispatch("get_next_call", [])).toThrow(
      "arguments must be an object",
    );
    expect(() => dispatch("nope", {})).toThrow("unknown engine method: nope");
    expect(() => dispatchJson("{not json")).toThrow(
      "request_json must contain valid JSON",
    );
    expect(() => dispatchJson("[]")).toThrow(
      "request_json must contain an object",
    );
    expect(() => dispatchJson(3)).toThrow("request_json must be a string");
    const board = Board.random();
    expect(dispatch("get_next_call", { identifier: board.identifier })).toBe(
      getNextCall(board.identifier),
    );
    expect(
      dispatch("get_full_autobid", { identifier: board.identifier }),
    ).toEqual(getFullAutobid(board.identifier));
  });
});

// --- python/tests/test_z3b_golden_cases.py ---------------------------------

describe("the golden cases", () => {
  it(`bids all ${goldenCases.length} as Python did`, () => {
    for (const goldenCase of goldenCases) {
      expect(getNextCall(goldenCase.identifier), goldenCase.identifier).toBe(
        goldenCase.call_name,
      );
      expect(
        getSuggestedCall(goldenCase.identifier),
        goldenCase.identifier,
      ).toEqual({
        call_name: goldenCase.call_name,
        rule_name: goldenCase.rule_name,
        description: goldenCase.description,
        knowledge_string: goldenCase.knowledge_string,
        category: goldenCase.category,
      });
    }
  });
});

// --- OpeningLeadAdapterTest of python/tests/test_leads.py ------------------

// Hands are C.D.H.S here (the engine's order), N E S W.
const OPENING_LEAD_HANDS = [
  "K5.AQ3.KJ4.AQ983", // North: 17 hcp balanced
  "T8.KT9.Q9762.J75", // East
  "AJ64.J87.A53.KT2", // South: 13 hcp balanced
  "Q9732.6542.T8.64", // West: the rest
];

describe("the opening lead adapter", () => {
  it("leads against a notrump contract", () => {
    const board = boardOf(OPENING_LEAD_HANDS, "1N P 3N P P P");
    const lead = _openingLeadForBoard(board);
    expect(lead.leader).toBe("E");
    expect(lead.card).toBe("H6"); // fourth best from Q9762: the 6
    expect([lead.partner_suits, lead.their_suits]).toEqual([[], []]);
    expect(lead.reason).toContain("fourth best");
  });

  it("does not read Stayman as a suit they bid", () => {
    const board = boardOf(OPENING_LEAD_HANDS, "1N P 2C P 2D P 3N P P P");
    const lead = _openingLeadForBoard(board);
    expect(lead.their_suits, JSON.stringify(lead)).toEqual([]);
    expect(lead.card).toBe("H6");
  });

  it("leads partner's natural suit", () => {
    // East overcalls 1S over North's 1C; South declares 3N; West leads
    // partner's suit.
    const hands = [
      "AK83.K52.A4.J752", // North
      "T4.T6.J953.AKQ98", // East: a spade overcall
      "QJ72.AQ98.KQT.63", // South
      "965.J743.8762.T4", // West: the rest
    ];
    const board = boardOf(hands, "1C 1S 3N P P P");
    const lead = _openingLeadForBoard(board);
    expect(lead.leader).toBe("W");
    expect(lead.partner_suits, JSON.stringify(lead)).toEqual(["S"]);
    expect(lead.card).toBe("ST");
  });

  it("rejects an incomplete or passed out auction", () => {
    expect(() =>
      _openingLeadForBoard(boardOf(OPENING_LEAD_HANDS, "1N P")),
    ).toThrow(BiddingInputError);
    expect(() =>
      _openingLeadForBoard(boardOf(OPENING_LEAD_HANDS, "P P P P")),
    ).toThrow(BiddingInputError);
  });

  it("says so through dispatch when there is no auction", () => {
    let board = Board.random();
    while (board.callHistory.isComplete()) {
      board = Board.random();
    }
    // A random board has an empty auction: the adapter must say so, not crash.
    expect(() =>
      dispatch("get_opening_lead", { identifier: board.identifier }),
    ).toThrow(BiddingInputError);
    expect(() => getOpeningLead(board.identifier)).toThrow(
      "the auction is not complete",
    );
  });
});

describe("the hand-aware analysis", () => {
  // AQ982 in spades, K5 in hearts, A973 in diamonds, 42 in clubs: thirteen
  // high-card points and five spades, so SAYC opens it one spade.  Written
  // C.D.H.S, the way the rest of the repository writes a hand.
  const OPENER = "42.A973.K5.AQ982";

  function analysisFor(hand: string, calls = "", dealer = "N") {
    const analysis = getHandAnalysis(hand, calls, dealer, "None");
    const byCall = new Map(
      analysis.calls.map((call) => [call.call_name, call]),
    );
    return { analysis, byCall };
  }

  it("marks the call z3b makes with the hand", () => {
    const { analysis, byCall } = analysisFor(OPENER);
    expect(analysis.call_name).toBe("1S");
    expect(analysis.category).toEqual([
      "Opening",
      "One of a suit",
      "One Level Suit Opening",
    ]);
    expect(byCall.get("1S")!.fit).toBe("chosen");
    // Exactly one call is the chosen one.
    expect(analysis.calls.filter((call) => call.fit === "chosen")).toHaveLength(
      1,
    );
  });

  it("separates a call the hand could make from the one z3b prefers", () => {
    const { byCall } = analysisFor(OPENER);
    // Four diamonds and an opening hand: 1D is a call this hand can make, and
    // SAYC opens the longer suit first, so it loses on priority rather than
    // on the hand.
    expect(byCall.get("1D")!.fit).toBe("possible");
    expect(byCall.get("P")!.fit).toBe("possible");
    // A call that only lost on priority is not accused of missing anything.
    expect(byCall.get("1D")!.requirements).toBeNull();
    expect(byCall.get("1D")!.unfit_reason).toBeNull();
  });

  it("says why z3b preferred its call to one that also fit", () => {
    const { byCall } = analysisFor(OPENER);
    // One rule offers both one-level openings and prefers the longer suit,
    // so the two calls are separated inside that rule, not by purpose.
    expect(byCall.get("1D")!.preference_reason).toEqual({
      kind: "rule",
      purpose: "MajorDiscovery",
      chosen_purpose: "MajorDiscovery",
    });
    // Passing and opening are different things to be doing, and opening the
    // hand is the better of the two.
    expect(byCall.get("P")!.preference_reason).toEqual({
      kind: "purpose",
      purpose: "Forced",
      chosen_purpose: "MajorDiscovery",
    });
    // Nothing is claimed about the call z3b made, or about a call no hand
    // could make here.
    expect(byCall.get("1S")!.preference_reason).toBeNull();
    expect(byCall.get("1H")!.preference_reason).toBeNull();
  });

  it("gives no reason where the two calls are incomparable", () => {
    // 25 balanced: SAYC opens 3NT, and 2C is the game force it beat.
    const { analysis, byCall } = analysisFor("A32.AK4.AK3.AKQ2");
    expect(analysis.call_name).toBe("3N");
    expect(byCall.get("2C")!.preference_reason).toEqual({
      kind: "purpose",
      purpose: "GameForce",
      chosen_purpose: "EnterNotrumpSystem",
    });
    // Every reason given is a real domination, so a call the ordering does
    // not compare gets none rather than an invented one.
    for (const call of analysis.calls) {
      if (call.fit !== "possible") {
        expect(call.preference_reason, call.call_name).toBeNull();
      }
    }
  });

  it("names the suit an unfitting call wanted", () => {
    const { byCall } = analysisFor(OPENER);
    const oneHeart = byCall.get("1H")!;
    expect(oneHeart.fit).toBe("unfit");
    expect(oneHeart.unfit_reason).toEqual({
      kind: "suit_short",
      suit: "H",
      shown: 5,
      actual: 2,
    });
    // A weak two asks for a sixth card of the suit the call names, not for
    // the spades the hand is otherwise long enough in.
    expect(byCall.get("2S")!.unfit_reason).toEqual({
      kind: "suit_short",
      suit: "S",
      shown: 6,
      actual: 5,
    });
  });

  it("names the points an unfitting call wanted", () => {
    const { byCall } = analysisFor(OPENER);
    expect(byCall.get("1N")!.unfit_reason).toEqual({
      kind: "hcp_low",
      suit: null,
      shown: 15,
      actual: 13,
    });
    expect(byCall.get("2C")!.unfit_reason).toEqual({
      kind: "hcp_low",
      suit: null,
      shown: 22,
      actual: 13,
    });
  });

  it("reports the requirements only of the calls the hand fails", () => {
    const { analysis } = analysisFor(OPENER);
    for (const call of analysis.calls) {
      if (call.fit === "unfit") {
        expect(call.requirements, call.call_name).not.toBeNull();
        expect(call.requirements!.suit_lengths).toHaveLength(4);
      } else {
        expect(call.requirements, call.call_name).toBeNull();
        expect(call.unfit_reason, call.call_name).toBeNull();
      }
    }
  });

  it("says when no SAYC rule makes a call", () => {
    // Over an opening bid, a jump to the seven level is nobody's rule.
    const { byCall } = analysisFor(OPENER, "1S");
    const seven = byCall.get("7C")!;
    expect(seven.fit).toBe("no_rule");
    expect(seven.rule_name).toBeNull();
    expect(seven.requirements).toBeNull();
  });

  it("keeps the interpretations get_call_interpretations gives", () => {
    const { analysis } = analysisFor(OPENER);
    const interpretations = getCallInterpretations("", "N", "None");
    expect(analysis.calls.map((call) => call.call_name)).toEqual(
      interpretations.map((interpretation) => interpretation.call_name),
    );
    for (const [index, call] of analysis.calls.entries()) {
      expect(call.rule_name, call.call_name).toBe(
        interpretations[index].rule_name,
      );
      expect(call.knowledge_string, call.call_name).toBe(
        interpretations[index].knowledge_string,
      );
    }
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
    // Thirteen cards, but the four of clubs twice.
    expect(() => getHandAnalysis("442.A973.K5.AQ82", "", "N", "None")).toThrow(
      "invalid hand",
    );
    // A rank no deck has.
    expect(() => getHandAnalysis("4X.A973.K5.AQ982", "", "N", "None")).toThrow(
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
    getHandAnalysis(OPENER, "1S P", "N", "None");
    const idle = _solverPool.idle;
    for (let repeat = 0; repeat < 3; repeat += 1) {
      getHandAnalysis(OPENER, "1S P", "N", "None");
      expect(_solverPool.idle, `repeat ${repeat}`).toBe(idle);
    }
  });

  it("names the point count before the shape, and the call's own suit first", () => {
    const hand = Hand.fromCdhsString(OPENER);
    const requirements = {
      hcp: [15, 17] as [number, number],
      // Clubs through spades: this asks for six clubs and six hearts too.
      suit_lengths: [
        [6, 13],
        [0, 13],
        [6, 13],
        [0, 13],
      ] as [number, number][],
    };
    // Points first: they rule the call out whatever the shape does.
    expect(_unfitReason(requirements, hand, Call.fromString("1H"))).toEqual({
      kind: "hcp_low",
      suit: null,
      shown: 15,
      actual: 13,
    });

    const shapeOnly = { ...requirements, hcp: [0, 37] as [number, number] };
    // Clubs is the larger shortfall (2 against 6, versus hearts' 2 against 6
    // -- equal here), but the call names hearts, so hearts is what it says.
    expect(_unfitReason(shapeOnly, hand, Call.fromString("1H"))).toEqual({
      kind: "suit_short",
      suit: "H",
      shown: 6,
      actual: 2,
    });
    // A call that names no suit falls back to the largest shortfall.
    expect(_unfitReason(shapeOnly, hand, Call.fromString("P"))!.suit).toBe("C");
  });

  it("says nothing when the bounds do not explain the miss", () => {
    const hand = Hand.fromCdhsString(OPENER);
    expect(_unfitReason(null, hand, Call.fromString("1H"))).toBeNull();
    expect(
      _unfitReason(
        {
          hcp: [0, 37],
          suit_lengths: [
            [0, 13],
            [0, 13],
            [0, 13],
            [0, 13],
          ],
        },
        hand,
        Call.fromString("1H"),
      ),
    ).toBeNull();
  });
});
