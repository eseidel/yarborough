import { useCallback, useEffect, useState } from "react";
import { recordStore } from "./db";
import type { HandRecord, SettingKey } from "./types";

/**
 * The record for a page: every hand, loaded once, kept in memory and
 * appended to as hands are bid. Where IndexedDB is unavailable the record
 * reads as empty and writes are dropped, so the page still works.
 */
export function useRecord() {
  const [hands, setHands] = useState<HandRecord[] | null>(null);
  const [available, setAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;
    recordStore()
      .then((store) => store.allHands())
      .then((loaded) => {
        if (!cancelled) setHands(loaded);
      })
      .catch(() => {
        if (!cancelled) {
          setAvailable(false);
          setHands([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const addHand = useCallback(
    async (record: HandRecord): Promise<number | null> => {
      try {
        const store = await recordStore();
        const id = await store.addHand(record);
        setHands((prev) => [...(prev ?? []), { ...record, id }]);
        return id;
      } catch {
        setHands((prev) => [...(prev ?? []), record]);
        return null;
      }
    },
    [],
  );

  const updateHand = useCallback(
    async (id: number, patch: Partial<HandRecord>): Promise<void> => {
      setHands((prev) =>
        (prev ?? []).map((hand) =>
          hand.id === id ? { ...hand, ...patch } : hand,
        ),
      );
      try {
        const store = await recordStore();
        await store.updateHand(id, patch);
      } catch {
        // Kept for this page only.
      }
    },
    [],
  );

  const clearHands = useCallback(async (): Promise<void> => {
    setHands([]);
    try {
      const store = await recordStore();
      await store.clearHands();
    } catch {
      // Nothing was stored to begin with.
    }
  }, []);

  return {
    hands: hands ?? [],
    loading: hands === null,
    available,
    addHand,
    updateHand,
    clearHands,
  };
}

/**
 * One setting from the record's settings store, with `fallback` until it
 * loads and wherever the store is unavailable.
 */
export function useSetting<T>(
  key: SettingKey,
  fallback: T,
): [T, (value: T) => Promise<void>] {
  const [value, setValueState] = useState<T>(fallback);

  useEffect(() => {
    let cancelled = false;
    recordStore()
      .then((store) => store.getSetting<T>(key))
      .then((stored) => {
        if (!cancelled && stored !== undefined) setValueState(stored);
      })
      .catch(() => {
        // Keep the fallback.
      });
    return () => {
      cancelled = true;
    };
  }, [key]);

  const setValue = useCallback(
    (next: T) =>
      new Promise<void>((resolve) => {
        setValueState(next);
        recordStore()
          .then((store) => store.setSetting(key, next))
          .catch(() => {
            // The setting lives for this page only.
          })
          .finally(resolve);
      }),
    [key],
  );

  return [value, setValue];
}
