import "./timeline.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface TimelineEvent {
  /** Stable unique event identity used as the rendered list key. */
  readonly id: string;
  /** Primary visible label for this event. */
  readonly title: ReactNode;
  /** Optional supporting event detail rendered after its timestamp. */
  readonly description?: ReactNode;
  /** Valid Date or parseable date string rendered through a semantic time element. */
  readonly timestamp: Date | string;
  /** Optional visible status context associated with the event title. */
  readonly status?: string;
}

export interface TimelineProps extends Omit<HTMLAttributes<HTMLOListElement>, "children"> {
  /** Ordered event models rendered as a semantic list. */
  readonly events: readonly TimelineEvent[];
  /** Accessible name applied to the timeline list. */
  readonly label: string;
  /** Locale used by the default date-and-time formatter. */
  readonly locale?: string;
  /** Custom localized timestamp formatter for each event. */
  readonly formatDate?: (date: Date, event: TimelineEvent) => string;
  /** Adds elapsed-time context between events; false removes every duration row. */
  readonly showDurations?: boolean;
  /** Formats optional elapsed-time output from milliseconds and adjacent event models. */
  readonly formatDuration?: (
    milliseconds: number,
    event: TimelineEvent,
    previous: TimelineEvent,
  ) => string;
}

function toDate(value: Date | string): Date {
  const result = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(result.valueOf()))
    throw new RangeError("Mergora Timeline timestamps must be valid dates.");
  return result;
}

function defaultDuration(milliseconds: number): string {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  if (minutes < 60) return `${minutes} minutes after previous event`;
  const hours = Math.round(minutes / 60);
  return `${hours} ${hours === 1 ? "hour" : "hours"} after previous event`;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export const Timeline = forwardRef<HTMLOListElement, TimelineProps>(function Timeline(
  {
    events,
    label,
    locale,
    formatDate,
    showDurations = false,
    formatDuration = defaultDuration,
    className,
    ...props
  },
  ref,
) {
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <ol
      {...props}
      ref={ref}
      aria-label={label}
      className={classes("mrg-timeline", className)}
      data-slot="timeline"
      data-durations={showDurations || undefined}
    >
      {events.map((event, index) => {
        const date = toDate(event.timestamp);
        const previous = index > 0 ? events[index - 1] : undefined;
        const duration =
          showDurations && previous !== undefined
            ? formatDuration(date.valueOf() - toDate(previous.timestamp).valueOf(), event, previous)
            : null;
        return (
          <li key={event.id} className="mrg-timeline__event" data-slot="timeline-event">
            <span aria-hidden="true" className="mrg-timeline__marker">
              {index + 1}
            </span>
            <div className="mrg-timeline__content">
              <div className="mrg-timeline__heading">
                <span className="mrg-timeline__title">{event.title}</span>
                {event.status ? <span className="mrg-timeline__status">{event.status}</span> : null}
              </div>
              <time dateTime={date.toISOString()}>
                {formatDate?.(date, event) ?? dateFormatter.format(date)}
              </time>
              {event.description ? (
                <div className="mrg-timeline__description">{event.description}</div>
              ) : null}
              {duration ? (
                <div className="mrg-timeline__duration" data-slot="timeline-duration">
                  {duration}
                </div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
});
