"use client";

import "./calendar-heatmap.css";

import {
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
} from "react";

export interface CalendarHeatmapEntry {
  /** Supplies the canonical UTC calendar date in YYYY-MM-DD form. */
  readonly date: string;
  /** Supplies the finite intensity value used to derive the visual level. */
  readonly value: number;
  /** Overrides the generated accessible date-and-value label. */
  readonly label?: string;
}
export interface CalendarHeatmapProps extends Omit<
  HTMLAttributes<HTMLElement>,
  "children" | "onChange"
> {
  /** Supplies chronologically ordered date values for the grid and table fallback. */
  readonly entries: readonly CalendarHeatmapEntry[];
  /** Names the heatmap section, grid, and native table fallback. */
  readonly label: string;
  /** Overrides the runtime locale used for visible date formatting. */
  readonly locale?: string;
  /** Controls the selected calendar date when supplied. */
  readonly selectedDate?: string | null;
  /** Sets the initial selected date for uncontrolled use. */
  readonly defaultSelectedDate?: string | null;
  /** Reports pointer and keyboard date selection. */
  readonly onSelectedDateChange?: (date: string) => void;
  /** Shows a total-value live summary; false removes its output and computation. */
  readonly showSummary?: boolean;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}
function validDate(value: string): Date {
  const date = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(date.valueOf()))
    throw new RangeError("Mergora CalendarHeatmap dates must use a valid YYYY-MM-DD value.");
  return date;
}

export function CalendarHeatmap({
  entries,
  label,
  locale,
  selectedDate,
  defaultSelectedDate = null,
  onSelectedDateChange,
  showSummary = false,
  className,
  ...props
}: CalendarHeatmapProps): ReactElement {
  const [internalSelected, setInternalSelected] = useState<string | null>(defaultSelectedDate);
  const current = selectedDate === undefined ? internalSelected : selectedDate;
  const refs = useRef(new Map<string, HTMLButtonElement>());
  const maximum = Math.max(1, ...entries.map((entry) => entry.value));
  const formatter = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" });
  const select = (entry: CalendarHeatmapEntry) => {
    if (selectedDate === undefined) setInternalSelected(entry.date);
    onSelectedDateChange?.(entry.date);
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let next = index;
    if (event.key === "ArrowRight") next += props.dir === "rtl" ? -1 : 1;
    else if (event.key === "ArrowLeft") next += props.dir === "rtl" ? 1 : -1;
    else if (event.key === "ArrowDown") next += 7;
    else if (event.key === "ArrowUp") next -= 7;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = entries.length - 1;
    else return;
    event.preventDefault();
    const entry = entries[Math.min(entries.length - 1, Math.max(0, next))];
    if (entry !== undefined) {
      select(entry);
      refs.current.get(entry.date)?.focus();
    }
  };
  const total = showSummary ? entries.reduce((sum, entry) => sum + entry.value, 0) : 0;
  const calendarRows = Array.from({ length: Math.ceil(entries.length / 7) }, (_, rowIndex) =>
    entries.slice(rowIndex * 7, rowIndex * 7 + 7),
  );
  return (
    <section
      {...props}
      aria-label={label}
      className={classes("mrg-heatmap", className)}
      data-slot="calendar-heatmap"
    >
      <div className="mrg-heatmap__legend" aria-label="Intensity legend">
        <span>Less</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span key={level} aria-label={`Level ${level}`} data-level={level}>
            {level}
          </span>
        ))}
        <span>More</span>
      </div>
      <div role="grid" aria-label={`${label} values`} className="mrg-heatmap__grid">
        {calendarRows.map((row, rowIndex) => (
          <div key={row[0]?.date ?? `empty-${rowIndex}`} role="row" className="mrg-heatmap__row">
            {row.map((entry, columnIndex) => {
              const index = rowIndex * 7 + columnIndex;
              const level =
                entry.value === 0 ? 0 : Math.max(1, Math.ceil((entry.value / maximum) * 4));
              const dateLabel = formatter.format(validDate(entry.date));
              return (
                <button
                  key={entry.date}
                  ref={(node) => {
                    if (node === null) refs.current.delete(entry.date);
                    else refs.current.set(entry.date, node);
                  }}
                  type="button"
                  role="gridcell"
                  aria-label={entry.label ?? `${dateLabel}: ${entry.value}`}
                  aria-selected={current === entry.date}
                  tabIndex={current === entry.date || (current === null && index === 0) ? 0 : -1}
                  data-level={level}
                  onClick={() => select(entry)}
                  onKeyDown={(event) => keyboard(event, index)}
                >
                  <span aria-hidden="true">{level === 0 ? "·" : level < 3 ? "•" : "+"}</span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <details className="mrg-heatmap__fallback">
        <summary>View values as a table</summary>
        <table>
          <caption>{label} data</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col">Value</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.date}>
                <th scope="row">{formatter.format(validDate(entry.date))}</th>
                <td>{entry.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      {showSummary ? (
        <output
          aria-live="polite"
          className="mrg-heatmap__summary"
          data-slot="calendar-heatmap-summary"
        >
          {entries.length} days · {total} total ·{" "}
          {current === null ? "no date selected" : `${current} selected`}
        </output>
      ) : null}
    </section>
  );
}
