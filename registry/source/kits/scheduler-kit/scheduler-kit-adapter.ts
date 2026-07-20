export interface SchedulerCalendar {
  /** Stable unique calendar identifier referenced by events and visibility filters. */
  readonly id: string;
  /** Human-readable calendar name shown in filtering controls. */
  readonly label: string;
}

export interface SchedulerEvent {
  /** Identifier of the calendar that owns this event. */
  readonly calendarId: string;
  /** Optional plain-text event detail supplied by the scheduling service. */
  readonly description?: string;
  /** Absolute ISO-compatible end instant interpreted in the selected display timezone. */
  readonly end: string;
  /** Stable event identifier used for editing, removal, and conflict relationships. */
  readonly id: string;
  /** Optional human-readable event location. */
  readonly location?: string;
  /** Absolute ISO-compatible start instant interpreted in the selected display timezone. */
  readonly start: string;
  /** Concise event title rendered in agenda and calendar presentations. */
  readonly title: string;
}

export interface SchedulerConflict {
  /** Identifier of the event whose save produced or owns the conflict. */
  readonly eventId: string;
  /** Stable conflict identifier passed to resolution operations. */
  readonly id: string;
  /** Existing event identifiers related to the conflict. */
  readonly relatedEventIds: readonly string[];
  /** Human-readable overlap or constraint explanation shown in recovery guidance. */
  readonly summary: string;
}

export interface SchedulerSnapshot {
  /** Immutable calendars available for event ownership and filtering. */
  readonly calendars: readonly SchedulerCalendar[];
  /** Immutable unresolved conflict records supplied by the adapter. */
  readonly conflicts: readonly SchedulerConflict[];
  /** Immutable event collection supplied by the adapter. */
  readonly events: readonly SchedulerEvent[];
}

export interface SchedulerEventInput {
  /** Target calendar identifier for the event being saved. */
  readonly calendarId: string;
  /** Local calendar date in `YYYY-MM-DD` form. */
  readonly date: string;
  /** Optional plain-text description for the event. */
  readonly description?: string;
  /** Local exclusive end time in 24-hour `HH:mm` form. */
  readonly endTime: string;
  /** Existing event identifier for updates; omission requests creation. */
  readonly id?: string;
  /** Optional human-readable event location. */
  readonly location?: string;
  /** Local start time in 24-hour `HH:mm` form. */
  readonly startTime: string;
  /** IANA timezone identifier defining how local date and time values should be resolved. */
  readonly timeZone: string;
  /** Required concise title for the event. */
  readonly title: string;
}

export interface SchedulerSaveResult {
  /** Conflicts detected for the saved event, empty when no recovery is required. */
  readonly conflicts: readonly SchedulerConflict[];
  /** Canonical event record returned after the adapter saves the request. */
  readonly event: SchedulerEvent;
}

export interface SchedulerAdapter {
  /** Loads the latest immutable schedule snapshot with lifecycle cancellation. */
  readonly load: (signal: AbortSignal) => Promise<SchedulerSnapshot>;
  /** Optionally removes one event; omission cleanly disables removal actions. */
  readonly remove?: (eventId: string, signal: AbortSignal) => Promise<void>;
  /** Optionally resolves one conflict; omission cleanly disables conflict resolution actions. */
  readonly resolveConflict?: (
    conflictId: string,
    resolution: "keep-existing" | "save-anyway",
    signal: AbortSignal,
  ) => Promise<void>;
  /** Creates or updates an event and returns its canonical record and conflicts. */
  readonly save: (input: SchedulerEventInput, signal: AbortSignal) => Promise<SchedulerSaveResult>;
}

const FIXTURE_EPOCH_DATE = "1970-01-01";

export function createDeterministicSchedulerSnapshot(): SchedulerSnapshot {
  return {
    calendars: [
      { id: "shared", label: "Shared calendar" },
      { id: "focus", label: "Focus calendar" },
    ],
    conflicts: [
      {
        eventId: "review",
        id: "review-overlap",
        relatedEventIds: ["focus-block"],
        summary: "Review overlaps Focus block by 30 minutes.",
      },
    ],
    events: [
      {
        calendarId: "shared",
        end: `${FIXTURE_EPOCH_DATE}T10:30:00.000Z`,
        id: "review",
        location: "Room One",
        start: `${FIXTURE_EPOCH_DATE}T09:30:00.000Z`,
        title: "Interface review",
      },
      {
        calendarId: "focus",
        end: `${FIXTURE_EPOCH_DATE}T11:30:00.000Z`,
        id: "focus-block",
        start: `${FIXTURE_EPOCH_DATE}T10:00:00.000Z`,
        title: "Focus block",
      },
    ],
  };
}

function ensureActive(signal: AbortSignal): void {
  if (signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
}

function validateInput(input: SchedulerEventInput): void {
  if (input.title.trim().length === 0 || input.title.length > 160) {
    throw new Error("Use an event title from 1 to 160 characters.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(input.date)) {
    throw new Error("Choose a valid event date.");
  }
  if (!/^\d{2}:\d{2}$/u.test(input.startTime) || !/^\d{2}:\d{2}$/u.test(input.endTime)) {
    throw new Error("Choose valid start and end times.");
  }
  if (input.endTime <= input.startTime) {
    throw new Error("End time must be later than start time.");
  }
}

export function createDeterministicSchedulerAdapter(): SchedulerAdapter {
  let snapshot = createDeterministicSchedulerSnapshot();
  return {
    async load(signal) {
      ensureActive(signal);
      return snapshot;
    },
    async remove(eventId, signal) {
      ensureActive(signal);
      snapshot = {
        ...snapshot,
        conflicts: snapshot.conflicts.filter((conflict) => conflict.eventId !== eventId),
        events: snapshot.events.filter((event) => event.id !== eventId),
      };
    },
    async resolveConflict(conflictId, resolution, signal) {
      ensureActive(signal);
      if (resolution === "keep-existing") {
        const conflict = snapshot.conflicts.find((candidate) => candidate.id === conflictId);
        if (conflict !== undefined) {
          snapshot = {
            ...snapshot,
            events: snapshot.events.filter((event) => event.id !== conflict.eventId),
          };
        }
      }
      snapshot = {
        ...snapshot,
        conflicts: snapshot.conflicts.filter((conflict) => conflict.id !== conflictId),
      };
    },
    async save(input, signal) {
      ensureActive(signal);
      validateInput(input);
      if (input.timeZone !== "UTC") {
        throw new Error(
          "The deterministic adapter accepts UTC only; production adapters must resolve local wall time.",
        );
      }
      const id = input.id ?? `event-${input.date}-${input.startTime.replace(":", "")}`;
      const event: SchedulerEvent = {
        calendarId: input.calendarId,
        ...(input.description === undefined ? {} : { description: input.description }),
        end: `${input.date}T${input.endTime}:00.000Z`,
        id,
        ...(input.location === undefined ? {} : { location: input.location }),
        start: `${input.date}T${input.startTime}:00.000Z`,
        title: input.title.trim(),
      };
      const overlaps = snapshot.events.filter(
        (candidate) =>
          candidate.id !== event.id && candidate.start < event.end && candidate.end > event.start,
      );
      const conflicts = overlaps.map((candidate) => ({
        eventId: event.id,
        id: `${event.id}-overlap-${candidate.id}`,
        relatedEventIds: [candidate.id],
        summary: `${event.title} overlaps ${candidate.title}.`,
      }));
      snapshot = {
        ...snapshot,
        conflicts: [
          ...snapshot.conflicts.filter((conflict) => conflict.eventId !== event.id),
          ...conflicts,
        ],
        events: [...snapshot.events.filter((candidate) => candidate.id !== event.id), event],
      };
      return { conflicts, event };
    },
  };
}
