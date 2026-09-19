// Copyright (c) 2013 The SAYCBridge Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.
//
// Ported from python/tests/test_bidder.py, plus tests of what the port made
// explicit: the solver release protocol and the log sink.  A few of the
// Python tests need rules phase 5 may not have registered yet (responses,
// for one); those assert the same thing on the opening auction until the
// registry is complete, then exactly what the Python asserts.

import { afterEach, describe, expect, it } from "vitest";
import { Call, sortCalls } from "../../core/call";
import { CallHistory } from "../../core/callhistory";
import { Hand } from "../../core/hand";
import { EAST, NORTH } from "../../core/position";
import {
  Bidder,
  History,
  HistoryCache,
  Interpreter,
  PossibleCalls,
  RuleSelector,
  _productionOrder,
  _solverPool,
  compareProductionOrder,
  setBidderLog,
  withHistory,
} from "../bidder";
import { Priority } from "../purposes";
import { PriorityOrdering, RuleCompiler } from "../rule_compiler";
import { OneLevelSuitOpening } from "../rules";
import { StandardAmericanYellowCard } from "../sayc";
import { type ManifestRule, readJsonFixture } from "./fixtures";

const manifest = readJsonFixture<ManifestRule[]>("rules-manifest.json");
const registryComplete =
  StandardAmericanYellowCard.rules.length === manifest.length;

function names(calls: readonly Call[]): string[] {
  return calls.map((call) => call.name);
}

describe("HistoryCache", () => {
  it("keeps the dealer and vulnerability on the root history", () => {
    const cache = new HistoryCache();
    const callHistory = CallHistory.fromString("1N P", "E", "N-S");
    const [history, remaining] = cache.lookup(callHistory);
    expect(remaining).toEqual(callHistory.calls);
    expect(history.callHistory.calls).toEqual([]);
    expect(history.callHistory.dealer).toBe(EAST);
    expect(history.callHistory.vulnerability.name).toBe("N-S");
  });

  it("keeps the same calls by a different dealer as different entries", () => {
    const cache = new HistoryCache();
    const interpreter = new Interpreter();
    const north = CallHistory.fromString("1N P", "N");
    const east = CallHistory.fromString("1N P", "E");
    for (const callHistory of [north, east]) {
      interpreter.withHistory(callHistory, (history) => cache.add(history));
    }
    const [cachedNorth, remainingNorth] = cache.lookup(north);
    const [cachedEast, remainingEast] = cache.lookup(east);
    expect(remainingNorth).toEqual([]);
    expect(remainingEast).toEqual([]);
    expect(cachedNorth).not.toBe(cachedEast);
    expect(cachedNorth.callHistory.dealer).toBe(NORTH);
    expect(cachedEast.callHistory.dealer).toBe(EAST);
  });

  it("does not match a cached root", () => {
    const cache = new HistoryCache();
    const callHistory = CallHistory.fromString("1N P");
    cache.add(
      new History({ callHistory: callHistory.copyWithPartialHistory(0) }),
    );
    const [history, remaining] = cache.lookup(callHistory);
    expect(remaining).toEqual(callHistory.calls);
    expect(history.callHistory.calls).toEqual([]);
  });

  it("lets the longest prefix win", () => {
    const cache = new HistoryCache();
    const interpreter = new Interpreter();
    interpreter.withHistory(CallHistory.fromString("1N P 2C P"), (history) =>
      cache.add(history),
    );
    const [history, remaining] = cache.lookup(
      CallHistory.fromString("1N P 2C P 2H P"),
    );
    expect(names(remaining)).toEqual(["2H", "P"]);
    expect(history.callHistory.callsString()).toBe("1N P 2C P");
  });

  it("forgets the oldest entry beyond its size limit", () => {
    const cache = new HistoryCache(2);
    const root = (calls: string) =>
      new History({
        callHistory: CallHistory.fromString(calls).copyWithPartialHistory(0),
      });
    const first = root("");
    cache.add(first);
    cache.add(root(""));
    cache.add(root(""));
    expect(cache.lru).toHaveLength(2);
    expect(cache.lru.map(([, history]) => history)).not.toContain(first);
  });
});

describe("canonical order", () => {
  // The bidder visits sets in Call order (and rules by name), never in hash
  // order: a port that cannot reproduce Python's set iteration must still make
  // the same choices.

  it("visits the possible calls in Call order", () => {
    // The Python asks after "1C P" with a responding hand; that needs the
    // responses registered, so until then an opening hand asks at the start.
    const hand = Hand.fromCdhsString(
      registryComplete ? "KJ32.A54.Q876.92" : "AQ.AQ2.AK52.Q973",
    );
    const calls = registryComplete ? "1C P" : "";
    const possible = new Interpreter().withHistory(
      CallHistory.fromString(calls),
      (history) => {
        const selector = new RuleSelector(StandardAmericanYellowCard, history);
        return selector.possibleCallsForHand(hand, null);
      },
    );
    const visited = possible._callsAndPriorities.map((pair) => pair[0]);
    expect(new Set(visited).size).toBeGreaterThan(1);
    expect(visited).toEqual(sortCalls(visited));
  });

  it("yields a rule's calls in Call order", () => {
    const rule = RuleCompiler.compile(OneLevelSuitOpening);
    const calls = new Interpreter().withHistory(
      CallHistory.fromString(""),
      (history) => [...rule.callsOver(history)].map(([, call]) => call.name),
    );
    expect(calls).toEqual(["1C", "1D", "1H", "1S"]);
  });

  it("keeps the rule for each call in Call order", () => {
    const calls = registryComplete ? "1C P" : "";
    const keys = new Interpreter().withHistory(
      CallHistory.fromString(calls),
      (history) => [
        ...new RuleSelector(
          StandardAmericanYellowCard,
          history,
        )._callToRule.keys(),
      ],
    );
    expect(keys.length).toBeGreaterThan(1);
    expect(keys).toEqual(sortCalls(keys));
  });

  it("sorts the rules by name", () => {
    const ruleNames = StandardAmericanYellowCard.rules.map((rule) => rule.name);
    expect(ruleNames).toEqual([...ruleNames].sort());
  });

  it.skipIf(!registryComplete)(
    "lists the suits of a view in suit order",
    () => {
      // North to call: North opened 1S, partner South bid 2H.
      new Interpreter().withHistory(
        CallHistory.fromString("1S P 2H P"),
        (history) => {
          expect(history.me.bidSuits.map((s) => s.char)).toEqual(["S"]);
          expect(history.partner.bidSuits.map((s) => s.char)).toEqual(["H"]);
          expect(history.partner.unbidSuits.map((s) => s.char)).toEqual([
            "C",
            "D",
            "S",
          ]);
          expect(history.us.bidSuits.map((s) => s.char)).toEqual(["H", "S"]);
          expect(history.them.unbidSuits.map((s) => s.char)).toEqual([
            "C",
            "D",
            "H",
            "S",
          ]);
        },
      );
    },
  );

  it("lists the suits of a view in suit order after an opening", () => {
    // West to call: North opened 1S (dealer North).
    new Interpreter().withHistory(
      CallHistory.fromString("1S P 2C"),
      (history) => {
        // A history the exemplars can interpret: 1S by OneLevelSuitOpening.
        expect(history.lho.lastCall?.name).toBe("1S");
        expect(history.lho.bidSuits.map((s) => s.char)).toEqual(["S"]);
        expect(history.lho.unbidSuits.map((s) => s.char)).toEqual([
          "C",
          "D",
          "H",
        ]);
        expect(history.them.bidSuits.map((s) => s.char)).toContain("S");
      },
    );
  });

  it("keeps the maximal set independent of the insertion order", () => {
    // PriorityOrdering.lt is not transitive: a strain of None compares with
    // neither strain, and equal fallbacks of two rules do not order.  Here
    // A < B < C but A and C are incomparable, so visiting C first keeps A and
    // visiting A first would lose it.
    const rule = (name: string) => ({ name });
    const a: [Call, Priority] = [
      Call.fromString("1H"),
      new Priority("Game", { rule: rule("a"), strain: 2, fallback: 0 }),
    ];
    const b: [Call, Priority] = [
      Call.fromString("1D"),
      new Priority("Game", { rule: rule("b"), strain: 1, fallback: 1 }),
    ];
    const c: [Call, Priority] = [
      Call.fromString("1C"),
      new Priority("Game", { rule: rule("c"), strain: null, fallback: 0 }),
    ];
    const lt = (left: Priority, right: Priority) =>
      new PriorityOrdering().lt(left, right);
    expect(lt(a[1], b[1]) && lt(b[1], c[1])).toBe(true);
    expect(lt(a[1], c[1]) || lt(c[1], a[1])).toBe(false);
    const results: [string, Priority][][] = [];
    for (const insertion of [
      [c, b, a],
      [a, b, c],
      [b, a, c],
    ]) {
      const possible = new PossibleCalls(new PriorityOrdering());
      for (const [call, priority] of insertion) {
        possible.addCallWithPriority(call, priority);
      }
      results.push(
        possible
          .maximalCallsAndPriorities()
          .map(([call, priority]) => [call.name, priority]),
      );
    }
    // Call order: C first, then A survives.
    expect(results[0]).toEqual([
      ["1C", c[1]],
      ["1H", a[1]],
    ]);
    expect(results[1]).toEqual(results[0]);
    expect(results[2]).toEqual(results[0]);
  });
});

describe("the solver pool and release", () => {
  it("returns every borrowed solver to the pool on release", () => {
    const interpreter = new Interpreter();
    const before = _solverPool.idle;
    const history = interpreter.createHistory(
      CallHistory.fromString("1S P 2C P 2H P"),
    );
    // Queries borrow solvers along the chain of each position.
    expect(history.partner.minPoints).toBeGreaterThanOrEqual(0);
    expect(
      history.lho.maxLength(history.lho.unbidSuits[0]),
    ).toBeLessThanOrEqual(13);
    expect(typeof history.me.isBalanced).toBe("boolean");
    history.release();
    expect(_solverPool.idle).toBeGreaterThanOrEqual(before);
    expect(_solverPool.idle).toBeGreaterThan(0);
  });

  it("releases even when the callback throws", () => {
    const idle = _solverPool.idle;
    expect(() =>
      new Interpreter().withHistory(CallHistory.fromString("1N P"), () => {
        throw new Error("boom");
      }),
    ).toThrow("boom");
    expect(_solverPool.idle).toBeGreaterThanOrEqual(idle);
  });

  it("answers a released history again from its memoized results", () => {
    const history = new Interpreter().createHistory(
      CallHistory.fromString("1N"),
    );
    const minPoints = history.rho.minPoints;
    history.release();
    expect(history.rho.minPoints).toBe(minPoints);
    withHistory(history, () => {
      expect(history.rho.maxPoints).toBeGreaterThanOrEqual(minPoints);
    });
  });
});

describe("the log sink", () => {
  afterEach(() => {
    setBidderLog(null);
  });

  it("receives the WARNING for a call no rule can make", () => {
    const lines: string[] = [];
    setBidderLog((line) => lines.push(line));
    new Interpreter().withHistory(CallHistory.fromString(""), (history) => {
      // 7N is legal but no opening rule makes it.
      new RuleSelector(
        StandardAmericanYellowCard,
        history,
        Call.fromString("7N"),
      );
    });
    expect(lines).toEqual(["WARNING: No rule can make: 7N"]);
  });

  it("restores the previous sink", () => {
    const first = setBidderLog(() => {});
    const second = setBidderLog(null);
    expect(second).not.toBe(first);
    expect(setBidderLog(first)).toBe(first);
  });
});

describe("Bidder", () => {
  it("opens 1N with a balanced 16 and explains it", () => {
    const bidder = new Bidder();
    const selection = bidder.callSelectionFor(
      Hand.fromCdhsString("KQ4.AQ8.K9873.K2"),
      CallHistory.fromString(""),
    );
    expect(selection?.call.name).toBe("1N");
    expect(selection?.rule?.name).toBe("NotrumpOpening");
    expect(selection?.collision).toBeNull();
    expect(
      bidder.findCallFor(
        Hand.fromCdhsString("KQ4.AQ8.K9873.K2"),
        CallHistory.fromString(""),
      )?.name,
    ).toBe("1N");
  });

  it("orders a collision a bid first, then a double, then a pass, the cheapest first", () => {
    const calls = ["P", "X", "2C", "1S", "XX"].map((name) =>
      Call.fromString(name),
    );
    expect(_productionOrder(calls[0])).toEqual([2, calls[0]]);
    expect(_productionOrder(calls[1])).toEqual([1, calls[1]]);
    expect(_productionOrder(calls[2])).toEqual([0, calls[2]]);
    expect(names([...calls].sort(compareProductionOrder))).toEqual([
      "1S",
      "2C",
      "X",
      "XX",
      "P",
    ]);
  });
});
