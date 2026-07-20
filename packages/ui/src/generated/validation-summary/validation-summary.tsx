// Generated from registry/source/components/validation-summary/validation-summary.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  Fragment,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  type ForwardedRef,
  type HTMLAttributes,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import { useMergoraContext, type MergoraMessage } from "../provider/index.js";
import "./validation-summary.css";

export interface ValidationIssue {
  /** Stable id of the real focusable control that should receive recovery focus. */
  readonly controlId: string;
  /** Stable unique issue identity used as the rendered list key. */
  readonly id: string;
  /** Non-empty visible recovery message linked to the target control. */
  readonly message: ReactNode;
}

export type ValidationFocusPolicy = "none" | "summary" | "first-error";

export interface ValidationSummaryProps extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Content rendered by an explicitly enabled empty summary. */
  readonly empty?: ReactNode;
  /** Attempt identity whose changes trigger the configured focus policy once. */
  readonly focusKey?: string | number;
  /** Moves focus to the summary, first error, or nowhere after an attempt. */
  readonly focusPolicy?: ValidationFocusPolicy;
  /** Formats the assertive issue-count announcement. */
  readonly formatAnnouncement?: (count: number) => string;
  /** Visible summary heading; defaults to the localized provider message. */
  readonly heading?: ReactNode;
  /** Stable non-empty heading ID used to name the focusable summary. */
  readonly headingId?: string;
  /** Native heading level used for the summary title; defaults to 2. */
  readonly headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Validated issues linked to real focusable controls by stable IDs. */
  readonly issues: readonly ValidationIssue[];
  /** Keeps an empty summary mounted; false removes all summary UI and accessibility output. */
  readonly renderWhenEmpty?: boolean;
}

export function formatValidationErrorCount(count: number, locale = "en-US"): string {
  const formattedCount = new Intl.NumberFormat(locale).format(count);
  const noun = new Intl.PluralRules(locale).select(count) === "one" ? "error" : "errors";
  return `${formattedCount} form ${noun}`;
}

const defaultErrorCountMessage: MergoraMessage = ({ locale, values }) =>
  formatValidationErrorCount(Number(values.count ?? 0), locale);

function validateNonBlank(value: string, name: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`Mergora ValidationSummary ${name} must not be empty or whitespace-only.`);
  }
}

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode; readonly "aria-label"?: string }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    if (typeof value.props["aria-label"] === "string") {
      return value.props["aria-label"].trim().length > 0;
    }
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function validateIssues(issues: readonly ValidationIssue[]): void {
  const issueIds = new Set<string>();
  for (const issue of issues) {
    validateNonBlank(issue.id, "issue id");
    validateNonBlank(issue.controlId, `controlId for issue "${issue.id}"`);
    if (issueIds.has(issue.id)) {
      throw new RangeError(`Mergora ValidationSummary received duplicate issue id "${issue.id}".`);
    }
    if (!hasAccessibleContent(issue.message)) {
      throw new RangeError(
        `Mergora ValidationSummary issue "${issue.id}" requires a non-empty accessible message.`,
      );
    }
    issueIds.add(issue.id);
  }
}

function focusAndReveal(target: HTMLElement): boolean {
  target.focus({ preventScroll: true });
  if (document.activeElement !== target) return false;
  target.scrollIntoView({ block: "center", inline: "nearest" });
  return true;
}

function setForwardedRef<T>(ref: ForwardedRef<T>, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null) ref.current = value;
}

export const ValidationSummary = forwardRef<HTMLDivElement, ValidationSummaryProps>(
  function ValidationSummary(
    {
      className,
      empty,
      focusKey,
      focusPolicy = "none",
      formatAnnouncement,
      heading: headingProp,
      headingId,
      headingLevel = 2,
      issues,
      renderWhenEmpty = false,
      ...nativeProps
    },
    forwardedRef,
  ) {
    const generatedId = useId().replaceAll(":", "");
    const { getMessage } = useMergoraContext();
    validateIssues(issues);
    if (headingId !== undefined) validateNonBlank(headingId, "headingId");
    const resolvedHeadingId = headingId ?? `mrg-validation-summary-${generatedId}-heading`;
    const heading =
      headingProp === undefined
        ? getMessage("validationSummary.heading", "Review the form")
        : headingProp;
    if (!hasAccessibleContent(heading)) {
      throw new RangeError(
        "Mergora ValidationSummary heading must have non-empty accessible content.",
      );
    }
    const announcement =
      issues.length === 0
        ? ""
        : (formatAnnouncement?.(issues.length) ??
          getMessage("validationSummary.errorCount", defaultErrorCountMessage, {
            count: issues.length,
          }));
    const Heading = `h${headingLevel}` as const;
    const rootRef = useRef<HTMLDivElement | null>(null);
    const focusRecord = useRef<{ initialized: boolean; value: string | number | undefined }>({
      initialized: false,
      value: undefined,
    });
    const assignRoot = useCallback(
      (node: HTMLDivElement | null) => {
        rootRef.current = node;
        setForwardedRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    useEffect(() => {
      if (focusPolicy === "none" || focusKey === undefined || issues.length === 0) return;
      const previous = focusRecord.current;
      if (previous.initialized && Object.is(previous.value, focusKey)) return;
      focusRecord.current = { initialized: true, value: focusKey };
      const summary = rootRef.current;
      if (summary === null) return;
      if (focusPolicy === "summary") {
        focusAndReveal(summary);
        return;
      }
      const target = document.getElementById(issues[0]?.controlId ?? "");
      if (!(target instanceof HTMLElement) || !focusAndReveal(target)) focusAndReveal(summary);
    }, [focusKey, focusPolicy, issues]);

    if (issues.length === 0 && !renderWhenEmpty) return null;

    const handleIssueClick =
      (controlId: string): MouseEventHandler<HTMLAnchorElement> =>
      (event) => {
        const target = document.getElementById(controlId);
        event.preventDefault();
        if (target instanceof HTMLElement && focusAndReveal(target)) return;
        if (rootRef.current !== null) focusAndReveal(rootRef.current);
      };

    return (
      <div
        {...nativeProps}
        aria-labelledby={resolvedHeadingId}
        className={
          className === undefined ? "mrg-validation-summary" : `mrg-validation-summary ${className}`
        }
        data-empty={issues.length === 0 || undefined}
        data-slot="validation-summary"
        ref={assignRoot}
        tabIndex={-1}
      >
        <Heading data-slot="validation-summary-heading" id={resolvedHeadingId}>
          {heading}
        </Heading>
        <p
          aria-atomic="true"
          aria-live={issues.length > 0 ? "assertive" : "off"}
          data-slot="validation-summary-announcement"
        >
          {issues.length > 0 ? announcement : null}
        </p>
        {issues.length === 0 ? (
          <div data-slot="validation-summary-empty">{empty}</div>
        ) : (
          <ul data-slot="validation-summary-list">
            {issues.map((issue) => (
              <li data-slot="validation-summary-item" key={issue.id}>
                <a
                  href={`#${encodeURIComponent(issue.controlId)}`}
                  onClick={handleIssueClick(issue.controlId)}
                >
                  {issue.message}
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  },
);

ValidationSummary.displayName = "ValidationSummary";
