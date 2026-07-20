export type FileBytes = Uint8Array | null;

export type FileMergeStatus =
  | "no-op"
  | "add"
  | "adopt"
  | "fast-forward"
  | "keep-local"
  | "local-delete"
  | "delete"
  | "binary-replace"
  | "semantic-merge"
  | "move"
  | "conflict";

export type SemanticConflictReason =
  | "add-add"
  | "binary-concurrent-change"
  | "comment-change"
  | "concurrent-edit"
  | "delete-modify"
  | "duplicate-key"
  | "input-limit"
  | "invalid-json"
  | "invalid-keep-region"
  | "invalid-move"
  | "move-collision"
  | "modify-delete"
  | "overlapping-text-edit"
  | "parse-error"
  | "remote-region-removed"
  | "unsupported-media-adapter"
  | "utf8-decode";

export interface SemanticConflict {
  readonly id: string;
  readonly reason: SemanticConflictReason;
  readonly base: string | null;
  readonly local: string | null;
  readonly remote: string | null;
  readonly detail: string;
}

export interface FileMergeResult {
  readonly status: FileMergeStatus;
  /** Bytes that may be staged only when status is not conflict. */
  readonly proposed: FileBytes;
  /** A marker-bearing proposal is local conflict evidence and is never live output. */
  readonly conflictProposal: FileBytes;
  readonly conflicts: readonly SemanticConflict[];
  readonly appliedRemoteKeys: readonly string[];
  readonly preservedLocalKeys: readonly string[];
  readonly tombstone: boolean;
}

export function cloneBytes(bytes: FileBytes): FileBytes {
  return bytes === null ? null : new Uint8Array(bytes);
}

export function bytesEqual(left: FileBytes, right: FileBytes): boolean {
  if (left === null || right === null) return left === right;
  if (left.byteLength !== right.byteLength) return false;
  for (let index = 0; index < left.byteLength; index += 1) {
    if (left[index] !== right[index]) return false;
  }
  return true;
}

export function semanticConflict(
  id: string,
  reason: SemanticConflictReason,
  detail: string,
  values: {
    readonly base?: string | null;
    readonly local?: string | null;
    readonly remote?: string | null;
  } = {},
): SemanticConflict {
  return {
    id,
    reason,
    base: values.base ?? null,
    local: values.local ?? null,
    remote: values.remote ?? null,
    detail,
  };
}

export function resolvedFileMerge(
  status: Exclude<FileMergeStatus, "conflict" | "semantic-merge">,
  proposed: FileBytes,
  options: { readonly tombstone?: boolean } = {},
): FileMergeResult {
  return {
    status,
    proposed: cloneBytes(proposed),
    conflictProposal: null,
    conflicts: [],
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
    tombstone: options.tombstone ?? false,
  };
}

export function conflictedFileMerge(
  conflicts: readonly SemanticConflict[],
  conflictProposal: FileBytes = null,
): FileMergeResult {
  return {
    status: "conflict",
    proposed: null,
    conflictProposal: cloneBytes(conflictProposal),
    conflicts: [...conflicts].sort((left, right) => {
      const idOrder = left.id.localeCompare(right.id, "en-US");
      return idOrder === 0 ? left.reason.localeCompare(right.reason, "en-US") : idOrder;
    }),
    appliedRemoteKeys: [],
    preservedLocalKeys: [],
    tombstone: false,
  };
}
