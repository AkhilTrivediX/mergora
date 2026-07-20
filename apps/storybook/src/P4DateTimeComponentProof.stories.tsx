import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type CSSProperties, type ReactElement, type ReactNode } from "react";

import { Button } from "../../../registry/source/components/button/index.ts";
import { Calendar } from "../../../registry/source/components/calendar/index.ts";
import { DateField } from "../../../registry/source/components/date-field/index.ts";
import {
  DatePicker,
  type DatePickerPreset,
} from "../../../registry/source/components/date-picker/index.ts";
import {
  DateRangePicker,
  type DateRangePreset,
} from "../../../registry/source/components/date-range-picker/index.ts";
import {
  DateTimeField,
  type DateTimeWallTimeAdapter,
} from "../../../registry/source/components/date-time-field/index.ts";
import {
  DateTimePicker,
  type DateTimePickerPreset,
} from "../../../registry/source/components/date-time-picker/index.ts";
import { MonthPicker } from "../../../registry/source/components/month-picker/index.ts";
import { RangeCalendar } from "../../../registry/source/components/range-calendar/index.ts";
import { TimeField } from "../../../registry/source/components/time-field/index.ts";
import {
  TimePicker,
  type TimePickerInterval,
} from "../../../registry/source/components/time-picker/index.ts";
import {
  YearPicker,
  type YearPickerVisibleRange,
} from "../../../registry/source/components/year-picker/index.ts";
import "mergora-tokens/tokens.css";

interface DateTimeProofArgs {
  readonly availabilityExplanations: boolean;
  readonly dateContext: boolean;
  readonly datePresets: boolean;
  readonly dateTimePresets: boolean;
  readonly durationBounds: boolean;
  readonly durationSummary: boolean;
  readonly quarterContext: boolean;
  readonly rangePreview: boolean;
  readonly timeIntervals: boolean;
  readonly timeZoneContext: boolean;
  readonly wallTimeResolution: boolean;
  readonly yearRangeSummary: boolean;
  readonly yearWindowing: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(52rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const labelStyle: CSSProperties = {
  display: "grid",
  fontSize: "var(--mrg-semantic-font-size-label)",
  fontWeight: "var(--mrg-semantic-font-weight-label)",
  gap: "var(--mrg-semantic-space-stack-xs)",
};

const evidenceRailStyle: CSSProperties = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  color: "var(--mrg-semantic-color-foreground-muted)",
  margin: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-sm)",
};

const DATE_PRESETS = [
  { label: "First review", value: "2026-08-04" },
  { label: "Second review", value: "2026-08-18" },
] as const;

const RANGE_PRESETS = [
  { label: "Three-day window", value: { end: "2026-08-06", start: "2026-08-04" } },
  { label: "Full week", value: { end: "2026-08-10", start: "2026-08-04" } },
] as const;

const DATE_TIME_PRESETS = [
  { label: "Morning", value: "2026-08-04T09:00" },
  { label: "Afternoon", value: "2026-08-04T14:00" },
] as const;

const TIME_INTERVALS = [
  { label: "09:00", value: "09:00" },
  { label: "10:30", value: "10:30" },
  { label: "14:00", value: "14:00" },
] as const;

const UNAVAILABLE_DATES = [
  { date: "2026-08-11", reason: "Calibration unavailable." },
  { date: "2026-08-12", reason: "No opening is available." },
] as const;

const WALL_TIME_ADAPTER: DateTimeWallTimeAdapter = {
  resolveLocalWallTime: ({ localValue }) => {
    if (localValue === "2026-10-25T02:30") {
      return {
        earlierInstant: "2026-10-25T00:30:00Z",
        kind: "ambiguous",
        laterInstant: "2026-10-25T01:30:00Z",
      };
    }
    return { instant: "2026-08-04T07:00:00Z", kind: "valid" };
  },
};

const CONTROLLED_TEMPORAL_DEFAULTS = {
  date: "2026-08-04",
  dateTime: "2026-08-04T09:00",
  time: "09:00",
} as const;

function ProofFrame({
  children,
  itemId,
  title,
}: {
  readonly children: ReactNode;
  readonly itemId: string;
  readonly title: string;
}): ReactElement {
  return (
    <section aria-labelledby={`${itemId}-proof-title`} data-story-item={itemId} style={frameStyle}>
      <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function CalendarSpecimen({
  availabilityExplanations,
  rangePreview,
}: Pick<DateTimeProofArgs, "availabilityExplanations" | "rangePreview">): ReactElement {
  const [previewedDate, setPreviewedDate] = useState<string | null>(null);
  return (
    <ProofFrame itemId="calendar" title="Calendar">
      <Calendar
        defaultValue="2026-08-04"
        highlightRange={rangePreview ? { end: "2026-08-07", start: "2026-08-04" } : false}
        inputLabel="Selected review date"
        locale="en-US"
        name="review-date"
        onDatePreviewChange={rangePreview ? setPreviewedDate : undefined}
        showAvailabilityExplanations={availabilityExplanations}
        unavailableDates={UNAVAILABLE_DATES}
        weekStartsOn={1}
      />
      {rangePreview ? (
        <output aria-live="polite" data-slot="calendar-preview-evidence" style={evidenceRailStyle}>
          Previewed date: {previewedDate ?? "none"}
        </output>
      ) : null}
    </ProofFrame>
  );
}

function DatePickerSpecimen({ presets }: { readonly presets: boolean }): ReactElement {
  const [selectedPreset, setSelectedPreset] = useState("none");
  return (
    <ProofFrame itemId="date-picker" title="Date picker">
      <DatePicker
        defaultValue="2026-08-04"
        inputLabel="Milestone date"
        name="milestone-date"
        presets={presets ? DATE_PRESETS : false}
        {...(presets
          ? {
              onPresetSelect: (preset: DatePickerPreset) => setSelectedPreset(preset.label),
            }
          : {})}
      />
      {presets ? (
        <output data-slot="date-picker-preset-evidence" style={evidenceRailStyle}>
          Selected shortcut: {selectedPreset}
        </output>
      ) : null}
    </ProofFrame>
  );
}

function DateRangePickerSpecimen({
  durationBounds,
  durationSummary,
  presets,
}: {
  readonly durationBounds: boolean;
  readonly durationSummary: boolean;
  readonly presets: boolean;
}): ReactElement {
  const [durationIssue, setDurationIssue] = useState("none");
  const [selectedPreset, setSelectedPreset] = useState("none");
  return (
    <ProofFrame itemId="date-range-picker" title="Date range picker">
      <DateRangePicker
        defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
        endName="review-window-end"
        maximumDurationDays={durationBounds ? 7 : undefined}
        minimumDurationDays={durationBounds ? 2 : undefined}
        onDurationIssueChange={
          durationBounds ? (issue) => setDurationIssue(issue?.reason ?? "none") : undefined
        }
        presets={presets ? RANGE_PRESETS : false}
        showDurationSummary={durationSummary}
        startName="review-window-start"
        {...(presets
          ? {
              onPresetSelect: (preset: DateRangePreset) => setSelectedPreset(preset.label),
            }
          : {})}
      />
      {presets ? (
        <output data-slot="date-range-picker-preset-evidence" style={evidenceRailStyle}>
          Selected shortcut: {selectedPreset}
        </output>
      ) : null}
      {durationBounds ? (
        <output
          aria-live="polite"
          data-slot="date-range-picker-bound-evidence"
          style={evidenceRailStyle}
        >
          Duration issue: {durationIssue}
        </output>
      ) : null}
    </ProofFrame>
  );
}

function DateTimePickerSpecimen({
  presets,
  timeZoneContext,
  wallTimeResolution,
}: {
  readonly presets: boolean;
  readonly timeZoneContext: boolean;
  readonly wallTimeResolution: boolean;
}): ReactElement {
  const [selectedPreset, setSelectedPreset] = useState("none");
  const hasTimeZone = timeZoneContext || wallTimeResolution;
  return (
    <ProofFrame itemId="date-time-picker" title="Date and time picker">
      <DateTimePicker
        ambiguityPolicy={wallTimeResolution ? "later" : "reject"}
        defaultValue="2026-10-25T02:30"
        inputLabel="Planned handoff"
        name="planned-handoff"
        presets={presets ? DATE_TIME_PRESETS : false}
        resolvedName={wallTimeResolution ? "planned-handoff-instant" : undefined}
        showTimeZoneContext={timeZoneContext}
        timeZone={hasTimeZone ? "Europe/Paris" : undefined}
        wallTimeAdapter={wallTimeResolution ? WALL_TIME_ADAPTER : false}
        {...(presets
          ? {
              onPresetSelect: (preset: DateTimePickerPreset) => setSelectedPreset(preset.label),
            }
          : {})}
      />
      {presets ? (
        <output data-slot="date-time-picker-preset-evidence" style={evidenceRailStyle}>
          Selected shortcut: {selectedPreset}
        </output>
      ) : null}
    </ProofFrame>
  );
}

function ControlledTemporalFieldsSpecimen(): ReactElement {
  const [date, setDate] = useState<string>(CONTROLLED_TEMPORAL_DEFAULTS.date);
  const [time, setTime] = useState<string>(CONTROLLED_TEMPORAL_DEFAULTS.time);
  const [dateTime, setDateTime] = useState<string>(CONTROLLED_TEMPORAL_DEFAULTS.dateTime);

  return (
    <ProofFrame itemId="controlled-temporal-fields" title="Controlled temporal fields">
      <p style={{ margin: 0, maxInlineSize: "64ch" }}>
        The parent owns each canonical native value. Optional context and wall-time resolution stay
        disabled, so the fields remain concise native controls.
      </p>
      <form
        aria-label="Controlled temporal field evidence"
        style={{ display: "grid", gap: "var(--mrg-semantic-space-stack-md)" }}
      >
        <label style={labelStyle}>
          Review date
          <DateField
            name="controlled-review-date"
            onValueChange={setDate}
            showDateContext={false}
            value={date}
          />
        </label>
        <label style={labelStyle}>
          Start time
          <TimeField
            name="controlled-start-time"
            onValueChange={setTime}
            showTimeZoneContext={false}
            value={time}
          />
        </label>
        <label style={labelStyle}>
          Planned start
          <DateTimeField
            name="controlled-planned-start"
            onValueChange={setDateTime}
            showTimeZoneContext={false}
            value={dateTime}
            wallTimeAdapter={false}
          />
        </label>
        <Button
          onClick={() => {
            setDate(CONTROLLED_TEMPORAL_DEFAULTS.date);
            setTime(CONTROLLED_TEMPORAL_DEFAULTS.time);
            setDateTime(CONTROLLED_TEMPORAL_DEFAULTS.dateTime);
          }}
          type="button"
          variant="secondary"
        >
          Restore controlled values
        </Button>
      </form>
      <output data-slot="controlled-temporal-values" style={evidenceRailStyle}>
        Date: {date}; time: {time}; date and time: {dateTime}
      </output>
    </ProofFrame>
  );
}

function TimePickerSpecimen({
  intervals,
  timeZoneContext,
}: {
  readonly intervals: boolean;
  readonly timeZoneContext: boolean;
}): ReactElement {
  const [selectedInterval, setSelectedInterval] = useState("none");
  return (
    <ProofFrame itemId="time-picker" title="Time picker">
      <TimePicker
        defaultValue="09:00"
        inputLabel="Available time"
        intervals={intervals ? TIME_INTERVALS : false}
        name="available-time"
        showTimeZoneContext={timeZoneContext}
        timeZone={timeZoneContext ? "Europe/Paris" : undefined}
        {...(intervals
          ? {
              onIntervalSelect: (interval: TimePickerInterval) =>
                setSelectedInterval(interval.label),
            }
          : {})}
      />
      {intervals ? (
        <output data-slot="time-picker-interval-evidence" style={evidenceRailStyle}>
          Selected interval: {selectedInterval}
        </output>
      ) : null}
    </ProofFrame>
  );
}

function YearPickerSpecimen({
  rangeSummary,
  windowing,
}: {
  readonly rangeSummary: boolean;
  readonly windowing: boolean;
}): ReactElement {
  const [visibleRange, setVisibleRange] = useState<YearPickerVisibleRange>({
    endYear: 2030,
    startYear: 2020,
  });
  return (
    <ProofFrame itemId="year-picker" title="Year picker">
      <label style={labelStyle}>
        Archive year
        <YearPicker
          defaultValue={2026}
          maxYear={windowing ? 10_000 : 2030}
          minYear={windowing ? 1 : 2020}
          name="archive-year"
          onVisibleRangeChange={windowing ? setVisibleRange : undefined}
          showRangeSummary={rangeSummary}
          visibleRange={windowing ? visibleRange : false}
        />
      </label>
    </ProofFrame>
  );
}

const onlyControls = (...names: readonly (keyof DateTimeProofArgs)[]) => ({
  controls: { include: names },
});

const meta = {
  args: {
    availabilityExplanations: false,
    dateContext: false,
    datePresets: false,
    dateTimePresets: false,
    durationBounds: false,
    durationSummary: false,
    quarterContext: false,
    rangePreview: false,
    timeIntervals: false,
    timeZoneContext: false,
    wallTimeResolution: false,
    yearRangeSummary: false,
    yearWindowing: false,
  },
  argTypes: {
    availabilityExplanations: {
      control: "boolean",
      description: "Associate consumer-supplied recovery reasons with unavailable dates.",
    },
    dateContext: {
      control: "boolean",
      description: "Associate a localized full-date reading with the native date input.",
    },
    datePresets: {
      control: "boolean",
      description: "Offer canonical date or range shortcuts through the same value model.",
    },
    dateTimePresets: {
      control: "boolean",
      description: "Offer canonical local-date-time shortcuts through the same value model.",
    },
    durationBounds: {
      control: "boolean",
      description: "Constrain range duration and expose recoverable native validity feedback.",
    },
    durationSummary: {
      control: "boolean",
      description: "Associate the inclusive calendar-day count with the selected range.",
    },
    quarterContext: {
      control: "boolean",
      description: "Associate derived quarter context with the native month input.",
    },
    rangePreview: {
      control: "boolean",
      description: "Expose semantic range highlighting and bounded preview behavior.",
    },
    timeIntervals: {
      control: "boolean",
      description: "Offer a bounded set of canonical available-time shortcuts.",
    },
    timeZoneContext: {
      control: "boolean",
      description: "Name the time-zone interpretation without changing form data.",
    },
    wallTimeResolution: {
      control: "boolean",
      description: "Resolve ambiguous local wall time through a consumer-supplied adapter.",
    },
    yearRangeSummary: {
      control: "boolean",
      description: "Associate available year bounds and count with the native select.",
    },
    yearWindowing: {
      control: "boolean",
      description: "Bound a large year domain with consumer-controlled native windows.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "P4/Date and time — component proof",
} satisfies Meta<DateTimeProofArgs>;

export default meta;
type Story = StoryObj<DateTimeProofArgs>;

export const BasicCalendar: Story = {
  args: { availabilityExplanations: false, rangePreview: false },
  name: "Calendar · Basic",
  parameters: onlyControls("availabilityExplanations", "rangePreview"),
  render: (args) => (
    <CalendarSpecimen
      availabilityExplanations={args.availabilityExplanations}
      rangePreview={args.rangePreview}
    />
  ),
};

export const RecommendedCalendar: Story = {
  args: { availabilityExplanations: true, rangePreview: true },
  name: "Calendar · Recommended Mergora",
  parameters: onlyControls("availabilityExplanations", "rangePreview"),
  render: (args) => (
    <CalendarSpecimen
      availabilityExplanations={args.availabilityExplanations}
      rangePreview={args.rangePreview}
    />
  ),
};

export const BasicDateField: Story = {
  args: { dateContext: false },
  name: "Date Field · Basic",
  parameters: onlyControls("dateContext"),
  render: (args) => (
    <ProofFrame itemId="date-field" title="Date field">
      <label style={labelStyle}>
        Review date
        <DateField
          defaultValue="2026-08-04"
          name="review-date"
          showDateContext={args.dateContext}
        />
      </label>
    </ProofFrame>
  ),
};

export const RecommendedDateField: Story = {
  args: { dateContext: true },
  name: "Date Field · Recommended Mergora",
  parameters: onlyControls("dateContext"),
  render: (args) => (
    <ProofFrame itemId="date-field" title="Date field">
      <label style={labelStyle}>
        Review date
        <DateField
          defaultValue="2026-08-04"
          name="review-date"
          showDateContext={args.dateContext}
        />
      </label>
    </ProofFrame>
  ),
};

export const ControlledTemporalFields: Story = {
  name: "Fields · Controlled ownership",
  render: () => <ControlledTemporalFieldsSpecimen />,
};

export const BasicDatePicker: Story = {
  args: { datePresets: false },
  name: "Date Picker · Basic",
  parameters: onlyControls("datePresets"),
  render: (args) => <DatePickerSpecimen presets={args.datePresets} />,
};

export const RecommendedDatePicker: Story = {
  args: { datePresets: true },
  name: "Date Picker · Recommended Mergora",
  parameters: onlyControls("datePresets"),
  render: (args) => <DatePickerSpecimen presets={args.datePresets} />,
};

export const BasicDateRangePicker: Story = {
  args: { datePresets: false, durationBounds: false, durationSummary: false },
  name: "Date Range Picker · Basic",
  parameters: onlyControls("datePresets", "durationSummary", "durationBounds"),
  render: (args) => (
    <DateRangePickerSpecimen
      durationBounds={args.durationBounds}
      durationSummary={args.durationSummary}
      presets={args.datePresets}
    />
  ),
};

export const RecommendedDateRangePicker: Story = {
  args: { datePresets: true, durationBounds: true, durationSummary: true },
  name: "Date Range Picker · Recommended Mergora",
  parameters: onlyControls("datePresets", "durationSummary", "durationBounds"),
  render: (args) => (
    <DateRangePickerSpecimen
      durationBounds={args.durationBounds}
      durationSummary={args.durationSummary}
      presets={args.datePresets}
    />
  ),
};

export const BasicDateTimeField: Story = {
  args: { timeZoneContext: false, wallTimeResolution: false },
  name: "Date Time Field · Basic",
  parameters: onlyControls("timeZoneContext", "wallTimeResolution"),
  render: (args) => {
    const hasTimeZone = args.timeZoneContext || args.wallTimeResolution;
    return (
      <ProofFrame itemId="date-time-field" title="Date and time field">
        <label style={labelStyle}>
          Planned start
          <DateTimeField
            ambiguityPolicy={args.wallTimeResolution ? "later" : "reject"}
            defaultValue="2026-10-25T02:30"
            name="planned-start"
            resolvedName={args.wallTimeResolution ? "planned-start-instant" : undefined}
            showTimeZoneContext={args.timeZoneContext}
            timeZone={hasTimeZone ? "Europe/Paris" : undefined}
            wallTimeAdapter={args.wallTimeResolution ? WALL_TIME_ADAPTER : false}
          />
        </label>
      </ProofFrame>
    );
  },
};

export const RecommendedDateTimeField: Story = {
  args: { timeZoneContext: true, wallTimeResolution: true },
  name: "Date Time Field · Recommended Mergora",
  parameters: onlyControls("timeZoneContext", "wallTimeResolution"),
  render: (args) => {
    const hasTimeZone = args.timeZoneContext || args.wallTimeResolution;
    return (
      <ProofFrame itemId="date-time-field" title="Date and time field">
        <label style={labelStyle}>
          Planned start
          <DateTimeField
            ambiguityPolicy={args.wallTimeResolution ? "later" : "reject"}
            defaultValue="2026-10-25T02:30"
            name="planned-start"
            resolvedName={args.wallTimeResolution ? "planned-start-instant" : undefined}
            showTimeZoneContext={args.timeZoneContext}
            timeZone={hasTimeZone ? "Europe/Paris" : undefined}
            wallTimeAdapter={args.wallTimeResolution ? WALL_TIME_ADAPTER : false}
          />
        </label>
      </ProofFrame>
    );
  },
};

export const BasicDateTimePicker: Story = {
  args: { dateTimePresets: false, timeZoneContext: false, wallTimeResolution: false },
  name: "Date Time Picker · Basic",
  parameters: onlyControls("dateTimePresets", "timeZoneContext", "wallTimeResolution"),
  render: (args) => (
    <DateTimePickerSpecimen
      presets={args.dateTimePresets}
      timeZoneContext={args.timeZoneContext}
      wallTimeResolution={args.wallTimeResolution}
    />
  ),
};

export const RecommendedDateTimePicker: Story = {
  args: { dateTimePresets: true, timeZoneContext: true, wallTimeResolution: true },
  name: "Date Time Picker · Recommended Mergora",
  parameters: onlyControls("dateTimePresets", "timeZoneContext", "wallTimeResolution"),
  render: (args) => (
    <DateTimePickerSpecimen
      presets={args.dateTimePresets}
      timeZoneContext={args.timeZoneContext}
      wallTimeResolution={args.wallTimeResolution}
    />
  ),
};

export const BasicMonthPicker: Story = {
  args: { quarterContext: false },
  name: "Month Picker · Basic",
  parameters: onlyControls("quarterContext"),
  render: (args) => (
    <ProofFrame itemId="month-picker" title="Month picker">
      <label style={labelStyle}>
        Reporting month
        <MonthPicker
          defaultValue="2026-08"
          name="reporting-month"
          showQuarterContext={args.quarterContext}
        />
      </label>
    </ProofFrame>
  ),
};

export const RecommendedMonthPicker: Story = {
  args: { quarterContext: true },
  name: "Month Picker · Recommended Mergora",
  parameters: onlyControls("quarterContext"),
  render: (args) => (
    <ProofFrame itemId="month-picker" title="Month picker">
      <label style={labelStyle}>
        Reporting month
        <MonthPicker
          defaultValue="2026-08"
          name="reporting-month"
          showQuarterContext={args.quarterContext}
        />
      </label>
    </ProofFrame>
  ),
};

export const BasicRangeCalendar: Story = {
  args: { availabilityExplanations: false, durationSummary: false, rangePreview: false },
  name: "Range Calendar · Basic",
  parameters: onlyControls("availabilityExplanations", "durationSummary", "rangePreview"),
  render: (args) => (
    <ProofFrame itemId="range-calendar" title="Range calendar">
      <RangeCalendar
        defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
        endName="calendar-range-end"
        locale="en-US"
        showAvailabilityExplanations={args.availabilityExplanations}
        showDurationSummary={args.durationSummary}
        showRangePreview={args.rangePreview}
        startName="calendar-range-start"
        unavailableDates={UNAVAILABLE_DATES}
        weekStartsOn={1}
      />
    </ProofFrame>
  ),
};

export const RecommendedRangeCalendar: Story = {
  args: { availabilityExplanations: true, durationSummary: true, rangePreview: true },
  name: "Range Calendar · Recommended Mergora",
  parameters: onlyControls("availabilityExplanations", "durationSummary", "rangePreview"),
  render: (args) => (
    <ProofFrame itemId="range-calendar" title="Range calendar">
      <RangeCalendar
        defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
        endName="calendar-range-end"
        locale="en-US"
        showAvailabilityExplanations={args.availabilityExplanations}
        showDurationSummary={args.durationSummary}
        showRangePreview={args.rangePreview}
        startName="calendar-range-start"
        unavailableDates={UNAVAILABLE_DATES}
        weekStartsOn={1}
      />
    </ProofFrame>
  ),
};

export const BasicTimeField: Story = {
  args: { timeZoneContext: false },
  name: "Time Field · Basic",
  parameters: onlyControls("timeZoneContext"),
  render: (args) => (
    <ProofFrame itemId="time-field" title="Time field">
      <label style={labelStyle}>
        Start time
        <TimeField
          defaultValue="09:00"
          name="start-time"
          showTimeZoneContext={args.timeZoneContext}
          timeZone={args.timeZoneContext ? "Europe/Paris" : undefined}
        />
      </label>
    </ProofFrame>
  ),
};

export const RecommendedTimeField: Story = {
  args: { timeZoneContext: true },
  name: "Time Field · Recommended Mergora",
  parameters: onlyControls("timeZoneContext"),
  render: (args) => (
    <ProofFrame itemId="time-field" title="Time field">
      <label style={labelStyle}>
        Start time
        <TimeField
          defaultValue="09:00"
          name="start-time"
          showTimeZoneContext={args.timeZoneContext}
          timeZone={args.timeZoneContext ? "Europe/Paris" : undefined}
        />
      </label>
    </ProofFrame>
  ),
};

export const BasicTimePicker: Story = {
  args: { timeIntervals: false, timeZoneContext: false },
  name: "Time Picker · Basic",
  parameters: onlyControls("timeIntervals", "timeZoneContext"),
  render: (args) => (
    <TimePickerSpecimen intervals={args.timeIntervals} timeZoneContext={args.timeZoneContext} />
  ),
};

export const RecommendedTimePicker: Story = {
  args: { timeIntervals: true, timeZoneContext: true },
  name: "Time Picker · Recommended Mergora",
  parameters: onlyControls("timeIntervals", "timeZoneContext"),
  render: (args) => (
    <TimePickerSpecimen intervals={args.timeIntervals} timeZoneContext={args.timeZoneContext} />
  ),
};

export const BasicYearPicker: Story = {
  args: { yearRangeSummary: false, yearWindowing: false },
  name: "Year Picker · Basic",
  parameters: onlyControls("yearRangeSummary", "yearWindowing"),
  render: (args) => (
    <YearPickerSpecimen rangeSummary={args.yearRangeSummary} windowing={args.yearWindowing} />
  ),
};

export const RecommendedYearPicker: Story = {
  args: { yearRangeSummary: true, yearWindowing: true },
  name: "Year Picker · Recommended Mergora",
  parameters: onlyControls("yearRangeSummary", "yearWindowing"),
  render: (args) => (
    <YearPickerSpecimen rangeSummary={args.yearRangeSummary} windowing={args.yearWindowing} />
  ),
};
