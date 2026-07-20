export type FileManagerFileStatus = "available" | "conflict" | "error" | "offline" | "syncing";
export type FileManagerUploadStatus =
  "cancelled" | "complete" | "error" | "paused" | "queued" | "retrying" | "uploading";

export interface FileManagerFolder {
  /** Optional immutable child folders used to build hierarchical navigation. */
  readonly children?: readonly FileManagerFolder[];
  /** Stable unique folder identifier used for navigation and move destinations. */
  readonly id: string;
  /** Human-readable folder name shown in the navigation tree. */
  readonly label: string;
}

export interface FileManagerFile {
  /** Identifier of the folder currently containing this file. */
  readonly folderId: string;
  /** Stable unique file identifier used for selection and adapter operations. */
  readonly id: string;
  /** Consumer-reported MIME type shown as metadata and preview context. */
  readonly mimeType: string;
  /** ISO-compatible modification instant used for localized metadata display. */
  readonly modifiedAt: string;
  /** Human-readable file name used for display and rename editing. */
  readonly name: string;
  /** Optional authorization level controlling whether file mutations are available. */
  readonly permission?: "manage" | "read-only";
  /** Non-negative file size in bytes used for localized metadata display. */
  readonly size: number;
  /** Optional synchronization lifecycle used for status and conflict context. */
  readonly status?: FileManagerFileStatus;
}

export interface FileManagerUpload {
  /** Optional recovery message for an errored upload. */
  readonly error?: string;
  /** Stable unique upload identifier used for retry and cancellation operations. */
  readonly id: string;
  /** Human-readable upload file name. */
  readonly name: string;
  /** Optional percentage from zero through 100 for progress presentation. */
  readonly progress?: number;
  /** Current upload lifecycle controlling progress and available actions. */
  readonly status: FileManagerUploadStatus;
  /** Total upload byte count paired with `uploadedBytes`. */
  readonly totalBytes: number;
  /** Completed upload byte count paired with `totalBytes`. */
  readonly uploadedBytes: number;
}

export interface FileManagerConflict {
  /** Identifier of the file requiring conflict resolution. */
  readonly fileId: string;
  /** Stable unique conflict identifier passed to adapter resolution. */
  readonly id: string;
  /** Human-readable description of the local version. */
  readonly localDescription: string;
  /** Human-readable description of the remote version. */
  readonly remoteDescription: string;
  /** Concise conflict explanation shown before resolution actions. */
  readonly summary: string;
}

export interface FileManagerStorage {
  /** Total storage capacity in bytes. */
  readonly totalBytes: number;
  /** Used storage capacity in bytes. */
  readonly usedBytes: number;
}

export interface FileManagerSnapshot {
  /** Immutable unresolved conflict records supplied by the adapter. */
  readonly conflicts: readonly FileManagerConflict[];
  /** Immutable file records available to the current workspace. */
  readonly files: readonly FileManagerFile[];
  /** Immutable hierarchical folders used for navigation and move destinations. */
  readonly folders: readonly FileManagerFolder[];
  /** Optional storage capacity context; omission removes the storage summary. */
  readonly storage?: FileManagerStorage;
  /** Immutable upload records used for progress and recovery actions. */
  readonly uploads: readonly FileManagerUpload[];
}

export interface FileManagerRecoveryReceipt {
  /** Removed file record retained for the bounded recovery action. */
  readonly file: FileManagerFile;
  /** Opaque consumer-owned token required to restore the removed file. */
  readonly token: string;
}

export type FileManagerConflictResolution = "keep-local" | "keep-remote";

export interface FileManagerAdapter {
  /** Optionally cancels one upload; omission cleanly removes cancellation actions. */
  readonly cancelUpload?: (uploadId: string, signal: AbortSignal) => Promise<FileManagerUpload>;
  /** Loads the latest immutable file workspace snapshot. */
  readonly load: (signal: AbortSignal) => Promise<FileManagerSnapshot>;
  /** Moves one manageable file and returns its canonical updated record. */
  readonly move: (
    fileId: string,
    folderId: string,
    signal: AbortSignal,
  ) => Promise<FileManagerFile>;
  /** Removes a file into consumer-owned recovery and returns its opaque receipt. */
  readonly moveToRecovery: (
    fileId: string,
    signal: AbortSignal,
  ) => Promise<FileManagerRecoveryReceipt>;
  /** Renames one manageable file and returns its canonical updated record. */
  readonly rename: (
    fileId: string,
    nextName: string,
    signal: AbortSignal,
  ) => Promise<FileManagerFile>;
  /** Optionally resolves one conflict; omission cleanly removes resolution actions. */
  readonly resolveConflict?: (
    conflictId: string,
    resolution: FileManagerConflictResolution,
    signal: AbortSignal,
  ) => Promise<FileManagerFile>;
  /** Restores a removed file using an opaque consumer-issued recovery token. */
  readonly restore: (token: string, signal: AbortSignal) => Promise<FileManagerFile>;
  /** Optionally retries one upload; omission cleanly removes retry actions. */
  readonly retryUpload?: (uploadId: string, signal: AbortSignal) => Promise<FileManagerUpload>;
}

const FIXTURE_EPOCH_TIME = "1970-01-01T00:00:00.000Z";

export function createDeterministicFileManagerSnapshot(): FileManagerSnapshot {
  return {
    conflicts: [
      {
        fileId: "release-notes",
        id: "release-notes-conflict",
        localDescription: "Edited locally at 10:28 UTC",
        remoteDescription: "Updated remotely at 10:29 UTC",
        summary: "Two versions of Release notes.txt need a decision.",
      },
    ],
    files: [
      {
        folderId: "working-set",
        id: "interface-map",
        mimeType: "application/pdf",
        modifiedAt: FIXTURE_EPOCH_TIME,
        name: "Interface map.pdf",
        permission: "manage",
        size: 2_420_736,
        status: "available",
      },
      {
        folderId: "working-set",
        id: "release-notes",
        mimeType: "text/plain",
        modifiedAt: FIXTURE_EPOCH_TIME,
        name: "Release notes.txt",
        permission: "manage",
        size: 18_432,
        status: "conflict",
      },
      {
        folderId: "reference",
        id: "token-reference",
        mimeType: "application/json",
        modifiedAt: FIXTURE_EPOCH_TIME,
        name: "Token reference.json",
        permission: "read-only",
        size: 82_944,
        status: "available",
      },
    ],
    folders: [
      {
        children: [
          { id: "working-set", label: "Working set" },
          { id: "reference", label: "Reference" },
        ],
        id: "workspace",
        label: "Workspace",
      },
    ],
    storage: { totalBytes: 10_737_418_240, usedBytes: 4_563_402_752 },
    uploads: [
      {
        id: "upload-accessibility-notes",
        name: "Accessibility notes.pdf",
        progress: 64,
        status: "uploading",
        totalBytes: 1_048_576,
        uploadedBytes: 671_089,
      },
    ],
  };
}

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}

function requireFile(snapshot: FileManagerSnapshot, id: string): FileManagerFile {
  const file = snapshot.files.find((candidate) => candidate.id === id);
  if (file === undefined) throw new Error("The requested file is no longer available.");
  return file;
}

function replaceFile(
  snapshot: FileManagerSnapshot,
  replacement: FileManagerFile,
): FileManagerSnapshot {
  return {
    ...snapshot,
    files: snapshot.files.map((file) => (file.id === replacement.id ? replacement : file)),
  };
}

export function createDeterministicFileManagerAdapter(): FileManagerAdapter {
  let snapshot = createDeterministicFileManagerSnapshot();
  const recovery = new Map<string, FileManagerFile>();
  return {
    async cancelUpload(uploadId, signal) {
      ensureActive(signal);
      const current = snapshot.uploads.find((upload) => upload.id === uploadId);
      if (current === undefined) throw new Error("The upload is no longer available.");
      const next: FileManagerUpload = { ...current, status: "cancelled" };
      snapshot = {
        ...snapshot,
        uploads: snapshot.uploads.map((upload) => (upload.id === uploadId ? next : upload)),
      };
      return next;
    },
    async load(signal) {
      ensureActive(signal);
      return snapshot;
    },
    async move(fileId, folderId, signal) {
      ensureActive(signal);
      const next = {
        ...requireFile(snapshot, fileId),
        folderId,
        modifiedAt: FIXTURE_EPOCH_TIME,
      };
      snapshot = replaceFile(snapshot, next);
      return next;
    },
    async moveToRecovery(fileId, signal) {
      ensureActive(signal);
      const file = requireFile(snapshot, fileId);
      const token = `recovery-${file.id}`;
      recovery.set(token, file);
      snapshot = {
        ...snapshot,
        files: snapshot.files.filter((candidate) => candidate.id !== fileId),
      };
      return { file, token };
    },
    async rename(fileId, nextName, signal) {
      ensureActive(signal);
      const normalized = nextName.trim();
      if (normalized.length === 0 || normalized.length > 255 || /[\\/:*?"<>|]/u.test(normalized)) {
        throw new Error("Use a file name from 1 to 255 characters without reserved symbols.");
      }
      const next = {
        ...requireFile(snapshot, fileId),
        modifiedAt: FIXTURE_EPOCH_TIME,
        name: normalized,
      };
      snapshot = replaceFile(snapshot, next);
      return next;
    },
    async resolveConflict(conflictId, resolution, signal) {
      ensureActive(signal);
      const conflict = snapshot.conflicts.find((candidate) => candidate.id === conflictId);
      if (conflict === undefined) throw new Error("The conflict is no longer available.");
      const current = requireFile(snapshot, conflict.fileId);
      const next = {
        ...current,
        modifiedAt: FIXTURE_EPOCH_TIME,
        name: resolution === "keep-local" ? current.name : current.name,
        status: "available" as const,
      };
      snapshot = {
        ...replaceFile(snapshot, next),
        conflicts: snapshot.conflicts.filter((candidate) => candidate.id !== conflictId),
      };
      return next;
    },
    async restore(token, signal) {
      ensureActive(signal);
      const file = recovery.get(token);
      if (file === undefined) throw new Error("The recovery window has expired.");
      recovery.delete(token);
      snapshot = { ...snapshot, files: [...snapshot.files, file] };
      return file;
    },
    async retryUpload(uploadId, signal) {
      ensureActive(signal);
      const current = snapshot.uploads.find((upload) => upload.id === uploadId);
      if (current === undefined) throw new Error("The upload is no longer available.");
      const { error: _error, ...uploadWithoutError } = current;
      const next: FileManagerUpload = { ...uploadWithoutError, status: "retrying" };
      snapshot = {
        ...snapshot,
        uploads: snapshot.uploads.map((upload) => (upload.id === uploadId ? next : upload)),
      };
      return next;
    },
  };
}
