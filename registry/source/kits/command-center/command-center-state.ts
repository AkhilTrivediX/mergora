"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { CommandCenterAdapter, CommandCenterItem } from "./command-center-adapter.js";

export type CommandCenterSearchState = "empty" | "error" | "idle" | "loading" | "ready";

export interface UseCommandCenterOptions {
  /** Consumer adapter that owns command discovery and execution. */
  readonly adapter: CommandCenterAdapter;
  /** Non-negative delay in milliseconds before adapter search begins. */
  readonly debounceMs?: number;
  /** Initial query for uncontrolled search. */
  readonly defaultQuery?: string;
  /** Non-negative character threshold below which search remains idle. */
  readonly minimumQueryLength?: number;
  /** Reports controlled or uncontrolled query changes. */
  readonly onQueryChange?: (query: string) => void;
  /** Controlled search query; use with `onQueryChange`. */
  readonly query?: string;
  /** Loads recent commands for an empty query when the adapter supports them. */
  readonly recentCommands?: boolean;
}

export function useCommandCenter({
  adapter,
  debounceMs = 120,
  defaultQuery = "",
  minimumQueryLength = 1,
  onQueryChange,
  query,
  recentCommands = false,
}: UseCommandCenterOptions) {
  if (!Number.isFinite(debounceMs) || debounceMs < 0) {
    throw new RangeError("Mergora CommandCenter debounceMs must be a finite non-negative number.");
  }
  if (!Number.isInteger(minimumQueryLength) || minimumQueryLength < 0) {
    throw new RangeError(
      "Mergora CommandCenter minimumQueryLength must be a non-negative integer.",
    );
  }
  const [uncontrolledQuery, setUncontrolledQuery] = useState(defaultQuery);
  const [commands, setCommands] = useState<readonly CommandCenterItem[]>([]);
  const [state, setState] = useState<CommandCenterSearchState>("idle");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const activeSearch = useRef<AbortController | null>(null);
  const activeExecution = useRef<AbortController | null>(null);
  const currentQuery = query ?? uncontrolledQuery;

  const setQuery = (next: string) => {
    if (query === undefined) setUncontrolledQuery(next);
    onQueryChange?.(next);
  };

  useEffect(() => {
    activeSearch.current?.abort();
    const normalized = currentQuery.trim();
    if (normalized.length < minimumQueryLength && !(normalized.length === 0 && recentCommands)) {
      setCommands([]);
      setError("");
      setState("idle");
      return;
    }
    if (normalized.length === 0 && recentCommands && adapter.loadRecent === undefined) {
      setCommands([]);
      setError("");
      setState("empty");
      return;
    }
    const controller = new AbortController();
    activeSearch.current = controller;
    setState("loading");
    setError("");
    const timer = setTimeout(() => {
      const request =
        normalized.length === 0
          ? adapter.loadRecent!(controller.signal)
          : adapter.search(normalized, controller.signal);
      void request
        .then((next) => {
          if (controller.signal.aborted) return;
          setCommands(next);
          setState(next.length === 0 ? "empty" : "ready");
        })
        .catch((searchError: unknown) => {
          if (controller.signal.aborted) return;
          setError(
            searchError instanceof Error ? searchError.message : "Search could not continue.",
          );
          setState("error");
        });
    }, debounceMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [adapter, currentQuery, debounceMs, minimumQueryLength, recentCommands, revision]);

  useEffect(
    () => () => {
      activeSearch.current?.abort();
      activeExecution.current?.abort();
    },
    [],
  );

  const retry = useCallback(() => setRevision((value) => value + 1), []);

  const execute = async (commandId: string) => {
    activeExecution.current?.abort();
    const controller = new AbortController();
    activeExecution.current = controller;
    try {
      await adapter.execute(commandId, controller.signal);
      setError("");
    } catch (executionError) {
      if (controller.signal.aborted) return;
      setError(
        executionError instanceof Error ? executionError.message : "The command could not run.",
      );
      setState("error");
    } finally {
      if (activeExecution.current === controller) activeExecution.current = null;
    }
  };

  return { commands, error, execute, query: currentQuery, retry, setQuery, state } as const;
}
