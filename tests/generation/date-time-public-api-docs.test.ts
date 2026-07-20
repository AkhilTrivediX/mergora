import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  {
    id: "calendar",
    publicExports: ["CalendarProps"],
    props: [
      "CalendarProps.defaultValue",
      "CalendarProps.disabled",
      "CalendarProps.form",
      "CalendarProps.highlightRange",
      "CalendarProps.inputAriaDescribedBy",
      "CalendarProps.inputAriaInvalid",
      "CalendarProps.inputLabel",
      "CalendarProps.locale",
      "CalendarProps.maxValue",
      "CalendarProps.minValue",
      "CalendarProps.name",
      "CalendarProps.nextMonthLabel",
      "CalendarProps.onDatePreviewChange",
      "CalendarProps.onValueChange",
      "CalendarProps.previousMonthLabel",
      "CalendarProps.readOnly",
      "CalendarProps.required",
      "CalendarProps.showAvailabilityExplanations",
      "CalendarProps.unavailableDates",
      "CalendarProps.value",
      "CalendarProps.weekStartsOn",
    ],
  },
  {
    id: "date-field",
    publicExports: ["DateFieldProps"],
    props: [
      "DateFieldProps.dateContext",
      "DateFieldProps.defaultValue",
      "DateFieldProps.locale",
      "DateFieldProps.onChange",
      "DateFieldProps.onValueChange",
      "DateFieldProps.showDateContext",
      "DateFieldProps.value",
    ],
  },
  {
    id: "date-picker",
    publicExports: ["DatePickerProps"],
    props: [
      "DatePickerProps.defaultValue",
      "DatePickerProps.disabled",
      "DatePickerProps.form",
      "DatePickerProps.inputLabel",
      "DatePickerProps.inputRef",
      "DatePickerProps.max",
      "DatePickerProps.min",
      "DatePickerProps.name",
      "DatePickerProps.onChange",
      "DatePickerProps.onPresetSelect",
      "DatePickerProps.onValueChange",
      "DatePickerProps.presets",
      "DatePickerProps.readOnly",
      "DatePickerProps.required",
      "DatePickerProps.showDateContext",
      "DatePickerProps.value",
    ],
  },
  {
    id: "date-range-picker",
    publicExports: ["DateRangePickerProps"],
    props: [
      "DateRangePickerProps.defaultValue",
      "DateRangePickerProps.disabled",
      "DateRangePickerProps.durationSummary",
      "DateRangePickerProps.endLabel",
      "DateRangePickerProps.endName",
      "DateRangePickerProps.form",
      "DateRangePickerProps.getDurationError",
      "DateRangePickerProps.max",
      "DateRangePickerProps.maximumDurationDays",
      "DateRangePickerProps.min",
      "DateRangePickerProps.minimumDurationDays",
      "DateRangePickerProps.onDurationIssueChange",
      "DateRangePickerProps.onPresetSelect",
      "DateRangePickerProps.onValueChange",
      "DateRangePickerProps.presets",
      "DateRangePickerProps.readOnly",
      "DateRangePickerProps.required",
      "DateRangePickerProps.showDurationSummary",
      "DateRangePickerProps.startLabel",
      "DateRangePickerProps.startName",
      "DateRangePickerProps.value",
    ],
  },
  {
    id: "date-time-field",
    publicExports: ["DateTimeFieldProps"],
    props: [
      "DateTimeFieldProps.ambiguityPolicy",
      "DateTimeFieldProps.defaultValue",
      "DateTimeFieldProps.getWallTimeMessage",
      "DateTimeFieldProps.onChange",
      "DateTimeFieldProps.onValueChange",
      "DateTimeFieldProps.onWallTimeResolutionChange",
      "DateTimeFieldProps.resolvedName",
      "DateTimeFieldProps.showTimeZoneContext",
      "DateTimeFieldProps.timeZone",
      "DateTimeFieldProps.timeZoneContext",
      "DateTimeFieldProps.value",
      "DateTimeFieldProps.wallTimeAdapter",
    ],
  },
  {
    id: "date-time-picker",
    publicExports: ["DateTimePickerProps"],
    props: [
      "DateTimePickerProps.ambiguityPolicy",
      "DateTimePickerProps.defaultValue",
      "DateTimePickerProps.disabled",
      "DateTimePickerProps.form",
      "DateTimePickerProps.getWallTimeMessage",
      "DateTimePickerProps.inputLabel",
      "DateTimePickerProps.inputRef",
      "DateTimePickerProps.max",
      "DateTimePickerProps.min",
      "DateTimePickerProps.name",
      "DateTimePickerProps.onChange",
      "DateTimePickerProps.onPresetSelect",
      "DateTimePickerProps.onValueChange",
      "DateTimePickerProps.onWallTimeResolutionChange",
      "DateTimePickerProps.presets",
      "DateTimePickerProps.readOnly",
      "DateTimePickerProps.required",
      "DateTimePickerProps.resolvedName",
      "DateTimePickerProps.showTimeZoneContext",
      "DateTimePickerProps.timeZone",
      "DateTimePickerProps.value",
      "DateTimePickerProps.wallTimeAdapter",
    ],
  },
  {
    id: "month-picker",
    publicExports: ["MonthPickerProps"],
    props: [
      "MonthPickerProps.defaultValue",
      "MonthPickerProps.onChange",
      "MonthPickerProps.onValueChange",
      "MonthPickerProps.quarterContext",
      "MonthPickerProps.showQuarterContext",
      "MonthPickerProps.value",
    ],
  },
  {
    id: "range-calendar",
    publicExports: ["RangeCalendarProps"],
    props: [
      "RangeCalendarProps.aria-describedby",
      "RangeCalendarProps.defaultValue",
      "RangeCalendarProps.disabled",
      "RangeCalendarProps.durationSummary",
      "RangeCalendarProps.endLabel",
      "RangeCalendarProps.endName",
      "RangeCalendarProps.form",
      "RangeCalendarProps.getUnavailableSpanError",
      "RangeCalendarProps.locale",
      "RangeCalendarProps.maxValue",
      "RangeCalendarProps.minValue",
      "RangeCalendarProps.onValueChange",
      "RangeCalendarProps.rangePreviewSummary",
      "RangeCalendarProps.readOnly",
      "RangeCalendarProps.required",
      "RangeCalendarProps.showAvailabilityExplanations",
      "RangeCalendarProps.showDurationSummary",
      "RangeCalendarProps.showRangePreview",
      "RangeCalendarProps.startLabel",
      "RangeCalendarProps.startName",
      "RangeCalendarProps.unavailableDates",
      "RangeCalendarProps.value",
      "RangeCalendarProps.weekStartsOn",
    ],
  },
  {
    id: "time-field",
    publicExports: ["TimeFieldProps"],
    props: [
      "TimeFieldProps.defaultValue",
      "TimeFieldProps.onChange",
      "TimeFieldProps.onValueChange",
      "TimeFieldProps.showTimeZoneContext",
      "TimeFieldProps.timeZone",
      "TimeFieldProps.timeZoneContext",
      "TimeFieldProps.value",
    ],
  },
  {
    id: "time-picker",
    publicExports: ["TimePickerProps"],
    props: [
      "TimePickerProps.defaultValue",
      "TimePickerProps.disabled",
      "TimePickerProps.form",
      "TimePickerProps.inputLabel",
      "TimePickerProps.inputRef",
      "TimePickerProps.intervals",
      "TimePickerProps.max",
      "TimePickerProps.min",
      "TimePickerProps.name",
      "TimePickerProps.onChange",
      "TimePickerProps.onIntervalSelect",
      "TimePickerProps.onValueChange",
      "TimePickerProps.readOnly",
      "TimePickerProps.required",
      "TimePickerProps.showTimeZoneContext",
      "TimePickerProps.timeZone",
      "TimePickerProps.value",
    ],
  },
  {
    id: "year-picker",
    publicExports: ["YearPickerProps"],
    props: [
      "YearPickerProps.defaultValue",
      "YearPickerProps.maxYear",
      "YearPickerProps.minYear",
      "YearPickerProps.nextWindowLabel",
      "YearPickerProps.onChange",
      "YearPickerProps.onValueChange",
      "YearPickerProps.onVisibleRangeChange",
      "YearPickerProps.previousWindowLabel",
      "YearPickerProps.rangeSummary",
      "YearPickerProps.showRangeSummary",
      "YearPickerProps.value",
      "YearPickerProps.visibleRange",
      "YearPickerProps.windowGroupLabel",
    ],
  },
] as const;

const hiddenSurfaces = {
  calendar: {
    CalendarHighlightRange: ["end", "start"],
    CalendarUnavailableDate: ["date", "reason"],
  },
  "date-picker": { DatePickerPreset: ["label", "value"] },
  "date-range-picker": {
    DateRangeDurationIssue: ["actualDays", "maximumDays", "minimumDays", "reason", "value"],
    DateRangePreset: ["label", "value"],
    DateRangeValue: ["end", "start"],
  },
  "date-time-field": {
    DateTimeWallTimeAdapter: ["resolveLocalWallTime", "localValue", "timeZone"],
    DateTimeWallTimeResolution: [
      "instant",
      "kind",
      "message",
      "earlierInstant",
      "kind",
      "laterInstant",
      "message",
      "kind",
      "message",
    ],
    DateTimeWallTimeStatus: [
      "adapterMessage",
      "ambiguityPolicy",
      "earlierInstant",
      "instant",
      "kind",
      "laterInstant",
      "localValue",
      "timeZone",
      "valid",
    ],
  },
  "date-time-picker": { DateTimePickerPreset: ["label", "value"] },
  "range-calendar": {
    RangeCalendarUnavailableSpanIssue: ["date", "range", "reason"],
    RangeCalendarValue: ["end", "start"],
  },
  "time-picker": { TimePickerInterval: ["label", "value"] },
  "year-picker": { YearPickerVisibleRange: ["endYear", "startYear"] },
} as const;

const documentedAliases = {
  "date-range-picker": ["DateRangeDurationIssueReason"],
  "date-time-field": ["DateTimeAmbiguityPolicy", "DateTimeWallTimeResolution"],
  "year-picker": ["YearPickerWindowDirection"],
} as const;

function sourceFor(id: string): { readonly path: string; readonly text: string } {
  const path = `registry/source/components/${id}/${id}.tsx`;
  return { path, text: readFileSync(resolve(workspaceRoot, path), "utf8") };
}

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const source = sourceFor(family.id);
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        { content: source.text, mediaType: "text/typescript-jsx", sourcePath: source.path },
      ],
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

function declarationFor(sourceFile: ts.SourceFile, name: string): ts.DeclarationStatement {
  const declaration = sourceFile.statements.find(
    (statement) =>
      (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
      statement.name.text === name,
  );
  if (declaration === undefined) throw new Error(`Missing declaration ${name}`);
  return declaration as ts.DeclarationStatement;
}

function propertyName(member: ts.PropertySignature): string {
  if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) return member.name.text;
  throw new Error(`Unsupported property name: ${member.name.getText()}`);
}

function nestedPropertySignatures(node: ts.Node): readonly ts.PropertySignature[] {
  const properties: ts.PropertySignature[] = [];
  const visit = (current: ts.Node): void => {
    if (ts.isPropertySignature(current)) properties.push(current);
    ts.forEachChild(current, visit);
  };
  visit(node);
  return properties;
}

function descriptionFor(sourceFile: ts.SourceFile, node: ts.Node): string | null {
  const comments = ts.getLeadingCommentRanges(sourceFile.text, node.getFullStart()) ?? [];
  const comment = [...comments]
    .reverse()
    .find(
      (candidate) =>
        candidate.kind === ts.SyntaxKind.MultiLineCommentTrivia &&
        sourceFile.text.slice(candidate.pos, candidate.pos + 3) === "/**",
    );
  if (comment === undefined) return null;
  return sourceFile.text
    .slice(comment.pos + 3, comment.end - 2)
    .split(/\r?\n/gu)
    .map((line) => line.replace(/^\s*\*?\s?/u, ""))
    .filter((line) => !line.startsWith("@"))
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

describe("date and time public API descriptions", () => {
  it("describes the exact extractor-visible inventory without review-required rows", () => {
    let describedCount = 0;
    let groupCount = 0;
    let localizationReviewCount = 0;
    let propCount = 0;
    let semanticReviewCount = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.groups.map((group) => group.name),
        `${family.id} groups`,
      ).toEqual(family.publicExports);
      expect(
        docs.props.map((prop) => `${prop.owner}.${prop.name}`),
        `${family.id} props`,
      ).toEqual(family.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description, key).not.toBeNull();
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.description, key).not.toMatch(/^(?:The|This) (?:prop|property)\b/iu);
        localizationReviewCount += Number(prop.localizationBehavior === "review-required");
        semanticReviewCount += Number(prop.semanticContract === "review-required");
      }
      describedCount += docs.summary.describedProps;
      groupCount += docs.summary.propGroups;
      propCount += docs.summary.props;
    }

    expect({
      describedCount,
      groupCount,
      localizationReviewCount,
      propCount,
      semanticReviewCount,
    }).toEqual({
      describedCount: 165,
      groupCount: 11,
      localizationReviewCount: 0,
      propCount: 165,
      semanticReviewCount: 0,
    });
  });

  it("documents extractor-hidden structured contracts and discriminated unions", () => {
    let declarationCount = 0;
    let propertyCount = 0;

    for (const [id, expectedDeclarations] of Object.entries(hiddenSurfaces)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.path,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const [name, expectedProperties] of Object.entries(expectedDeclarations)) {
        const declaration = declarationFor(sourceFile, name);
        const properties = nestedPropertySignatures(declaration);
        expect(properties.map(propertyName), `${id}:${name}`).toEqual(expectedProperties);
        for (const property of properties) {
          const key = `${id}:${name}.${propertyName(property)}`;
          expect(descriptionFor(sourceFile, property), key).not.toBeNull();
          expect(descriptionFor(sourceFile, property)?.length, key).toBeGreaterThanOrEqual(28);
        }
        declarationCount += 1;
        propertyCount += properties.length;
      }
    }

    for (const [id, aliases] of Object.entries(documentedAliases)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.path,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const alias of aliases) {
        const key = `${id}:${alias}`;
        const description = descriptionFor(sourceFile, declarationFor(sourceFile, alias));
        expect(description, key).not.toBeNull();
        expect(description?.length, key).toBeGreaterThanOrEqual(28);
      }
    }

    expect({ declarationCount, propertyCount }).toEqual({
      declarationCount: 14,
      propertyCount: 47,
    });
  });

  it("keeps optional enhancement, validation, and form claims tied to implemented contracts", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("calendar:CalendarProps.showAvailabilityExplanations")).toContain(
      "removes those descriptions",
    );
    expect(descriptions.get("date-field:DateFieldProps.showDateContext")).toContain(
      "accessibility output",
    );
    expect(descriptions.get("date-picker:DatePickerProps.presets")).toContain(
      "removes their group, actions, and callbacks",
    );
    expect(
      descriptions.get("date-range-picker:DateRangePickerProps.maximumDurationDays"),
    ).toContain("native validity");
    expect(descriptions.get("date-time-field:DateTimeFieldProps.wallTimeAdapter")).toContain(
      "removes validation, status, callbacks, and resolved output",
    );
    expect(descriptions.get("date-time-picker:DateTimePickerProps.resolvedName")).toContain(
      "only while resolution is valid",
    );
    expect(descriptions.get("month-picker:MonthPickerProps.showQuarterContext")).toContain(
      "accessibility output",
    );
    expect(descriptions.get("range-calendar:RangeCalendarProps.unavailableDates")).toContain(
      "rejects ranges that cross",
    );
    expect(descriptions.get("range-calendar:RangeCalendarProps.showRangePreview")).toContain(
      "polite live output",
    );
    expect(descriptions.get("time-field:TimeFieldProps.timeZone")).toContain(
      "browser-resolved zone",
    );
    expect(descriptions.get("time-picker:TimePickerProps.intervals")).toContain(
      "removes their group and callbacks",
    );
    expect(descriptions.get("year-picker:YearPickerProps.visibleRange")).toContain(
      "Controlled subset",
    );
  });
});
