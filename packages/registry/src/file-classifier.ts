import {
  bytesEqual,
  resolvedFileMerge,
  semanticConflict,
  type FileBytes,
  type FileMergeResult,
  type SemanticConflict,
} from "./merge-model.js";

export type BlrClassification =
  | { readonly kind: "resolved"; readonly result: FileMergeResult }
  | { readonly kind: "merge" }
  | { readonly kind: "conflict"; readonly conflict: SemanticConflict };

/**
 * Classifies the complete raw-byte B/L/R truth table before a media adapter is
 * allowed to parse or normalize anything. `null` is a missing file, never an
 * empty file. The function is pure and does not expose mutable input views.
 */
export function classifyBlr(input: {
  readonly base: FileBytes;
  readonly local: FileBytes;
  readonly remote: FileBytes;
  readonly binary: boolean;
}): BlrClassification {
  const { base, local, remote } = input;

  if (base === null) {
    if (local === null && remote === null) {
      return { kind: "resolved", result: resolvedFileMerge("no-op", null) };
    }
    if (local === null) {
      return { kind: "resolved", result: resolvedFileMerge("add", remote) };
    }
    if (remote === null) {
      return { kind: "resolved", result: resolvedFileMerge("keep-local", local) };
    }
    if (bytesEqual(local, remote)) {
      return { kind: "resolved", result: resolvedFileMerge("adopt", local) };
    }
    return {
      kind: "conflict",
      conflict: semanticConflict(
        "$file",
        "add-add",
        "A local file already occupies a target that the new release adds.",
      ),
    };
  }

  if (local === null && remote === null) {
    return { kind: "resolved", result: resolvedFileMerge("delete", null) };
  }
  if (local === null) {
    if (bytesEqual(base, remote)) {
      return {
        kind: "resolved",
        result: resolvedFileMerge("local-delete", null, { tombstone: true }),
      };
    }
    return {
      kind: "conflict",
      conflict: semanticConflict(
        "$file",
        "delete-modify",
        "The consumer deleted the file while the upstream release modified it.",
      ),
    };
  }
  if (remote === null) {
    if (bytesEqual(base, local)) {
      return { kind: "resolved", result: resolvedFileMerge("delete", null) };
    }
    return {
      kind: "conflict",
      conflict: semanticConflict(
        "$file",
        "modify-delete",
        "The consumer modified the file while the upstream release deleted it.",
      ),
    };
  }

  if (bytesEqual(local, remote)) {
    return { kind: "resolved", result: resolvedFileMerge("no-op", local) };
  }
  if (bytesEqual(local, base)) {
    return {
      kind: "resolved",
      result: resolvedFileMerge(input.binary ? "binary-replace" : "fast-forward", remote),
    };
  }
  if (bytesEqual(remote, base)) {
    return { kind: "resolved", result: resolvedFileMerge("keep-local", local) };
  }
  if (input.binary) {
    return {
      kind: "conflict",
      conflict: semanticConflict(
        "$file",
        "binary-concurrent-change",
        "Binary bytes changed both locally and upstream and cannot be text-merged.",
      ),
    };
  }

  return { kind: "merge" };
}

export function classificationConflictResult(classification: {
  readonly kind: "conflict";
  readonly conflict: SemanticConflict;
}): FileMergeResult {
  return {
    status: "conflict",
    proposed: null,
    conflictProposal: null,
    conflicts: [classification.conflict],
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
    tombstone: false,
  };
}
