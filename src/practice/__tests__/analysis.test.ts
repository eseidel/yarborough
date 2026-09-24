import { describe, expect, it } from "vitest";
import type { DoubleDummyTable } from "../../dds/dds-core";
import {
  describePlay,
  formatContract,
  formatContractBy,
  listMakeable,
  makeableContracts,
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
    expect(listMakeable(ns)).toBe("4♠, 3NT, 2♦");
    expect(listMakeable([])).toBe("");
  });

  it("formats contracts and results", () => {
    expect(formatContract(2, "H", "X")).toBe("2♥X");
    expect(formatContractBy({ level: 3, strain: "N" }, "S")).toBe(
      "3NT by South",
    );
    expect(describePlay(4, 10)).toBe("makes 4 (10 tricks)");
    expect(describePlay(4, 11)).toBe("makes 5 (11 tricks)");
    expect(describePlay(4, 8)).toBe("goes down 2 (8 tricks)");
  });
});
