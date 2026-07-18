import { cloneBytes, type FileBytes, type SemanticConflict } from "./merge-model.js";

export interface ConflictBundleMetadata {
  readonly target: string;
  readonly owner: string;
  readonly mediaType: string;
  readonly digests: {
    readonly base: string | null;
    readonly local: string | null;
    readonly remote: string | null;
    readonly proposed: string | null;
  };
  readonly originalLivePreconditionDigest: string | null;
  readonly semanticUnitIds: readonly string[];
  readonly conflicts: readonly SemanticConflict[];
  readonly safeResolutionChoices: readonly ["keep-local", "take-upstream", "manual"];
}

export interface ConflictBundle {
  readonly files: {
    readonly base: FileBytes;
    readonly local: FileBytes;
    readonly remote: FileBytes;
    readonly proposed: FileBytes;
  };
  readonly metadata: ConflictBundleMetadata;
}

const DEFAULT_MAX_BUNDLE_BYTES = 8_388_608;

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const codePoint = character.codePointAt(0)!;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
}

function validProjectTarget(target: string): boolean {
  return (
    target.length > 0 &&
    target === target.normalize("NFC") &&
    !target.startsWith("/") &&
    !target.includes("\\") &&
    !/^[a-zA-Z]:/u.test(target) &&
    !containsControlCharacter(target) &&
    !target.split("/").some((segment) => segment === "" || segment === "." || segment === "..")
  );
}

async function sha256(bytes: FileBytes): Promise<string | null> {
  if (bytes === null) return null;
  const detached = new Uint8Array(bytes.byteLength);
  detached.set(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", detached.buffer);
  const hex = [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

/**
 * Creates a detached local-only conflict snapshot. Every input view is copied
 * before hashing so later caller mutation cannot change staged evidence.
 */
export async function createConflictBundle(input: {
  readonly target: string;
  readonly owner: string;
  readonly mediaType: string;
  readonly base: FileBytes;
  readonly local: FileBytes;
  readonly remote: FileBytes;
  readonly proposed: FileBytes;
  readonly conflicts: readonly SemanticConflict[];
  readonly maxBundleBytes?: number;
}): Promise<ConflictBundle> {
  if (!validProjectTarget(input.target)) {
    throw new TypeError("Conflict bundle target must be a normalized project-relative POSIX path.");
  }
  if (input.conflicts.length === 0) {
    throw new TypeError("A conflict bundle requires at least one structured conflict.");
  }
  const files = {
    base: cloneBytes(input.base),
    local: cloneBytes(input.local),
    remote: cloneBytes(input.remote),
    proposed: cloneBytes(input.proposed),
  };
  const totalBytes = Object.values(files).reduce(
    (total, bytes) => total + (bytes?.byteLength ?? 0),
    0,
  );
  if (totalBytes > (input.maxBundleBytes ?? DEFAULT_MAX_BUNDLE_BYTES)) {
    throw new RangeError("Conflict bundle exceeds its bounded byte policy.");
  }
  const [base, local, remote, proposed] = await Promise.all([
    sha256(files.base),
    sha256(files.local),
    sha256(files.remote),
    sha256(files.proposed),
  ]);
  const conflicts = [...input.conflicts].sort((left, right) => {
    const idOrder = left.id.localeCompare(right.id, "en-US");
    return idOrder === 0 ? left.reason.localeCompare(right.reason, "en-US") : idOrder;
  });
  return {
    files,
    metadata: {
      target: input.target,
      owner: input.owner,
      mediaType: input.mediaType,
      digests: { base, local, remote, proposed },
      originalLivePreconditionDigest: local,
      semanticUnitIds: [...new Set(conflicts.map(({ id }) => id))],
      conflicts,
      safeResolutionChoices: ["keep-local", "take-upstream", "manual"],
    },
  };
}
