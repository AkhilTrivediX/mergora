// Generated from registry/source/components/chart/chart.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import "./chart.css";

import { useId, useState, type HTMLAttributes, type ReactElement, type ReactNode } from "react";

export interface ChartPoint {
  /** Provides the stable point identifier used by optional active state. */
  readonly id: string;
  /** Presents the point’s category in controls and the table fallback. */
  readonly label: string;
  /** Supplies the finite numeric value represented by the plotted point. */
  readonly value: number;
}

export interface ChartProps extends Omit<HTMLAttributes<HTMLElement>, "children" | "onChange"> {
  /** Provides the visible chart title and accessible graphic name. */
  readonly name: string;
  /** Explains the chart’s measure or intended interpretation. */
  readonly description: string;
  /** Supplies ordered points for the plot and equivalent data table. */
  readonly points: readonly ChartPoint[];
  /** Labels the value column in the equivalent data table. */
  readonly valueLabel?: string;
  /** Formats values consistently in controls and the equivalent data table. */
  readonly formatValue?: (value: number, point: ChartPoint) => string;
  /** Keeps the equivalent table visible or inside a native disclosure. */
  readonly dataTableFallback?: "visible" | "disclosure";
  /** Adds pressable point controls; false removes their UI and pressed semantics. */
  readonly interactive?: boolean;
  /** Controls the active point when optional interaction is enabled. */
  readonly activePointId?: string | null;
  /** Sets the initial active point for uncontrolled interaction. */
  readonly defaultActivePointId?: string | null;
  /** Reports activated points without changing canonical point data. */
  readonly onActivePointChange?: (point: ChartPoint) => void;
  /** Replaces the default content shown when no points exist. */
  readonly emptyContent?: ReactNode;
}

function classes(...values: readonly (string | undefined | false)[]): string {
  return values.filter((value): value is string => Boolean(value)).join(" ");
}

export function Chart({
  name,
  description,
  points,
  valueLabel = "Value",
  formatValue = (value) => String(value),
  dataTableFallback = "disclosure",
  interactive = false,
  activePointId,
  defaultActivePointId = null,
  onActivePointChange,
  emptyContent = "No chart data",
  className,
  ...props
}: ChartProps): ReactElement {
  const descriptionId = useId();
  const nameId = useId();
  const [internalActive, setInternalActive] = useState<string | null>(defaultActivePointId);
  const active = activePointId === undefined ? internalActive : activePointId;
  const values = points.map((point) => point.value);
  const minimum = Math.min(...values, 0);
  const maximum = Math.max(...values, 1);
  const range = Math.max(1, maximum - minimum);
  const coordinates = points.map((point, index) => ({
    point,
    x: points.length <= 1 ? 50 : (index / (points.length - 1)) * 100,
    y: 92 - ((point.value - minimum) / range) * 84,
  }));
  const table = (
    <table>
      <caption>{name} data</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">{valueLabel}</th>
        </tr>
      </thead>
      <tbody>
        {points.map((point) => (
          <tr key={point.id}>
            <th scope="row">{point.label}</th>
            <td>{formatValue(point.value, point)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <figure
      {...props}
      className={classes("mrg-chart", className)}
      data-slot="chart"
      data-interactive={interactive || undefined}
    >
      <figcaption>
        <strong id={nameId}>{name}</strong>
        <span id={descriptionId}>{description}</span>
      </figcaption>
      {points.length === 0 ? (
        <div className="mrg-chart__empty">{emptyContent}</div>
      ) : (
        <>
          <svg
            viewBox="0 0 100 100"
            role="img"
            aria-labelledby={`${nameId} ${descriptionId}`}
            className="mrg-chart__plot"
            preserveAspectRatio="none"
          >
            <polyline
              aria-hidden="true"
              points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
              vectorEffect="non-scaling-stroke"
            />
            {coordinates.map(({ point, x, y }) => (
              <circle
                key={point.id}
                aria-hidden="true"
                cx={x}
                cy={y}
                r="2"
                data-active={active === point.id || undefined}
                vectorEffect="non-scaling-stroke"
              />
            ))}
          </svg>
          {interactive ? (
            <ol aria-label={`${name} data points`} className="mrg-chart__point-controls">
              {points.map((point) => (
                <li key={point.id}>
                  <button
                    type="button"
                    aria-pressed={active === point.id}
                    onClick={() => {
                      if (activePointId === undefined) setInternalActive(point.id);
                      onActivePointChange?.(point);
                    }}
                  >
                    <span>{point.label}</span>
                    <strong>{formatValue(point.value, point)}</strong>
                  </button>
                </li>
              ))}
            </ol>
          ) : null}
          {dataTableFallback === "visible" ? (
            <div className="mrg-chart__table">{table}</div>
          ) : (
            <details className="mrg-chart__table">
              <summary>View chart data</summary>
              {table}
            </details>
          )}
        </>
      )}
    </figure>
  );
}
