import { describe, expect, it } from "vitest";
import type { DoubleDummyTable } from "../../dds/dds-core";
import {
  bestClass,
  biddingVerdict,
  contractClass,
  describeMakeable,
  describePlay,
  formatContract,
  formatContractBy,
  makeableContracts,
  sideOf,
} from "../analysis";

// N-S make 4♠ (10 tricks, North or South), 3NT (9, North only), 2♦ (8);
// E-W make 2♥ (8) and 1♣ (7 by West).
const TABLE: DoubleDummyTable = {
  S: { N: 10, E: 3, S: 10, W: 3 },
  H: { N: 5, E: 8, S: 5, W: 8 },
  D: { N: 8, E: 5, S: 8, W: 5 },
  C: { N: 6, E: 6, S: 6, W: 7 },
  N: { N: 9, E: 4, S: 8, W: 4 },
};

const NOTHING: DoubleDummyTable = {
  S: { N: 6, E: 6, S: 6, W: 6 },
  H: { N: 6, E: 6, S: 6, W: 6 },
  D: { N: 6, E: 6, S: 6, W: 6 },
  C: { N: 6, E: 6, S: 6, W: 6 },
  N: { N: 6, E: 6, S: 6, W: 6 },
};

describe("analysis", () => {
  it("lists what each side can make, highest first, by the better declarer", () => {
    const ns = makeableContracts(TABLE, "NS");
    expect(ns.map((c) => formatContract(c.level, c.strain))).toEqual([
      "4♠",
      "3NT",
      "2♦",
    ]);
    expect(ns[1].declarer).toBe("N");
    expect(makeableContracts(TABLE, "EW").map((c) => c.strain)).toEqual([
      "H",
      "C",
    ]);
    expect(makeableContracts(NOTHING, "NS")).toEqual([]);
    expect(describeMakeable("NS", ns)).toBe("N-S can make 4♠, 3NT, 2♦");
    expect(describeMakeable("EW", [])).toBe("E-W can make nothing");
  });

  it("classifies contracts", () => {
    expect(contractClass(3, "N")).toBe("game");
    expect(contractClass(4, "H")).toBe("game");
    expect(contractClass(4, "D")).toBe("partscore");
    expect(contractClass(5, "C")).toBe("game");
    expect(contractClass(6, "S")).toBe("small slam");
    expect(contractClass(7, "N")).toBe("grand slam");
    expect(bestClass(makeableContracts(TABLE, "NS"))).toBe("game");
    expect(bestClass([])).toBeNull();
  });

  it("formats contracts and results", () => {
    expect(formatContract(2, "H", "X")).toBe("2♥X");
    expect(formatContractBy({ level: 3, strain: "N" }, "S")).toBe(
      "3NT by South",
    );
    expect(describePlay(4, 10)).toBe("makes 4 (10 tricks)");
    expect(describePlay(4, 11)).toBe("makes 5 (11 tricks)");
    expect(describePlay(4, 8)).toBe("goes down 2 (8 tricks)");
    expect(sideOf("W")).toBe("EW");
  });

  describe("biddingVerdict", () => {
    it("praises a making game and flags a missed slam", () => {
      expect(
        biddingVerdict({ level: 4, strain: "S" }, "N", TABLE, "NS"),
      ).toEqual({
        text: "4♠ makes: N-S reached the game the cards allow.",
        tone: "good",
      });
      const slam: DoubleDummyTable = {
        ...TABLE,
        S: { N: 12, E: 1, S: 12, W: 1 },
      };
      expect(
        biddingVerdict({ level: 4, strain: "S" }, "N", slam, "NS"),
      ).toEqual({
        text: "4♠ makes, but N-S can make small slam in 6♠.",
        tone: "mixed",
      });
    });

    it("flags stopping in a partscore when game makes", () => {
      expect(
        biddingVerdict({ level: 2, strain: "S" }, "S", TABLE, "NS"),
      ).toEqual({
        text: "2♠ makes, but N-S can make game in 4♠, 3NT.",
        tone: "mixed",
      });
    });

    it("accepts a partscore when there is no game", () => {
      const partscore: DoubleDummyTable = {
        ...NOTHING,
        S: { N: 8, E: 4, S: 8, W: 4 },
      };
      expect(
        biddingVerdict({ level: 2, strain: "S" }, "S", partscore, "NS"),
      ).toEqual({
        text: "2♠ makes, and there is no game for N-S.",
        tone: "good",
      });
    });

    it("explains a failing contract", () => {
      expect(
        biddingVerdict({ level: 5, strain: "D" }, "N", TABLE, "NS"),
      ).toEqual({
        text: "5♦ goes down 3 (8 tricks). N-S can make 4♠, 3NT, 2♦.",
        tone: "bad",
      });
      expect(
        biddingVerdict({ level: 2, strain: "S" }, "N", NOTHING, "NS"),
      ).toEqual({
        text: "2♠ goes down 2 (6 tricks). N-S can make nothing on these cards.",
        tone: "bad",
      });
    });

    it("judges the opponents' contract by what we could have made", () => {
      expect(
        biddingVerdict({ level: 2, strain: "H" }, "E", TABLE, "NS"),
      ).toEqual({
        text: "2♥ by East makes 2 (8 tricks). N-S can make 4♠, 3NT: a missed game.",
        tone: "bad",
      });
      const nothingForUs: DoubleDummyTable = {
        ...NOTHING,
        H: { N: 4, E: 9, S: 4, W: 9 },
      };
      expect(
        biddingVerdict(
          { level: 4, strain: "H", doubled: "X" },
          "W",
          nothingForUs,
          "NS",
        ),
      ).toEqual({
        text: "4♥X by West goes down 1 (9 tricks). N-S can make nothing, so defending is right.",
        tone: "good",
      });
      const partscore: DoubleDummyTable = {
        ...nothingForUs,
        S: { N: 8, E: 5, S: 7, W: 5 },
      };
      expect(
        biddingVerdict({ level: 3, strain: "H" }, "E", partscore, "NS"),
      ).toEqual({
        text: "3♥ by East makes 3 (9 tricks). N-S could make 2♠.",
        tone: "mixed",
      });
    });

    it("judges a pass-out", () => {
      expect(biddingVerdict(null, null, TABLE, "NS")).toEqual({
        text: "Passed out, but N-S can make 4♠, 3NT.",
        tone: "bad",
      });
      expect(biddingVerdict(null, null, NOTHING, "NS")).toEqual({
        text: "Passed out. N-S can make nothing, and neither can the opponents.",
        tone: "good",
      });
      const theirs: DoubleDummyTable = {
        ...NOTHING,
        H: { N: 4, E: 8, S: 4, W: 8 },
      };
      expect(biddingVerdict(null, null, theirs, "NS")).toEqual({
        text: "Passed out. N-S can make nothing, E-W can make 2♥.",
        tone: "good",
      });
      const partscore: DoubleDummyTable = {
        ...NOTHING,
        D: { N: 8, E: 4, S: 8, W: 4 },
      };
      expect(biddingVerdict(null, null, partscore, "NS")).toEqual({
        text: "Passed out. N-S could make 2♦, but no game.",
        tone: "mixed",
      });
    });
  });
});
