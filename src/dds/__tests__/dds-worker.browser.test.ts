import { describe, expect, it } from "vitest";
import { getDoubleDummyTable, getTricksAfterLead } from "../dds";
import { parseCardName } from "../dds-core";
import type { Deal, Position, StrainName } from "../../bridge/types";
import golden from "../../../tests/dd_golden_cases.json";

function dealFromPbn(pbn: string): Deal {
  const hands = pbn.slice(2).split(" ");
  const suits = ["S", "H", "D", "C"] as const;
  const hand = (text: string) => ({
    cards: text
      .split(".")
      .flatMap((ranks, i) =>
        [...ranks].map((rank) => ({ suit: suits[i], rank: rank as "A" })),
      ),
  });
  return {
    north: hand(hands[0]),
    east: hand(hands[1]),
    south: hand(hands[2]),
    west: hand(hands[3]),
  };
}

describe("dds browser worker", () => {
  it("solves a deal in the worker: the table, then the play after a lead", async () => {
    const { pbn, table } = golden.tables[0];
    const deal = dealFromPbn(pbn);
    const got = await getDoubleDummyTable(deal);
    expect(got.S.N).toBe(table[0][0]);
    expect(got.N.S).toBe(table[4][2]);

    for (const set of [golden.after_lead, golden.after_lead_singleton]) {
      const c = set.cases[0];
      const tricks = await getTricksAfterLead(
        dealFromPbn(set.pbn),
        c.strain as StrainName,
        c.declarer as Position,
        parseCardName(c.lead),
      );
      expect(tricks).toBe(c.tricks);
    }
  }, 30_000);
});
