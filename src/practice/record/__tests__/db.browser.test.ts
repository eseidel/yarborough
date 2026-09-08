import { describe, expect, it } from "vitest";
import { openRecordStore } from "../db";
import type { HandRecord } from "../types";

// The unit tests run against fake-indexeddb; this one runs in Chromium
// against the real thing.
describe("the record in a real browser", () => {
  it("round-trips a hand and a setting through IndexedDB", async () => {
    const name = `yarborough-test-${Date.now()}`;
    const store = await openRecordStore(indexedDB, name);
    const hand: HandRecord = {
      boardId: "1-00000000000000000000000000",
      boardNumber: 1,
      dealer: "N",
      vulnerability: "None",
      userPosition: "S",
      source: "Random",
      calls: ["P", "P", "P", "P"],
      contract: null,
      declarer: null,
      saycCalls: null,
      verdicts: [
        {
          index: 2,
          call: "P",
          saycCall: "P",
          category: ["Opening", "Passing", "Pass"],
          matched: true,
          assisted: false,
        },
      ],
      completedAt: Date.now(),
      durationMs: 1,
    };
    const id = await store.addHand(hand);
    await store.updateHand(id, { saycCalls: ["P", "P", "P", "P"] });
    await store.setSetting("focus", "Preempt");

    const hands = await store.allHands();
    expect(hands).toHaveLength(1);
    expect(hands[0].id).toBe(id);
    expect(hands[0].saycCalls).toEqual(["P", "P", "P", "P"]);
    expect(await store.getSetting("focus")).toBe("Preempt");

    store.close();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  });
});
