"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  SchedulerAdapter,
  SchedulerEventInput,
  SchedulerSnapshot,
} from "./scheduler-kit-adapter.js";

export type SchedulerLoadState = "empty" | "error" | "loading" | "offline" | "ready";
export type SchedulerMutationState = "error" | "idle" | "pending" | "success";

export interface UseSchedulerOptions {
  /** Consumer scheduling adapter used for cancellable loading and mutations. */
  readonly adapter: SchedulerAdapter;
  /** Optional server-provided snapshot that avoids the initial client load request. */
  readonly initialSnapshot?: SchedulerSnapshot;
  /** Prevents adapter requests and exposes the explicit offline state when true. */
  readonly offline?: boolean;
}

export function useScheduler({ adapter, initialSnapshot, offline = false }: UseSchedulerOptions) {
  const [snapshot, setSnapshot] = useState<SchedulerSnapshot | null>(initialSnapshot ?? null);
  const [state, setState] = useState<SchedulerLoadState>(
    offline
      ? "offline"
      : initialSnapshot === undefined
        ? "loading"
        : initialSnapshot.events.length === 0
          ? "empty"
          : "ready",
  );
  const [error, setError] = useState("");
  const [mutationState, setMutationState] = useState<SchedulerMutationState>("idle");
  const [mutationError, setMutationError] = useState("");
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
    try {
      const next = await adapter.load(controller.signal);
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setState(next.events.length === 0 ? "empty" : "ready");
      setError("");
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "The schedule could not load.");
      setState("error");
    }
  }, [adapter, offline]);

  useEffect(() => {
    if (initialSnapshot === undefined) void reload();
    return () => activeRequest.current?.abort();
  }, [initialSnapshot, reload]);

  const mutate = async (action: (signal: AbortSignal) => Promise<void>): Promise<boolean> => {
    if (offline || snapshot === null) return false;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setMutationState("pending");
    setMutationError("");
    try {
      await action(controller.signal);
      if (controller.signal.aborted) return false;
      const next = await adapter.load(controller.signal);
      if (controller.signal.aborted) return false;
      setSnapshot(next);
      setMutationState("success");
      setState(next.events.length === 0 ? "empty" : "ready");
      return true;
    } catch (mutationFailure) {
      if (controller.signal.aborted) return false;
      setMutationError(
        mutationFailure instanceof Error
          ? mutationFailure.message
          : "The schedule change could not be completed.",
      );
      setMutationState("error");
      return false;
    }
  };

  const save = (input: SchedulerEventInput) =>
    mutate((signal) => adapter.save(input, signal).then(() => undefined));
  const remove = (eventId: string) =>
    adapter.remove === undefined
      ? Promise.resolve(false)
      : mutate((signal) => adapter.remove!(eventId, signal));
  const resolveConflict = (conflictId: string, resolution: "keep-existing" | "save-anyway") =>
    adapter.resolveConflict === undefined
      ? Promise.resolve(false)
      : mutate((signal) => adapter.resolveConflict!(conflictId, resolution, signal));

  return {
    error,
    mutationError,
    mutationState,
    reload,
    remove,
    resolveConflict,
    save,
    snapshot,
    state,
  } as const;
}
