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
    id: "color-field",
    publicExports: ["ColorFieldProps"],
    props: [
      "ColorFieldProps.alphaPolicy",
      "ColorFieldProps.aria-describedby",
      "ColorFieldProps.aria-errormessage",
      "ColorFieldProps.aria-invalid",
      "ColorFieldProps.aria-label",
      "ColorFieldProps.aria-labelledby",
      "ColorFieldProps.contrastBackground",
      "ColorFieldProps.contrastThreshold",
      "ColorFieldProps.defaultValue",
      "ColorFieldProps.disabled",
      "ColorFieldProps.form",
      "ColorFieldProps.format",
      "ColorFieldProps.id",
      "ColorFieldProps.inputClassName",
      "ColorFieldProps.inputRef",
      "ColorFieldProps.inputStyle",
      "ColorFieldProps.messages",
      "ColorFieldProps.name",
      "ColorFieldProps.onChange",
      "ColorFieldProps.placeholder",
      "ColorFieldProps.readOnly",
      "ColorFieldProps.required",
      "ColorFieldProps.showContrast",
      "ColorFieldProps.showPreview",
      "ColorFieldProps.value",
    ],
  },
  {
    id: "color-picker",
    publicExports: ["ColorPickerProps"],
    props: [
      "ColorPickerProps.alphaPolicy",
      "ColorPickerProps.aria-describedby",
      "ColorPickerProps.aria-errormessage",
      "ColorPickerProps.aria-invalid",
      "ColorPickerProps.aria-label",
      "ColorPickerProps.aria-labelledby",
      "ColorPickerProps.contrastBackground",
      "ColorPickerProps.contrastThreshold",
      "ColorPickerProps.defaultValue",
      "ColorPickerProps.disabled",
      "ColorPickerProps.fieldMessages",
      "ColorPickerProps.form",
      "ColorPickerProps.format",
      "ColorPickerProps.getSwatchLabel",
      "ColorPickerProps.id",
      "ColorPickerProps.inputRef",
      "ColorPickerProps.messages",
      "ColorPickerProps.name",
      "ColorPickerProps.onChange",
      "ColorPickerProps.placeholder",
      "ColorPickerProps.readOnly",
      "ColorPickerProps.required",
      "ColorPickerProps.showContrast",
      "ColorPickerProps.showPreview",
      "ColorPickerProps.swatches",
      "ColorPickerProps.value",
    ],
  },
  {
    id: "field",
    publicExports: ["FieldProps"],
    props: [
      "FieldProps.children",
      "FieldProps.contextualAction",
      "FieldProps.controlId",
      "FieldProps.description",
      "FieldProps.error",
      "FieldProps.label",
      "FieldProps.layout",
      "FieldProps.optionalLabel",
      "FieldProps.required",
      "FieldProps.requiredIndicator",
    ],
  },
  {
    id: "form",
    publicExports: ["FormProps"],
    props: ["FormProps.layout", "FormProps.submissionStatus"],
  },
  {
    id: "inline-edit",
    publicExports: ["InlineEditInputProps", "InlineEditProps", "InlineEditTextareaProps"],
    props: [
      "InlineEditProps.blurBehavior",
      "InlineEditProps.canceledMessage",
      "InlineEditProps.cancelLabel",
      "InlineEditProps.control",
      "InlineEditProps.defaultValue",
      "InlineEditProps.description",
      "InlineEditProps.disabled",
      "InlineEditProps.editAccessibleLabel",
      "InlineEditProps.editLabel",
      "InlineEditProps.emptyValueLabel",
      "InlineEditProps.error",
      "InlineEditProps.externalChangeMessage",
      "InlineEditProps.form",
      "InlineEditProps.inputProps",
      "InlineEditProps.invalid",
      "InlineEditProps.label",
      "InlineEditProps.name",
      "InlineEditProps.noChangesMessage",
      "InlineEditProps.onCancel",
      "InlineEditProps.onEdit",
      "InlineEditProps.onSave",
      "InlineEditProps.onValueChange",
      "InlineEditProps.pendingLabel",
      "InlineEditProps.readOnly",
      "InlineEditProps.readOnlyLabel",
      "InlineEditProps.required",
      "InlineEditProps.requiredMessage",
      "InlineEditProps.resetMessage",
      "InlineEditProps.resolveSaveError",
      "InlineEditProps.saveErrorMessage",
      "InlineEditProps.saveLabel",
      "InlineEditProps.successMessage",
      "InlineEditProps.textareaProps",
      "InlineEditProps.validate",
      "InlineEditProps.value",
    ],
  },
  {
    id: "masked-field",
    publicExports: ["MaskedFieldProps"],
    props: [
      "MaskedFieldProps.adapter",
      "MaskedFieldProps.defaultValue",
      "MaskedFieldProps.inputClassName",
      "MaskedFieldProps.invalid",
      "MaskedFieldProps.invalidMessage",
      "MaskedFieldProps.maxInputLength",
      "MaskedFieldProps.name",
      "MaskedFieldProps.onValueChange",
      "MaskedFieldProps.rootClassName",
      "MaskedFieldProps.rootStyle",
      "MaskedFieldProps.serialization",
      "MaskedFieldProps.value",
    ],
  },
  {
    id: "number-field",
    publicExports: ["NumberFieldProps", "NumericFieldBaseProps"],
    props: [
      "NumberFieldProps.allowWheel",
      "NumberFieldProps.aria-errormessage",
      "NumberFieldProps.aria-invalid",
      "NumberFieldProps.className",
      "NumberFieldProps.decrementLabel",
      "NumberFieldProps.disabled",
      "NumberFieldProps.formatOptions",
      "NumberFieldProps.id",
      "NumberFieldProps.incrementLabel",
      "NumberFieldProps.inputClassName",
      "NumberFieldProps.inputRef",
      "NumberFieldProps.inputStyle",
      "NumberFieldProps.invalid",
      "NumberFieldProps.precision",
      "NumberFieldProps.readOnly",
      "NumberFieldProps.required",
      "NumberFieldProps.scrub",
      "NumberFieldProps.scrubLabel",
      "NumberFieldProps.scrubSensitivity",
      "NumberFieldProps.showCanonicalPreview",
      "NumberFieldProps.showStepper",
      "NumberFieldProps.statusRail",
      "NumberFieldProps.style",
      "NumericFieldBaseProps.allowWheel",
      "NumericFieldBaseProps.aria-errormessage",
      "NumericFieldBaseProps.aria-invalid",
      "NumericFieldBaseProps.className",
      "NumericFieldBaseProps.currencyCode",
      "NumericFieldBaseProps.decrementLabel",
      "NumericFieldBaseProps.disabled",
      "NumericFieldBaseProps.formatOptions",
      "NumericFieldBaseProps.id",
      "NumericFieldBaseProps.incrementLabel",
      "NumericFieldBaseProps.inputClassName",
      "NumericFieldBaseProps.inputRef",
      "NumericFieldBaseProps.inputStyle",
      "NumericFieldBaseProps.invalid",
      "NumericFieldBaseProps.kind",
      "NumericFieldBaseProps.precision",
      "NumericFieldBaseProps.readOnly",
      "NumericFieldBaseProps.required",
      "NumericFieldBaseProps.scrub",
      "NumericFieldBaseProps.scrubLabel",
      "NumericFieldBaseProps.scrubSensitivity",
      "NumericFieldBaseProps.showCanonicalPreview",
      "NumericFieldBaseProps.showStepper",
      "NumericFieldBaseProps.statusRail",
      "NumericFieldBaseProps.style",
      "NumericFieldBaseProps.valueScale",
    ],
  },
  {
    id: "otp-field",
    publicExports: ["OtpFieldProps"],
    props: [
      "OtpFieldProps.characterSet",
      "OtpFieldProps.defaultValue",
      "OtpFieldProps.groupingLabel",
      "OtpFieldProps.groups",
      "OtpFieldProps.inputClassName",
      "OtpFieldProps.invalid",
      "OtpFieldProps.onChange",
      "OtpFieldProps.onComplete",
      "OtpFieldProps.rootClassName",
      "OtpFieldProps.rootStyle",
      "OtpFieldProps.value",
    ],
  },
  {
    id: "password-field",
    publicExports: ["PasswordFieldProps"],
    props: [
      "PasswordFieldProps.capsLockMessage",
      "PasswordFieldProps.defaultValue",
      "PasswordFieldProps.hidePasswordLabel",
      "PasswordFieldProps.inputClassName",
      "PasswordFieldProps.invalid",
      "PasswordFieldProps.onChange",
      "PasswordFieldProps.rootClassName",
      "PasswordFieldProps.rootStyle",
      "PasswordFieldProps.ruleMetLabel",
      "PasswordFieldProps.rules",
      "PasswordFieldProps.rulesLabel",
      "PasswordFieldProps.ruleUnmetLabel",
      "PasswordFieldProps.showPasswordLabel",
      "PasswordFieldProps.value",
    ],
  },
  {
    id: "phone-field",
    publicExports: ["PhoneFieldProps"],
    props: [
      "PhoneFieldProps.adapter",
      "PhoneFieldProps.country",
      "PhoneFieldProps.defaultExtensionValue",
      "PhoneFieldProps.defaultValue",
      "PhoneFieldProps.extension",
      "PhoneFieldProps.extensionClassName",
      "PhoneFieldProps.extensionLabel",
      "PhoneFieldProps.extensionMaxLength",
      "PhoneFieldProps.extensionName",
      "PhoneFieldProps.extensionValue",
      "PhoneFieldProps.inputClassName",
      "PhoneFieldProps.invalid",
      "PhoneFieldProps.invalidMessage",
      "PhoneFieldProps.maxInputLength",
      "PhoneFieldProps.name",
      "PhoneFieldProps.onExtensionChange",
      "PhoneFieldProps.onValueChange",
      "PhoneFieldProps.rootClassName",
      "PhoneFieldProps.rootStyle",
      "PhoneFieldProps.value",
    ],
  },
  {
    id: "pin-field",
    publicExports: ["PinFieldProps"],
    props: [
      "PinFieldProps.defaultValue",
      "PinFieldProps.displayMode",
      "PinFieldProps.inputClassName",
      "PinFieldProps.invalid",
      "PinFieldProps.length",
      "PinFieldProps.onChange",
      "PinFieldProps.onComplete",
      "PinFieldProps.pasteBlockedMessage",
      "PinFieldProps.pastePolicy",
      "PinFieldProps.purpose",
      "PinFieldProps.purposeLabel",
      "PinFieldProps.rootClassName",
      "PinFieldProps.rootStyle",
      "PinFieldProps.value",
    ],
  },
  {
    id: "rating",
    publicExports: ["RatingProps"],
    props: [
      "RatingProps.allowClear",
      "RatingProps.clearLabel",
      "RatingProps.defaultValue",
      "RatingProps.description",
      "RatingProps.disabled",
      "RatingProps.error",
      "RatingProps.form",
      "RatingProps.formatOptionLabel",
      "RatingProps.formatValueLabel",
      "RatingProps.invalid",
      "RatingProps.label",
      "RatingProps.maximum",
      "RatingProps.name",
      "RatingProps.onValueChange",
      "RatingProps.readOnly",
      "RatingProps.readOnlyLabel",
      "RatingProps.required",
      "RatingProps.requiredLabel",
      "RatingProps.value",
    ],
  },
  {
    id: "search-field",
    publicExports: ["SearchFieldProps"],
    props: [
      "SearchFieldProps.clearLabel",
      "SearchFieldProps.defaultValue",
      "SearchFieldProps.inputClassName",
      "SearchFieldProps.invalid",
      "SearchFieldProps.onChange",
      "SearchFieldProps.resultsId",
      "SearchFieldProps.rootClassName",
      "SearchFieldProps.rootStyle",
      "SearchFieldProps.status",
      "SearchFieldProps.submitLabel",
      "SearchFieldProps.value",
    ],
  },
  {
    id: "slider",
    publicExports: ["SliderBaseProps", "SliderProps"],
    props: [
      "SliderBaseProps.aria-errormessage",
      "SliderBaseProps.className",
      "SliderBaseProps.collisionBehavior",
      "SliderBaseProps.defaultValue",
      "SliderBaseProps.disabled",
      "SliderBaseProps.form",
      "SliderBaseProps.formatOptions",
      "SliderBaseProps.intelligentMarks",
      "SliderBaseProps.invalid",
      "SliderBaseProps.marks",
      "SliderBaseProps.maxValue",
      "SliderBaseProps.minValue",
      "SliderBaseProps.names",
      "SliderBaseProps.onChange",
      "SliderBaseProps.onChangeEnd",
      "SliderBaseProps.orientation",
      "SliderBaseProps.readOnly",
      "SliderBaseProps.readOnlyMessage",
      "SliderBaseProps.showOutput",
      "SliderBaseProps.showValueBubbles",
      "SliderBaseProps.step",
      "SliderBaseProps.style",
      "SliderBaseProps.thumbCount",
      "SliderBaseProps.thumbLabels",
      "SliderBaseProps.value",
      "SliderProps.aria-errormessage",
      "SliderProps.className",
      "SliderProps.defaultValue",
      "SliderProps.disabled",
      "SliderProps.form",
      "SliderProps.formatOptions",
      "SliderProps.intelligentMarks",
      "SliderProps.invalid",
      "SliderProps.marks",
      "SliderProps.maxValue",
      "SliderProps.minValue",
      "SliderProps.name",
      "SliderProps.onChange",
      "SliderProps.onChangeEnd",
      "SliderProps.orientation",
      "SliderProps.readOnly",
      "SliderProps.readOnlyMessage",
      "SliderProps.showOutput",
      "SliderProps.showValueBubbles",
      "SliderProps.step",
      "SliderProps.style",
      "SliderProps.thumbLabel",
      "SliderProps.value",
    ],
  },
  {
    id: "validation-summary",
    publicExports: ["ValidationSummaryProps"],
    props: [
      "ValidationSummaryProps.empty",
      "ValidationSummaryProps.focusKey",
      "ValidationSummaryProps.focusPolicy",
      "ValidationSummaryProps.formatAnnouncement",
      "ValidationSummaryProps.heading",
      "ValidationSummaryProps.headingId",
      "ValidationSummaryProps.headingLevel",
      "ValidationSummaryProps.issues",
      "ValidationSummaryProps.renderWhenEmpty",
    ],
  },
] as const;

const supportingModels = {
  "color-field": {
    ColorFieldMessages: 11,
    ColorParseResult: 4,
    HslColorValue: 4,
    SrgbColorValue: 5,
  },
  "color-picker": { ChannelControlProps: 3, ColorPickerMessages: 9 },
  field: { FieldControlState: 7, ProcessLike: 1 },
  form: { FormSubmissionStatus: 2 },
  "inline-edit": { InlineEditSaveContext: 2, ProcessLike: 1 },
  "masked-field": {
    DeterministicMaskAdapter: 2,
    MaskAdapterContext: 5,
    MaskAdapterResult: 4,
    MaskedFieldValue: 5,
    MaskTextSelection: 3,
  },
  "number-field": {
    NumericFieldInsightsProps: 7,
    NumericScrubControlProps: 9,
    StepNumericValueOptions: 4,
  },
  "password-field": { PasswordFieldRule: 3 },
  "phone-field": {
    PhoneAdapterContext: 6,
    PhoneAdapterResult: 4,
    PhoneCountry: 3,
    PhoneFieldValue: 6,
    PhoneFormatAdapter: 2,
    PhoneTextSelection: 3,
  },
  rating: { ProcessLike: 1, RatingLabelContext: 3 },
  "search-field": { SearchFieldStatus: 3 },
  slider: { SliderDomain: 3, SliderIntelligentMarksOptions: 2, SliderMark: 2 },
  "validation-summary": { ValidationIssue: 3 },
} as const;

function sourceFor(id: string): { sourcePath: string; text: string } {
  const sourcePath = `registry/source/components/${id}/${id}.tsx`;
  return { sourcePath, text: readFileSync(resolve(workspaceRoot, sourcePath), "utf8") };
}

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const source = sourceFor(family.id);
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: source.text,
          mediaType: "text/typescript-jsx",
          sourcePath: source.sourcePath,
        },
      ],
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

function propertySignatures(node: ts.Node): readonly ts.PropertySignature[] {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeLiteralNode(node)) {
    return node.members.filter(ts.isPropertySignature);
  }
  if (ts.isTypeAliasDeclaration(node) || ts.isParenthesizedTypeNode(node)) {
    return propertySignatures(node.type);
  }
  if (ts.isIntersectionTypeNode(node) || ts.isUnionTypeNode(node)) {
    return node.types.flatMap((member) => propertySignatures(member));
  }
  return [];
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
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

describe("expanded fields and forms public API descriptions", () => {
  it("describes every recursive extractor-visible prop without review placeholders", () => {
    let props = 0;
    let describedProps = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.props.map((prop) => `${prop.owner}.${prop.name}`),
        family.id,
      ).toEqual(family.props);
      expect(docs.summary.describedProps, family.id).toBe(docs.summary.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      props += docs.summary.props;
      describedProps += docs.summary.describedProps;
    }

    expect({ describedProps, props }).toEqual({ describedProps: 305, props: 305 });
  });

  it("documents exported messages and structured models outside Props extraction", () => {
    for (const [id, declarations] of Object.entries(supportingModels)) {
      const source = sourceFor(id);
      const sourceFile = ts.createSourceFile(
        source.sourcePath,
        source.text,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX,
      );
      for (const [name, expectedCount] of Object.entries(declarations)) {
        const declaration = sourceFile.statements.find(
          (statement) =>
            (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) &&
            statement.name.text === name,
        );
        expect(declaration, `${id}:${name}`).toBeDefined();
        const members = propertySignatures(declaration!);
        expect(members, `${id}:${name}`).toHaveLength(expectedCount);
        for (const member of members) {
          const description = descriptionFor(sourceFile, member);
          expect(
            description?.length,
            `${id}:${name}:${member.name.getText(sourceFile)}`,
          ).toBeGreaterThanOrEqual(28);
        }
      }
    }
  });

  it("records native form behavior and independent enhancement removal", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("color-field:ColorFieldProps.showContrast")).toContain("removes");
    expect(descriptions.get("color-picker:ColorPickerProps.swatches")).toContain("empty array");
    expect(descriptions.get("form:FormProps.submissionStatus")).toContain("plain native form");
    expect(descriptions.get("inline-edit:InlineEditProps.name")).toContain("serialization");
    expect(descriptions.get("masked-field:MaskedFieldProps.serialization")).toContain("hidden");
    expect(descriptions.get("number-field:NumberFieldProps.scrub")).toContain("events");
    expect(descriptions.get("otp-field:OtpFieldProps.onComplete")).toContain("without submitting");
    expect(descriptions.get("password-field:PasswordFieldProps.rules")).toContain("removes");
    expect(descriptions.get("phone-field:PhoneFieldProps.extension")).toContain(
      "successful control",
    );
    expect(descriptions.get("pin-field:PinFieldProps.pastePolicy")).toContain("removes");
    expect(descriptions.get("rating:RatingProps.readOnly")).toContain("hidden serialization");
    expect(descriptions.get("search-field:SearchFieldProps.submitLabel")).toContain("removes");
    expect(descriptions.get("slider:SliderBaseProps.intelligentMarks")).toContain(
      "permits independent manual marks",
    );
    expect(descriptions.get("validation-summary:ValidationSummaryProps.renderWhenEmpty")).toContain(
      "accessibility output",
    );
  });
});
