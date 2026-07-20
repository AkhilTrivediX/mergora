import { useCallback, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Calendar } from "../../../registry/source/components/calendar/calendar";
import { DateField } from "../../../registry/source/components/date-field/date-field";
import { DatePicker } from "../../../registry/source/components/date-picker/date-picker";
import {
  DateRangePicker,
  type DateRangeDurationIssue,
  type DateRangeValue,
} from "../../../registry/source/components/date-range-picker/date-range-picker";
import {
  DateTimeField,
  type DateTimeWallTimeAdapter,
  type DateTimeWallTimeStatus,
} from "../../../registry/source/components/date-time-field/date-time-field";
import { DateTimePicker } from "../../../registry/source/components/date-time-picker/date-time-picker";
import { MonthPicker } from "../../../registry/source/components/month-picker/month-picker";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import { RangeCalendar } from "../../../registry/source/components/range-calendar/range-calendar";
import { TimeField } from "../../../registry/source/components/time-field/time-field";
import { TimePicker } from "../../../registry/source/components/time-picker/time-picker";
import {
  YearPicker,
  type YearPickerVisibleRange,
} from "../../../registry/source/components/year-picker/year-picker";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "clamp(1rem, 4vw, 3rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "68rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const matrixStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 19rem), 1fr))",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-strong) solid var(--mrg-semantic-color-border-strong)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-sm)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-inset-md)",
} satisfies CSSProperties;

const labelStyle = {
  display: "grid",
  fontSize: "var(--mrg-semantic-font-size-label)",
  fontWeight: "var(--mrg-semantic-font-weight-label)",
  gap: "var(--mrg-semantic-space-stack-xs)",
} satisfies CSSProperties;

const actionStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-action-border)",
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

interface DateTimeEnhancementArgs {
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
  readonly yearRangeSummary: boolean;
  readonly yearWindowing: boolean;
  readonly wallTimeResolution: boolean;
}

const DATE_PRESETS = [
  { label: "First review", value: "2026-08-04" },
  { label: "Second review", value: "2026-08-18" },
] as const;
const RANGE_PRESETS = [
  { label: "Three-day window", value: { end: "2026-08-06", start: "2026-08-04" } },
  { label: "Full week", value: { end: "2026-08-10", start: "2026-08-04" } },
] as const;
const TIME_INTERVALS = [
  { label: "09:00", value: "09:00" },
  { label: "10:30", value: "10:30" },
  { label: "14:00", value: "14:00" },
] as const;
const DATE_TIME_PRESETS = [
  { label: "Morning", value: "2026-08-04T09:00" },
  { label: "Afternoon", value: "2026-08-04T14:00" },
] as const;
const UNAVAILABLE = [
  { date: "2026-08-11", reason: "Closed for maintenance." },
  { date: "2026-08-12", reason: "No appointments are available." },
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
    if (localValue === "2026-03-29T02:30") return { kind: "nonexistent" };
    return { instant: "2026-08-04T07:00:00Z", kind: "valid" };
  },
};

function Canvas({
  children,
  direction = "ltr",
  locale = "en-US",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
}) {
  return (
    <MergoraProvider direction={direction} locale={locale}>
      <main dir={direction} style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

function YearWindowSpecimen({
  enabled,
  showRangeSummary,
}: {
  readonly enabled: boolean;
  readonly showRangeSummary: boolean;
}) {
  const [visibleRange, setVisibleRange] = useState<YearPickerVisibleRange>({
    endYear: 2030,
    startYear: 2020,
  });
  return (
    <YearPicker
      defaultValue={2026}
      maxYear={enabled ? 10_000 : 2030}
      minYear={enabled ? 1 : 2020}
      name="archive-year"
      onVisibleRangeChange={enabled ? setVisibleRange : undefined}
      showRangeSummary={showRangeSummary}
      visibleRange={enabled ? visibleRange : false}
    />
  );
}

function ComponentModes(args: Partial<DateTimeEnhancementArgs> = {}) {
  const options: DateTimeEnhancementArgs = {
    availabilityExplanations: true,
    dateContext: true,
    datePresets: true,
    dateTimePresets: true,
    durationBounds: true,
    durationSummary: true,
    quarterContext: true,
    rangePreview: true,
    timeIntervals: true,
    timeZoneContext: true,
    wallTimeResolution: true,
    yearRangeSummary: true,
    yearWindowing: true,
    ...args,
  };
  const [durationIssueEvent, setDurationIssueEvent] = useState("none");
  const [wallTimeEvent, setWallTimeEvent] = useState("none");
  const handleDurationIssue = useCallback((issue: DateRangeDurationIssue | null) => {
    setDurationIssueEvent(issue?.reason ?? "none");
  }, []);
  const handleWallTimeResolution = useCallback((status: DateTimeWallTimeStatus | null) => {
    setWallTimeEvent(status?.kind ?? "none");
  }, []);
  return (
    <Canvas>
      <header>
        <h1 style={{ margin: 0 }}>Date and time controls</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Native form controls stay primary. Optional context and shortcuts can be switched off
          independently with no replacement value model.
        </p>
      </header>
      <div style={matrixStyle}>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Date field</h2>
          <label style={labelStyle}>
            Review date
            <DateField
              defaultValue="2026-08-04"
              name="review-date"
              showDateContext={options.dateContext}
            />
          </label>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Date picker</h2>
          <DatePicker
            defaultValue="2026-08-04"
            inputLabel="Milestone date"
            name="milestone-date"
            presets={options.datePresets ? DATE_PRESETS : false}
            showDateContext={options.dateContext}
          />
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Time field</h2>
          <label style={labelStyle}>
            Start time
            <TimeField
              defaultValue="09:00"
              name="start-time"
              showTimeZoneContext={options.timeZoneContext}
              timeZone="Europe/Paris"
            />
          </label>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Time picker</h2>
          <TimePicker
            defaultValue="09:00"
            inputLabel="Available time"
            intervals={options.timeIntervals ? TIME_INTERVALS : false}
            name="available-time"
            showTimeZoneContext={options.timeZoneContext}
            timeZone="Europe/Paris"
          />
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Local date and time</h2>
          <label style={labelStyle}>
            Planned start
            <DateTimeField
              ambiguityPolicy="later"
              defaultValue="2026-10-25T02:30"
              name="planned-start"
              onWallTimeResolutionChange={
                options.wallTimeResolution ? handleWallTimeResolution : undefined
              }
              resolvedName={options.wallTimeResolution ? "planned-start-instant" : undefined}
              showTimeZoneContext={options.timeZoneContext}
              timeZone="Europe/Paris"
              wallTimeAdapter={options.wallTimeResolution ? WALL_TIME_ADAPTER : false}
            />
          </label>
          {options.wallTimeResolution ? (
            <output aria-live="polite" data-testid="wall-time-resolution-event">
              Resolution event: {wallTimeEvent}
            </output>
          ) : null}
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Date-time picker</h2>
          <DateTimePicker
            ambiguityPolicy="later"
            defaultValue="2026-10-25T02:30"
            inputLabel="Planned handoff"
            name="planned-handoff"
            presets={options.dateTimePresets ? DATE_TIME_PRESETS : false}
            resolvedName={options.wallTimeResolution ? "planned-handoff-instant" : undefined}
            showTimeZoneContext={options.timeZoneContext}
            timeZone="Europe/Paris"
            wallTimeAdapter={options.wallTimeResolution ? WALL_TIME_ADAPTER : false}
          />
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Month picker</h2>
          <label style={labelStyle}>
            Reporting month
            <MonthPicker
              defaultValue="2026-08"
              name="reporting-month"
              showQuarterContext={options.quarterContext}
            />
          </label>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Year picker</h2>
          <label style={labelStyle}>
            Archive year
            <YearWindowSpecimen
              enabled={options.yearWindowing}
              showRangeSummary={options.yearRangeSummary}
            />
          </label>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Date range</h2>
          <DateRangePicker
            defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
            endName="window-end"
            maximumDurationDays={options.durationBounds ? 7 : undefined}
            minimumDurationDays={options.durationBounds ? 2 : undefined}
            onDurationIssueChange={options.durationBounds ? handleDurationIssue : undefined}
            presets={options.datePresets ? RANGE_PRESETS : false}
            showDurationSummary={options.durationSummary}
            startName="window-start"
          />
          {options.durationBounds ? (
            <output aria-live="polite" data-testid="duration-issue-event">
              Duration issue: {durationIssueEvent}
            </output>
          ) : null}
        </section>
      </div>
      <section style={specimenStyle}>
        <h2 style={{ margin: 0 }}>Calendar</h2>
        <Calendar
          defaultValue="2026-08-04"
          locale="en-US"
          name="calendar-date"
          showAvailabilityExplanations={options.availabilityExplanations}
          unavailableDates={UNAVAILABLE}
          weekStartsOn={1}
        />
      </section>
      <section style={specimenStyle}>
        <h2 style={{ margin: 0 }}>Range calendar</h2>
        <RangeCalendar
          defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
          endName="calendar-range-end"
          locale="en-US"
          showAvailabilityExplanations={options.availabilityExplanations}
          showDurationSummary={options.durationSummary}
          showRangePreview={options.rangePreview}
          startName="calendar-range-start"
          unavailableDates={UNAVAILABLE}
          weekStartsOn={1}
        />
      </section>
    </Canvas>
  );
}

function ControlledRangeExample() {
  const [value, setValue] = useState<DateRangeValue>({
    end: "2026-08-06",
    start: "2026-08-04",
  });
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Controlled range</h1>
      <DateRangePicker onValueChange={setValue} showDurationSummary value={value} />
      <output aria-live="polite">{JSON.stringify(value)}</output>
    </Canvas>
  );
}

function FormExample() {
  const [submission, setSubmission] = useState("No submission yet.");
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmission(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())));
  };
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Native submission and reset</h1>
      <form aria-label="Temporal settings" onSubmit={submit}>
        <div style={matrixStyle}>
          <label style={labelStyle}>
            Effective date
            <DateField defaultValue="2026-08-04" name="effective-date" required />
          </label>
          <label style={labelStyle}>
            Effective time
            <TimeField defaultValue="09:00" name="effective-time" required />
          </label>
          <label style={labelStyle}>
            Effective local date and time
            <DateTimeField
              defaultValue="2026-08-04T09:00"
              name="effective-local-date-time"
              required
              resolvedName="effective-instant"
              timeZone="Europe/Paris"
              wallTimeAdapter={WALL_TIME_ADAPTER}
            />
          </label>
          <label style={labelStyle}>
            Reporting month
            <MonthPicker defaultValue="2026-08" name="reporting-month" required />
          </label>
          <label style={labelStyle}>
            Archive year
            <YearPicker
              defaultValue={2026}
              maxYear={2030}
              minYear={2020}
              name="archive-year"
              required
            />
          </label>
          <DateRangePicker
            defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
            endName="field-range-end"
            required
            showDurationSummary
            startName="field-range-start"
          />
        </div>
        <RangeCalendar
          defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
          endName="calendar-form-end"
          required
          showDurationSummary
          startName="calendar-form-start"
        />
        <div
          style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", marginBlockStart: "1rem" }}
        >
          <button style={actionStyle} type="submit">
            Inspect values
          </button>
          <button style={actionStyle} type="reset">
            Restore defaults
          </button>
        </div>
      </form>
      <output aria-live="polite" data-testid="date-time-form-output">
        {submission}
      </output>
    </Canvas>
  );
}

const meta = {
  args: {
    availabilityExplanations: true,
    dateContext: true,
    datePresets: true,
    dateTimePresets: true,
    durationBounds: true,
    durationSummary: true,
    quarterContext: true,
    rangePreview: true,
    timeIntervals: true,
    timeZoneContext: true,
    wallTimeResolution: true,
    yearRangeSummary: true,
    yearWindowing: true,
  },
  argTypes: {
    availabilityExplanations: { control: "boolean" },
    dateContext: { control: "boolean" },
    datePresets: { control: "boolean" },
    dateTimePresets: { control: "boolean" },
    durationBounds: { control: "boolean" },
    durationSummary: { control: "boolean" },
    quarterContext: { control: "boolean" },
    rangePreview: { control: "boolean" },
    timeIntervals: { control: "boolean" },
    timeZoneContext: { control: "boolean" },
    wallTimeResolution: { control: "boolean" },
    yearRangeSummary: { control: "boolean" },
    yearWindowing: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  title: "P4/Date and time systems",
} satisfies Meta<DateTimeEnhancementArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {
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
  render: (args) => <ComponentModes {...args} />,
};

export const RecommendedMergora: Story = {
  render: (args) => <ComponentModes {...args} />,
};

export const ControlledAndUncontrolled: Story = { render: () => <ControlledRangeExample /> };

export const FormLifecycle: Story = { render: () => <FormExample /> };

export const KeyboardWorkbench: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Calendar keyboard workbench</h1>
      <p style={{ margin: 0 }}>
        Use arrows, Home, End, Page Up, Page Down, and Shift + Page Up or Down.
      </p>
      <Calendar defaultValue="2026-08-04" locale="en-US" weekStartsOn={1} />
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Disabled, read-only, invalid, and empty states</h1>
      <div style={matrixStyle}>
        <label style={labelStyle}>
          Disabled date
          <DateField defaultValue="2026-08-04" disabled />
        </label>
        <label style={labelStyle}>
          Read-only time
          <TimeField defaultValue="09:00" readOnly />
        </label>
        <label style={labelStyle}>
          Required empty date
          <DateField aria-invalid required />
        </label>
        <DatePicker disabled inputLabel="Disabled date picker" presets={DATE_PRESETS} />
        <Calendar disabled defaultValue="2026-08-04" />
        <YearPicker aria-invalid maxYear={2030} minYear={2020} required />
        <label style={labelStyle}>
          Nonexistent local time
          <DateTimeField
            defaultValue="2026-03-29T02:30"
            timeZone="Europe/Paris"
            wallTimeAdapter={WALL_TIME_ADAPTER}
          />
        </label>
        <DateRangePicker
          defaultValue={{ end: "2026-08-05", start: "2026-08-04" }}
          minimumDurationDays={3}
        />
      </div>
      <RangeCalendar
        defaultValue={{ end: "2026-08-13", start: "2026-08-10" }}
        showAvailabilityExplanations
        showRangePreview
        unavailableDates={UNAVAILABLE}
      />
    </Canvas>
  ),
};

export const NarrowMobile: Story = {
  render: () => (
    <div style={{ inlineSize: "20rem", maxInlineSize: "100%" }}>
      <ComponentModes
        availabilityExplanations
        dateContext
        datePresets
        dateTimePresets
        durationBounds
        durationSummary
        quarterContext
        rangePreview
        timeIntervals
        timeZoneContext
        wallTimeResolution
        yearRangeSummary
        yearWindowing
      />
    </div>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <h1 style={{ margin: 0 }}>عناصر التاريخ والوقت</h1>
      <Calendar
        defaultValue="2026-08-04"
        locale="ar-EG"
        showAvailabilityExplanations
        unavailableDates={UNAVAILABLE}
        weekStartsOn={6}
      />
      <DateRangePicker
        defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
        endLabel="تاريخ الانتهاء"
        showDurationSummary
        startLabel="تاريخ البدء"
      />
    </Canvas>
  ),
};

export const UserPreferenceEvidence: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Forced colors and reduced motion target</h1>
      <p style={{ margin: 0 }}>
        Browser evidence emulates both preferences against these controls.
      </p>
      <Calendar
        defaultValue="2026-08-04"
        showAvailabilityExplanations
        unavailableDates={UNAVAILABLE}
      />
      <TimePicker
        defaultValue="09:00"
        intervals={TIME_INTERVALS}
        showTimeZoneContext
        timeZone="Europe/Paris"
      />
    </Canvas>
  ),
};
