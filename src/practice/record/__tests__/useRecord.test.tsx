import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { openRecordStore, useRecordStoreForTests } from "../db";
import { useRecord, useSetting } from "../useRecord";
import { sampleHand } from "./db.test";

afterEach(() => {
  useRecordStoreForTests(null);
});

describe("useRecord", () => {
  it("loads the hands once and appends as hands are added", async () => {
    const store = await openRecordStore(new IDBFactory(), "hook-hands");
    await store.addHand(sampleHand({ completedAt: 1_000 }));
    useRecordStoreForTests(Promise.resolve(store));

    const { result } = renderHook(() => useRecord());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.hands).toHaveLength(1);
    expect(result.current.available).toBe(true);

    await act(async () => {
      await result.current.addHand(sampleHand({ completedAt: 2_000 }));
    });
    expect(result.current.hands.map((h) => h.completedAt)).toEqual([
      1_000, 2_000,
    ]);
    expect(result.current.hands[1].id).toBeDefined();
    expect(await store.allHands()).toHaveLength(2);

    await act(async () => {
      await result.current.clearHands();
    });
    expect(result.current.hands).toEqual([]);
    expect(await store.allHands()).toEqual([]);
  });

  it("reads as an empty record where the store cannot open", async () => {
    useRecordStoreForTests(Promise.reject(new Error("no IndexedDB")));
    const { result } = renderHook(() => useRecord());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.available).toBe(false);
    await act(async () => {
      await result.current.addHand(sampleHand());
    });
    // Kept for this page only.
    expect(result.current.hands).toHaveLength(1);
  });
});

describe("useSetting", () => {
  it("starts from the fallback, loads the stored value, and writes changes", async () => {
    const store = await openRecordStore(new IDBFactory(), "hook-settings");
    await store.setSetting("feedbackTiming", "end");
    useRecordStoreForTests(Promise.resolve(store));

    const { result } = renderHook(() =>
      useSetting<"immediate" | "end">("feedbackTiming", "immediate"),
    );
    expect(result.current[0]).toBe("immediate");
    await waitFor(() => expect(result.current[0]).toBe("end"));

    await act(async () => {
      await result.current[1]("immediate");
    });
    expect(result.current[0]).toBe("immediate");
    await waitFor(async () =>
      expect(await store.getSetting("feedbackTiming")).toBe("immediate"),
    );
  });

  it("keeps the fallback where the store cannot open", async () => {
    useRecordStoreForTests(Promise.reject(new Error("no IndexedDB")));
    const { result } = renderHook(() => useSetting("focus", "Random"));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current[0]).toBe("Random");
    await act(async () => {
      await result.current[1]("Notrump");
    });
    expect(result.current[0]).toBe("Notrump");
  });
});
