// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of python/z3b/test_purposes.py, adapted to the exemplar
// rules where the Python reaches for another one.

import { describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import { CallHistory } from "../../core/callhistory";
import { Interpreter } from "../bidder";
import * as purposes from "../purposes";
import { Priority } from "../purposes";
import { lookup } from "../rule_compiler";
import { PreemptiveOpen } from "../rules";
import { RuleCompiler } from "../rule_compiler";
import { StandardAmericanYellowCard } from "../sayc";

/** The purposes in the Python module's order, worst last. */
const ORDER = [
  "Planned",
  "Answer",
  "EnterNotrumpSystem",
  "GameForce",
  "Penalize",
  "Enough",
  "SupportMajors",
  "TwoSuiter",
  "RebidLongMajor",
  "BalancedLimit",
  "LongSuitInvitation",
  "PreemptWeak",
  "Ask",
  "MajorDiscovery",
  "MinorDiscovery",
  "SupportMinorWithFive",
  "RebidLongMajorMinimum",
  "MinorDiscoveryWithFour",
  "Slam",
  "RebidLongMinor",
  "SupportMinorWithFour",
  "Game",
  "AskLater",
  "CharacterizeStrength",
  "SupportMinors",
  "RebidSuit",
  "Preempt",
  "Compete",
  "Miscellaneous",
  "Forced",
];

describe("purpose order", () => {
  it("documents every purpose in the order", () => {
    // The Python checks its docstring; here the order is the documented list.
    expect([...purposes.ORDER]).toEqual(ORDER);
    expect(purposes.RANK.get("Planned")).toBe(0);
    expect(purposes.RANK.get("Forced")).toBe(ORDER.length - 1);
    expect(new Set(purposes.ORDER).size).toBe(purposes.ORDER.length);
    for (const [shorthand, [major, minor]] of Object.entries(
      purposes.BY_SUIT,
    )) {
      expect(purposes.RANK.has(major), shorthand).toBe(true);
      expect(purposes.RANK.has(minor), shorthand).toBe(true);
    }
  });

  it("resolves the shorthands by suit", () => {
    expect(purposes.resolve("Support", Call.fromString("2H"))).toBe(
      "SupportMajors",
    );
    expect(purposes.resolve("Support", Call.fromString("2D"))).toBe(
      "SupportMinors",
    );
    expect(purposes.resolve("Discovery", Call.fromString("1S"))).toBe(
      "MajorDiscovery",
    );
    expect(purposes.resolve("RebidLong", Call.fromString("3C"))).toBe(
      "RebidLongMinor",
    );
    expect(purposes.resolve("RebidLongMinimum", Call.fromString("2S"))).toBe(
      "RebidLongMajorMinimum",
    );
    expect(purposes.resolve("Answer", Call.fromString("P"))).toBe("Answer");
    expect(() =>
      purposes.resolve("NoSuchPurpose", Call.fromString("P")),
    ).toThrow(/unknown purpose/);
  });

  it("compares priorities by purpose first", () => {
    const ordering = StandardAmericanYellowCard.priorityOrdering;
    const answer = new Priority("Answer");
    const game = new Priority("Game");
    expect(ordering.lt(game, answer)).toBe(true);
    expect(ordering.lt(answer, game)).toBe(false);
    expect(ordering.lt(answer, new Priority("Answer"))).toBe(false);
    expect(
      new Priority("Ask", { key: [1, 0] }).equals(
        new Priority("Ask", { key: [1, 0] }),
      ),
    ).toBe(true);
    expect(
      new Priority("Ask", { key: [1, 0] }).equals(
        new Priority("AskLater", { key: [1, 0] }),
      ),
    ).toBe(false);
    expect(new Priority("Ask", { key: [1, 0] }).repr()).toBe("Ask/None[1, 0]");
    expect(
      new Priority("Game", {
        rule: { name: "NaturalNotrump" },
        key: [1, 2],
        strain: 1,
        fallback: 1,
      }).repr(),
    ).toBe("Game/strain1/NaturalNotrump[1, 2]/fallback1");
    expect(() => new Priority("NoSuchPurpose")).toThrow(/unknown purpose/);
  });
});

describe("rule purposes", () => {
  const system = StandardAmericanYellowCard;

  it("declares a purpose on every rule", () => {
    for (const rule of system.rules) {
      expect(
        lookup(rule.dslRule, "purpose") ||
          Object.keys(rule.purposesPerCall).length > 0,
        `${rule.name} declares no purpose`,
      ).toBeTruthy();
    }
  });

  it("keys a conditional purpose on its condition", () => {
    // A preempt is PreemptWeak below an opening hand and Preempt otherwise
    // (the Python checks Stayman, which phase 5 ports): the promoted variants
    // carry the condition in their meaning.
    const rule = RuleCompiler.compile(PreemptiveOpen);
    const seen = new Interpreter().withHistory(
      CallHistory.fromString("", "N", "None"),
      (history) =>
        new Set(
          [...rule.meaningOf(history, Call.fromString("3C"))].map(
            ([priority]) => priority.purpose,
          ),
        ),
    );
    expect(seen).toEqual(new Set(["Preempt", "PreemptWeak"]));
  });

  it("never chooses a planning rule", () => {
    for (const rule of system.rules) {
      if (rule.requiresPlanning) {
        expect(lookup(rule.dslRule, "purpose"), rule.name).toBe("Planned");
      }
    }
  });
});
