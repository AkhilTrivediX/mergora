"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
} from "react";

import {
  addCalendarDays,
  addCalendarMonths,
  canonicalDate,
  formatCanonicalDate,
  isCanonicalDate,
  mergeTemporalRefs,
  parseCanonicalDate,
  useNativeTemporalControl,
} from "../date-field/date-time-utils.js";
import "./calendar.css";

export interface CalendarUnavailableDate {
  /** Canonical `YYYY-MM-DD` date that cannot be selected. */
  readonly date: string;
  /** Optional user-facing explanation linked to the blocked day when explanations are enabled. */
  readonly reason?: string;
}

export interface CalendarHighlightRange {
  /** Inclusive canonical `YYYY-MM-DD` end of the visual range highlight. */
  readonly end: string;
  /** Inclusive canonical `YYYY-MM-DD` start of the visual range highlight. */
  readonly start: string;
}

export interface CalendarProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "defaultValue" | "onChange"
> {
  /** Initial canonical `YYYY-MM-DD` selection for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Disables month navigation, date activation, and the native date input. */
  readonly disabled?: boolean;
  /** Associates the hidden native date input with a form by identifier. */
  readonly form?: string | undefined;
  /** Space-separated description identifiers forwarded to the native date input. */
  readonly inputAriaDescribedBy?: string | undefined;
  /** Marks the native date input invalid without changing grid selection behavior. */
  readonly inputAriaInvalid?: boolean | undefined;
  /** Visible label for the native date input that preserves form and validation semantics. */
  readonly inputLabel?: string;
  /** Locale used for month headings, weekday labels, and complete date labels. */
  readonly locale?: string;
  /** Latest selectable canonical date, also forwarded as the native input maximum. */
  readonly maxValue?: string | undefined;
  /** Earliest selectable canonical date, also forwarded as the native input minimum. */
  readonly minValue?: string | undefined;
  /** Native form field name used to serialize the selected canonical date. */
  readonly name?: string | undefined;
  /** Accessible label for the button that advances the visible month. */
  readonly nextMonthLabel?: string;
  /** Reports the focused or pointer-hovered date, and `null` when preview interaction ends. */
  readonly onDatePreviewChange?: ((date: string | null) => void) | undefined;
  /** Reports a selected canonical date and native form-reset restoration. */
  readonly onValueChange?: (value: string) => void;
  /** Accessible label for the button that moves to the previous visible month. */
  readonly previousMonthLabel?: string;
  /** Keeps navigation available while preventing date selection and marking days aria-disabled. */
  readonly readOnly?: boolean;
  /** Applies native required validation to the associated date input. */
  readonly required?: boolean;
  /** Inclusive visual range highlight, or `false` to remove every range data signal. */
  readonly highlightRange?: false | CalendarHighlightRange;
  /** Links unavailable-date reasons to blocked day buttons; disabling it removes those descriptions. */
  readonly showAvailabilityExplanations?: boolean;
  /** Canonical dates blocked from selection, with optional recovery context for each date. */
  readonly unavailableDates?: readonly CalendarUnavailableDate[];
  /** Controlled canonical `YYYY-MM-DD` selection; pair with `onValueChange`. */
  readonly value?: string;
  /** Weekday index rendered as the first column and used by Home and End keyboard movement. */
  readonly weekStartsOn?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

interface CalendarCellValue {
  readonly currentMonth: boolean;
  readonly date: string;
  readonly day: number;
}

function todayCanonical(): string {
  const now = new Date();
  return canonicalDate(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

function monthKey(value: string): { readonly month: number; readonly year: number } {
  const parsed = parseCanonicalDate(value) ?? parseCanonicalDate(todayCanonical())!;
  return { month: parsed.getUTCMonth() + 1, year: parsed.getUTCFullYear() };
}

function cellsForMonth(
  year: number,
  month: number,
  weekStartsOn: number,
): readonly CalendarCellValue[] {
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leading = (firstDay - weekStartsOn + 7) % 7;
  const first = canonicalDate(year, month, 1);
  return Array.from({ length: 42 }, (_, index) => {
    const date = addCalendarDays(first, index - leading);
    const parsed = parseCanonicalDate(date)!;
    return {
      currentMonth: parsed.getUTCMonth() + 1 === month,
      date,
      day: parsed.getUTCDate(),
    };
  });
}

function weekdayLabels(locale: string, weekStartsOn: number): readonly string[] {
  const sunday = new Date(Date.UTC(2024, 0, 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(sunday);
    date.setUTCDate(sunday.getUTCDate() + ((weekStartsOn + index) % 7));
    return new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(date);
  });
}

function validBound(value: string | undefined, fallback: string): string {
  return value !== undefined && isCanonicalDate(value) ? value : fallback;
}

export const Calendar = forwardRef<HTMLDivElement, CalendarProps>(function Calendar(
  {
    "aria-label": ariaLabel = "Calendar",
    className,
    defaultValue = "",
    disabled = false,
    form,
    inputAriaDescribedBy,
    inputAriaInvalid,
    inputLabel = "Selected date",
    locale = "en-US",
    maxValue,
    minValue,
    name,
    nextMonthLabel = "Next month",
    onDatePreviewChange,
    onValueChange,
    previousMonthLabel = "Previous month",
    readOnly = false,
    required = false,
    highlightRange = false,
    showAvailabilityExplanations = false,
    unavailableDates = [],
    value,
    weekStartsOn = 0,
    ...nativeProps
  },
  ref,
) {
  const control = useNativeTemporalControl({ defaultValue, onValueChange, value });
  const initialMonth = monthKey(control.value);
  const [visible, setVisible] = useState(initialMonth);
  const [focusDate, setFocusDate] = useState(control.value || todayCanonical());
  const generatedId = useId().replaceAll(":", "");
  const unavailable = useMemo(
    () => new Map(unavailableDates.map((entry) => [entry.date, entry.reason])),
    [unavailableDates],
  );
  const cells = useMemo(
    () => cellsForMonth(visible.year, visible.month, weekStartsOn),
    [visible, weekStartsOn],
  );
  const labels = useMemo(() => weekdayLabels(locale, weekStartsOn), [locale, weekStartsOn]);
  const monthHeading = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC", year: "numeric" }).format(
        new Date(Date.UTC(visible.year, visible.month - 1, 1)),
      ),
    [locale, visible],
  );
  const minimum = validBound(minValue, "0001-01-01");
  const maximum = validBound(maxValue, "9999-12-31");

  useEffect(() => {
    if (control.value === "") return;
    const next = monthKey(control.value);
    setFocusDate(control.value);
    setVisible((current) =>
      current.month === next.month && current.year === next.year ? current : next,
    );
  }, [control.value]);

  const moveFocus = (from: string, amount: number, unit: "day" | "month") => {
    const next = unit === "day" ? addCalendarDays(from, amount) : addCalendarMonths(from, amount);
    const nextMonth = monthKey(next);
    setFocusDate(next);
    setVisible(nextMonth);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(
          `[data-mrg-calendar="${generatedId}"][data-date="${next}"]`,
        )
        ?.focus();
    });
  };

  const handleGridKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const direction = getComputedStyle(event.currentTarget).direction;
    let amount: number | null = null;
    let unit: "day" | "month" = "day";
    if (event.key === "ArrowLeft") amount = direction === "rtl" ? 1 : -1;
    else if (event.key === "ArrowRight") amount = direction === "rtl" ? -1 : 1;
    else if (event.key === "ArrowUp") amount = -7;
    else if (event.key === "ArrowDown") amount = 7;
    else if (event.key === "Home") {
      const parsed = parseCanonicalDate(date)!;
      amount = -((parsed.getUTCDay() - weekStartsOn + 7) % 7);
    } else if (event.key === "End") {
      const parsed = parseCanonicalDate(date)!;
      amount = 6 - ((parsed.getUTCDay() - weekStartsOn + 7) % 7);
    } else if (event.key === "PageUp" || event.key === "PageDown") {
      amount = (event.key === "PageUp" ? -1 : 1) * (event.shiftKey ? 12 : 1);
      unit = "month";
    }
    if (amount === null) return;
    event.preventDefault();
    moveFocus(date, amount, unit);
  };

  const select = (date: string) => {
    if (disabled || readOnly || unavailable.has(date) || date < minimum || date > maximum) return;
    setFocusDate(date);
    control.setValue(date);
  };

  const navigateMonth = (amount: number) => {
    const next = addCalendarMonths(canonicalDate(visible.year, visible.month, 1), amount);
    setVisible(monthKey(next));
    setFocusDate((current) => addCalendarMonths(current, amount));
  };

  return (
    <div
      {...nativeProps}
      aria-label={ariaLabel}
      className={className === undefined ? "mrg-calendar" : `mrg-calendar ${className}`}
      data-disabled={disabled || undefined}
      data-readonly={readOnly || undefined}
      data-slot="calendar"
      ref={ref}
      role="group"
    >
      <div data-slot="calendar-header">
        <button
          aria-label={previousMonthLabel}
          data-slot="calendar-previous"
          disabled={disabled}
          onClick={() => navigateMonth(-1)}
          type="button"
        >
          <span aria-hidden="true">‹</span>
        </button>
        <strong aria-live="polite" data-slot="calendar-heading">
          {monthHeading}
        </strong>
        <button
          aria-label={nextMonthLabel}
          data-slot="calendar-next"
          disabled={disabled}
          onClick={() => navigateMonth(1)}
          type="button"
        >
          <span aria-hidden="true">›</span>
        </button>
      </div>
      <div aria-label={monthHeading} data-slot="calendar-grid" role="grid">
        <div data-slot="calendar-weekdays" role="row">
          {labels.map((label) => (
            <span key={label} role="columnheader">
              {label}
            </span>
          ))}
        </div>
        <div data-slot="calendar-days" role="rowgroup">
          {Array.from({ length: 6 }, (_, rowIndex) => (
            <div data-slot="calendar-week" key={cells[rowIndex * 7]?.date} role="row">
              {cells.slice(rowIndex * 7, rowIndex * 7 + 7).map((cell) => {
                const unavailableReason = unavailable.get(cell.date);
                const blocked =
                  unavailable.has(cell.date) || cell.date < minimum || cell.date > maximum;
                const explanationId =
                  showAvailabilityExplanations && blocked && unavailableReason !== undefined
                    ? `mrg-calendar-${generatedId}-${cell.date}-reason`
                    : undefined;
                const label = formatCanonicalDate(cell.date, locale, {
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                  year: "numeric",
                });
                const highlighted =
                  highlightRange !== false &&
                  highlightRange.start <= highlightRange.end &&
                  cell.date >= highlightRange.start &&
                  cell.date <= highlightRange.end;
                return (
                  <span aria-selected={control.value === cell.date} key={cell.date} role="gridcell">
                    <button
                      aria-current={cell.date === todayCanonical() ? "date" : undefined}
                      aria-describedby={explanationId}
                      aria-disabled={blocked || readOnly || undefined}
                      aria-label={label ?? cell.date}
                      data-current-month={cell.currentMonth || undefined}
                      data-date={cell.date}
                      data-range-end={
                        highlightRange !== false && cell.date === highlightRange.end
                          ? true
                          : undefined
                      }
                      data-range-start={
                        highlightRange !== false && cell.date === highlightRange.start
                          ? true
                          : undefined
                      }
                      data-range-within={highlighted || undefined}
                      data-mrg-calendar={generatedId}
                      data-selected={control.value === cell.date || undefined}
                      data-slot="calendar-day"
                      data-unavailable={blocked || undefined}
                      disabled={disabled}
                      onClick={() => select(cell.date)}
                      onBlur={
                        onDatePreviewChange === undefined
                          ? undefined
                          : () => onDatePreviewChange(null)
                      }
                      onFocus={() => {
                        setFocusDate(cell.date);
                        onDatePreviewChange?.(cell.date);
                      }}
                      onKeyDown={(event) => handleGridKeyDown(event, cell.date)}
                      onPointerEnter={
                        onDatePreviewChange === undefined
                          ? undefined
                          : () => onDatePreviewChange(cell.date)
                      }
                      onPointerLeave={
                        onDatePreviewChange === undefined
                          ? undefined
                          : () => onDatePreviewChange(null)
                      }
                      tabIndex={focusDate === cell.date ? 0 : -1}
                      type="button"
                    >
                      {cell.day}
                    </button>
                    {explanationId === undefined ? null : (
                      <span className="mrg-calendar-visually-hidden" id={explanationId}>
                        {unavailableReason}
                      </span>
                    )}
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <label data-slot="calendar-input-label" htmlFor={`mrg-calendar-${generatedId}-input`}>
        {inputLabel}
      </label>
      <input
        aria-describedby={inputAriaDescribedBy}
        aria-invalid={inputAriaInvalid}
        className="mrg-calendar-input"
        data-slot="calendar-input"
        disabled={disabled}
        form={form}
        id={`mrg-calendar-${generatedId}-input`}
        max={maxValue}
        min={minValue}
        name={name}
        onChange={control.onChange}
        readOnly={readOnly}
        ref={mergeTemporalRefs(control.inputRef)}
        required={required}
        type="date"
        value={control.value}
      />
    </div>
  );
});

Calendar.displayName = "Calendar";
