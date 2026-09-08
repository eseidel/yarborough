import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { openRecordStore } from "../db";
import type { HandRecord } from "../types";

export function sampleHand(overrides: Partial<HandRecord> = {}): HandRecord {
  return {
    boardId: "1-00000000000000000000000000",
    boardNumber: 1,
    dealer: "N",
    vulnerability: "None",
    userPosition: "S",
    source: "Random",
    calls: ["1S", "P", "3S", "P", "4S", "P", "P", "P"],
    contract: "4S",
    declarer: "N",
    saycCalls: ["1S", "P", "3S", "P", "4S", "P", "P", "P"],
    verdicts: [
      {
        index: 2,
        call: "3S",
        saycCall: "3S",
        ruleName: "Jump Raise",
        category: ["Responding to an opening", "Raises", "Jump Raise"],
        matched: true,
        assisted: false,
      },
      {
        index: 6,
        call: "P",
        saycCall: "P",
        category: ["Responder's rebid", "Passing", "Pass"],
        matched: true,
        assisted: false,
      },
    ],
    completedAt: 1_700_000_000_000,
    durationMs: 12_000,
    ...overrides,
  };
}

describe("RecordStore", () => {
  it("stores hands and returns them oldest first", async () => {
    const store = await openRecordStore(new IDBFactory(), "test-hands");
    const second = await store.addHand(
      sampleHand({
        completedAt: 2_000,
        boardId: "2-00000000000000000000000000",
      }),
    );
    const first = await store.addHand(sampleHand({ completedAt: 1_000 }));
    expect(first).not.toBe(second);

    const hands = await store.allHands();
    expect(hands.map((h) => h.completedAt)).toEqual([1_000, 2_000]);
    expect(hands[0].id).toBe(first);
    expect(hands[1].verdicts[0].category).toEqual([
      "Responding to an opening",
      "Raises",
      "Jump Raise",
    ]);

    await store.clearHands();
    expect(await store.allHands()).toEqual([]);
    store.close();
  });

  it("keeps settings by key", async () => {
    const store = await openRecordStore(new IDBFactory(), "test-settings");
    expect(await store.getSetting("feedbackTiming")).toBeUndefined();
    await store.setSetting("feedbackTiming", "end");
    await store.setSetting("focus", "Notrump");
    await store.setSetting("feedbackTiming", "immediate");
    expect(await store.getSetting("feedbackTiming")).toBe("immediate");
    expect(await store.getSetting("focus")).toBe("Notrump");
    store.close();
  });

  it("reopens an existing database without losing it", async () => {
    const factory = new IDBFactory();
    const first = await openRecordStore(factory, "test-reopen");
    await first.addHand(sampleHand());
    first.close();
    const second = await openRecordStore(factory, "test-reopen");
    expect(await second.allHands()).toHaveLength(1);
    second.close();
  });
});
