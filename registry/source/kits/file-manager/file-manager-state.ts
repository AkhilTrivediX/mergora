"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  FileManagerAdapter,
  FileManagerConflictResolution,
  FileManagerFile,
  FileManagerRecoveryReceipt,
  FileManagerSnapshot,
  FileManagerUpload,
} from "./file-manager-adapter.js";

export type FileManagerLoadState = "empty" | "error" | "loading" | "offline" | "ready";
export type FileManagerOperationState = "error" | "idle" | "pending" | "success";

export interface UseFileManagerOptions {
  /** Consumer adapter that owns file data, authorization, mutations, and recovery. */
  readonly adapter: FileManagerAdapter;
  /** Optional server-provided snapshot that bypasses the initial adapter load. */
  readonly initialSnapshot?: FileManagerSnapshot;
  /** Prevents adapter requests and exposes explicit offline recovery state. */
  readonly offline?: boolean;
}

function replaceFile(snapshot: FileManagerSnapshot, file: FileManagerFile): FileManagerSnapshot {
  return {
    ...snapshot,
    files: snapshot.files.map((candidate) => (candidate.id === file.id ? file : candidate)),
  };
}

function replaceUpload(
  snapshot: FileManagerSnapshot,
  upload: FileManagerUpload,
): FileManagerSnapshot {
  return {
    ...snapshot,
    uploads: snapshot.uploads.map((candidate) => (candidate.id === upload.id ? upload : candidate)),
  };
}

export function useFileManager({
  adapter,
  initialSnapshot,
  offline = false,
}: UseFileManagerOptions) {
  const [snapshot, setSnapshot] = useState<FileManagerSnapshot | null>(initialSnapshot ?? null);
  const [state, setState] = useState<FileManagerLoadState>(
    offline
      ? "offline"
      : initialSnapshot === undefined
        ? "loading"
        : initialSnapshot.files.length === 0
          ? "empty"
          : "ready",
  );
  const [error, setError] = useState("");
  const [operationState, setOperationState] = useState<FileManagerOperationState>("idle");
  const [operationError, setOperationError] = useState("");
  const [lastRecovery, setLastRecovery] = useState<FileManagerRecoveryReceipt | null>(null);
  const activeRequest = useRef<AbortController | null>(null);

  const reload = useCallback(async () => {
    if (offline) {
      setState("offline");
      return;
    }
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState("loading");
    setError("");
    try {
      const next = await adapter.load(controller.signal);
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setState(next.files.length === 0 ? "empty" : "ready");
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(
        loadError instanceof Error ? loadError.message : "The file workspace could not load.",
      );
      setState("error");
    }
  }, [adapter, offline]);

  useEffect(() => {
    if (initialSnapshot === undefined) void reload();
    return () => activeRequest.current?.abort();
  }, [initialSnapshot, reload]);

  const operate = async <T>(
    action: (signal: AbortSignal) => Promise<T>,
    apply: (current: FileManagerSnapshot, result: T) => FileManagerSnapshot,
  ): Promise<T | null> => {
    if (offline || snapshot === null) return null;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setOperationState("pending");
    setOperationError("");
    try {
      const result = await action(controller.signal);
      if (controller.signal.aborted) return null;
      setSnapshot((current) => (current === null ? current : apply(current, result)));
      setOperationState("success");
      return result;
    } catch (operationFailure) {
      if (controller.signal.aborted) return null;
      setOperationError(
        operationFailure instanceof Error
          ? operationFailure.message
          : "The file operation could not be completed.",
      );
      setOperationState("error");
      return null;
    }
  };

  const rename = (fileId: string, nextName: string) =>
    operate(
      (signal) => adapter.rename(fileId, nextName, signal),
      (current, file) => replaceFile(current, file),
    );
  const move = (fileId: string, folderId: string) =>
    operate(
      (signal) => adapter.move(fileId, folderId, signal),
      (current, file) => replaceFile(current, file),
    );
  const moveToRecovery = async (fileId: string) => {
    const receipt = await operate(
      (signal) => adapter.moveToRecovery(fileId, signal),
      (current, result) => ({
        ...current,
        files: current.files.filter((file) => file.id !== result.file.id),
      }),
    );
    if (receipt !== null) setLastRecovery(receipt);
    return receipt;
  };
  const restore = async () => {
    if (lastRecovery === null) return null;
    const file = await operate(
      (signal) => adapter.restore(lastRecovery.token, signal),
      (current, restored) => ({ ...current, files: [...current.files, restored] }),
    );
    if (file !== null) setLastRecovery(null);
    return file;
  };
  const resolveConflict = (conflictId: string, resolution: FileManagerConflictResolution) => {
    if (adapter.resolveConflict === undefined) return Promise.resolve(null);
    return operate(
      (signal) => adapter.resolveConflict!(conflictId, resolution, signal),
      (current, file) => ({
        ...replaceFile(current, file),
        conflicts: current.conflicts.filter((conflict) => conflict.id !== conflictId),
      }),
    );
  };
  const cancelUpload = (uploadId: string) => {
    if (adapter.cancelUpload === undefined) return Promise.resolve(null);
    return operate(
      (signal) => adapter.cancelUpload!(uploadId, signal),
      (current, upload) => replaceUpload(current, upload),
    );
  };
  const retryUpload = (uploadId: string) => {
    if (adapter.retryUpload === undefined) return Promise.resolve(null);
    return operate(
      (signal) => adapter.retryUpload!(uploadId, signal),
      (current, upload) => replaceUpload(current, upload),
    );
  };

  return {
    cancelUpload,
    error,
    lastRecovery,
    move,
    moveToRecovery,
    operationError,
    operationState,
    reload,
    rename,
    resolveConflict,
    restore,
    retryUpload,
    snapshot,
    state,
  } as const;
}
