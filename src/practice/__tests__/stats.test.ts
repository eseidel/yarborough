import { describe, expect, it } from "vitest";
import {
  accuracy,
  callOutcomes,
  formatAccuracy,
  handOnSystem,
  summarize,
} from "../stats";
import { sampleHand } from "../record/__tests__/db.test";

const missed = sampleHand({
  completedAt: 2_000,
  source: "Notrump",
  verdicts: [
    {
      index: 2,
      call: "2S",
      saycCall: "3S",
      category: ["Responding to an opening", "Raises", "Jump Raise"],
      matched: false,
      assisted: false,
    },
    {
      index: 6,
      call: "P",
      saycCall: "P",
      category: ["Responder's rebid", "Passing", "Pass"],
      matched: true,
      assisted: true,
    },
  ],
});

describe("stats", () => {
  it("judges a hand on system only when every call matched unaided", () => {
    expect(handOnSystem(sampleHand())).toBe(true);
    expect(handOnSystem(missed)).toBe(false);
    expect(handOnSystem(sampleHand({ verdicts: [] }))).toBe(false);
    const assisted = sampleHand();
    assisted.verdicts[0] = { ...assisted.verdicts[0], assisted: true };
    expect(handOnSystem(assisted)).toBe(false);
  });

  it("totals calls, hands, streaks, and sources", () => {
    const hands = [
      sampleHand({ completedAt: 1_000 }),
      missed,
      sampleHand({ completedAt: 3_000 }),
      sampleHand({ completedAt: 4_000, source: "Adaptive" }),
    ];
    const summary = summarize(hands);
    expect(summary).toMatchObject({
      hands: 4,
      handsOnSystem: 3,
      // The assisted call in the missed hand is not checked.
      calls: 7,
      matched: 6,
      streak: 2,
      bestStreak: 2,
    });
    expect(summary.bySource.Random).toEqual({
      hands: 2,
      handsOnSystem: 2,
      calls: 4,
      matched: 4,
    });
    expect(summary.bySource.Notrump).toEqual({
      hands: 1,
      handsOnSystem: 0,
      calls: 1,
      matched: 0,
    });
    expect(summary.bySource.Adaptive?.hands).toBe(1);
    expect(summarize([]).streak).toBe(0);
  });

  it("lists checked calls in order with their categories", () => {
    const outcomes = callOutcomes([sampleHand({ id: 7 }), missed]);
    expect(outcomes).toHaveLength(3);
    expect(outcomes[0]).toEqual({
      matched: true,
      category: ["Responding to an opening", "Raises", "Jump Raise"],
      completedAt: 1_700_000_000_000,
      handId: 7,
    });
    expect(outcomes[2].matched).toBe(false);
  });

  it("formats accuracy", () => {
    expect(accuracy({ calls: 0, matched: 0 })).toBeNull();
    expect(formatAccuracy({ calls: 0, matched: 0 })).toBe("–");
    expect(formatAccuracy({ calls: 3, matched: 2 })).toBe("67%");
  });
});
