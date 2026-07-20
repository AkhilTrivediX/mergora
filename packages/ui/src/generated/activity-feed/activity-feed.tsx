// Generated from registry/source/components/activity-feed/activity-feed.tsx by @mergora-internal/source-transformer. Do not edit.
import "./activity-feed.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export interface ActivityFeedEvent {
  /** Provides the stable event identity used for ordered rendering. */
  readonly id: string;
  /** Presents the event actor without imposing a domain-specific data model. */
  readonly actor: ReactNode;
  /** Presents the action associated with the actor. */
  readonly action: ReactNode;
  /** Supplies a valid timestamp for native time semantics and locale formatting. */
  readonly timestamp: Date | string;
  /** Adds optional event detail without changing the ordered event semantics. */
  readonly context?: ReactNode;
}
export interface ActivityFeedProps extends Omit<HTMLAttributes<HTMLOListElement>, "children"> {
  /** Supplies ordered activity events with stable identities and valid timestamps. */
  readonly events: readonly ActivityFeedEvent[];
  /** Names the native ordered list for assistive technologies. */
  readonly label: string;
  /** Overrides the runtime locale used for event timestamps. */
  readonly locale?: string;
  /** Marks the region busy and shows loading content without mutating events. */
  readonly loading?: boolean;
  /** Replaces the default visible loading status. */
  readonly loadingContent?: ReactNode;
  /** Shows the load-more action when true and no loading or error state is active. */
  readonly hasMore?: boolean;
  /** Enables consumer-owned pagination; omission leaves the load-more action disabled. */
  readonly onLoadMore?: () => void;
  /** Shows consumer-provided recovery content in an alert and suppresses pagination. */
  readonly loadError?: ReactNode;
  /** Enables the retry action only while loadError is present. */
  readonly onRetry?: () => void;
  /** Replaces the default content shown for an empty settled feed. */
  readonly emptyContent?: ReactNode;
  /** Shows loaded-count and continuation status; false removes its live output. */
  readonly showContinuationStatus?: boolean;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}
function toDate(value: Date | string): Date {
  const result = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(result.valueOf()))
    throw new RangeError("Mergora ActivityFeed timestamps must be valid dates.");
  return result;
}

export const ActivityFeed = forwardRef<HTMLOListElement, ActivityFeedProps>(function ActivityFeed(
  {
    events,
    label,
    locale,
    loading = false,
    loadingContent = "Loading activity",
    hasMore = false,
    onLoadMore,
    loadError,
    onRetry,
    emptyContent = "No activity yet",
    showContinuationStatus = false,
    className,
    ...props
  },
  ref,
) {
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });
  return (
    <div className="mrg-activity-feed" data-slot="activity-feed" aria-busy={loading || undefined}>
      <ol
        {...props}
        ref={ref}
        aria-label={label}
        className={classes("mrg-activity-feed__list", className)}
      >
        {events.length === 0 && !loading && !loadError ? (
          <li className="mrg-activity-feed__empty">{emptyContent}</li>
        ) : (
          events.map((event) => {
            const date = toDate(event.timestamp);
            return (
              <li key={event.id} className="mrg-activity-feed__event">
                <span aria-hidden="true" className="mrg-activity-feed__mark" />
                <div>
                  <div className="mrg-activity-feed__action">
                    <strong>{event.actor}</strong> {event.action}
                  </div>
                  <time dateTime={date.toISOString()}>{formatter.format(date)}</time>
                  {event.context ? (
                    <div className="mrg-activity-feed__context">{event.context}</div>
                  ) : null}
                </div>
              </li>
            );
          })
        )}
      </ol>
      {loading ? (
        <div role="status" className="mrg-activity-feed__loading">
          {loadingContent}
        </div>
      ) : null}
      {loadError ? (
        <div role="alert" className="mrg-activity-feed__error">
          <span>{loadError}</span>
          {onRetry ? (
            <button type="button" onClick={onRetry}>
              Retry
            </button>
          ) : null}
        </div>
      ) : null}
      {hasMore && !loading && !loadError ? (
        <button
          type="button"
          className="mrg-activity-feed__more"
          onClick={onLoadMore}
          disabled={onLoadMore === undefined}
        >
          Load more activity
        </button>
      ) : null}
      {showContinuationStatus ? (
        <output
          aria-live="polite"
          className="mrg-activity-feed__summary"
          data-slot="activity-feed-continuation-status"
        >
          {events.length} events loaded ·{" "}
          {loadError
            ? "loading interrupted"
            : loading
              ? "loading more"
              : hasMore
                ? "more available"
                : "end of activity"}
        </output>
      ) : null}
    </div>
  );
});
