"use client";

import "./tool-call.css";

import { forwardRef, useState, type HTMLAttributes, type ReactNode } from "react";

export type ToolCallStatus = "cancelled" | "error" | "pending" | "running" | "success";

export interface ToolCallDetails {
  /** Optional serialized tool input shown only when details are enabled. */
  readonly input?: string;
  /** Optional serialized tool output shown only when details are enabled. */
  readonly output?: string;
  /** Exact substrings replaced with `[redacted]` before any detail text is rendered. */
  readonly redactions?: readonly string[];
  /** Marks detail values as hidden unless explicit sensitive reveal is both allowed and active. */
  readonly sensitive?: boolean;
}

export interface ToolCallProps extends Omit<HTMLAttributes<HTMLElement>, "children"> {
  /** Adds a reveal control for sensitive details; false keeps sensitive values hidden. */
  readonly allowSensitiveReveal?: boolean;
  /** Initial sensitive reveal state for uncontrolled use when revealing is allowed. */
  readonly defaultSensitiveRevealed?: boolean;
  /** Consumer-formatted duration content rendered only when `showDuration` is enabled. */
  readonly duration?: ReactNode;
  /** Error recovery content announced only while the tool call status is `error`. */
  readonly error?: ReactNode;
  /** Required visible tool name rendered in the status header. */
  readonly name: ReactNode;
  /** Adds a cancel action while status is `running`; execution cancellation remains consumer-owned. */
  readonly onCancel?: () => void;
  /** Adds a retry action while status is `error`; retry execution remains consumer-owned. */
  readonly onRetry?: () => void;
  /** Reports sensitive reveal changes for controlled or uncontrolled use. */
  readonly onSensitiveRevealedChange?: (revealed: boolean) => void;
  /** Controlled sensitive reveal state; omit to use `defaultSensitiveRevealed`. */
  readonly sensitiveRevealed?: boolean;
  /** Adds redacted input/output disclosure details; false removes the disclosure and reveal UI. */
  readonly showDetails?: false | ToolCallDetails;
  /** Adds supplied duration context; false removes it from visual and accessibility output. */
  readonly showDuration?: boolean;
  /** Current tool execution lifecycle, including busy semantics for pending and running states. */
  readonly status: ToolCallStatus;
}

export function redactToolText(value: string, redactions: readonly string[] = []): string {
  return redactions.reduce(
    (result, secret) => (secret === "" ? result : result.split(secret).join("[redacted]")),
    value,
  );
}

export const ToolCall = forwardRef<HTMLElement, ToolCallProps>(function ToolCall(
  {
    allowSensitiveReveal = false,
    className,
    defaultSensitiveRevealed = false,
    duration,
    error,
    name,
    onCancel,
    onRetry,
    onSensitiveRevealedChange,
    sensitiveRevealed,
    showDetails = false,
    showDuration = false,
    status,
    ...props
  },
  ref,
) {
  const controlled = sensitiveRevealed !== undefined;
  const [uncontrolledReveal, setUncontrolledReveal] = useState(defaultSensitiveRevealed);
  const revealed = controlled ? sensitiveRevealed : uncontrolledReveal;
  const details = showDetails === false ? null : showDetails;
  const sensitive = details?.sensitive === true;
  const display = (value: string | undefined) => {
    if (value === undefined) return null;
    if (sensitive && !(allowSensitiveReveal && revealed)) return "Sensitive value hidden.";
    return redactToolText(value, details?.redactions);
  };
  const setReveal = (next: boolean) => {
    if (!controlled) setUncontrolledReveal(next);
    onSensitiveRevealedChange?.(next);
  };

  return (
    <section
      {...props}
      aria-busy={status === "pending" || status === "running" || undefined}
      className={className === undefined ? "mrg-tool-call" : `mrg-tool-call ${className}`}
      data-slot="tool-call"
      data-status={status}
      ref={ref}
    >
      <header data-slot="tool-call-header">
        <strong>{name}</strong>
        <span>{status}</span>
      </header>
      {showDuration && duration !== undefined ? (
        <p data-slot="tool-call-duration">{duration}</p>
      ) : null}
      {details === null ? null : (
        <details data-slot="tool-call-details">
          <summary>Tool input and output</summary>
          {details.input === undefined ? null : (
            <div>
              <strong>Input</strong>
              <pre>{display(details.input)}</pre>
            </div>
          )}
          {details.output === undefined ? null : (
            <div>
              <strong>Output</strong>
              <pre>{display(details.output)}</pre>
            </div>
          )}
          {sensitive && allowSensitiveReveal ? (
            <button onClick={() => setReveal(!revealed)} type="button">
              {revealed ? "Hide sensitive values" : "Reveal sensitive values"}
            </button>
          ) : null}
        </details>
      )}
      {status === "error" && error !== undefined ? (
        <div data-slot="tool-call-error" role="alert">
          {error}
        </div>
      ) : null}
      {status === "running" && onCancel !== undefined ? (
        <button data-slot="tool-call-action" onClick={onCancel} type="button">
          Cancel tool call
        </button>
      ) : null}
      {status === "error" && onRetry !== undefined ? (
        <button data-slot="tool-call-action" onClick={onRetry} type="button">
          Retry tool call
        </button>
      ) : null}
    </section>
  );
});

ToolCall.displayName = "ToolCall";
