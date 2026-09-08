// The record's home: one IndexedDB database on the device, with a store of
// hands and a store of settings. A thin promise wrapper over the raw API;
// there is nothing else in the app to justify a library.

import type { HandRecord, SettingKey } from "./types";

export const DATABASE_NAME = "yarborough";
export const DATABASE_VERSION = 1;
const HANDS = "hands";
const SETTINGS = "settings";

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("IndexedDB transaction aborted"));
  });
}

export function openRecordDatabase(
  factory: IDBFactory,
  name: string = DATABASE_NAME,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(name, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(HANDS)) {
        const hands = db.createObjectStore(HANDS, {
          keyPath: "id",
          autoIncrement: true,
        });
        hands.createIndex("completedAt", "completedAt");
        hands.createIndex("boardId", "boardId");
      }
      if (!db.objectStoreNames.contains(SETTINGS)) {
        db.createObjectStore(SETTINGS, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open the record"));
    request.onblocked = () =>
      reject(
        new Error("The record is open in another tab at an older version"),
      );
  });
}

/** The record: hands the user has bid, and the page's settings. */
export class RecordStore {
  private readonly db: IDBDatabase;

  constructor(db: IDBDatabase) {
    this.db = db;
  }

  /** Insert a hand and return its id. */
  async addHand(record: HandRecord): Promise<number> {
    const tx = this.db.transaction(HANDS, "readwrite");
    const id = await requestToPromise(tx.objectStore(HANDS).add(record));
    await transactionDone(tx);
    return id as number;
  }

  /** Merge `patch` into the hand with `id`; a missing id is ignored. */
  async updateHand(id: number, patch: Partial<HandRecord>): Promise<void> {
    const tx = this.db.transaction(HANDS, "readwrite");
    const store = tx.objectStore(HANDS);
    const existing = (await requestToPromise(store.get(id))) as
      | HandRecord
      | undefined;
    if (existing) store.put({ ...existing, ...patch, id });
    await transactionDone(tx);
  }

  /** Every hand, oldest first. */
  async allHands(): Promise<HandRecord[]> {
    const tx = this.db.transaction(HANDS, "readonly");
    const hands = await requestToPromise(
      tx.objectStore(HANDS).index("completedAt").getAll(),
    );
    await transactionDone(tx);
    return hands as HandRecord[];
  }

  async clearHands(): Promise<void> {
    const tx = this.db.transaction(HANDS, "readwrite");
    tx.objectStore(HANDS).clear();
    await transactionDone(tx);
  }

  async getSetting<T>(key: SettingKey): Promise<T | undefined> {
    const tx = this.db.transaction(SETTINGS, "readonly");
    const row = (await requestToPromise(tx.objectStore(SETTINGS).get(key))) as
      | { key: string; value: T }
      | undefined;
    await transactionDone(tx);
    return row?.value;
  }

  async setSetting<T>(key: SettingKey, value: T): Promise<void> {
    const tx = this.db.transaction(SETTINGS, "readwrite");
    tx.objectStore(SETTINGS).put({ key, value });
    await transactionDone(tx);
  }

  close(): void {
    this.db.close();
  }
}

export async function openRecordStore(
  factory: IDBFactory,
  name?: string,
): Promise<RecordStore> {
  return new RecordStore(await openRecordDatabase(factory, name));
}

let shared: Promise<RecordStore> | null = null;

/**
 * The page's one store, opened on first use. Rejects where IndexedDB is not
 * available (some private windows); callers treat that as "no record".
 */
export function recordStore(): Promise<RecordStore> {
  shared ??= (() => {
    if (typeof indexedDB === "undefined") {
      return Promise.reject(new Error("IndexedDB is not available"));
    }
    return openRecordStore(indexedDB);
  })();
  return shared;
}

/** Tests: use a fresh store, typically from fake-indexeddb. */
export function useRecordStoreForTests(store: Promise<RecordStore> | null) {
  shared = store;
}
