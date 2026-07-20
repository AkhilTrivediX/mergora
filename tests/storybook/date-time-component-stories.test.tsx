import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P4DateTimeComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P4DateTimeComponentProof.stories.tsx";
const evidencePath = "tests/storybook/date-time-component-stories.test.tsx";

const expectedItems = [
  {
    id: "calendar",
    controls: ["availabilityExplanations", "rangePreview"],
    basic: "BasicCalendar",
    recommended: "RecommendedCalendar",
  },
  {
    id: "date-field",
    controls: ["dateContext"],
    basic: "BasicDateField",
    recommended: "RecommendedDateField",
  },
  {
    id: "date-picker",
    controls: ["datePresets"],
    basic: "BasicDatePicker",
    recommended: "RecommendedDatePicker",
  },
  {
    id: "date-range-picker",
    controls: ["datePresets", "durationSummary", "durationBounds"],
    basic: "BasicDateRangePicker",
    recommended: "RecommendedDateRangePicker",
  },
  {
    id: "date-time-field",
    controls: ["timeZoneContext", "wallTimeResolution"],
    basic: "BasicDateTimeField",
    recommended: "RecommendedDateTimeField",
  },
  {
    id: "date-time-picker",
    controls: ["dateTimePresets", "timeZoneContext", "wallTimeResolution"],
    basic: "BasicDateTimePicker",
    recommended: "RecommendedDateTimePicker",
  },
  {
    id: "month-picker",
    controls: ["quarterContext"],
    basic: "BasicMonthPicker",
    recommended: "RecommendedMonthPicker",
  },
  {
    id: "range-calendar",
    controls: ["availabilityExplanations", "durationSummary", "rangePreview"],
    basic: "BasicRangeCalendar",
    recommended: "RecommendedRangeCalendar",
  },
  {
    id: "time-field",
    controls: ["timeZoneContext"],
    basic: "BasicTimeField",
    recommended: "RecommendedTimeField",
  },
  {
    id: "time-picker",
    controls: ["timeIntervals", "timeZoneContext"],
    basic: "BasicTimePicker",
    recommended: "RecommendedTimePicker",
  },
  {
    id: "year-picker",
    controls: ["yearRangeSummary", "yearWindowing"],
    basic: "BasicYearPicker",
    recommended: "RecommendedYearPicker",
  },
] as const;

type Args = Record<string, boolean>;
type RenderableStory = {
  readonly args?: Partial<Args>;
  readonly parameters?: { readonly controls?: { readonly include?: readonly string[] } };
  readonly render?: (args: Args) => ReactElement;
};

const stories = storyModule as unknown as Record<string, RenderableStory>;
const defaultArgs = storyMeta.args as Args;

function story(name: string): RenderableStory {
  const value = stories[name];
  expect(value, name).toBeDefined();
  expect(value?.render, name).toBeTypeOf("function");
  return value!;
}

function renderStory(name: string, overrides: Partial<Args> = {}): string {
  const value = story(name);
  return renderToStaticMarkup(
    value.render!({ ...defaultArgs, ...value.args, ...overrides } as Args),
  );
}

describe("date and time component-specific Storybook evidence", () => {
  it("maps every item to unique Basic and Recommended exports with exact controls", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/date-time.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        interactionEvidence: { status: string };
        maturityAssessment: { status: string };
        optionalEnhancements: { storybookControlNames: string[] }[];
        storybook: {
          basic: {
            status: string;
            mode: string;
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
          enhanced: {
            status: string;
            mode: string;
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
        };
      }[];
    };
    const profileById = new Map(shard.profiles.map((profile) => [profile.id, profile]));
    const pointers: string[] = [];

    expect([...profileById.keys()].sort()).toEqual(expectedItems.map(({ id }) => id).sort());
    for (const expected of expectedItems) {
      const profile = profileById.get(expected.id)!;
      expect([
        ...new Set(
          profile.optionalEnhancements.flatMap(
            ({ storybookControlNames }) => storybookControlNames,
          ),
        ),
      ]).toEqual(expected.controls);
      expect(profile.storybook.basic).toMatchObject({
        status: "tested",
        mode: "basic-enhancements-disabled",
        modulePath: storyPath,
        exportName: expected.basic,
        enhancementControls: expected.controls,
      });
      expect(profile.storybook.enhanced).toMatchObject({
        status: "tested",
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        exportName: expected.recommended,
        enhancementControls: expected.controls,
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.interactionEvidence.status).toBe("partial");
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.maturityAssessment.status).toBe("not-ready");

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      expect(basic.parameters?.controls?.include).toEqual(expected.controls);
      expect(recommended.parameters?.controls?.include).toEqual(expected.controls);
      for (const control of expected.controls) {
        expect(basic.args?.[control]).toBe(false);
        expect(recommended.args?.[control]).toBe(true);
      }
      pointers.push(expected.basic, expected.recommended);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports every canonical item directly instead of routing through the aggregate story", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("P4DateTimeSystems");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("renders clean basic output and the actual optional enhancement contracts", () => {
    const rendered = Object.fromEntries(
      expectedItems.map(({ id, basic, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );

    for (const { id } of expectedItems) {
      expect(rendered[id]!.basic).toContain(`data-story-item="${id}"`);
      expect(rendered[id]!.recommended).toContain(`data-story-item="${id}"`);
    }

    expect(rendered.calendar!.basic).not.toContain("calendar-preview-evidence");
    expect(rendered.calendar!.basic).not.toContain("data-range-start");
    expect(rendered.calendar!.basic).not.toContain("Calibration unavailable.");
    expect(rendered.calendar!.recommended).toContain("calendar-preview-evidence");
    expect(rendered.calendar!.recommended).toContain('data-range-start="true"');
    expect(rendered.calendar!.recommended).toContain("Calibration unavailable.");

    expect(rendered["date-field"]!.basic).not.toContain('data-slot="date-field-context"');
    expect(rendered["date-field"]!.recommended).toContain('data-slot="date-field-context"');

    expect(rendered["date-picker"]!.basic).not.toContain('data-slot="date-picker-presets"');
    expect(rendered["date-picker"]!.basic).not.toContain("date-picker-preset-evidence");
    expect(rendered["date-picker"]!.recommended).toContain('data-slot="date-picker-presets"');
    expect(rendered["date-picker"]!.recommended).toContain("date-picker-preset-evidence");

    expect(rendered["date-range-picker"]!.basic).not.toContain(
      'data-slot="date-range-picker-presets"',
    );
    expect(rendered["date-range-picker"]!.basic).not.toContain(
      'data-slot="date-range-picker-duration"',
    );
    expect(rendered["date-range-picker"]!.basic).not.toContain("date-range-picker-bound-evidence");
    expect(rendered["date-range-picker"]!.recommended).toContain(
      'data-slot="date-range-picker-presets"',
    );
    expect(rendered["date-range-picker"]!.recommended).toContain(
      'data-slot="date-range-picker-duration"',
    );
    expect(rendered["date-range-picker"]!.recommended).toContain(
      "date-range-picker-bound-evidence",
    );

    expect(rendered["date-time-field"]!.basic).not.toContain('data-slot="date-time-field-zone"');
    expect(rendered["date-time-field"]!.basic).not.toContain(
      'data-slot="date-time-field-wall-time"',
    );
    expect(rendered["date-time-field"]!.basic).not.toContain(
      'data-slot="date-time-field-resolved-value"',
    );
    expect(rendered["date-time-field"]!.recommended).toContain('data-slot="date-time-field-zone"');
    expect(rendered["date-time-field"]!.recommended).toContain(
      'data-slot="date-time-field-wall-time"',
    );
    expect(rendered["date-time-field"]!.recommended).toContain(
      'data-slot="date-time-field-resolved-value"',
    );

    expect(rendered["date-time-picker"]!.basic).not.toContain(
      'data-slot="date-time-picker-presets"',
    );
    expect(rendered["date-time-picker"]!.basic).not.toContain('data-slot="date-time-field-zone"');
    expect(rendered["date-time-picker"]!.basic).not.toContain(
      'data-slot="date-time-field-wall-time"',
    );
    expect(rendered["date-time-picker"]!.recommended).toContain(
      'data-slot="date-time-picker-presets"',
    );
    expect(rendered["date-time-picker"]!.recommended).toContain('data-slot="date-time-field-zone"');
    expect(rendered["date-time-picker"]!.recommended).toContain(
      'data-slot="date-time-field-wall-time"',
    );

    expect(rendered["month-picker"]!.basic).not.toContain('data-slot="month-picker-quarter"');
    expect(rendered["month-picker"]!.recommended).toContain('data-slot="month-picker-quarter"');

    expect(rendered["range-calendar"]!.basic).not.toContain('data-slot="range-calendar-duration"');
    expect(rendered["range-calendar"]!.basic).not.toContain('data-range-preview="true"');
    expect(rendered["range-calendar"]!.basic).not.toContain("Calibration unavailable.");
    expect(rendered["range-calendar"]!.recommended).toContain(
      'data-slot="range-calendar-duration"',
    );
    expect(rendered["range-calendar"]!.recommended).toContain('data-range-preview="true"');
    expect(rendered["range-calendar"]!.recommended).toContain("Calibration unavailable.");

    expect(rendered["time-field"]!.basic).not.toContain('data-slot="time-field-zone"');
    expect(rendered["time-field"]!.recommended).toContain('data-slot="time-field-zone"');

    expect(rendered["time-picker"]!.basic).not.toContain('data-slot="time-picker-intervals"');
    expect(rendered["time-picker"]!.basic).not.toContain('data-slot="time-field-zone"');
    expect(rendered["time-picker"]!.basic).not.toContain("time-picker-interval-evidence");
    expect(rendered["time-picker"]!.recommended).toContain('data-slot="time-picker-intervals"');
    expect(rendered["time-picker"]!.recommended).toContain('data-slot="time-field-zone"');
    expect(rendered["time-picker"]!.recommended).toContain("time-picker-interval-evidence");

    expect(rendered["year-picker"]!.basic).not.toContain('data-windowed="true"');
    expect(rendered["year-picker"]!.basic).not.toContain('data-slot="year-picker-window"');
    expect(rendered["year-picker"]!.basic).not.toContain('data-slot="year-picker-range"');
    expect(rendered["year-picker"]!.recommended).toContain('data-windowed="true"');
    expect(rendered["year-picker"]!.recommended).toContain('data-slot="year-picker-window"');
    expect(rendered["year-picker"]!.recommended).toContain('data-slot="year-picker-range"');
  });

  it("keeps DateField, TimeField, and DateTimeField directly controllable without enabled enhancements", () => {
    const rendered = renderStory("ControlledTemporalFields");
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    expect(rendered).toContain('data-story-item="controlled-temporal-fields"');
    expect(rendered).toContain('name="controlled-review-date"');
    expect(rendered).toContain('name="controlled-start-time"');
    expect(rendered).toContain('name="controlled-planned-start"');
    expect(rendered).toContain('data-slot="controlled-temporal-values"');
    expect(rendered).toContain("Date: 2026-08-04; time: 09:00; date and time: 2026-08-04T09:00");
    expect(rendered).not.toContain('data-slot="date-field-context"');
    expect(rendered).not.toContain('data-slot="time-field-zone"');
    expect(rendered).not.toContain('data-slot="date-time-field-zone"');
    expect(rendered).not.toContain('data-slot="date-time-field-wall-time"');
    expect(rendered).not.toContain('data-slot="date-time-field-resolved-value"');
    expect(source).toContain("onValueChange={setDate}");
    expect(source).toContain("onValueChange={setTime}");
    expect(source).toContain("onValueChange={setDateTime}");
    expect(source).toContain("showDateContext={false}");
    expect(source).toContain("showTimeZoneContext={false}");
    expect(source).toContain("wallTimeAdapter={false}");
  });

  it("keeps multi-enhancement stories valid when one capability is disabled independently", () => {
    expect(renderStory("RecommendedCalendar", { availabilityExplanations: false })).not.toContain(
      "Calibration unavailable.",
    );
    expect(renderStory("RecommendedCalendar", { rangePreview: false })).not.toContain(
      "calendar-preview-evidence",
    );
    expect(renderStory("RecommendedDateRangePicker", { datePresets: false })).not.toContain(
      'data-slot="date-range-picker-presets"',
    );
    expect(renderStory("RecommendedDateRangePicker", { durationSummary: false })).not.toContain(
      'data-slot="date-range-picker-duration"',
    );
    expect(renderStory("RecommendedDateRangePicker", { durationBounds: false })).not.toContain(
      "date-range-picker-bound-evidence",
    );
    expect(renderStory("RecommendedDateTimePicker", { dateTimePresets: false })).not.toContain(
      'data-slot="date-time-picker-presets"',
    );
    expect(renderStory("RecommendedDateTimePicker", { timeZoneContext: false })).not.toContain(
      'data-slot="date-time-field-zone"',
    );
    expect(renderStory("RecommendedDateTimePicker", { wallTimeResolution: false })).not.toContain(
      'data-slot="date-time-field-wall-time"',
    );
    expect(
      renderStory("RecommendedRangeCalendar", { availabilityExplanations: false }),
    ).not.toContain("Calibration unavailable.");
    expect(renderStory("RecommendedRangeCalendar", { durationSummary: false })).not.toContain(
      'data-slot="range-calendar-duration"',
    );
    expect(renderStory("RecommendedRangeCalendar", { rangePreview: false })).not.toContain(
      'data-range-preview="true"',
    );
    expect(renderStory("RecommendedTimePicker", { timeIntervals: false })).not.toContain(
      'data-slot="time-picker-intervals"',
    );
    expect(renderStory("RecommendedTimePicker", { timeZoneContext: false })).not.toContain(
      'data-slot="time-field-zone"',
    );
    expect(renderStory("RecommendedYearPicker", { yearRangeSummary: false })).not.toContain(
      'data-slot="year-picker-range"',
    );
    expect(renderStory("RecommendedYearPicker", { yearWindowing: false })).not.toContain(
      'data-slot="year-picker-window"',
    );
  });
});
