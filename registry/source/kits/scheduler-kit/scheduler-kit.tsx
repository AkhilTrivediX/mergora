"use client";

import "./scheduler-kit.css";

import {
  forwardRef,
  useId,
  useMemo,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../../components/button/button.js";
import { Calendar } from "../../components/calendar/calendar.js";
import {
  type SchedulerAdapter,
  type SchedulerEvent,
  type SchedulerSnapshot,
} from "./scheduler-kit-adapter.js";
import { useScheduler } from "./scheduler-kit-state.js";

const FIXTURE_EPOCH_DATE = "1970-01-01";

export type SchedulerView = "agenda" | "calendar";

export interface SchedulerKitProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Consumer scheduling adapter that owns storage, timezone resolution, and authorization. */
  readonly adapter: SchedulerAdapter;
  /** Adds polite mutation feedback; false removes the live region and change announcements. */
  readonly announceChanges?: boolean;
  /** Initial local date in `YYYY-MM-DD` form for uncontrolled selection. */
  readonly defaultSelectedDate?: string;
  /** Initial IANA timezone identifier for uncontrolled display and editing. */
  readonly defaultTimeZone?: string;
  /** Initial agenda or calendar presentation for uncontrolled view selection. */
  readonly defaultView?: SchedulerView;
  /** Initial calendar visibility filter for uncontrolled use. */
  readonly defaultVisibleCalendarIds?: readonly string[];
  /** Disables date, filter, view, edit, and mutation controls while preserving schedule context. */
  readonly disabled?: boolean;
  /** Optional server-provided snapshot that bypasses the initial adapter load. */
  readonly initialSnapshot?: SchedulerSnapshot;
  /** Accessible and visible workspace name, defaulting to `Scheduler`. */
  readonly label?: ReactNode;
  /** Prevents adapter requests and presents explicit offline recovery context. */
  readonly offline?: boolean;
  /** Reports controlled or uncontrolled selected-date changes. */
  readonly onSelectedDateChange?: (date: string) => void;
  /** Reports controlled or uncontrolled timezone changes. */
  readonly onTimeZoneChange?: (timeZone: string) => void;
  /** Reports controlled or uncontrolled agenda/calendar presentation changes. */
  readonly onViewChange?: (view: SchedulerView) => void;
  /** Reports controlled or uncontrolled calendar visibility filter changes. */
  readonly onVisibleCalendarIdsChange?: (ids: readonly string[]) => void;
  /** Prevents schedule mutations while retaining date, view, and event review. */
  readonly readOnly?: boolean;
  /** Controlled selected local date; omit `defaultSelectedDate` when supplied. */
  readonly selectedDate?: string;
  /** Adds conflict explanations and supported resolution actions; false removes that recovery UI. */
  readonly showConflictGuidance?: boolean;
  /** Adds a computed draft duration summary; false removes its output and calculation display. */
  readonly showDurationSummary?: boolean;
  /** Adds selected timezone context near schedule times; false removes that explanatory output. */
  readonly showTimeZoneContext?: boolean;
  /** Controlled selected IANA timezone identifier; omit `defaultTimeZone` when supplied. */
  readonly timeZone?: string;
  /** Non-empty unique IANA timezone choices offered by the workspace. */
  readonly timeZones?: readonly string[];
  /** Controlled agenda or calendar presentation; use with `onViewChange`. */
  readonly view?: SchedulerView;
  /** Controlled visible calendar identifiers; omit uncontrolled defaults when supplied. */
  readonly visibleCalendarIds?: readonly string[];
}

interface LocalParts {
  readonly date: string;
  readonly time: string;
}

function localParts(value: string, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${read("year")}-${read("month")}-${read("day")}`,
    time: `${read("hour").replace("24", "00")}:${read("minute")}`,
  };
}

function formatEventTime(event: SchedulerEvent, timeZone: string): string {
  const formatter = new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  });
  return `${formatter.format(new Date(event.start))} – ${formatter.format(new Date(event.end))}`;
}

function durationMinutes(start: string, end: string): number | null {
  if (!/^\d{2}:\d{2}$/u.test(start) || !/^\d{2}:\d{2}$/u.test(end) || end <= start) return null;
  const toMinutes = (value: string) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
  return toMinutes(end) - toMinutes(start);
}

export const SchedulerKit = forwardRef<HTMLDivElement, SchedulerKitProps>(function SchedulerKit(
  {
    adapter,
    announceChanges = false,
    className,
    defaultSelectedDate = FIXTURE_EPOCH_DATE,
    defaultTimeZone = "UTC",
    defaultView = "calendar",
    defaultVisibleCalendarIds,
    disabled = false,
    initialSnapshot,
    label = "Scheduler",
    offline = false,
    onSelectedDateChange,
    onTimeZoneChange,
    onViewChange,
    onVisibleCalendarIdsChange,
    readOnly = false,
    selectedDate,
    showConflictGuidance = false,
    showDurationSummary = false,
    showTimeZoneContext = false,
    timeZone,
    timeZones = ["UTC"],
    view,
    visibleCalendarIds,
    ...props
  },
  ref,
) {
  if (timeZones.length === 0 || new Set(timeZones).size !== timeZones.length) {
    throw new Error("Mergora SchedulerKit timeZones must be non-empty and unique.");
  }
  if (selectedDate !== undefined && defaultSelectedDate !== FIXTURE_EPOCH_DATE) {
    throw new Error(
      "Mergora SchedulerKit controlled date cannot be combined with defaultSelectedDate.",
    );
  }
  if (timeZone !== undefined && defaultTimeZone !== "UTC") {
    throw new Error(
      "Mergora SchedulerKit controlled timeZone cannot be combined with defaultTimeZone.",
    );
  }
  if (visibleCalendarIds !== undefined && defaultVisibleCalendarIds !== undefined) {
    throw new Error(
      "Mergora SchedulerKit controlled calendar filters cannot be combined with defaults.",
    );
  }
  const scheduler = useScheduler({
    adapter,
    ...(initialSnapshot === undefined ? {} : { initialSnapshot }),
    offline,
  });
  const generatedId = useId().replaceAll(":", "");
  const [localDate, setLocalDate] = useState(defaultSelectedDate);
  const [localTimeZone, setLocalTimeZone] = useState(defaultTimeZone);
  const [localView, setLocalView] = useState(defaultView);
  const [localVisibleIds, setLocalVisibleIds] = useState<readonly string[] | null>(
    defaultVisibleCalendarIds ?? null,
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftTimes, setDraftTimes] = useState({ end: "10:00", start: "09:00" });
  const resolvedDate = selectedDate ?? localDate;
  const resolvedTimeZone = timeZone ?? localTimeZone;
  const resolvedView = view ?? localView;
  const allCalendarIds = scheduler.snapshot?.calendars.map((calendar) => calendar.id) ?? [];
  const resolvedVisibleIds = visibleCalendarIds ?? localVisibleIds ?? allCalendarIds;
  const visibleSet = useMemo(() => new Set(resolvedVisibleIds), [resolvedVisibleIds]);
  const visibleEvents = useMemo(
    () =>
      (scheduler.snapshot?.events ?? [])
        .filter(
          (event) =>
            visibleSet.has(event.calendarId) &&
            localParts(event.start, resolvedTimeZone).date === resolvedDate,
        )
        .sort((left, right) => left.start.localeCompare(right.start)),
    [resolvedDate, resolvedTimeZone, scheduler.snapshot?.events, visibleSet],
  );
  const editingEvent = scheduler.snapshot?.events.find((event) => event.id === editingId);
  const duration = durationMinutes(draftTimes.start, draftTimes.end);
  const busy = scheduler.mutationState === "pending";

  const setDate = (next: string): void => {
    if (disabled) return;
    if (selectedDate === undefined) setLocalDate(next);
    onSelectedDateChange?.(next);
  };
  const setZone = (next: string): void => {
    if (disabled) return;
    if (timeZone === undefined) setLocalTimeZone(next);
    onTimeZoneChange?.(next);
  };
  const setPresentation = (next: SchedulerView): void => {
    if (disabled) return;
    if (view === undefined) setLocalView(next);
    onViewChange?.(next);
  };
  const toggleCalendar = (id: string): void => {
    if (disabled) return;
    const next = visibleSet.has(id)
      ? resolvedVisibleIds.filter((candidate) => candidate !== id)
      : [...resolvedVisibleIds, id];
    if (visibleCalendarIds === undefined) setLocalVisibleIds(next);
    onVisibleCalendarIdsChange?.(next);
  };

  if (scheduler.snapshot === null) {
    return (
      <div
        {...props}
        aria-busy={scheduler.state === "loading" || undefined}
        className={className === undefined ? "mrg-scheduler-kit" : `mrg-scheduler-kit ${className}`}
        data-maturity="beta"
        data-slot="scheduler-kit"
        ref={ref}
      >
        <h1>{label}</h1>
        {scheduler.state === "loading" ? <p role="status">Loading schedule…</p> : null}
        {scheduler.state === "offline" ? (
          <div role="alert">The schedule is unavailable while offline.</div>
        ) : null}
        {scheduler.state === "error" ? (
          <div role="alert">
            <p>{scheduler.error}</p>
            <Button onClick={() => void scheduler.reload()} variant="secondary">
              Retry loading
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  const draftEventParts =
    editingEvent === undefined ? null : localParts(editingEvent.start, resolvedTimeZone);
  const draftEventEnd =
    editingEvent === undefined ? null : localParts(editingEvent.end, resolvedTimeZone);

  return (
    <div
      {...props}
      aria-busy={busy || undefined}
      className={className === undefined ? "mrg-scheduler-kit" : `mrg-scheduler-kit ${className}`}
      data-maturity="beta"
      data-offline={scheduler.state === "offline" || undefined}
      data-slot="scheduler-kit"
      ref={ref}
    >
      <header data-slot="scheduler-header">
        <div>
          <span data-slot="scheduler-maturity">Beta</span>
          <h1>{label}</h1>
          <p>Calendar and agenda views share one explicit time-zone boundary.</p>
        </div>
        <div aria-label="Schedule presentation" data-slot="scheduler-view" role="group">
          <Button
            aria-pressed={resolvedView === "calendar"}
            disabled={disabled}
            onClick={() => setPresentation("calendar")}
            variant="secondary"
          >
            Calendar
          </Button>
          <Button
            aria-pressed={resolvedView === "agenda"}
            disabled={disabled}
            onClick={() => setPresentation("agenda")}
            variant="secondary"
          >
            Agenda
          </Button>
        </div>
      </header>

      {scheduler.state === "offline" ? (
        <div data-slot="scheduler-offline" role="alert">
          Offline: cached events remain visible; editing is unavailable.
        </div>
      ) : null}
      {scheduler.mutationState === "error" ? (
        <div data-slot="scheduler-error" role="alert">
          {scheduler.mutationError}
        </div>
      ) : null}

      <aside data-slot="scheduler-filters">
        <fieldset>
          <legend>Calendars</legend>
          {scheduler.snapshot.calendars.map((calendar) => (
            <label key={calendar.id}>
              <input
                checked={visibleSet.has(calendar.id)}
                disabled={disabled}
                onChange={() => toggleCalendar(calendar.id)}
                type="checkbox"
              />
              <span aria-hidden="true" data-slot="scheduler-calendar-mark" />
              {calendar.label}
            </label>
          ))}
        </fieldset>
        <label htmlFor={`${generatedId}-timezone`}>Time zone</label>
        <select
          disabled={disabled}
          id={`${generatedId}-timezone`}
          onChange={(event) => setZone(event.currentTarget.value)}
          value={resolvedTimeZone}
        >
          {timeZones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        {showTimeZoneContext ? (
          <aside data-slot="scheduler-timezone-context">
            <strong>Time-zone context</strong>
            <p>
              Times are shown in {resolvedTimeZone}. The adapter owns conversion from wall time to
              an instant.
            </p>
          </aside>
        ) : null}
      </aside>

      <main data-slot="scheduler-main" data-view={resolvedView}>
        <section data-slot="scheduler-calendar-panel">
          <Calendar
            aria-label="Event date"
            disabled={disabled}
            inputLabel="Selected schedule date"
            onValueChange={setDate}
            readOnly={readOnly}
            value={resolvedDate}
          />
        </section>
        <section aria-labelledby={`${generatedId}-agenda`} data-slot="scheduler-agenda">
          <div data-slot="scheduler-section-heading">
            <div>
              <h2 id={`${generatedId}-agenda`}>Agenda</h2>
              <p>{resolvedDate}</p>
            </div>
            <Button
              disabled={disabled || readOnly || offline}
              onClick={() => setEditingId(null)}
              variant="secondary"
            >
              New event
            </Button>
          </div>
          {visibleEvents.length === 0 ? (
            <div data-slot="scheduler-empty">
              <h3>No events on this date</h3>
              <p>Adjust calendar filters or create an event.</p>
            </div>
          ) : (
            <ol>
              {visibleEvents.map((event) => (
                <li key={event.id}>
                  <button
                    aria-pressed={editingId === event.id}
                    disabled={disabled}
                    onClick={() => {
                      const start = localParts(event.start, resolvedTimeZone);
                      const end = localParts(event.end, resolvedTimeZone);
                      setDraftTimes({ end: end.time, start: start.time });
                      setEditingId(event.id);
                    }}
                    type="button"
                  >
                    <span aria-hidden="true" data-slot="scheduler-event-mark" />
                    <span>
                      <strong>{event.title}</strong>
                      <span>{formatEventTime(event, resolvedTimeZone)}</span>
                      {event.location === undefined ? null : <span>{event.location}</span>}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section aria-labelledby={`${generatedId}-editor`} data-slot="scheduler-editor">
          <h2 id={`${generatedId}-editor`}>
            {editingEvent === undefined ? "Create event" : "Edit event"}
          </h2>
          <form
            key={editingEvent?.id ?? "new"}
            onReset={(event) => {
              if (readOnly) {
                event.preventDefault();
                return;
              }
              setEditingId(null);
              setDraftTimes({ end: "10:00", start: "09:00" });
            }}
            onSubmit={(event: FormEvent<HTMLFormElement>) => {
              event.preventDefault();
              const data = new FormData(event.currentTarget);
              const title = data.get("title");
              const date = data.get("date");
              const startTime = data.get("startTime");
              const endTime = data.get("endTime");
              const calendarId = data.get("calendarId");
              const location = data.get("location");
              const description = data.get("description");
              if (
                typeof title !== "string" ||
                typeof date !== "string" ||
                typeof startTime !== "string" ||
                typeof endTime !== "string" ||
                typeof calendarId !== "string"
              )
                return;
              void scheduler
                .save({
                  calendarId,
                  date,
                  ...(typeof description === "string" && description.trim() !== ""
                    ? { description }
                    : {}),
                  endTime,
                  ...(editingEvent === undefined ? {} : { id: editingEvent.id }),
                  ...(typeof location === "string" && location.trim() !== "" ? { location } : {}),
                  startTime,
                  timeZone: resolvedTimeZone,
                  title,
                })
                .then((saved) => {
                  if (saved) setEditingId(null);
                });
            }}
          >
            <label htmlFor={`${generatedId}-title`}>Title</label>
            <input
              defaultValue={editingEvent?.title ?? ""}
              disabled={disabled}
              id={`${generatedId}-title`}
              maxLength={160}
              name="title"
              readOnly={readOnly}
              required
            />
            <label htmlFor={`${generatedId}-date`}>Date</label>
            <input
              defaultValue={draftEventParts?.date ?? resolvedDate}
              disabled={disabled}
              id={`${generatedId}-date`}
              name="date"
              readOnly={readOnly}
              required
              type="date"
            />
            <div data-slot="scheduler-time-fields">
              <label>
                Start
                <input
                  defaultValue={draftEventParts?.time ?? draftTimes.start}
                  disabled={disabled}
                  name="startTime"
                  onChange={(event) =>
                    setDraftTimes((current) => ({ ...current, start: event.currentTarget.value }))
                  }
                  readOnly={readOnly}
                  required
                  type="time"
                />
              </label>
              <label>
                End
                <input
                  defaultValue={draftEventEnd?.time ?? draftTimes.end}
                  disabled={disabled}
                  name="endTime"
                  onChange={(event) =>
                    setDraftTimes((current) => ({ ...current, end: event.currentTarget.value }))
                  }
                  readOnly={readOnly}
                  required
                  type="time"
                />
              </label>
            </div>
            {showDurationSummary ? (
              <output data-slot="scheduler-duration">
                {duration === null ? "Choose an end time after the start." : `${duration} minutes`}
              </output>
            ) : null}
            <label htmlFor={`${generatedId}-calendar`}>Calendar</label>
            <select
              defaultValue={editingEvent?.calendarId ?? scheduler.snapshot.calendars[0]?.id}
              disabled={disabled || readOnly}
              id={`${generatedId}-calendar`}
              name="calendarId"
              required
            >
              {scheduler.snapshot.calendars.map((calendar) => (
                <option key={calendar.id} value={calendar.id}>
                  {calendar.label}
                </option>
              ))}
            </select>
            <label htmlFor={`${generatedId}-location`}>Location (optional)</label>
            <input
              defaultValue={editingEvent?.location ?? ""}
              disabled={disabled}
              id={`${generatedId}-location`}
              name="location"
              readOnly={readOnly}
            />
            <label htmlFor={`${generatedId}-description`}>Description (optional)</label>
            <textarea
              defaultValue={editingEvent?.description ?? ""}
              disabled={disabled}
              id={`${generatedId}-description`}
              name="description"
              readOnly={readOnly}
              rows={3}
            />
            <div data-slot="scheduler-actions">
              <Button
                disabled={disabled || readOnly || offline || duration === null}
                pending={busy}
                pendingLabel="Saving event"
                type="submit"
              >
                Save event
              </Button>
              <Button disabled={disabled || readOnly || busy} type="reset" variant="quiet">
                Reset
              </Button>
              {editingEvent !== undefined && adapter.remove !== undefined ? (
                <Button
                  disabled={disabled || readOnly || offline}
                  onClick={() =>
                    void scheduler.remove(editingEvent.id).then(() => setEditingId(null))
                  }
                  type="button"
                  variant="destructive"
                >
                  Remove event
                </Button>
              ) : null}
            </div>
          </form>
        </section>

        {showConflictGuidance && scheduler.snapshot.conflicts.length > 0 ? (
          <section aria-labelledby={`${generatedId}-conflicts`} data-slot="scheduler-conflicts">
            <h2 id={`${generatedId}-conflicts`}>Schedule conflicts</h2>
            {scheduler.snapshot.conflicts.map((conflict) => (
              <article key={conflict.id}>
                <p>{conflict.summary}</p>
                {adapter.resolveConflict === undefined ? null : (
                  <div data-slot="scheduler-actions">
                    <Button
                      disabled={disabled || readOnly || offline}
                      onClick={() => void scheduler.resolveConflict(conflict.id, "keep-existing")}
                      variant="secondary"
                    >
                      Keep existing event
                    </Button>
                    <Button
                      disabled={disabled || readOnly || offline}
                      onClick={() => void scheduler.resolveConflict(conflict.id, "save-anyway")}
                      variant="secondary"
                    >
                      Keep both events
                    </Button>
                  </div>
                )}
              </article>
            ))}
          </section>
        ) : null}
        {announceChanges ? (
          <output aria-live="polite" data-slot="scheduler-announcer">
            {scheduler.mutationState === "pending"
              ? "Schedule change in progress."
              : scheduler.mutationState === "success"
                ? "Schedule updated."
                : ""}
          </output>
        ) : null}
      </main>
    </div>
  );
});

SchedulerKit.displayName = "SchedulerKit";
export const SchedulerKitPage = SchedulerKit;
