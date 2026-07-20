"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  CrudDataRecord,
  CrudDataRecordInput,
  CrudDataWorkspaceAdapter,
  CrudDataWorkspaceSnapshot,
} from "./crud-data-workspace-adapter.js";

export type CrudDataWorkspaceLoadState = "empty" | "error" | "loading" | "offline" | "ready";
export type CrudDataMutationState = "error" | "idle" | "pending" | "success";

export interface UseCrudDataWorkspaceOptions {
  /** Consumer adapter that owns records, authorization, persistence, and recovery. */
  readonly adapter: CrudDataWorkspaceAdapter;
  /** Prevents adapter requests and exposes explicit offline recovery state. */
  readonly offline?: boolean;
  /** Applies reversible local previews before mutation completion when enabled. */
  readonly optimisticMutations?: boolean;
}

export function useCrudDataWorkspace({
  adapter,
  offline = false,
  optimisticMutations = false,
}: UseCrudDataWorkspaceOptions) {
  const [snapshot, setSnapshot] = useState<CrudDataWorkspaceSnapshot | null>(null);
  const [state, setState] = useState<CrudDataWorkspaceLoadState>(offline ? "offline" : "loading");
  const [mutationState, setMutationState] = useState<CrudDataMutationState>("idle");
  const [error, setError] = useState("");
  const [lastDeleted, setLastDeleted] = useState<CrudDataRecord | null>(null);
  const [lastOperation, setLastOperation] = useState("");
  const activeRequest = useRef<AbortController | null>(null);
  const optimisticSequence = useRef(0);

  const reload = useCallback(async () => {
    activeRequest.current?.abort();
    if (offline) {
      setState("offline");
      return;
    }
    const controller = new AbortController();
    activeRequest.current = controller;
    setState("loading");
    setError("");
    try {
      const next = await adapter.load(controller.signal);
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setState(next.records.length === 0 ? "empty" : "ready");
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "Records could not be loaded.");
      setState("error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [adapter, offline]);

  useEffect(() => {
    void reload();
    return () => activeRequest.current?.abort();
  }, [reload]);

  const startMutation = () => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setMutationState("pending");
    setError("");
    return controller;
  };

  const failMutation = (controller: AbortController, mutationError: unknown) => {
    if (controller.signal.aborted) return;
    setError(
      mutationError instanceof Error ? mutationError.message : "The change could not be saved.",
    );
    setMutationState("error");
    if (activeRequest.current === controller) activeRequest.current = null;
  };

  const finishMutation = (controller: AbortController, message: string) => {
    if (controller.signal.aborted) return;
    setMutationState("success");
    setLastOperation(message);
    setState("ready");
    if (activeRequest.current === controller) activeRequest.current = null;
  };

  const createRecord = async (input: CrudDataRecordInput) => {
    if (snapshot === null || offline || !snapshot.permissions.canCreate) return;
    const controller = startMutation();
    optimisticSequence.current += 1;
    const temporary: CrudDataRecord = {
      ...input,
      id: `optimistic-${optimisticSequence.current}`,
      updatedAt: new Date().toISOString(),
    };
    const previous = snapshot;
    if (optimisticMutations) {
      setSnapshot({ ...snapshot, records: [...snapshot.records, temporary] });
    }
    try {
      const created = await adapter.create(input, controller.signal);
      setSnapshot((current) => {
        if (current === null) return current;
        return {
          ...current,
          records: optimisticMutations
            ? current.records.map((record) => (record.id === temporary.id ? created : record))
            : [...current.records, created],
        };
      });
      finishMutation(controller, `Created ${created.name}.`);
    } catch (createError) {
      if (optimisticMutations) setSnapshot(previous);
      failMutation(controller, createError);
    }
  };

  const updateRecord = async (recordId: string, input: CrudDataRecordInput) => {
    if (snapshot === null || offline || !snapshot.permissions.canUpdate) return;
    const controller = startMutation();
    const previous = snapshot;
    if (optimisticMutations) {
      setSnapshot({
        ...snapshot,
        records: snapshot.records.map((record) =>
          record.id === recordId
            ? { ...record, ...input, updatedAt: new Date().toISOString() }
            : record,
        ),
      });
    }
    try {
      const updated = await adapter.update(recordId, input, controller.signal);
      setSnapshot((current) =>
        current === null
          ? current
          : {
              ...current,
              records: current.records.map((record) => (record.id === recordId ? updated : record)),
            },
      );
      finishMutation(controller, `Updated ${updated.name}.`);
    } catch (updateError) {
      if (optimisticMutations) setSnapshot(previous);
      failMutation(controller, updateError);
    }
  };

  const deleteRecord = async (recordId: string) => {
    if (snapshot === null || offline || !snapshot.permissions.canDelete) return;
    const record = snapshot.records.find((item) => item.id === recordId);
    if (record === undefined) return;
    const controller = startMutation();
    const previous = snapshot;
    if (optimisticMutations) {
      setSnapshot({
        ...snapshot,
        records: snapshot.records.filter((item) => item.id !== recordId),
      });
    }
    try {
      await adapter.delete(recordId, controller.signal);
      if (!optimisticMutations) {
        setSnapshot((current) =>
          current === null
            ? current
            : { ...current, records: current.records.filter((item) => item.id !== recordId) },
        );
      }
      setLastDeleted(record);
      finishMutation(controller, `Deleted ${record.name}.`);
    } catch (deleteError) {
      if (optimisticMutations) setSnapshot(previous);
      failMutation(controller, deleteError);
    }
  };

  const restoreDeleted = async () => {
    if (snapshot === null || lastDeleted === null || adapter.restore === undefined || offline)
      return;
    const controller = startMutation();
    try {
      const restored = await adapter.restore(lastDeleted, controller.signal);
      setSnapshot((current) =>
        current === null
          ? current
          : {
              ...current,
              records: [...current.records.filter((record) => record.id !== restored.id), restored],
            },
      );
      setLastDeleted(null);
      finishMutation(controller, `Restored ${restored.name}.`);
    } catch (restoreError) {
      failMutation(controller, restoreError);
    }
  };

  const bulkSetStatus = async (
    recordIds: readonly string[],
    status: CrudDataRecordInput["status"],
  ) => {
    if (
      snapshot === null ||
      recordIds.length === 0 ||
      adapter.bulkUpdate === undefined ||
      !snapshot.permissions.canBulkUpdate ||
      offline
    ) {
      return;
    }
    const controller = startMutation();
    const previous = snapshot;
    if (optimisticMutations) {
      const ids = new Set(recordIds);
      setSnapshot({
        ...snapshot,
        records: snapshot.records.map((record) =>
          ids.has(record.id) ? { ...record, status } : record,
        ),
      });
    }
    try {
      const updated = await adapter.bulkUpdate(recordIds, { status }, controller.signal);
      const updates = new Map(updated.map((record) => [record.id, record]));
      setSnapshot((current) =>
        current === null
          ? current
          : {
              ...current,
              records: current.records.map((record) => updates.get(record.id) ?? record),
            },
      );
      finishMutation(controller, `Updated ${updated.length} records.`);
    } catch (bulkError) {
      if (optimisticMutations) setSnapshot(previous);
      failMutation(controller, bulkError);
    }
  };

  const saveView = async (label: string, search: string, category: string) => {
    if (snapshot === null || adapter.saveView === undefined || offline || label.trim() === "")
      return;
    const controller = startMutation();
    const id = `view-${
      label
        .trim()
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-|-$/gu, "") || "custom"
    }`;
    const view = {
      ...(category === "all" ? {} : { category }),
      id,
      label: label.trim(),
      ...(search.trim() === "" ? {} : { search: search.trim() }),
    };
    try {
      await adapter.saveView(view, controller.signal);
      setSnapshot((current) =>
        current === null
          ? current
          : {
              ...current,
              savedViews: [...current.savedViews.filter((item) => item.id !== id), view],
            },
      );
      finishMutation(controller, `Saved view ${view.label}.`);
    } catch (saveError) {
      failMutation(controller, saveError);
    }
  };

  const cancelMutation = () => {
    activeRequest.current?.abort();
    activeRequest.current = null;
    setMutationState("idle");
    setLastOperation("Change cancelled.");
  };

  const clearError = () => {
    setError("");
    setMutationState("idle");
  };

  return {
    bulkSetStatus,
    cancelMutation,
    clearError,
    createRecord,
    deleteRecord,
    error,
    lastDeleted,
    lastOperation,
    mutationState,
    reload,
    restoreDeleted,
    saveView,
    snapshot,
    state,
    updateRecord,
  } as const;
}
