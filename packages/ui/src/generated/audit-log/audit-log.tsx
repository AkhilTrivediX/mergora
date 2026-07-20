// Generated from registry/source/components/audit-log/audit-log.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./audit-log.css";

import { forwardRef, useMemo, useState, type HTMLAttributes, type UIEvent } from "react";

export interface AuditLogEvent {
  /** Human-readable action performed in this audit event. */
  readonly action: string;
  /** Human-readable person or system responsible for the event. */
  readonly actor: string;
  /** Optional plain-text event detail included in filtering and export. */
  readonly details?: string;
  /** Stable unique event identifier used for rendering identity. */
  readonly id: string;
  /** Human-readable resource or subject affected by the action. */
  readonly object: string;
  /** Valid event instant rendered locally and exported canonically as ISO text. */
  readonly timestamp: Date | string;
}

export interface AuditLogFilterOptions {
  /** Localized visible label for the action selection control. */
  readonly actionLabel?: string;
  /** Localized option label that removes action filtering. */
  readonly allActionsLabel?: string;
  /** Localized visible label for the full-text search control. */
  readonly searchLabel?: string;
}

export interface AuditLogVirtualization {
  /** Positive fixed estimated event block size in CSS pixels. */
  readonly estimateSize: number;
  /** Additional event count rendered before and after the visible window. */
  readonly overscan?: number;
  /** Positive scroll viewport height in CSS pixels. */
  readonly viewportHeight: number;
}

export interface AuditLogExportDetail {
  /** Formula-safe RFC-style CSV text for the currently filtered event collection. */
  readonly csv: string;
  /** Exact immutable filtered events represented by the CSV payload. */
  readonly events: readonly AuditLogEvent[];
  /** Consumer-facing filename suggestion; no download or filesystem write is performed. */
  readonly suggestedFilename: string;
}

export interface AuditLogExportOptions {
  /** Optional filename suggestion, defaulting to `audit-log.csv`. */
  readonly filename?: string;
  /** Receives safe CSV and events; network, download, storage, and authorization remain consumer-owned. */
  readonly onExport: (detail: AuditLogExportDetail) => void;
}

export interface AuditLogProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Localized empty-result recovery copy. */
  readonly emptyContent?: string;
  /** Immutable audit records with valid timestamps and stable identifiers. */
  readonly events: readonly AuditLogEvent[];
  /** Adds safe CSV export callback UI; false removes export generation and events. */
  readonly exportCsv?: false | AuditLogExportOptions;
  /** Adds local search, action filtering, and result count; false removes their UI and state. */
  readonly filtering?: false | AuditLogFilterOptions;
  /** Required accessible name for the audit-log region. */
  readonly label: string;
  /** Locale used for filtering normalization, action sorting, and timestamp formatting. */
  readonly locale?: string;
  /** Enables bounded event rendering; false renders every filtered event without virtual semantics. */
  readonly virtualization?: false | AuditLogVirtualization;
}

function eventDate(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new RangeError("Mergora AuditLog timestamps must be valid dates.");
  }
  return date;
}

export function safeAuditCsvCell(value: string): string {
  const normalized = value.replaceAll("\0", "");
  const protectedValue = /^\s*[=+@-]/u.test(normalized) ? `'${normalized}` : normalized;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function createAuditLogCsv(events: readonly AuditLogEvent[]): string {
  const header = ["Actor", "Action", "Object", "Timestamp", "Details"]
    .map(safeAuditCsvCell)
    .join(",");
  const rows = events.map((event) =>
    [
      event.actor,
      event.action,
      event.object,
      eventDate(event.timestamp).toISOString(),
      event.details ?? "",
    ]
      .map(safeAuditCsvCell)
      .join(","),
  );
  return [header, ...rows].join("\r\n");
}

export const AuditLog = forwardRef<HTMLDivElement, AuditLogProps>(function AuditLog(
  {
    className,
    emptyContent = "No audit events match the current view.",
    events,
    exportCsv = false,
    filtering = false,
    label,
    locale,
    virtualization = false,
    ...props
  },
  ref,
) {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const filtered = useMemo(() => {
    if (filtering === false) return events;
    const query = search.trim().toLocaleLowerCase(locale);
    return events.filter(
      (event) =>
        (action === "" || event.action === action) &&
        (query === "" ||
          `${event.actor} ${event.action} ${event.object} ${event.details ?? ""}`
            .toLocaleLowerCase(locale)
            .includes(query)),
    );
  }, [action, events, filtering, locale, search]);
  const actions = useMemo(
    () =>
      [...new Set(events.map((event) => event.action))].sort((a, b) => a.localeCompare(b, locale)),
    [events, locale],
  );
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  const virtual = useMemo(() => {
    if (virtualization === false) return { end: filtered.length, start: 0, total: 0 };
    if (
      virtualization.estimateSize <= 0 ||
      virtualization.viewportHeight <= 0 ||
      !Number.isFinite(virtualization.estimateSize) ||
      !Number.isFinite(virtualization.viewportHeight)
    ) {
      throw new RangeError("Mergora AuditLog virtualization sizes must be positive numbers.");
    }
    const overscan = virtualization.overscan ?? 3;
    const start = Math.max(0, Math.floor(scrollTop / virtualization.estimateSize) - overscan);
    const visible = Math.ceil(virtualization.viewportHeight / virtualization.estimateSize);
    return {
      end: Math.min(filtered.length, start + visible + overscan * 2),
      start,
      total: filtered.length * virtualization.estimateSize,
    };
  }, [filtered.length, scrollTop, virtualization]);

  return (
    <div
      {...props}
      aria-label={label}
      className={className === undefined ? "mrg-audit-log" : `mrg-audit-log ${className}`}
      data-slot="audit-log"
      ref={ref}
      role="region"
    >
      {filtering === false ? null : (
        <form data-slot="audit-log-filters" onSubmit={(event) => event.preventDefault()}>
          <label>
            <span>{filtering.searchLabel ?? "Search audit log"}</span>
            <input
              onChange={(event) => setSearch(event.currentTarget.value)}
              type="search"
              value={search}
            />
          </label>
          <label>
            <span>{filtering.actionLabel ?? "Action"}</span>
            <select onChange={(event) => setAction(event.currentTarget.value)} value={action}>
              <option value="">{filtering.allActionsLabel ?? "All actions"}</option>
              {actions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <output>{filtered.length} matching events</output>
        </form>
      )}
      <div
        data-slot="audit-log-viewport"
        onScroll={(event: UIEvent<HTMLDivElement>) => setScrollTop(event.currentTarget.scrollTop)}
        style={
          virtualization === false
            ? undefined
            : { blockSize: virtualization.viewportHeight, overflowY: "auto" }
        }
        tabIndex={virtualization === false ? undefined : 0}
      >
        {filtered.length === 0 ? (
          <p data-slot="audit-log-empty">{emptyContent}</p>
        ) : (
          <ol data-slot="audit-log-events" style={{ blockSize: virtual.total || undefined }}>
            {filtered.slice(virtual.start, virtual.end).map((event, visibleIndex) => {
              const index = virtual.start + visibleIndex;
              const date = eventDate(event.timestamp);
              return (
                <li
                  aria-posinset={virtualization === false ? undefined : index + 1}
                  aria-setsize={virtualization === false ? undefined : filtered.length}
                  key={event.id}
                  style={
                    virtualization === false
                      ? undefined
                      : {
                          blockSize: virtualization.estimateSize,
                          insetBlockStart: index * virtualization.estimateSize,
                          position: "absolute",
                        }
                  }
                >
                  <dl>
                    <div>
                      <dt>Actor</dt>
                      <dd>{event.actor}</dd>
                    </div>
                    <div>
                      <dt>Action</dt>
                      <dd>{event.action}</dd>
                    </div>
                    <div>
                      <dt>Object</dt>
                      <dd>{event.object}</dd>
                    </div>
                    <div>
                      <dt>Time</dt>
                      <dd>
                        <time dateTime={date.toISOString()}>{formatter.format(date)}</time>
                      </dd>
                    </div>
                  </dl>
                  {event.details === undefined ? null : <p>{event.details}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </div>
      {exportCsv === false ? null : (
        <button
          data-slot="audit-log-export"
          onClick={() =>
            exportCsv.onExport({
              csv: createAuditLogCsv(filtered),
              events: filtered,
              suggestedFilename: exportCsv.filename ?? "audit-log.csv",
            })
          }
          type="button"
        >
          Export {filtered.length} events as CSV
        </button>
      )}
    </div>
  );
});

AuditLog.displayName = "AuditLog";
