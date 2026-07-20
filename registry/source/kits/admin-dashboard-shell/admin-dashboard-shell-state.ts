"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type {
  AdminDashboardRole,
  AdminDashboardShellAdapter,
  AdminDashboardSnapshot,
} from "./admin-dashboard-shell-adapter.js";

export type AdminDashboardShellLoadState = "empty" | "error" | "loading" | "offline" | "ready";

export interface UseAdminDashboardShellOptions {
  /** Consumer adapter that owns dashboard loading and optional notification mutation. */
  readonly adapter: AdminDashboardShellAdapter;
  /** Prevents adapter requests and exposes an explicit offline recovery state. */
  readonly offline?: boolean;
  /** Role supplied to loading and optional permission-aware navigation filtering. */
  readonly role?: AdminDashboardRole;
}

export function useAdminDashboardShell({
  adapter,
  offline = false,
  role = "owner",
}: UseAdminDashboardShellOptions) {
  const [snapshot, setSnapshot] = useState<AdminDashboardSnapshot | null>(null);
  const [state, setState] = useState<AdminDashboardShellLoadState>(offline ? "offline" : "loading");
  const [error, setError] = useState("");
  const activeRequest = useRef<AbortController | null>(null);

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
      const next = await adapter.load(role, controller.signal);
      if (controller.signal.aborted) return;
      setSnapshot(next);
      setState(next.activities.length === 0 && next.trend.length === 0 ? "empty" : "ready");
    } catch (loadError) {
      if (controller.signal.aborted) return;
      setError(loadError instanceof Error ? loadError.message : "The dashboard could not load.");
      setState("error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  }, [adapter, offline, role]);

  useEffect(() => {
    void reload();
    return () => activeRequest.current?.abort();
  }, [reload]);

  const markNotificationRead = async (notificationId: string) => {
    if (adapter.markNotificationRead === undefined || offline) return;
    const controller = new AbortController();
    activeRequest.current?.abort();
    activeRequest.current = controller;
    const previous = snapshot;
    setSnapshot((current) =>
      current === null
        ? current
        : {
            ...current,
            notifications: current.notifications.map((notification) =>
              notification.id === notificationId ? { ...notification, read: true } : notification,
            ),
          },
    );
    try {
      await adapter.markNotificationRead(notificationId, controller.signal);
      setError("");
    } catch (markError) {
      if (controller.signal.aborted) return;
      setSnapshot(previous);
      setError(
        markError instanceof Error ? markError.message : "The notification could not be updated.",
      );
      setState("error");
    } finally {
      if (activeRequest.current === controller) activeRequest.current = null;
    }
  };

  return { error, markNotificationRead, reload, snapshot, state } as const;
}
