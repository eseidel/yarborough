// A minimal zip filter for Python wheels.
//
// Wheels are plain zip archives, so dropping an entry is a matter of rewriting
// the central directory. Entries that stay are copied with their compressed
// bytes untouched, which keeps the served wheel byte-for-byte derived from the
// checksum-verified upstream download and makes the output deterministic.
//
// Only the shape real wheels have is supported: no zip64, no data descriptors,
// no multi-disk archives. Anything else throws rather than guessing.

import { crc32, inflateRawSync } from "node:zlib";

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_SIZE = 30;
const CENTRAL_HEADER_SIZE = 46;
const END_OF_CENTRAL_DIRECTORY_SIZE = 22;
const DATA_DESCRIPTOR_FLAG = 0x08;
const ZIP64_SENTINEL = 0xffffffff;
const STORED = 0;
const DEFLATED = 8;
const VERSION_NEEDED_TO_EXTRACT = 20;

function findEndOfCentralDirectory(zip) {
  // The record is last, but a trailing comment may follow it.
  const earliest = Math.max(
    0,
    zip.length - END_OF_CENTRAL_DIRECTORY_SIZE - 0xffff,
  );
  for (
    let offset = zip.length - END_OF_CENTRAL_DIRECTORY_SIZE;
    offset >= earliest;
    offset--
  ) {
    if (zip.readUInt32LE(offset) === END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      return offset;
    }
  }
  throw new Error("Not a zip archive: no end-of-central-directory record");
}

/**
 * Reads a zip's central directory.
 *
 * @param {Buffer} zip
 * @returns {{ name: string, header: Buffer, localHeaderOffset: number,
 *             compressedSize: number, flags: number }[]}
 */
export function readCentralDirectory(zip) {
  const end = findEndOfCentralDirectory(zip);
  const entryCount = zip.readUInt16LE(end + 10);
  if (zip.readUInt16LE(end + 8) !== entryCount) {
    throw new Error("Multi-disk zip archives are not supported");
  }

  const entries = [];
  let offset = zip.readUInt32LE(end + 16);
  for (let index = 0; index < entryCount; index++) {
    if (zip.readUInt32LE(offset) !== CENTRAL_HEADER_SIGNATURE) {
      throw new Error(`Corrupt central directory at offset ${offset}`);
    }
    const flags = zip.readUInt16LE(offset + 8);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localHeaderOffset = zip.readUInt32LE(offset + 42);
    const headerLength =
      CENTRAL_HEADER_SIZE + nameLength + extraLength + commentLength;

    if (flags & DATA_DESCRIPTOR_FLAG) {
      throw new Error("Zip entries with data descriptors are not supported");
    }
    if (
      compressedSize === ZIP64_SENTINEL ||
      localHeaderOffset === ZIP64_SENTINEL
    ) {
      throw new Error("Zip64 archives are not supported");
    }

    entries.push({
      name: zip.toString(
        "utf8",
        offset + CENTRAL_HEADER_SIZE,
        offset + CENTRAL_HEADER_SIZE + nameLength,
      ),
      header: zip.subarray(offset, offset + headerLength),
      localHeaderOffset,
      compressedSize,
      flags,
    });
    offset += headerLength;
  }
  return entries;
}

// The bytes a kept entry contributes to the new archive: its local header plus
// its already-compressed data, copied verbatim.
function localRecord(zip, entry) {
  const offset = entry.localHeaderOffset;
  if (zip.readUInt32LE(offset) !== LOCAL_HEADER_SIGNATURE) {
    throw new Error(`Corrupt local header for ${entry.name}`);
  }
  const nameLength = zip.readUInt16LE(offset + 26);
  const extraLength = zip.readUInt16LE(offset + 28);
  const length =
    LOCAL_HEADER_SIZE + nameLength + extraLength + entry.compressedSize;
  return zip.subarray(offset, offset + length);
}

/**
 * Decompresses one archive member.
 *
 * @param {Buffer} zip
 * @param {{ name: string, header: Buffer, localHeaderOffset: number, compressedSize: number }} entry
 * @returns {Buffer}
 */
export function readEntry(zip, entry) {
  const record = localRecord(zip, entry);
  const data = record.subarray(record.length - entry.compressedSize);
  const method = entry.header.readUInt16LE(10);
  if (method === STORED) {
    return Buffer.from(data);
  }
  if (method === DEFLATED) {
    return inflateRawSync(data);
  }
  throw new Error(`Unsupported compression method ${method} for ${entry.name}`);
}

// A fresh, uncompressed entry, used for the RECORD file once its lines have
// been filtered. Wheel metadata is small enough that storing it costs nothing.
function storedRecord(
  name,
  contents,
  modifiedTime,
  modifiedDate,
  externalAttributes,
) {
  const nameBytes = Buffer.from(name, "utf8");
  const checksum = crc32(contents);

  const local = Buffer.alloc(LOCAL_HEADER_SIZE + nameBytes.length);
  local.writeUInt32LE(LOCAL_HEADER_SIGNATURE, 0);
  local.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT, 4);
  local.writeUInt16LE(0, 6); // flags
  local.writeUInt16LE(STORED, 8);
  local.writeUInt16LE(modifiedTime, 10);
  local.writeUInt16LE(modifiedDate, 12);
  local.writeUInt32LE(checksum, 14);
  local.writeUInt32LE(contents.length, 18);
  local.writeUInt32LE(contents.length, 22);
  local.writeUInt16LE(nameBytes.length, 26);
  local.writeUInt16LE(0, 28); // extra field length
  nameBytes.copy(local, LOCAL_HEADER_SIZE);

  const header = Buffer.alloc(CENTRAL_HEADER_SIZE + nameBytes.length);
  header.writeUInt32LE(CENTRAL_HEADER_SIGNATURE, 0);
  header.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT, 4); // version made by
  header.writeUInt16LE(VERSION_NEEDED_TO_EXTRACT, 6);
  header.writeUInt16LE(0, 8); // flags
  header.writeUInt16LE(STORED, 10);
  header.writeUInt16LE(modifiedTime, 12);
  header.writeUInt16LE(modifiedDate, 14);
  header.writeUInt32LE(checksum, 16);
  header.writeUInt32LE(contents.length, 20);
  header.writeUInt32LE(contents.length, 24);
  header.writeUInt16LE(nameBytes.length, 28);
  header.writeUInt32LE(externalAttributes, 38);
  nameBytes.copy(header, CENTRAL_HEADER_SIZE);

  return { local: Buffer.concat([local, contents]), header };
}

/**
 * Drops the RECORD lines whose file is no longer in the wheel. RECORD is a
 * PEP 376 manifest, one `path,hash,size` line per installed file.
 *
 * @param {Buffer} record
 * @param {(name: string) => boolean} keep
 * @returns {Buffer}
 */
export function filterRecord(record, keep) {
  const lines = record.toString("utf8").split("\n");
  const kept = lines.filter(
    (line) => line === "" || keep(line.slice(0, line.indexOf(","))),
  );
  return Buffer.from(kept.join("\n"), "utf8");
}

/**
 * Removes entries from a wheel, rewriting its RECORD manifest to match.
 *
 * @param {Buffer} wheel
 * @param {(name: string) => boolean} keep called with each archive member name
 * @returns {{ wheel: Buffer, dropped: string[] }}
 */
export function slimWheel(wheel, keep) {
  const entries = readCentralDirectory(wheel);
  const dropped = entries
    .map((entry) => entry.name)
    .filter((name) => !keep(name));
  if (dropped.length === 0) {
    return { wheel, dropped };
  }

  const locals = [];
  const headers = [];
  let offset = 0;

  for (const entry of entries) {
    if (!keep(entry.name)) {
      continue;
    }

    let local;
    let header;
    if (entry.name.endsWith(".dist-info/RECORD")) {
      ({ local, header } = storedRecord(
        entry.name,
        filterRecord(readEntry(wheel, entry), keep),
        entry.header.readUInt16LE(12),
        entry.header.readUInt16LE(14),
        entry.header.readUInt32LE(38),
      ));
    } else {
      local = localRecord(wheel, entry);
      header = Buffer.from(entry.header);
    }

    header.writeUInt32LE(offset, 42);
    locals.push(local);
    headers.push(header);
    offset += local.length;
  }

  const centralDirectory = Buffer.concat(headers);
  const end = Buffer.alloc(END_OF_CENTRAL_DIRECTORY_SIZE);
  end.writeUInt32LE(END_OF_CENTRAL_DIRECTORY_SIGNATURE, 0);
  end.writeUInt16LE(headers.length, 8);
  end.writeUInt16LE(headers.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);

  return { wheel: Buffer.concat([...locals, centralDirectory, end]), dropped };
}
