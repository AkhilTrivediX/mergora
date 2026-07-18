// Generated from registry/source/components/sr-announcer/sr-announcer.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactElement,
} from "react";

import { useMergoraContext } from "../provider/index.js";
import "./sr-announcer.css";

export type AnnouncementPriority = "polite" | "assertive";

export interface AnnouncementMessage {
  readonly key?: string;
  readonly defaultMessage: string;
}

export interface AnnouncementOptions {
  readonly priority?: AnnouncementPriority;
  /** Identical messages are ignored within the provider's dedupe window by default. */
  readonly dedupe?: boolean;
  /** Stable semantic identity when localized text can vary. */
  readonly dedupeKey?: string;
}

export interface AnnouncementRecord {
  readonly id: number;
  readonly message: string;
  readonly priority: AnnouncementPriority;
  readonly dedupeKey: string;
}

export interface AnnouncementQueue {
  readonly enqueue: (message: string, options?: AnnouncementOptions) => AnnouncementRecord | null;
  readonly take: (priority: AnnouncementPriority) => AnnouncementRecord | null;
  readonly has: (priority: AnnouncementPriority) => boolean;
  readonly clear: () => void;
}

export function createAnnouncementQueue(
  dedupeWindowMs = 1_000,
  now: () => number = Date.now,
): AnnouncementQueue {
  const queued: Record<AnnouncementPriority, AnnouncementRecord[]> = {
    polite: [],
    assertive: [],
  };
  const seen = new Map<string, number>();
  let sequence = 0;

  return {
    enqueue(message, options = {}) {
      const normalized = message.trim();
      if (normalized.length === 0) return null;
      const priority = options.priority ?? "polite";
      const dedupeKey = options.dedupeKey ?? `${priority}:${normalized}`;
      const timestamp = now();
      for (const [key, seenAt] of seen) {
        if (timestamp - seenAt >= dedupeWindowMs) seen.delete(key);
      }
      const prior = seen.get(dedupeKey);
      if (options.dedupe !== false && prior !== undefined && timestamp - prior < dedupeWindowMs) {
        return null;
      }
      seen.set(dedupeKey, timestamp);
      const record = { id: ++sequence, message: normalized, priority, dedupeKey } as const;
      queued[priority].push(record);
      return record;
    },
    take(priority) {
      return queued[priority].shift() ?? null;
    },
    has(priority) {
      return queued[priority].length > 0;
    },
    clear() {
      queued.polite.length = 0;
      queued.assertive.length = 0;
      seen.clear();
    },
  };
}

export interface AnnouncerApi {
  readonly announce: (
    message: string | AnnouncementMessage,
    options?: AnnouncementOptions,
  ) => boolean;
  readonly clear: () => void;
}

const inertApi: AnnouncerApi = {
  announce: () => false,
  clear: () => undefined,
};

const AnnouncerContext = createContext<AnnouncerApi>(inertApi);

export interface AnnouncerProviderProps extends PropsWithChildren {
  readonly dedupeWindowMs?: number;
  readonly politeIntervalMs?: number;
  readonly assertiveIntervalMs?: number;
}

export function AnnouncerProvider({
  assertiveIntervalMs = 100,
  children,
  dedupeWindowMs = 1_000,
  politeIntervalMs = 500,
}: AnnouncerProviderProps): ReactElement {
  const parentAnnouncer = useContext(AnnouncerContext);
  const mergora = useMergoraContext();
  const queue = useMemo(() => createAnnouncementQueue(dedupeWindowMs), [dedupeWindowMs]);
  const [polite, setPolite] = useState<AnnouncementRecord | null>(null);
  const [assertive, setAssertive] = useState<AnnouncementRecord | null>(null);
  const timers = useRef<Partial<Record<AnnouncementPriority, ReturnType<typeof setTimeout>>>>({});

  const pump = useCallback(
    (priority: AnnouncementPriority) => {
      if (timers.current[priority] !== undefined) return;
      const setCurrent = priority === "polite" ? setPolite : setAssertive;
      setCurrent(null);
      timers.current[priority] = setTimeout(
        function deliver() {
          const next = queue.take(priority);
          setCurrent(next);
          delete timers.current[priority];
          if (queue.has(priority)) pump(priority);
        },
        priority === "polite" ? politeIntervalMs : assertiveIntervalMs,
      );
    },
    [assertiveIntervalMs, politeIntervalMs, queue],
  );

  useEffect(
    () => () => {
      for (const timer of Object.values(timers.current)) {
        if (timer !== undefined) clearTimeout(timer);
      }
      queue.clear();
    },
    [queue],
  );

  const api = useMemo<AnnouncerApi>(
    () => ({
      announce(message, options) {
        const resolved =
          typeof message === "string"
            ? message
            : mergora.getMessage(message.key ?? "", message.defaultMessage);
        const descriptorKey = typeof message === "string" ? undefined : message.key;
        const dedupeKey = options?.dedupeKey ?? descriptorKey;
        const resolvedOptions: AnnouncementOptions =
          dedupeKey === undefined ? { ...options } : { ...options, dedupeKey };
        const record = queue.enqueue(resolved, resolvedOptions);
        if (record === null) return false;
        pump(record.priority);
        return true;
      },
      clear() {
        for (const priority of ["polite", "assertive"] as const) {
          const timer = timers.current[priority];
          if (timer !== undefined) clearTimeout(timer);
          delete timers.current[priority];
        }
        queue.clear();
        setPolite(null);
        setAssertive(null);
      },
    }),
    [mergora, pump, queue],
  );

  if (parentAnnouncer !== inertApi) return <>{children}</>;

  return (
    <AnnouncerContext.Provider value={api}>
      {children}
      <div
        role="status"
        aria-atomic="true"
        aria-live="polite"
        aria-relevant="additions text"
        className="mrg-sr-announcer"
        data-announcement-id={polite?.id}
        data-announcement-key={polite?.dedupeKey}
        data-slot="sr-announcer-polite"
      >
        {polite?.message}
      </div>
      <div
        role="alert"
        aria-atomic="true"
        aria-live="assertive"
        aria-relevant="additions text"
        className="mrg-sr-announcer"
        data-announcement-id={assertive?.id}
        data-announcement-key={assertive?.dedupeKey}
        data-slot="sr-announcer-assertive"
      >
        {assertive?.message}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerApi {
  return useContext(AnnouncerContext);
}

export const ScreenReaderAnnouncer = {
  Provider: AnnouncerProvider,
} as const;
