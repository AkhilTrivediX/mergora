import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

const tarBlockSize = 512;
const canonicalJsonPaths = new Set(["package/package.json"]);

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function compactCanonicalJson(value) {
  const normalize = (entry) => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry === null || typeof entry !== "object") return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return JSON.stringify(normalize(value));
}

function tarString(header, offset, length) {
  const value = header.subarray(offset, offset + length);
  const end = value.indexOf(0);
  return value.subarray(0, end === -1 ? value.length : end).toString("utf8");
}

function tarNumber(header, offset, length) {
  const value = header.subarray(offset, offset + length);
  if ((value[0] & 0x80) !== 0) {
    let result = BigInt(value[0] & 0x7f);
    for (const byte of value.subarray(1)) result = (result << 8n) | BigInt(byte);
    const number = Number(result);
    if (!Number.isSafeInteger(number)) throw new Error("Tar entry size is not a safe integer.");
    return number;
  }
  const octal = value.toString("ascii").replaceAll("\0", "").trim();
  if (octal === "") return 0;
  if (!/^[0-7]+$/u.test(octal)) throw new Error(`Tar entry has invalid octal data: ${octal}`);
  return Number.parseInt(octal, 8);
}

function paxFields(bytes) {
  const fields = {};
  let offset = 0;
  while (offset < bytes.length) {
    const separator = bytes.indexOf(0x20, offset);
    if (separator === -1) throw new Error("PAX record omits its length separator.");
    const length = Number.parseInt(bytes.subarray(offset, separator).toString("ascii"), 10);
    if (!Number.isSafeInteger(length) || length <= 0 || offset + length > bytes.length) {
      throw new Error("PAX record has an invalid length.");
    }
    const record = bytes.subarray(separator + 1, offset + length - 1).toString("utf8");
    const equals = record.indexOf("=");
    if (equals > 0) fields[record.slice(0, equals)] = record.slice(equals + 1);
    offset += length;
  }
  return fields;
}

/**
 * Digests the semantic file tree carried by an exact npm-compatible tarball.
 * Tar metadata, entry order, gzip headers, and JSON object-key order in the
 * packed root manifest do not affect the result; paths and file values do.
 */
export function canonicalPackedContentDigest(tarballBytes) {
  const archive = gunzipSync(tarballBytes);
  const entries = [];
  let globalPax = {};
  let nextPax = {};
  let nextLongPath;
  let nextLongLink;
  let offset = 0;

  while (offset + tarBlockSize <= archive.length) {
    const header = archive.subarray(offset, offset + tarBlockSize);
    if (header.every((byte) => byte === 0)) break;

    const size = tarNumber(header, 124, 12);
    const contentStart = offset + tarBlockSize;
    const contentEnd = contentStart + size;
    if (contentEnd > archive.length) throw new Error("Tar entry content is truncated.");
    const content = archive.subarray(contentStart, contentEnd);
    const type = tarString(header, 156, 1) || "0";
    const rawName = tarString(header, 0, 100);
    const prefix = tarString(header, 345, 155);
    const headerPath = prefix === "" ? rawName : `${prefix}/${rawName}`;

    if (type === "g") {
      globalPax = { ...globalPax, ...paxFields(content) };
    } else if (type === "x") {
      nextPax = paxFields(content);
    } else if (type === "L") {
      nextLongPath = content.toString("utf8").replace(/\0.*$/su, "");
    } else if (type === "K") {
      nextLongLink = content.toString("utf8").replace(/\0.*$/su, "");
    } else {
      const metadata = { ...globalPax, ...nextPax };
      const path = metadata.path ?? nextLongPath ?? headerPath;
      const link = metadata.linkpath ?? nextLongLink ?? tarString(header, 157, 100);
      if (path === "" || path.includes("\\") || path.split("/").includes("..")) {
        throw new Error(`Tar entry has an unsafe path: ${path}`);
      }

      if (type === "0" || type === "7") {
        let normalized = content;
        if (canonicalJsonPaths.has(path)) {
          normalized = Buffer.from(compactCanonicalJson(JSON.parse(content.toString("utf8"))));
        }
        entries.push({ bytes: normalized.length, path, sha256: sha256(normalized), type: "file" });
      } else if (type === "1" || type === "2") {
        entries.push({ link, path, type: type === "1" ? "hardlink" : "symlink" });
      } else if (type !== "5") {
        throw new Error(`Tar entry ${path} has unsupported type ${type}.`);
      }
      nextPax = {};
      nextLongPath = undefined;
      nextLongLink = undefined;
    }

    offset = contentStart + Math.ceil(size / tarBlockSize) * tarBlockSize;
  }

  if (entries.length === 0) throw new Error("Packed tarball does not contain files.");
  entries.sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  for (let index = 1; index < entries.length; index += 1) {
    if (entries[index - 1].path === entries[index].path) {
      throw new Error(`Packed tarball contains duplicate path ${entries[index].path}.`);
    }
  }
  return sha256(compactCanonicalJson(entries));
}
