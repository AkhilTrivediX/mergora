// Generated from registry/source/components/collaboration-presence/collaboration-presence.tsx by @mergora-internal/source-transformer. Do not edit.
import "./collaboration-presence.css";

import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

export type CollaborationPresenceStatus = "available" | "away" | "busy" | "offline" | "stale";

export interface CollaborationPresencePerson {
  /** Optional visual avatar hidden from assistive technology beside the person's name. */
  readonly avatar?: ReactNode;
  /** Stable unique person identifier used for list rendering identity. */
  readonly id: string;
  /** Optional valid activity instant used by the stale-status policy. */
  readonly lastActive?: Date | string;
  /** Human-readable person name rendered as the primary list content. */
  readonly name: string;
  /** Consumer-owned presence lifecycle before optional stale derivation. */
  readonly status: CollaborationPresenceStatus;
  /** Optional localized label for the unchanged consumer-supplied status. */
  readonly statusLabel?: string;
}

export interface CollaborationStalePolicy {
  /** Non-negative elapsed milliseconds after which active status becomes stale. */
  readonly afterMilliseconds: number;
  /** Explicit clock instant used for deterministic stale calculation. */
  readonly now: Date | string;
}

export interface CollaborationPresenceProps extends Omit<
  HTMLAttributes<HTMLUListElement>,
  "children"
> {
  /** Required accessible name for the semantic presence list. */
  readonly label: string;
  /** Immutable people collection with stable unique identifiers. */
  readonly people: readonly CollaborationPresencePerson[];
  /** Adds active and inactive totals; false removes the summary output. */
  readonly showSummary?: boolean;
  /** Enables deterministic stale derivation; false preserves supplied statuses without clock work. */
  readonly stalePolicy?: false | CollaborationStalePolicy;
}

const DEFAULT_LABELS: Readonly<Record<CollaborationPresenceStatus, string>> = {
  available: "Available",
  away: "Away",
  busy: "Busy",
  offline: "Offline",
  stale: "Status may be out of date",
};

function milliseconds(value: Date | string, field: string): number {
  const result = value instanceof Date ? value.valueOf() : new Date(value).valueOf();
  if (Number.isNaN(result)) {
    throw new RangeError(`Mergora CollaborationPresence ${field} must be a valid date.`);
  }
  return result;
}

export function getCollaborationPresenceStatus(
  person: CollaborationPresencePerson,
  stalePolicy: false | CollaborationStalePolicy,
): CollaborationPresenceStatus {
  if (stalePolicy === false || person.lastActive === undefined || person.status === "offline") {
    return person.status;
  }
  if (!Number.isFinite(stalePolicy.afterMilliseconds) || stalePolicy.afterMilliseconds < 0) {
    throw new RangeError(
      "Mergora CollaborationPresence stale afterMilliseconds must be non-negative.",
    );
  }
  return milliseconds(stalePolicy.now, "stalePolicy.now") -
    milliseconds(person.lastActive, "lastActive") >
    stalePolicy.afterMilliseconds
    ? "stale"
    : person.status;
}

export const CollaborationPresence = forwardRef<HTMLUListElement, CollaborationPresenceProps>(
  function CollaborationPresence(
    { className, label, people, showSummary = false, stalePolicy = false, ...props },
    ref,
  ) {
    const resolved = people.map((person) => ({
      person,
      status: getCollaborationPresenceStatus(person, stalePolicy),
    }));
    const active = resolved.filter(
      ({ status }) => status !== "offline" && status !== "stale",
    ).length;

    return (
      <div className="mrg-collaboration-presence" data-slot="collaboration-presence">
        <ul
          {...props}
          aria-label={label}
          className={className}
          data-slot="collaboration-presence-list"
          ref={ref}
        >
          {resolved.map(({ person, status }) => (
            <li data-presence-status={status} key={person.id}>
              <span aria-hidden="true" data-slot="collaboration-presence-avatar">
                {person.avatar ?? person.name.trim().slice(0, 2).toLocaleUpperCase()}
              </span>
              <span>
                <strong>{person.name}</strong>
                <span data-slot="collaboration-presence-label">
                  {status === person.status && person.statusLabel !== undefined
                    ? person.statusLabel
                    : DEFAULT_LABELS[status]}
                </span>
              </span>
            </li>
          ))}
        </ul>
        {showSummary ? (
          <output data-slot="collaboration-presence-summary">
            {active} active · {people.length - active} away, stale, or offline
          </output>
        ) : null}
      </div>
    );
  },
);

CollaborationPresence.displayName = "CollaborationPresence";
