// Copyright (c) 2026 The Yarborough Authors. All rights reserved.
// Use of this source code is governed by a BSD-style license that can be
// found in the LICENSE file.

// A translation of python/z3b/test_natural.py, plus the module-level helpers
// of natural.ts that no rule of the fixtures exercises yet.  The Python test
// bids two hands through the Bidder with one rule class swapped out; the
// Bidder arrives in phase 6 and QuantitativeFourNotrumpJump with the slam
// section of rules.py, so those two cases wait (it.todo below).  What the
// test is about -- the natural point tables are the one source of the game
// and slam numbers -- is pinned here on the tables themselves.

import { describe, expect, it } from "vitest";
import { Call } from "../../core/call";
import {
  copyDict,
  _naturalSuitedPossible,
  lawOfTotalTricksPurpose,
  naturalNotrumpPurpose,
  naturalSuitedPurpose,
  newMinorWithFive,
  newSuitPurpose,
  pointsForSoundNotrumpBidAtLevel,
  pointsForSoundSuitedBidAtLevel,
  RULE_CLASSES,
} from "../natural";
import { StandardAmericanYellowCard } from "../sayc";
import {
  type AuctionSnapshot,
  type ManifestRule,
  readJsonFixture,
  readJsonlFixture,
  type VocabularyFixture,
} from "./fixtures";
import { RecordedHistories } from "./recorded-history";

const vocabulary = readJsonFixture<VocabularyFixture>("vocabulary.json");
const manifest = readJsonFixture<ManifestRule[]>("rules-manifest.json");
const store = new RecordedHistories(
  readJsonlFixture<AuctionSnapshot>("auction-snapshots.jsonl"),
  (name) => ({ name, forcing: null, requiresPlanning: false }),
);

// North opened 1H and East passed: partner has bid hearts naturally, and no
// other suit has been bid.
const history = store.historyFor(store.snapshot("N", "Both", "1H P")!);

describe("the natural point tables", () => {
  it("are the tables the exporter read from the Python module", () => {
    expect(pointsForSoundSuitedBidAtLevel).toEqual(
      vocabulary.points_tables.suited,
    );
    expect(pointsForSoundNotrumpBidAtLevel).toEqual(
      vocabulary.points_tables.notrump,
    );
  });

  it("holds the slam number the quantitative invitation reads", () => {
    // test_natural.QuantitativeFourNotrumpTest: the 6N entry is the number
    // QuantitativeFourNotrumpJumpConstraint.slam_points() returns, so moving
    // one moves the other.  The constraint lands with the slam section.
    expect(pointsForSoundNotrumpBidAtLevel[6]).toBe(33);
    expect(pointsForSoundSuitedBidAtLevel[6]).toBe(33);
    // A grand in notrump wants a point more than one in a suit (the comment
    // in natural.ts says why).
    expect(pointsForSoundNotrumpBidAtLevel[7]).toBe(38);
    expect(pointsForSoundSuitedBidAtLevel[7]).toBe(37);
  });

  it.todo(
    "bids 6N, not the quantitative 4N, on eighteen opposite a 1N opening (needs the Bidder, phase 6)",
  );
  it.todo(
    "invites instead when the system's slam number moves to 34 (needs the Bidder, phase 6)",
  );
});

describe("the purposes of a natural call", () => {
  it("raises partner's major, discovers a new suit and names a game or a slam", () => {
    const purposeOf = (name: string) =>
      naturalSuitedPurpose(history, Call.fromString(name));
    expect(purposeOf("2H")).toBe("SupportMajors");
    expect(purposeOf("4H")).toBe("SupportMajors");
    expect(purposeOf("6H")).toBe("Slam");
    expect(purposeOf("2S")).toBe("Discovery");
    expect(purposeOf("3C")).toBe("Discovery");
    expect(purposeOf("5C")).toBe("Game"); // a minor game competes with 3N
  });

  it("makes a notrump call a slam, a game or a statement of strength", () => {
    const purposeOf = (name: string) =>
      naturalNotrumpPurpose(history, Call.fromString(name));
    expect(purposeOf("1N")).toBe("CharacterizeStrength");
    expect(purposeOf("2N")).toBe("CharacterizeStrength");
    expect(purposeOf("3N")).toBe("Game");
    expect(purposeOf("6N")).toBe("Slam");
  });

  it("supports partner's suit under the law and competes in any other", () => {
    const purposeOf = (name: string) =>
      lawOfTotalTricksPurpose(history, Call.fromString(name));
    expect(purposeOf("2H")).toBe("Support");
    expect(purposeOf("4H")).toBe("Support");
    expect(purposeOf("2S")).toBe("Compete");
    expect(purposeOf("3C")).toBe("Compete");
  });

  it("waits with a four-card minor above the one level, unless it is five", () => {
    const purposeOf = (name: string) =>
      newSuitPurpose(history, Call.fromString(name));
    expect(purposeOf("1S")).toBe("MajorDiscovery");
    expect(purposeOf("2H")).toBe("MajorDiscovery");
    expect(purposeOf("1D")).toBe("MinorDiscovery");
    expect(purposeOf("2D")).toBe("MinorDiscoveryWithFour");
    expect(purposeOf("3C")).toBe("MinorDiscoveryWithFour");
    // The fifth card promotes it back to MinorDiscovery (rules.py reads this).
    const [[, promoted, base]] = newMinorWithFive;
    expect(promoted).toBe("MinorDiscovery");
    expect(base).toBe("MinorDiscoveryWithFour");
  });

  it("lists the purposes a natural suit bid can take at a level", () => {
    const possible = (name: string) =>
      _naturalSuitedPossible(Call.fromString(name));
    expect(possible("2C")).toEqual([
      "RebidSuit",
      "Support",
      "AskLater",
      "Discovery",
    ]);
    expect(possible("4H")).toEqual(["Game", "SupportMajors"]);
    expect(possible("5C")).toEqual(["Game"]);
    expect(possible("6D")).toEqual(["Slam"]);
  });
});

describe("the rules of natural.ts", () => {
  it("registers the Python module's concrete rules, and only those", () => {
    const names = Object.keys(RULE_CLASSES);
    expect(names).toEqual([
      "NaturalSuited",
      "LawOfTotalTricks",
      "NaturalNotrump",
      "DefaultPass",
      "SuitGameIsRemote",
      "SuitSlamIsRemote",
      "NotrumpSlamIsRemote",
    ]);
    const known = new Set(manifest.map((entry) => entry.name));
    for (const name of names) {
      expect(known.has(name), `${name} is not a Python rule`).toBe(true);
    }
    const registered = new Set(
      StandardAmericanYellowCard.rules.map((rule) => rule.name),
    );
    for (const name of names) {
      expect(registered.has(name), `${name} is not in sayc.ts`).toBe(true);
    }
  });

  it("copies a dict key by key, missing keys included", () => {
    expect(copyDict({ a: 1, b: 2 }, ["a", "c"])).toEqual({ a: 1, c: null });
  });
});
