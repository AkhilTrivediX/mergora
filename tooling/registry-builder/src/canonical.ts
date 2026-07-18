export type CanonicalJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJsonValue[]
  | { readonly [key: string]: CanonicalJsonValue };

const FORBIDDEN_RECORD_KEYS =
  /^(?:generatedAt|selectedAt|checkedAt|timestamp|releaseCommit|sourceDigest|evidenceDigest|payloadDigest|manifestDigest|dependencyGraphDigest|sha256SumsDigest|digest|checksum)$/iu;
const SECRET_RECORD_KEYS =
  /^(?:password|secret|credential|credentials|authorization|cookie|privateKey|authToken|accessToken|refreshToken|npmToken)$/iu;

function normalizeForCanonicalJson(
  value: unknown,
  ancestors: WeakSet<object>,
  path: string,
): CanonicalJsonValue {
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") return value.normalize("NFKC");
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`Canonical JSON value at ${path} is not a finite number.`);
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    throw new TypeError(`Canonical JSON value at ${path} contains unsupported ${typeof value}.`);
  }
  if (ancestors.has(value)) throw new TypeError(`Canonical JSON value at ${path} is cyclic.`);
  ancestors.add(value);

  let normalized: CanonicalJsonValue;
  if (Array.isArray(value)) {
    normalized = value.map((entry, index) =>
      normalizeForCanonicalJson(entry, ancestors, `${path}/${index}`),
    );
  } else {
    const output: Record<string, CanonicalJsonValue> = {};
    const normalizedKeys = new Map<string, string>();
    for (const [key, entry] of Object.entries(value)) {
      const normalizedKey = key.normalize("NFKC");
      const prior = normalizedKeys.get(normalizedKey);
      if (prior !== undefined) {
        throw new TypeError(
          `Canonical JSON keys ${JSON.stringify(key)} and ${JSON.stringify(prior)} collide at ${path}.`,
        );
      }
      normalizedKeys.set(normalizedKey, key);
      output[normalizedKey] = normalizeForCanonicalJson(
        entry,
        ancestors,
        `${path}/${normalizedKey}`,
      );
    }
    normalized = output;
  }

  ancestors.delete(value);
  return normalized;
}

function serializeCanonical(value: CanonicalJsonValue): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(serializeCanonical).join(",")}]`;
  const record = value as { readonly [key: string]: CanonicalJsonValue };
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${serializeCanonical(record[key]!)}`)
    .join(",")}}`;
}

export function canonicalJson(value: unknown): string {
  return serializeCanonical(normalizeForCanonicalJson(value, new WeakSet(), ""));
}

export function canonicalJsonFile(value: unknown): string {
  return `${canonicalJson(value)}\n`;
}

export function assertHonestGeneratedArtifact(value: unknown, path = ""): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertHonestGeneratedArtifact(entry, `${path}/${index}`));
    return;
  }
  if (value === null || typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value)) {
    const normalizedKey = key.normalize("NFKC");
    const normalizedEntry = typeof entry === "string" ? entry.normalize("NFKC") : entry;
    const nextPath = `${path}/${normalizedKey}`;
    if (FORBIDDEN_RECORD_KEYS.test(normalizedKey)) {
      throw new Error(
        `Generated planning artifact must not contain release, timestamp, or digest field ${nextPath}.`,
      );
    }
    if (SECRET_RECORD_KEYS.test(normalizedKey)) {
      throw new Error(
        `Generated planning artifact must not contain secret-like field ${nextPath}.`,
      );
    }
    if (
      normalizedKey === "implementationStatus" &&
      typeof normalizedEntry === "string" &&
      normalizedEntry !== "unimplemented" &&
      normalizedEntry !== "source-present-unreleased"
    ) {
      throw new Error(`Generated planning artifact made an implementation claim at ${nextPath}.`);
    }
    if (normalizedKey === "publishedMaturity" && normalizedEntry !== null) {
      throw new Error(
        `Generated planning artifact made a published maturity claim at ${nextPath}.`,
      );
    }
    if (normalizedKey === "maturity" && normalizedEntry === "stable") {
      throw new Error(`Generated planning artifact made a Stable claim at ${nextPath}.`);
    }
    if (normalizedKey === "state" && normalizedEntry === "pass") {
      throw new Error(`Generated planning artifact fabricated passing evidence at ${nextPath}.`);
    }
    if (typeof normalizedEntry === "string") {
      if (
        /(?:^|[\s"'(])[a-z]:[\\/]/iu.test(normalizedEntry) ||
        /\/(?:Users|home)\/[^/]+\//u.test(normalizedEntry)
      ) {
        throw new Error(
          `Generated planning artifact contains a machine-specific path at ${nextPath}.`,
        );
      }
      if (/\b20\d{2}-\d{2}-\d{2}(?:T\d{2}:\d{2})?/u.test(normalizedEntry)) {
        throw new Error(
          `Generated planning artifact contains a timestamp or calendar date at ${nextPath}.`,
        );
      }
    }
    assertHonestGeneratedArtifact(entry, nextPath);
  }
}
