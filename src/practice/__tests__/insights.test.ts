import { describe, expect, it } from "vitest";
import {
  computeInsights,
  describeAccuracy,
  describeSample,
  describeTrend,
  describeVerdict,
} from "../insights";
import type { HandRecord, RecordedVerdict } from "../record/types";
import { sampleHand } from "../record/__tests__/db.test";

const RAISE = ["Responding to an opening", "Raises", "Jump Raise"];
const STAYMAN = ["Responding to an opening", "To 1NT", "Stayman"];
const OPEN = ["Opening", "One of a suit", "One Level Suit Opening"];

function verdict(
  category: string[],
  matched: boolean,
  assisted = false,
): RecordedVerdict {
  return {
    index: 0,
    call: "P",
    saycCall: "P",
    category,
    matched,
    assisted,
  };
}

function hand(
  n: number,
  verdicts: RecordedVerdict[],
  overrides: Partial<HandRecord> = {},
): HandRecord {
  return sampleHand({
    completedAt: 1_800_000_000_000 + n * 60_000,
    verdicts,
    ...overrides,
  });
}

describe("computeInsights", () => {
  const now = 1_800_000_000_000 + 1_000 * 60_000;

  it("builds the tree with a verdict per node against the rest of the record", () => {
    const hands: HandRecord[] = [];
    // Twenty solid openings and raises, then Stayman missed five of six.
    for (let i = 0; i < 20; i++) {
      hands.push(hand(i, [verdict(OPEN, true), verdict(RAISE, true)]));
    }
    for (let i = 20; i < 26; i++) {
      hands.push(hand(i, [verdict(STAYMAN, i === 25)]));
    }
    const insights = computeInsights(hands, now);

    expect(insights.overall).toMatchObject({
      hands: 26,
      calls: 46,
      matched: 41,
    });
    expect(insights.tree.map((n) => n.name)).toEqual([
      "Opening",
      "Responding to an opening",
    ]);
    const responding = insights.tree[1];
    expect(responding.children.map((n) => n.name)).toEqual([
      "Raises",
      "To 1NT",
    ]);
    const stayman = responding.children[1];
    expect(stayman.calls).toBe(6);
    expect(stayman.verdict).toBe("weak spot");
    expect(stayman.posterior!.probabilityBelow).toBeGreaterThan(0.95);
    expect(stayman.children[0].path).toEqual(STAYMAN);
    expect(stayman.children[0].level).toBe(3);

    const raises = responding.children[0];
    expect(raises.verdict).toBe("strength");
    expect(insights.opportunities.map((n) => n.name)).toEqual(["To 1NT"]);
    expect(insights.strengths.map((n) => n.name)).toEqual([
      "One of a suit",
      "Raises",
    ]);
  });

  it("ignores assisted and uncategorized calls in the tree but keeps the latter overall", () => {
    const hands = [
      hand(0, [
        verdict([], true),
        verdict(OPEN, true, true),
        verdict(RAISE, false),
      ]),
    ];
    const insights = computeInsights(hands, now);
    expect(insights.overall.calls).toBe(2);
    expect(insights.overall.matched).toBe(1);
    expect(insights.tree.map((n) => n.name)).toEqual([
      "Responding to an opening",
    ]);
    expect(insights.tree[0].calls).toBe(1);
  });

  it("chunks hands into blocks with intervals", () => {
    const hands = Array.from({ length: 45 }, (_, i) =>
      hand(i, [verdict(OPEN, i % 3 !== 0)]),
    );
    const { blocks } = computeInsights(hands, now, 20);
    expect(blocks.map((b) => [b.firstHand, b.lastHand, b.calls])).toEqual([
      [1, 20, 20],
      [21, 40, 20],
      [41, 45, 5],
    ]);
    expect(blocks[0].interval).not.toBeNull();
    expect(blocks[0].matched).toBe(13);
  });

  it("finds a trend once accuracy rises", () => {
    const hands = Array.from({ length: 80 }, (_, i) =>
      hand(i, [verdict(OPEN, i < 40 ? i % 2 === 0 : i % 10 !== 0)]),
    );
    const { overall, tree } = computeInsights(hands, now);
    expect(overall.trend?.label).toBe("improving");
    expect(tree[0].trend?.label).toBe("improving");
  });

  it("copes with an empty record", () => {
    const insights = computeInsights([], now);
    expect(insights.overall.calls).toBe(0);
    expect(insights.overall.interval).toBeNull();
    expect(insights.overall.trend).toBeNull();
    expect(insights.tree).toEqual([]);
    expect(insights.blocks).toEqual([]);
  });
});

describe("descriptions", () => {
  it("speak in the user's terms, without the statistics", () => {
    const [stayman] = computeInsights(
      Array.from({ length: 6 }, (_, i) =>
        hand(i, [verdict(STAYMAN, false), verdict(OPEN, true)]),
      ),
      1_900_000_000_000,
    ).tree.find((n) => n.name === "Responding to an opening")!.children;
    expect(describeVerdict(stayman)).toBe("Weak spot");
    expect(
      describeVerdict({
        ...stayman,
        posterior: { mean: 0.5, probabilityBelow: 0.85 },
      }),
    ).toBe("Likely weak spot");
    expect(
      describeVerdict({
        ...stayman,
        verdict: "strength",
        posterior: { mean: 0.9, probabilityBelow: 0.1 },
      }),
    ).toBe("Likely strength");
    expect(describeVerdict({ ...stayman, verdict: null })).toBeNull();

    expect(describeTrend(null)).toBe("Holding steady");
    expect(
      describeTrend({
        calls: 50,
        pointsPerHundredCalls: 6.4,
        pValue: 0.03,
        label: "improving",
      }),
    ).toBe("Improving, up about 6 points over your last 100 calls");
    expect(
      describeTrend({
        calls: 50,
        pointsPerHundredCalls: -3,
        pValue: 0.15,
        label: "probably slipping",
      }),
    ).toBe("Probably slipping");
    expect(
      describeTrend({
        calls: 50,
        pointsPerHundredCalls: -0.4,
        pValue: 0.01,
        label: "slipping",
      }),
    ).toBe("Slipping");

    expect(describeAccuracy({ calls: 0, matched: 0 })).toBe("no calls yet");
    expect(describeAccuracy({ calls: 5, matched: 4 })).toBe("80%");
    expect(describeSample(4)).toBe("from 4 calls, so early days");
    expect(describeSample(1)).toBe("from 1 call, so early days");
    expect(describeSample(120)).toBe("from 120 calls");
  });
});
