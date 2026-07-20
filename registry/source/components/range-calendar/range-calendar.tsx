"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Calendar, type CalendarUnavailableDate } from "../calendar/index.js";
import { inclusiveCalendarDays } from "../date-field/date-time-utils.js";
import "./range-calendar.css";

export interface RangeCalendarValue {
  /** Canonical `YYYY-MM-DD` end date, or an empty string while incomplete. */
  readonly end: string;
  /** Canonical `YYYY-MM-DD` start date, or an empty string while incomplete. */
  readonly start: string;
}

export interface RangeCalendarUnavailableSpanIssue {
  /** First canonical unavailable date crossed by the attempted range. */
  readonly date: string;
  /** Canonical range that crosses the unavailable date. */
  readonly range: RangeCalendarValue;
  /** Optional unavailable-date explanation, exposed only when explanations are enabled. */
  readonly reason?: string | undefined;
}

export interface RangeCalendarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Space-separated description identifiers merged with the active span-error description. */
  readonly "aria-describedby"?: string;
  /** Initial canonical range for uncontrolled use and native form reset. */
  readonly defaultValue?: RangeCalendarValue;
  /** Disables navigation, date activation, and both native date inputs. */
  readonly disabled?: boolean;
  /** Custom inclusive-day summary content or renderer used only when the summary is enabled. */
  readonly durationSummary?: ReactNode | ((days: number, value: RangeCalendarValue) => ReactNode);
  /** Visible heading and accessible name for the end-date calendar pane. */
  readonly endLabel?: string;
  /** Native form field name used to serialize the end date. */
  readonly endName?: string;
  /** Associates both native date inputs with a form by identifier. */
  readonly form?: string;
  /** Produces the linked alert and native-validation message for an unavailable crossed date. */
  readonly getUnavailableSpanError?:
    ((issue: RangeCalendarUnavailableSpanIssue) => string) | undefined;
  /** Locale used for month headings, weekday labels, and full date labels in both panes. */
  readonly locale?: string;
  /** Latest canonical date selectable in either calendar. */
  readonly maxValue?: string;
  /** Earliest canonical date selectable in either calendar. */
  readonly minValue?: string;
  /** Reports accepted range edits and native form-reset restoration. */
  readonly onValueChange?: (value: RangeCalendarValue) => void;
  /** Custom prospective-range output or renderer used only while range preview is enabled. */
  readonly rangePreviewSummary?:
    ReactNode | ((days: number, value: RangeCalendarValue) => ReactNode) | undefined;
  /** Keeps navigation available while preventing selection in both calendars. */
  readonly readOnly?: boolean;
  /** Applies native required validation to both associated date inputs. */
  readonly required?: boolean;
  /** Exposes blocked-date reasons to day buttons and span recovery; `false` withholds the reasons. */
  readonly showAvailabilityExplanations?: boolean;
  /** Renders an inclusive calendar-day output; `false` removes the output entirely. */
  readonly showDurationSummary?: boolean;
  /** Enables highlighted pointer/focus range preview and its polite live output. */
  readonly showRangePreview?: boolean;
  /** Visible heading and accessible name for the start-date calendar pane. */
  readonly startLabel?: string;
  /** Native form field name used to serialize the start date. */
  readonly startName?: string;
  /** Blocks individual dates and rejects ranges that cross any listed canonical date. */
  readonly unavailableDates?: readonly CalendarUnavailableDate[];
  /** Controlled canonical range; pair with `onValueChange`. */
  readonly value?: RangeCalendarValue;
  /** Weekday index rendered first and used by Home and End movement in both calendars. */
  readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

const EMPTY_RANGE: RangeCalendarValue = Object.freeze({ end: "", start: "" });

interface RejectedSpan {
  readonly issue: RangeCalendarUnavailableSpanIssue;
  readonly selectionKey: string;
}

function selectionKey(value: RangeCalendarValue): string {
  return `${value.start}\u0000${value.end}`;
}

function findUnavailableSpan(
  value: RangeCalendarValue,
  unavailableDates: readonly CalendarUnavailableDate[],
): RangeCalendarUnavailableSpanIssue | null {
  if (inclusiveCalendarDays(value.start, value.end) === null) return null;
  const entry = unavailableDates
    .filter(({ date }) => date >= value.start && date <= value.end)
    .sort((left, right) => left.date.localeCompare(right.date))[0];
  return entry === undefined ? null : { date: entry.date, range: value, reason: entry.reason };
}

function defaultUnavailableSpanError(issue: RangeCalendarUnavailableSpanIssue): string {
  const recovery = `The range crosses unavailable date ${issue.date}. Choose an end before it or a start after it.`;
  return issue.reason === undefined ? recovery : `${recovery} ${issue.reason}`;
}

export const RangeCalendar = forwardRef<HTMLDivElement, RangeCalendarProps>(function RangeCalendar(
  {
    "aria-describedby": ariaDescribedBy,
    className,
    defaultValue = EMPTY_RANGE,
    disabled = false,
    durationSummary,
    endLabel = "End date",
    endName,
    form,
    getUnavailableSpanError = defaultUnavailableSpanError,
    locale = "en-US",
    maxValue,
    minValue,
    onValueChange,
    rangePreviewSummary,
    readOnly = false,
    required = false,
    showAvailabilityExplanations = false,
    showDurationSummary = false,
    showRangePreview = false,
    startLabel = "Start date",
    startName,
    unavailableDates = [],
    value,
    weekStartsOn = 0,
    ...nativeProps
  },
  ref,
) {
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [previewEnd, setPreviewEnd] = useState<string | null>(null);
  const [rejectedSpan, setRejectedSpan] = useState<RejectedSpan | null>(null);
  const selected = controlled ? value : uncontrolledValue;
  const startCalendar = useRef<HTMLDivElement | null>(null);
  const endCalendar = useRef<HTMLDivElement | null>(null);
  const generatedId = useId().replaceAll(":", "");
  const latest = useRef(selected);
  latest.current = selected;
  const days = useMemo(
    () => (showDurationSummary ? inclusiveCalendarDays(selected.start, selected.end) : null),
    [selected, showDurationSummary],
  );
  const currentSpanIssue = useMemo(
    () => findUnavailableSpan(selected, unavailableDates),
    [selected, unavailableDates],
  );
  const rejectedIssue =
    rejectedSpan?.selectionKey === selectionKey(selected) ? rejectedSpan.issue : null;
  const spanIssue = currentSpanIssue ?? rejectedIssue;
  const presentedSpanIssue =
    spanIssue === null
      ? null
      : {
          ...spanIssue,
          reason: showAvailabilityExplanations ? spanIssue.reason : undefined,
        };
  const spanError =
    presentedSpanIssue === null
      ? null
      : getUnavailableSpanError(presentedSpanIssue).trim() ||
        defaultUnavailableSpanError(presentedSpanIssue);
  const spanErrorId =
    spanError === null ? undefined : `mrg-range-calendar-${generatedId}-span-error`;
  const previewValue =
    showRangePreview && previewEnd !== null && selected.start !== "" && previewEnd >= selected.start
      ? { end: previewEnd, start: selected.start }
      : null;
  const previewDays =
    previewValue === null ? null : inclusiveCalendarDays(previewValue.start, previewValue.end);
  const preview =
    previewDays === null || previewValue === null
      ? null
      : typeof rangePreviewSummary === "function"
        ? rangePreviewSummary(previewDays, previewValue)
        : (rangePreviewSummary ??
          `${previewDays} calendar ${previewDays === 1 ? "day" : "days"} if selected`);
  const highlightedRange =
    !showRangePreview || selected.start === ""
      ? false
      : (previewValue ?? (selected.end === "" ? false : selected));
  const publish = (next: RangeCalendarValue) => {
    if (next.start === selected.start && next.end === selected.end) return;
    if (!controlled) setUncontrolledValue(next);
    onValueChange?.(next);
  };
  const summary =
    days === null
      ? null
      : typeof durationSummary === "function"
        ? durationSummary(days, selected)
        : (durationSummary ?? `${days} calendar ${days === 1 ? "day" : "days"}`);

  const rejectSpan = (issue: RangeCalendarUnavailableSpanIssue) => {
    setRejectedSpan({ issue, selectionKey: selectionKey(selected) });
  };

  const selectStart = (start: string) => {
    setPreviewEnd(null);
    const next = {
      end: selected.end !== "" && start > selected.end ? "" : selected.end,
      start,
    };
    const issue = findUnavailableSpan(next, unavailableDates);
    if (issue !== null) {
      const recovered = { end: "", start };
      setRejectedSpan({ issue, selectionKey: selectionKey(recovered) });
      publish(recovered);
      return;
    }
    setRejectedSpan(null);
    publish(next);
  };

  const selectEnd = (end: string) => {
    setPreviewEnd(null);
    const next = { end, start: selected.start };
    const issue = findUnavailableSpan(next, unavailableDates);
    if (issue !== null) {
      rejectSpan(issue);
      return;
    }
    setRejectedSpan(null);
    publish(next);
  };

  useEffect(() => {
    const owner = startCalendar.current?.querySelector("input")?.form;
    if (owner === null || owner === undefined) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const handleReset = (event: Event) => {
      timer = setTimeout(() => {
        if (event.defaultPrevented) return;
        setPreviewEnd(null);
        setRejectedSpan(null);
        if (latest.current.start === defaultValue.start && latest.current.end === defaultValue.end)
          return;
        if (!controlled) setUncontrolledValue(defaultValue);
        onValueChange?.(defaultValue);
      }, 0);
    };
    owner.addEventListener("reset", handleReset);
    return () => {
      owner.removeEventListener("reset", handleReset);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [controlled, defaultValue, onValueChange]);

  useEffect(() => {
    endCalendar.current
      ?.querySelector<HTMLInputElement>('input[type="date"]')
      ?.setCustomValidity(currentSpanIssue === null ? "" : (spanError ?? "Invalid date range"));
  }, [currentSpanIssue, spanError]);
  return (
    <div
      {...nativeProps}
      aria-describedby={[ariaDescribedBy, spanErrorId].filter(Boolean).join(" ") || undefined}
      className={className === undefined ? "mrg-range-calendar" : `mrg-range-calendar ${className}`}
      data-duration={summary === null ? undefined : true}
      data-range-invalid={spanIssue === null ? undefined : true}
      data-range-preview={showRangePreview || undefined}
      data-slot="range-calendar"
      ref={ref}
    >
      <div data-slot="range-calendar-panes">
        <section aria-label={startLabel}>
          <h3>{startLabel}</h3>
          <Calendar
            defaultValue={selected.start}
            disabled={disabled}
            form={form}
            highlightRange={highlightedRange}
            locale={locale}
            maxValue={selected.end || maxValue}
            minValue={minValue}
            name={startName}
            onValueChange={selectStart}
            readOnly={readOnly}
            ref={startCalendar}
            required={required}
            showAvailabilityExplanations={showAvailabilityExplanations}
            unavailableDates={unavailableDates}
            value={selected.start}
            weekStartsOn={weekStartsOn}
          />
        </section>
        <section aria-label={endLabel}>
          <h3>{endLabel}</h3>
          <Calendar
            defaultValue={selected.end}
            disabled={disabled}
            form={form}
            highlightRange={highlightedRange}
            inputAriaDescribedBy={spanErrorId}
            inputAriaInvalid={currentSpanIssue === null ? undefined : true}
            locale={locale}
            maxValue={maxValue}
            minValue={selected.start || minValue}
            name={endName}
            onDatePreviewChange={showRangePreview ? setPreviewEnd : undefined}
            onValueChange={selectEnd}
            readOnly={readOnly}
            ref={endCalendar}
            required={required}
            showAvailabilityExplanations={showAvailabilityExplanations}
            unavailableDates={unavailableDates}
            value={selected.end}
            weekStartsOn={weekStartsOn}
          />
        </section>
      </div>
      {summary === null ? null : <output data-slot="range-calendar-duration">{summary}</output>}
      {preview === null ? null : (
        <output aria-live="polite" data-slot="range-calendar-preview">
          {preview}
        </output>
      )}
      {spanError === null ? null : (
        <p data-slot="range-calendar-span-error" id={spanErrorId} role="alert">
          {spanError}
        </p>
      )}
    </div>
  );
});

RangeCalendar.displayName = "RangeCalendar";
