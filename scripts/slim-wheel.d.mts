// Type surface of scripts/slim-wheel.mjs.

/** One member of a zip's central directory. */
export interface WheelEntry {
  /** The archive member's path, e.g. `z3/lib/libz3.so`. */
  name: string;
  /** The member's central directory header, for reading its other fields. */
  header: Buffer;
  localHeaderOffset: number;
  compressedSize: number;
  flags: number;
}

/** A predicate over archive member names: true keeps the member. */
export type KeepEntry = (name: string) => boolean;

export function readCentralDirectory(zip: Buffer): WheelEntry[];

/** Decompresses one archive member. */
export function readEntry(zip: Buffer, entry: WheelEntry): Buffer;

/** Drops the RECORD lines whose file is no longer in the wheel. */
export function filterRecord(record: Buffer, keep: KeepEntry): Buffer;

/** Removes entries from a wheel, rewriting its RECORD manifest to match. */
export function slimWheel(
  wheel: Buffer,
  keep: KeepEntry,
): { wheel: Buffer; dropped: string[] };
