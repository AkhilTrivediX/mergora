// Generated from registry/source/components/toast/toast.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./toast.css";

import {
  forwardRef,
  useSyncExternalStore,
  type FocusEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

export type ToastTone = "information" | "success" | "warning" | "danger";
export type ToastPriority = "polite" | "urgent";

export interface ToastAction {
  /** Visible label for the native notification action button. */
  readonly label: string;
  /** Consumer-owned recovery or follow-up action. */
  readonly onAction: () => void;
  /** Whether successful activation also removes the notification; defaults to true. */
  readonly closeOnAction?: boolean;
}

export interface ToastMessage {
  /** Required notification heading content. */
  readonly title: ReactNode;
  /** Optional supporting notification content. */
  readonly description?: ReactNode;
  /** Visual and non-color status category; defaults to information. */
  readonly tone?: ToastTone;
  /** Live-region urgency; only urgent messages use alert semantics. */
  readonly priority?: ToastPriority;
  /** Prevents time-based dismissal. Persistent errors still need durable page context. */
  readonly persistent?: boolean;
  /** Optional native action rendered beside the dismissal control. */
  readonly action?: ToastAction;
}

export interface ToastAddOptions {
  /** Auto-dismiss timeout in milliseconds for non-persistent notifications. */
  readonly timeout?: number;
  /** Stable key that updates an existing queued notification instead of adding a duplicate. */
  readonly dedupeKey?: string;
  /** Called when the newly queued notification is removed or cleared. */
  readonly onClose?: () => void;
}

export interface QueuedToastMessage {
  /** Queue-generated stable identifier used for dismissal. */
  readonly key: string;
  /** Consumer-supplied notification content. */
  readonly content: ToastMessage;
}

interface InternalToast {
  readonly key: string;
  content: ToastMessage;
  readonly dedupeKey?: string;
  readonly onClose?: () => void;
  timeout: number | undefined;
  remaining: number | undefined;
  startedAt: number | undefined;
  timer: ReturnType<typeof setTimeout> | undefined;
}

interface ToastQueueSnapshot {
  /** Whether automatic dismissal timers are currently paused. */
  readonly paused: boolean;
  /** Number of records waiting outside the visible queue window. */
  readonly queuedCount: number;
  /** Immutable ordered view of every queued record. */
  readonly records: readonly QueuedToastMessage[];
  /** Immutable ordered records inside the current visible window. */
  readonly visible: readonly QueuedToastMessage[];
}

export interface ToastQueueOptions {
  /** Maximum simultaneously visible notifications, from one through eight. */
  readonly maxVisible?: number;
  /** Default non-persistent timeout in milliseconds. */
  readonly defaultTimeout?: number;
}

let queueSequence = 0;

function validateTimeout(value: number, name: string): number {
  if (!Number.isFinite(value) || value < 1_000 || value > 120_000) {
    throw new RangeError(`Mergora Toast ${name} must be from 1000 through 120000 milliseconds.`);
  }
  return value;
}

export class ToastQueue {
  readonly maxVisible: number;
  readonly defaultTimeout: number;
  private records: InternalToast[] = [];
  private listeners = new Set<() => void>();
  private paused = false;
  private snapshot: ToastQueueSnapshot;

  constructor({ defaultTimeout = 5_000, maxVisible = 3 }: ToastQueueOptions = {}) {
    if (!Number.isSafeInteger(maxVisible) || maxVisible < 1 || maxVisible > 8) {
      throw new RangeError("Mergora ToastQueue maxVisible must be an integer from 1 through 8.");
    }
    this.maxVisible = maxVisible;
    this.defaultTimeout = validateTimeout(defaultTimeout, "defaultTimeout");
    this.snapshot = this.createSnapshot();
  }

  private createSnapshot(): ToastQueueSnapshot {
    const publicRecords = this.records.map(({ content, key }) => Object.freeze({ content, key }));
    return Object.freeze({
      paused: this.paused,
      queuedCount: Math.max(0, publicRecords.length - this.maxVisible),
      records: Object.freeze(publicRecords),
      visible: Object.freeze(publicRecords.slice(0, this.maxVisible)),
    });
  }

  private emit(): void {
    this.snapshot = this.createSnapshot();
    for (const listener of this.listeners) listener();
  }

  private clearTimer(record: InternalToast): void {
    if (record.timer !== undefined) clearTimeout(record.timer);
    record.timer = undefined;
    record.startedAt = undefined;
  }

  private reconcileTimers(): void {
    const visibleKeys = new Set(this.records.slice(0, this.maxVisible).map((record) => record.key));
    for (const record of this.records) {
      if (!visibleKeys.has(record.key) || this.paused || record.content.persistent) {
        this.clearTimer(record);
        continue;
      }
      if (record.timer !== undefined) continue;
      const duration = record.remaining ?? record.timeout;
      if (duration === undefined) continue;
      record.remaining = duration;
      record.startedAt = Date.now();
      record.timer = setTimeout(() => this.close(record.key), duration);
    }
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): ToastQueueSnapshot => this.snapshot;

  getServerSnapshot = (): ToastQueueSnapshot => this.snapshot;

  add(content: ToastMessage, options: ToastAddOptions = {}): string {
    if (this.records.length >= 100) {
      throw new RangeError("Mergora ToastQueue cannot hold more than 100 notifications.");
    }
    if (options.dedupeKey !== undefined && options.dedupeKey.trim().length === 0) {
      throw new Error("Mergora Toast dedupeKey must be non-empty when provided.");
    }
    const actionLabel = content.action?.label;
    if (actionLabel !== undefined && actionLabel.trim().length === 0) {
      throw new Error("Mergora Toast action labels must be non-empty.");
    }
    if (options.dedupeKey !== undefined) {
      const existing = this.records.find((record) => record.dedupeKey === options.dedupeKey);
      if (existing !== undefined) {
        this.clearTimer(existing);
        existing.content = content;
        existing.timeout = content.persistent
          ? undefined
          : validateTimeout(options.timeout ?? this.defaultTimeout, "timeout");
        existing.remaining = existing.timeout;
        this.reconcileTimers();
        this.emit();
        return existing.key;
      }
    }
    const timeout = content.persistent
      ? undefined
      : validateTimeout(options.timeout ?? this.defaultTimeout, "timeout");
    const key = `mrg-toast-${++queueSequence}`;
    const record: InternalToast = {
      content,
      key,
      ...(options.dedupeKey === undefined ? {} : { dedupeKey: options.dedupeKey }),
      ...(options.onClose === undefined ? {} : { onClose: options.onClose }),
      remaining: timeout,
      startedAt: undefined,
      timer: undefined,
      timeout,
    };
    const firstNormal = this.records.findIndex(
      (item) => (item.content.priority ?? "polite") !== "urgent",
    );
    if ((content.priority ?? "polite") === "urgent" && firstNormal >= 0) {
      this.records.splice(firstNormal, 0, record);
    } else {
      this.records.push(record);
    }
    this.reconcileTimers();
    this.emit();
    return key;
  }

  close(key: string): void {
    const index = this.records.findIndex((record) => record.key === key);
    if (index < 0) return;
    const [record] = this.records.splice(index, 1);
    if (record === undefined) return;
    this.clearTimer(record);
    record.onClose?.();
    this.reconcileTimers();
    this.emit();
  }

  clear(): void {
    const records = [...this.records];
    this.records = [];
    for (const record of records) {
      this.clearTimer(record);
      record.onClose?.();
    }
    this.emit();
  }

  pauseAll(): void {
    if (this.paused) return;
    this.paused = true;
    const now = Date.now();
    for (const record of this.records.slice(0, this.maxVisible)) {
      if (record.startedAt !== undefined && record.remaining !== undefined) {
        record.remaining = Math.max(250, record.remaining - (now - record.startedAt));
      }
      this.clearTimer(record);
    }
    this.emit();
  }

  resumeAll(): void {
    if (!this.paused) return;
    this.paused = false;
    this.reconcileTimers();
    this.emit();
  }
}

export function createToastQueue(options?: ToastQueueOptions): ToastQueue {
  return new ToastQueue(options);
}

export interface ToastRegionProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Observable queue whose visible records and timers this region presents. */
  readonly queue: ToastQueue;
  /** Accessible name applied to the notification region. */
  readonly label?: string;
  /** Produces the accessible dismissal name for each visible notification. */
  readonly closeLabel?: (toast: QueuedToastMessage) => string;
  /** Exposes how many notifications are waiting outside the visible queue window. */
  readonly showQueueSummary?: boolean;
  /** Formats the polite summary for records waiting outside the visible window. */
  readonly queueSummaryLabel?: (count: number) => string;
  /** Adds an explicit timer pause/resume control in addition to automatic hover/focus pause. */
  readonly pauseControls?: boolean;
  /** Visible label for the optional action that pauses notification timers. */
  readonly pauseLabel?: string;
  /** Visible label for the optional action that resumes notification timers. */
  readonly resumeLabel?: string;
}

export const ToastRegion = forwardRef<HTMLElement, ToastRegionProps>(function ToastRegion(
  {
    className,
    closeLabel = () => "Dismiss notification",
    label = "Notifications",
    pauseControls = false,
    pauseLabel = "Pause notification timers",
    queue,
    queueSummaryLabel = (count) =>
      `${count} ${count === 1 ? "notification" : "notifications"} waiting`,
    resumeLabel = "Resume notification timers",
    showQueueSummary = false,
    ...nativeProps
  },
  ref,
) {
  if (label.trim().length === 0) throw new Error("Mergora ToastRegion requires a non-empty label.");
  const snapshot = useSyncExternalStore(
    queue.subscribe,
    queue.getSnapshot,
    queue.getServerSnapshot,
  );
  if (snapshot.records.length === 0) return null;

  const handleBlur = (event: FocusEvent<HTMLElement>): void => {
    const next = event.relatedTarget;
    if (!(next instanceof Node) || !event.currentTarget.contains(next)) queue.resumeAll();
  };

  return (
    <section
      {...nativeProps}
      ref={ref}
      aria-label={label}
      className={className === undefined ? "mrg-toast-region" : `mrg-toast-region ${className}`}
      data-paused={snapshot.paused || undefined}
      data-slot="toast-region"
      onBlurCapture={handleBlur}
      onFocusCapture={() => queue.pauseAll()}
      onPointerEnter={() => queue.pauseAll()}
      onPointerLeave={() => queue.resumeAll()}
    >
      <ol className="mrg-toast-region__list" data-slot="toast-list">
        {snapshot.visible.map((toast) => {
          const tone = toast.content.tone ?? "information";
          const urgent = (toast.content.priority ?? "polite") === "urgent";
          return (
            <li
              className="mrg-toast"
              data-priority={urgent ? "urgent" : "polite"}
              data-slot="toast"
              data-tone={tone}
              key={toast.key}
              onKeyDown={(event) => {
                if (event.key === "Escape" && !event.nativeEvent.isComposing) {
                  event.stopPropagation();
                  queue.close(toast.key);
                }
              }}
            >
              <div
                aria-atomic="true"
                className="mrg-toast__message"
                data-slot="toast-message"
                role={urgent ? "alert" : "status"}
              >
                <strong data-slot="toast-title">{toast.content.title}</strong>
                {toast.content.description === undefined ? null : (
                  <span data-slot="toast-description">{toast.content.description}</span>
                )}
              </div>
              <div className="mrg-toast__actions" data-slot="toast-actions">
                {toast.content.action === undefined ? null : (
                  <button
                    data-slot="toast-action"
                    onClick={() => {
                      toast.content.action?.onAction();
                      if (toast.content.action?.closeOnAction !== false) queue.close(toast.key);
                    }}
                    type="button"
                  >
                    {toast.content.action.label}
                  </button>
                )}
                <button
                  aria-label={closeLabel(toast)}
                  data-slot="toast-close"
                  onClick={() => queue.close(toast.key)}
                  type="button"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {showQueueSummary && snapshot.queuedCount > 0 ? (
        <output
          aria-live="polite"
          className="mrg-toast-region__summary"
          data-slot="toast-queue-summary"
        >
          {queueSummaryLabel(snapshot.queuedCount)}
        </output>
      ) : null}
      {pauseControls ? (
        <button
          aria-pressed={snapshot.paused}
          className="mrg-toast-region__pause"
          data-slot="toast-pause-control"
          onClick={() => (snapshot.paused ? queue.resumeAll() : queue.pauseAll())}
          type="button"
        >
          {snapshot.paused ? resumeLabel : pauseLabel}
        </button>
      ) : null}
    </section>
  );
});

ToastRegion.displayName = "ToastRegion";

export const Toast = Object.freeze({ Region: ToastRegion });
