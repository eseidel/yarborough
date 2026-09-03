import { describe, expect, it } from "vitest";
import type { Deal } from "../../bridge/types";
import {
  ddsRankValue,
  dealToPbn,
  describeResult,
  handToPbn,
  parseCardName,
  parseDoubleDummyTable,
  pbnWithoutCard,
} from "../dds-core";
import { MOCK_DEAL } from "../../bridge/mock";
import golden from "../../../tests/dd_golden_cases.json";

function dealFromPbn(pbn: string): Deal {
  const hands = pbn.slice(2).split(" ");
  const suits = ["S", "H", "D", "C"] as const;
  const hand = (text: string) => ({
    cards: text.split(".").flatMap((ranks, i) =>
      [...ranks].map((rank) => ({
        suit: suits[i],
        rank: rank as "A",
      })),
    ),
  });
  return {
    north: hand(hands[0]),
    east: hand(hands[1]),
    south: hand(hands[2]),
    west: hand(hands[3]),
  };
}

describe("dds-core", () => {
  it("writes a hand as PBN with each suit from the ace down", () => {
    expect(handToPbn(MOCK_DEAL.north)).toBe("AK32.QJ4.987.654");
  });

  it("round-trips the golden deals through PBN", () => {
    for (const { pbn } of golden.tables) {
      expect(dealToPbn(dealFromPbn(pbn))).toBe(pbn);
    }
  });

  it("removes the led card from the leader's hand", () => {
    const pbn =
      "N:AK32.QJ4.987.654 QJ9.T98.AKJ.T982 T876.A76.Q32.AK3 54.K532.T654.QJ7";
    expect(pbnWithoutCard(pbn, "E", { suit: "D", rank: "K" })).toBe(
      "N:AK32.QJ4.987.654 QJ9.T98.AJ.T982 T876.A76.Q32.AK3 54.K532.T654.QJ7",
    );
    expect(() => pbnWithoutCard(pbn, "E", { suit: "D", rank: "Q" })).toThrow(
      "does not hold",
    );
  });

  it("encodes ranks the way DDS numbers them", () => {
    expect(ddsRankValue("A")).toBe(14);
    expect(ddsRankValue("T")).toBe(10);
    expect(ddsRankValue("2")).toBe(2);
    expect(parseCardName("H8")).toEqual({ suit: "H", rank: "8" });
    expect(() => parseCardName("8H")).toThrow("Invalid card");
  });

  it("parses the solver's table and rejects its errors", () => {
    const table = parseDoubleDummyTable(
      "9,3,9,3,4,9,4,9,9,3,9,3,4,9,4,9,7,3,7,3",
    );
    expect(table.S.N).toBe(9);
    expect(table.H.E).toBe(9);
    expect(table.N.W).toBe(3);
    expect(() => parseDoubleDummyTable("error 2: bad PBN")).toThrow("failed");
    expect(() => parseDoubleDummyTable("1,2,3")).toThrow("invalid table");
  });

  it("describes a result against the contract level", () => {
    expect(describeResult(4, 10)).toBe("makes 4 (10 tricks)");
    expect(describeResult(4, 11)).toBe("makes 5 (11 tricks)");
    expect(describeResult(3, 7)).toBe("down 2 (7 tricks)");
    expect(describeResult(7, 1)).toBe("down 12 (1 trick)");
  });
});
