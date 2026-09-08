import { describe, expect, it, vi } from "vitest";
import {
  adaptiveTargets,
  chooseTarget,
  describeTargets,
  searchAdaptiveBoard,
} from "../adaptive";
import { computeInsights } from "../insights";
import type { HandRecord, RecordedVerdict } from "../record/types";
import { sampleHand } from "../record/__tests__/db.test";

const STAYMAN = ["Responding to an opening", "To 1NT", "Stayman"];
const DOUBLE = ["Competing", "Takeout doubles", "One Level Takeout Double"];
const OPEN = ["Opening", "One of a suit", "One Level Suit Opening"];

function verdict(category: string[], matched: boolean): RecordedVerdict {
  return {
    index: 0,
    call: "P",
    saycCall: "P",
    category,
    matched,
    assisted: false,
  };
}

function hand(n: number, verdicts: RecordedVerdict[]): HandRecord {
  return sampleHand({ completedAt: 1_800_000_000_000 + n * 60_000, verdicts });
}

describe("adaptiveTargets", () => {
  it("aims at the weak spots, weighting the larger and surer ones more", () => {
    const hands: HandRecord[] = [];
    for (let i = 0; i < 30; i++) {
      hands.push(
        hand(i, [
          verdict(OPEN, true),
          // Stayman missed almost always; doubles missed two times in three.
          verdict(STAYMAN, i % 10 === 0),
          verdict(DOUBLE, i % 3 === 0),
        ]),
      );
    }
    const targets = adaptiveTargets(computeInsights(hands, 1_900_000_000_000));
    expect(targets.map((t) => t.path)).toEqual([
      ["Responding to an opening", "To 1NT"],
      ["Competing", "Takeout doubles"],
    ]);
    expect(targets[0].weight).toBeGreaterThan(targets[1].weight);
    expect(adaptiveTargets(computeInsights([], 1))).toEqual([]);
  });
});

describe("chooseTarget", () => {
  const targets = [
    { path: ["a"], weight: 3 },
    { path: ["b"], weight: 1 },
  ];

  it("draws in proportion to the weights", () => {
    expect(chooseTarget(targets, () => 0.1)!.path).toEqual(["a"]);
    expect(chooseTarget(targets, () => 0.74)!.path).toEqual(["a"]);
    expect(chooseTarget(targets, () => 0.76)!.path).toEqual(["b"]);
    expect(chooseTarget(targets, () => 0.999)!.path).toEqual(["b"]);
    expect(chooseTarget([], () => 0.5)).toBeNull();
    expect(chooseTarget([{ path: ["z"], weight: 0 }])!.path).toEqual(["z"]);
  });
});

describe("describeTargets", () => {
  it("names the last level of each path", () => {
    expect(describeTargets([])).toBe("");
    expect(describeTargets([["Responding to an opening", "To 1NT"]])).toBe(
      "To 1NT",
    );
    expect(
      describeTargets([
        ["a", "To 1NT"],
        ["b", "Takeout doubles"],
      ]),
    ).toBe("To 1NT and Takeout doubles");
    expect(
      describeTargets([
        ["a", "x"],
        ["b", "y"],
        ["c", "z"],
      ]),
    ).toBe("x, y and z");
    expect(
      describeTargets([
        ["a", "x"],
        ["b", "y"],
        ["c", "z"],
        ["d", "w"],
      ]),
    ).toBe("x, y and 2 more");
  });
});

describe("searchAdaptiveBoard", () => {
  const targets = [
    { path: ["Responding to an opening", "To 1NT"], weight: 1 },
    { path: ["Competing", "Takeout doubles"], weight: 1 },
  ];
  const found = {
    identifier: "3-00000000000000000000000000",
    category: ["Competing", "Takeout doubles", "One Level Takeout Double"],
  };

  it("asks for a few boards per request, one target at a time, until one is found", async () => {
    const generate = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(found);
    let draw = 0;
    const result = await searchAdaptiveBoard(targets, {
      generate,
      random: () => [0.1, 0.9, 0.9][draw++] ?? 0.9,
      attemptsPerRequest: 3,
    });
    expect(result).toEqual({ board: found, target: targets[1] });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(generate).toHaveBeenNthCalledWith(1, [targets[0].path], 3);
    expect(generate).toHaveBeenNthCalledWith(2, [targets[1].path], 3);
  });

  it("gives up after the request budget, and stops when cancelled", async () => {
    const generate = vi.fn().mockResolvedValue(null);
    expect(
      await searchAdaptiveBoard(targets, { generate, maxRequests: 4 }),
    ).toBeNull();
    expect(generate).toHaveBeenCalledTimes(4);

    const cancelled = { current: false };
    const slow = vi.fn(async () => {
      cancelled.current = true;
      return found;
    });
    expect(
      await searchAdaptiveBoard(targets, { generate: slow, cancelled }),
    ).toBeNull();
    expect(slow).toHaveBeenCalledTimes(1);

    expect(await searchAdaptiveBoard([], { generate })).toBeNull();
  });
});
