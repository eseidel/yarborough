import { describe, expect, it } from "vitest";
import {
  EMPTY_PROGRESS,
  PROGRESS_STORAGE_KEY,
  accuracy,
  formatAccuracy,
  loadProgress,
  parseProgress,
  recordHand,
  saveProgress,
} from "../progress";
import type { CallVerdict } from "../verdicts";

const sayc = { call: { type: "pass" as const } };
const hit = (index: number, assisted = false): CallVerdict => ({
  index,
  call: { type: "pass" },
  sayc,
  matched: true,
  assisted,
});
const miss = (index: number): CallVerdict => ({
  index,
  call: { type: "double" },
  sayc,
  matched: false,
  assisted: false,
});

class MemoryStorage implements Storage {
  private items = new Map<string, string>();
  get length() {
    return this.items.size;
  }
  clear() {
    this.items.clear();
  }
  getItem(key: string) {
    return this.items.get(key) ?? null;
  }
  key(index: number) {
    return [...this.items.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.items.delete(key);
  }
  setItem(key: string, value: string) {
    this.items.set(key, value);
  }
}

describe("progress", () => {
  it("counts hands, calls, and streaks by focus", () => {
    let progress = recordHand(EMPTY_PROGRESS, "b1", "Random", [hit(2), hit(6)]);
    progress = recordHand(progress, "b2", "Notrump", [hit(2), miss(6)]);
    progress = recordHand(progress, "b3", "Notrump", [hit(0), hit(4, true)]);

    expect(progress.total).toEqual({
      hands: 3,
      handsOnSystem: 1,
      calls: 5,
      callsMatched: 4,
    });
    expect(progress.byFocus.Random).toEqual({
      hands: 1,
      handsOnSystem: 1,
      calls: 2,
      callsMatched: 2,
    });
    expect(progress.byFocus.Notrump?.hands).toBe(2);
    // The miss ended the streak; the assisted hand did not restart it.
    expect(progress.streak).toBe(0);
    expect(progress.bestStreak).toBe(1);
  });

  it("records each hand once and ignores hands with nothing to check", () => {
    const once = recordHand(EMPTY_PROGRESS, "b1", "Random", [hit(2)]);
    expect(recordHand(once, "b1", "Random", [hit(2)])).toBe(once);
    expect(recordHand(EMPTY_PROGRESS, "b9", "Random", [])).toBe(EMPTY_PROGRESS);
  });

  it("keeps only the most recent hand keys", () => {
    let progress = EMPTY_PROGRESS;
    for (let i = 0; i < 60; i++) {
      progress = recordHand(progress, `b${i}`, "Random", [hit(2)]);
    }
    expect(progress.recorded).toHaveLength(50);
    expect(progress.recorded[0]).toBe("b10");
    expect(progress.total.hands).toBe(60);
  });

  it("round-trips through storage and survives garbage", () => {
    const storage = new MemoryStorage();
    const progress = recordHand(EMPTY_PROGRESS, "b1", "Preempt", [miss(2)]);
    saveProgress(storage, progress);
    expect(loadProgress(storage)).toEqual(progress);

    storage.setItem(PROGRESS_STORAGE_KEY, "{not json");
    expect(loadProgress(storage)).toEqual(EMPTY_PROGRESS);
    expect(parseProgress(JSON.stringify({ version: 2 }))).toEqual(
      EMPTY_PROGRESS,
    );
    expect(
      parseProgress(
        JSON.stringify({
          version: 1,
          total: { hands: 1, handsOnSystem: 1, calls: 2, callsMatched: 2 },
          byFocus: { Random: { hands: "x" } },
        }),
      ),
    ).toEqual({
      version: 1,
      total: { hands: 1, handsOnSystem: 1, calls: 2, callsMatched: 2 },
      byFocus: {},
      streak: 0,
      bestStreak: 0,
      recorded: [],
    });
    expect(loadProgress(undefined)).toEqual(EMPTY_PROGRESS);
  });

  it("formats accuracy", () => {
    expect(accuracy(EMPTY_PROGRESS.total)).toBeNull();
    expect(formatAccuracy(EMPTY_PROGRESS.total)).toBe("–");
    expect(
      formatAccuracy({ hands: 1, handsOnSystem: 0, calls: 3, callsMatched: 2 }),
    ).toBe("67%");
  });
});
