import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Calendar } from "../../../registry/source/components/calendar/calendar.tsx";
import { DateField } from "../../../registry/source/components/date-field/date-field.tsx";
import {
  addCalendarDays,
  addCalendarMonths,
  canonicalDate,
  daysInMonth,
  formatCanonicalDate,
  inclusiveCalendarDays,
  isCanonicalDate,
  parseCanonicalDate,
} from "../../../registry/source/components/date-field/date-time-utils.ts";
import { DatePicker } from "../../../registry/source/components/date-picker/date-picker.tsx";
import { DateRangePicker } from "../../../registry/source/components/date-range-picker/date-range-picker.tsx";
import { DateTimeField } from "../../../registry/source/components/date-time-field/date-time-field.tsx";
import { DateTimePicker } from "../../../registry/source/components/date-time-picker/date-time-picker.tsx";
import { MonthPicker } from "../../../registry/source/components/month-picker/month-picker.tsx";
import { RangeCalendar } from "../../../registry/source/components/range-calendar/range-calendar.tsx";
import { TimeField } from "../../../registry/source/components/time-field/time-field.tsx";
import { TimePicker } from "../../../registry/source/components/time-picker/time-picker.tsx";
import { YearPicker } from "../../../registry/source/components/year-picker/year-picker.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "calendar",
  "date-field",
  "date-picker",
  "date-range-picker",
  "date-time-field",
  "date-time-picker",
  "month-picker",
  "range-calendar",
  "time-field",
  "time-picker",
  "year-picker",
] as const;
const expectedDependencies = {
  calendar: ["date-field"],
  "date-field": [],
  "date-picker": ["date-field"],
  "date-range-picker": ["date-field"],
  "date-time-field": ["date-field"],
  "date-time-picker": ["date-field", "date-time-field"],
  "month-picker": ["date-field"],
  "range-calendar": ["calendar", "date-field"],
  "time-field": ["date-field"],
  "time-picker": ["date-field", "time-field"],
  "year-picker": ["date-field"],
} satisfies Record<(typeof itemIds)[number], readonly string[]>;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("date and time canonical records", () => {
  it("ships one complete source record set per catalog item", () => {
    for (const itemId of itemIds) {
      const files = readdirSync(resolve(componentsRoot, itemId)).sort();
      const expected = [
        "README.md",
        "index.ts",
        `${itemId}-css.d.ts`,
        `${itemId}.anatomy.json`,
        `${itemId}.api.json`,
        `${itemId}.contract.json`,
        `${itemId}.css`,
        `${itemId}.metadata.json`,
        `${itemId}.source.json`,
        `${itemId}.status.json`,
        `${itemId}.stories.json`,
        `${itemId}.tsx`,
        ...(itemId === "date-field" ? ["date-time-utils.ts"] : []),
      ].sort();
      expect(files, itemId).toEqual(expected);
    }
  });

  it("validates metadata and all required story states", () => {
    for (const itemId of itemIds) {
      expect(
        validateSchemaDocument("component-metadata", readJson(itemId, `${itemId}.metadata.json`)),
        itemId,
      ).toMatchObject({ errors: [], ok: true });
      expect(
        validateStoryStateMatrix(readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`)),
        itemId,
      ).toMatchObject({ issues: [], ok: true });
    }
  });

  it("keeps source dependencies exact and maturity claims honest", () => {
    for (const itemId of itemIds) {
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(source).sort()).toEqual([
        "declaredImports",
        "entryPath",
        "id",
        "itemDependencies",
        "outputRole",
      ]);
      expect(source).toMatchObject({
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: expectedDependencies[itemId],
        outputRole: "system",
      });
      const records = readdirSync(resolve(componentsRoot, itemId))
        .filter((file) => file.endsWith(".json"))
        .map((file) => readItem(itemId, file))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(readJson(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        releaseStatus: "unreleased",
      });
    }
  });

  it("uses shared semantic tokens, logical layout, touch targets, and forced colors", () => {
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      expect(css, itemId).not.toMatch(/#[\da-f]{3,8}\b|\brgba?\(|\bhsla?\(/iu);
      expect(css, itemId).not.toMatch(/\b(?:left|right)-(?:width|color|style|radius)\s*:/u);
      expect(css, itemId).toContain("var(--mrg-semantic-color-background-canvas)");
      expect(css, itemId).toContain("@media (forced-colors: active)");
    }
  });
});

describe("canonical date arithmetic", () => {
  it("rejects impossible dates and preserves date-only UTC boundaries", () => {
    expect(isCanonicalDate("2024-02-29")).toBe(true);
    expect(isCanonicalDate("2023-02-29")).toBe(false);
    expect(isCanonicalDate("2026-8-04")).toBe(false);
    expect(parseCanonicalDate("2026-08-04")?.toISOString()).toBe("2026-08-04T00:00:00.000Z");
    expect(canonicalDate(2026, 8, 4)).toBe("2026-08-04");
  });

  it("handles leap years, month clipping, and inclusive duration deterministically", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(addCalendarDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addCalendarMonths("2026-01-31", 1)).toBe("2026-02-28");
    expect(inclusiveCalendarDays("2026-08-04", "2026-08-04")).toBe(1);
    expect(inclusiveCalendarDays("2026-08-04", "2026-08-10")).toBe(7);
    expect(inclusiveCalendarDays("2026-08-10", "2026-08-04")).toBeNull();
  });

  it("formats date context without a local-time-zone shift", () => {
    expect(formatCanonicalDate("2026-08-04", "en-US")).toContain("Tuesday");
    expect(formatCanonicalDate("not-a-date", "en-US")).toBeNull();
  });
});

describe("independently disableable Mergora date-time enhancements", () => {
  it("removes date, timezone, quarter, and year context nodes when disabled", () => {
    const basic = renderToStaticMarkup(
      <>
        <DateField defaultValue="2026-08-04" showDateContext={false} />
        <TimeField defaultValue="09:00" showTimeZoneContext={false} />
        <DateTimeField defaultValue="2026-08-04T09:00" showTimeZoneContext={false} />
        <MonthPicker defaultValue="2026-08" showQuarterContext={false} />
        <YearPicker defaultValue={2026} maxYear={2030} minYear={2020} showRangeSummary={false} />
      </>,
    );
    expect(basic).not.toContain("date-field-context");
    expect(basic).not.toContain("time-field-zone");
    expect(basic).not.toContain("date-time-field-zone");
    expect(basic).not.toContain("date-time-field-wall-time");
    expect(basic).not.toContain("month-picker-quarter");
    expect(basic).not.toContain("year-picker-range");
    expect(basic).not.toContain("year-picker-window");

    const enhanced = renderToStaticMarkup(
      <>
        <DateField defaultValue="2026-08-04" showDateContext />
        <TimeField defaultValue="09:00" showTimeZoneContext timeZone="Europe/Paris" />
        <DateTimeField
          defaultValue="2026-08-04T09:00"
          showTimeZoneContext
          timeZone="Europe/Paris"
        />
        <MonthPicker defaultValue="2026-08" showQuarterContext />
        <YearPicker defaultValue={2026} maxYear={2030} minYear={2020} showRangeSummary />
      </>,
    );
    expect(enhanced).toContain("Tuesday");
    expect(enhanced).toContain("Time zone: Europe/Paris");
    expect(enhanced).toContain("Interpreted in Europe/Paris");
    expect(enhanced).toContain("Quarter 3 of 2026");
    expect(enhanced).toContain("11 years available");
  });

  it("removes picker shortcuts, interval controls, events, and group semantics when disabled", () => {
    const basic = renderToStaticMarkup(
      <>
        <DatePicker presets={false} />
        <TimePicker intervals={false} />
        <DateTimePicker presets={false} />
        <DateRangePicker presets={false} showDurationSummary={false} />
      </>,
    );
    expect(basic).not.toContain("date-picker-presets");
    expect(basic).not.toContain("time-picker-intervals");
    expect(basic).not.toContain("date-time-picker-presets");
    expect(basic).not.toContain("date-range-picker-duration");

    const enhanced = renderToStaticMarkup(
      <>
        <DatePicker presets={[{ label: "Review", value: "2026-08-04" }]} />
        <TimePicker intervals={[{ label: "09:00", value: "09:00" }]} />
        <DateTimePicker presets={[{ label: "Morning", value: "2026-08-04T09:00" }]} />
        <DateRangePicker
          defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
          presets={[]}
          showDurationSummary
        />
      </>,
    );
    expect(enhanced).toContain("Review");
    expect(enhanced).toContain("Available times");
    expect(enhanced).toContain("Morning");
    expect(enhanced).toContain("3 calendar days");
  });

  it("keeps blocked-date reason text and range duration strictly gated", () => {
    const unavailableDates = [{ date: "2026-08-11", reason: "Closed for maintenance." }];
    const basic = renderToStaticMarkup(
      <>
        <Calendar
          defaultValue="2026-08-04"
          showAvailabilityExplanations={false}
          unavailableDates={unavailableDates}
        />
        <RangeCalendar
          defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
          showAvailabilityExplanations={false}
          showDurationSummary={false}
          unavailableDates={unavailableDates}
        />
      </>,
    );
    expect(basic).not.toContain("Closed for maintenance.");
    expect(basic).not.toContain("range-calendar-duration");
    expect(basic).not.toContain("range-calendar-preview");
    expect(basic).not.toContain("range-calendar-span-error");

    const enhanced = renderToStaticMarkup(
      <>
        <Calendar
          defaultValue="2026-08-04"
          showAvailabilityExplanations
          unavailableDates={unavailableDates}
        />
        <RangeCalendar
          defaultValue={{ end: "2026-08-06", start: "2026-08-04" }}
          showDurationSummary
        />
      </>,
    );
    expect(enhanced).toContain("Closed for maintenance.");
    expect(enhanced).toContain("3 calendar days");
  });

  it("keeps wall-time resolution completely dormant until an adapter is enabled", () => {
    let adapterCalls = 0;
    const adapter = {
      resolveLocalWallTime: () => {
        adapterCalls += 1;
        return { instant: "2026-08-04T07:00:00Z", kind: "valid" as const };
      },
    };
    const basic = renderToStaticMarkup(
      <DateTimeField
        defaultValue="2026-08-04T09:00"
        resolvedName="resolved"
        timeZone="Europe/Paris"
        wallTimeAdapter={false}
      />,
    );
    expect(adapterCalls).toBe(0);
    expect(basic).not.toContain("date-time-field-wall-time");
    expect(basic).not.toContain('name="resolved"');

    const enhanced = renderToStaticMarkup(
      <DateTimeField
        defaultValue="2026-08-04T09:00"
        resolvedName="resolved"
        timeZone="Europe/Paris"
        wallTimeAdapter={adapter}
      />,
    );
    expect(adapterCalls).toBe(1);
    expect(enhanced).toContain("Resolved instant");
    expect(enhanced).toContain('name="resolved"');
    expect(enhanced).toContain('value="2026-08-04T07:00:00Z"');
  });

  it("makes ambiguity policy explicit and turns rejected wall times into recoverable output", () => {
    const ambiguousAdapter = {
      resolveLocalWallTime: () => ({
        earlierInstant: "2026-10-25T00:30:00Z",
        kind: "ambiguous" as const,
        laterInstant: "2026-10-25T01:30:00Z",
      }),
    };
    const rejected = renderToStaticMarkup(
      <DateTimeField
        ambiguityPolicy="reject"
        defaultValue="2026-10-25T02:30"
        resolvedName="instant"
        timeZone="Europe/Paris"
        wallTimeAdapter={ambiguousAdapter}
      />,
    );
    expect(rejected).toContain("occurs twice");
    expect(rejected).toContain('aria-invalid="true"');
    expect(rejected).not.toContain('name="instant"');

    const resolved = renderToStaticMarkup(
      <DateTimeField
        ambiguityPolicy="later"
        defaultValue="2026-10-25T02:30"
        resolvedName="instant"
        timeZone="Europe/Paris"
        wallTimeAdapter={ambiguousAdapter}
      />,
    );
    expect(resolved).toContain("later occurrence");
    expect(resolved).toContain('value="2026-10-25T01:30:00Z"');
  });

  it("enforces optional date-range duration bounds with native constraints and recovery copy", () => {
    const basic = renderToStaticMarkup(
      <DateRangePicker defaultValue={{ end: "2026-08-05", start: "2026-08-04" }} />,
    );
    expect(basic).not.toContain("date-range-picker-duration-error");

    const constrained = renderToStaticMarkup(
      <DateRangePicker
        defaultValue={{ end: "2026-08-05", start: "2026-08-04" }}
        maximumDurationDays={7}
        minimumDurationDays={3}
      />,
    );
    expect(constrained).toContain("at least 3 calendar days");
    expect(constrained).toContain('aria-invalid="true"');
    expect(constrained).toContain('min="2026-08-06"');
    expect(constrained).toContain('max="2026-08-10"');
  });

  it("rejects a fully selected unavailable span while gating consumer reasons", () => {
    const unavailableDates = [{ date: "2026-08-11", reason: "Closed for maintenance." }];
    const basic = renderToStaticMarkup(
      <RangeCalendar
        defaultValue={{ end: "2026-08-13", start: "2026-08-10" }}
        showAvailabilityExplanations={false}
        unavailableDates={unavailableDates}
      />,
    );
    expect(basic).toContain("range-calendar-span-error");
    expect(basic).toContain("crosses unavailable date 2026-08-11");
    expect(basic).not.toContain("Closed for maintenance.");

    const enhanced = renderToStaticMarkup(
      <RangeCalendar
        defaultValue={{ end: "2026-08-13", start: "2026-08-10" }}
        showAvailabilityExplanations
        unavailableDates={unavailableDates}
      />,
    );
    expect(enhanced).toContain("Closed for maintenance.");
  });

  it("bounds huge year domains with a consumer-controlled native window", () => {
    const windowed = renderToStaticMarkup(
      <YearPicker
        defaultValue={9000}
        maxYear={10_000}
        minYear={1}
        onVisibleRangeChange={() => undefined}
        visibleRange={{ endYear: 2030, startYear: 2020 }}
      />,
    );
    expect(windowed).toContain("year-picker-window");
    expect(windowed).toContain("2020");
    expect(windowed).toContain("2030");
    expect(windowed).toContain('<option value="9000" selected="">9000</option>');
    expect(windowed.match(/<option/gu)).toHaveLength(13);
  });
});

describe("native form surface", () => {
  it("renders successful canonical controls with names, bounds, requirements, and defaults", () => {
    const markup = renderToStaticMarkup(
      <form>
        <DateField
          defaultValue="2026-08-04"
          max="2026-12-31"
          min="2026-01-01"
          name="date"
          required
        />
        <TimeField defaultValue="09:00" name="time" step={60} />
        <DateTimeField defaultValue="2026-08-04T09:00" name="date-time" />
        <MonthPicker defaultValue="2026-08" name="month" />
        <YearPicker defaultValue={2026} maxYear={2030} minYear={2020} name="year" />
      </form>,
    );
    expect(markup).toContain('type="date"');
    expect(markup).toContain('name="date"');
    expect(markup).toContain('required=""');
    expect(markup).toContain('type="time"');
    expect(markup).toContain('name="date-time"');
    expect(markup).toContain('type="datetime-local"');
    expect(markup).toContain('type="month"');
    expect(markup).toContain('<option value="2026" selected="">2026</option>');
  });

  it("rejects unsafe year domains before rendering a huge native collection", () => {
    expect(() => renderToStaticMarkup(<YearPicker maxYear={10000} minYear={0} />)).toThrow(
      /at most 5,001 years/u,
    );
    expect(() => renderToStaticMarkup(<YearPicker maxYear={2020} minYear={2030} />)).toThrow(
      /minYear not greater/u,
    );
    expect(() =>
      renderToStaticMarkup(
        <YearPicker
          maxYear={10_000}
          minYear={1}
          visibleRange={{ endYear: 9000, startYear: 2000 }}
        />,
      ),
    ).toThrow(/visibleRange supports at most 5,001 years/u);
  });

  it("rejects invalid duration contracts before rendering contradictory constraints", () => {
    expect(() =>
      renderToStaticMarkup(<DateRangePicker maximumDurationDays={2} minimumDurationDays={3} />),
    ).toThrow(/must not exceed/u);
    expect(() => renderToStaticMarkup(<DateRangePicker minimumDurationDays={0} />)).toThrow(
      /positive safe integer/u,
    );
  });

  it("requires an explicit zone only when wall-time resolution is enabled", () => {
    const adapter = {
      resolveLocalWallTime: () => ({ instant: "2026-08-04T07:00:00Z", kind: "valid" as const }),
    };
    expect(() =>
      renderToStaticMarkup(
        <DateTimeField defaultValue="2026-08-04T09:00" wallTimeAdapter={adapter} />,
      ),
    ).toThrow(/requires an explicit timeZone/u);
    expect(() =>
      renderToStaticMarkup(
        <DateTimeField defaultValue="2026-08-04T09:00" wallTimeAdapter={false} />,
      ),
    ).not.toThrow();
  });
});
