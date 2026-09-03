// The WebAssembly solver itself, loaded in Node: its tables must equal the ones
// a native DDS computed for the same deals, and a fixed lead must never let the
// defense do better than the table (the table is the killing lead).
import { describe, expect, it } from "vitest";
import createDdsModule from "../wasm/dds.mjs";
import { createDoubleDummySolver } from "../dds";
import type { Deal, Position, StrainName } from "../../bridge/types";
import { parseCardName } from "../dds-core";
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

const STRAINS: StrainName[] = ["S", "H", "D", "C", "N"];
const POSITIONS: Position[] = ["N", "E", "S", "W"];

describe("dds wasm", () => {
  const modulePromise = createDdsModule();
  const solver = createDoubleDummySolver({
    async request(method, args) {
      const dds = await modulePromise;
      if (method === "calc_dd_table") {
        return dds.ccall("dds_calc_table", "string", ["string"], [args.pbn]);
      }
      return dds.ccall(
        "dds_solve_after_lead",
        "number",
        ["string", "number", "number", "number", "number"],
        [args.pbn, args.trump, args.leader, args.suit, args.rank],
      );
    },
  });

  it("reports the DDS version it was built from", async () => {
    const dds = await modulePromise;
    expect(dds.ccall("dds_version", "string", [], [])).toBe("2.9.0");
  });

  it("computes the same tables as a native DDS", async () => {
    for (const { pbn, table } of golden.tables) {
      const got = await solver.getTable(dealFromPbn(pbn));
      STRAINS.forEach((strain, s) => {
        POSITIONS.forEach((position, p) => {
          expect(got[strain][position], `${pbn} ${strain} by ${position}`).toBe(
            table[s][p],
          );
        });
      });
    }
  }, 30_000);

  it("solves the play after a fixed opening lead like a native DDS", async () => {
    // The second set makes the hand after the leader follow with a singleton:
    // DDS mode 0 would skip the search there and report -2.
    for (const set of [golden.after_lead, golden.after_lead_singleton]) {
      const deal = dealFromPbn(set.pbn);
      for (const c of set.cases) {
        const tricks = await solver.getTricksAfterLead(
          deal,
          c.strain as StrainName,
          c.declarer as Position,
          parseCardName(c.lead),
        );
        expect(
          tricks,
          `${c.strain} by ${c.declarer}, ${c.leader} leads ${c.lead}`,
        ).toBe(c.tricks);
      }
    }
  }, 30_000);
});
