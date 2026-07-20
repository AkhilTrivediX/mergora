import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P4FieldsFormsComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P4FieldsFormsComponentProof.stories.tsx";
const evidencePath = "tests/storybook/fields-forms-component-proof.test.tsx";

const expectedItems = [
  {
    id: "currency-field",
    controls: ["statusRail", "showCanonicalPreview"],
    basic: "BasicCurrencyField",
    recommended: "RecommendedCurrencyField",
  },
  {
    id: "percentage-field",
    controls: ["statusRail", "showCanonicalPreview"],
    basic: "BasicPercentageField",
    recommended: "RecommendedPercentageField",
  },
  {
    id: "range-slider",
    controls: ["intelligentMarks", "showValueBubbles", "announceCollisions"],
    basic: "BasicRangeSlider",
    recommended: "RecommendedRangeSlider",
  },
  {
    id: "fieldset",
    controls: ["fieldsetSelectionSummary"],
    basic: "BasicFieldset",
    recommended: "RecommendedFieldset",
  },
  {
    id: "form",
    controls: ["formSubmissionStatus", "formStatusState"],
    basic: "BasicForm",
    recommended: "RecommendedForm",
  },
  {
    id: "input",
    controls: ["inputClearAction"],
    basic: "BasicInput",
    recommended: "RecommendedInput",
  },
  {
    id: "textarea",
    controls: ["textareaAutoGrow", "textareaCount"],
    basic: "BasicTextarea",
    recommended: "RecommendedTextarea",
  },
  {
    id: "password-field",
    controls: ["passwordRuleChecklist"],
    basic: "BasicPasswordField",
    recommended: "RecommendedPasswordField",
  },
  {
    id: "phone-field",
    controls: ["phoneCanonicalSerialization", "phoneExtension"],
    basic: "BasicPhoneField",
    recommended: "RecommendedPhoneField",
  },
  {
    id: "validation-summary",
    controls: ["validationFocusPolicy"],
    basic: "BasicValidationSummary",
    recommended: "RecommendedValidationSummary",
  },
  {
    id: "checkbox",
    controls: ["checkboxDescription"],
    basic: "BasicCheckbox",
    recommended: "RecommendedCheckbox",
  },
  {
    id: "checkbox-group",
    controls: ["checkboxGroupConstraints"],
    basic: "BasicCheckboxGroup",
    recommended: "RecommendedCheckboxGroup",
  },
  {
    id: "native-select",
    controls: ["nativeSelectSelectionContext"],
    basic: "BasicNativeSelect",
    recommended: "RecommendedNativeSelect",
  },
  {
    id: "radio-group",
    controls: ["radioCardOptions"],
    basic: "BasicRadioGroup",
    recommended: "RecommendedRadioGroup",
  },
  {
    id: "switch",
    controls: ["switchFormSerialization"],
    basic: "BasicSwitch",
    recommended: "RecommendedSwitch",
  },
  {
    id: "color-picker",
    controls: ["colorPickerPreview", "colorPickerContrast", "colorPickerSwatches"],
    basic: "BasicColorPicker",
    recommended: "RecommendedColorPicker",
  },
  {
    id: "pin-field",
    controls: ["pinCompletionHook", "pinPastePolicy"],
    basic: "BasicPinField",
    recommended: "RecommendedPinField",
  },
  {
    id: "rating",
    controls: ["ratingAllowClear"],
    basic: "BasicRating",
    recommended: "RecommendedRating",
  },
] as const;

const preservedIds = [
  "number-field",
  "slider",
  "field",
  "search-field",
  "masked-field",
  "color-field",
  "otp-field",
  "inline-edit",
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

function renderStory(name: string): string {
  const value = story(name);
  return renderToStaticMarkup(value.render!({ ...defaultArgs, ...value.args } as Args));
}

describe("fields and forms component-specific Storybook evidence", () => {
  it("maps the 18 formerly shared items to direct Basic and Recommended exports", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/fields-forms.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        maturityAssessment: { status: string };
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

    expect(shard.profiles).toHaveLength(26);
    for (const expected of expectedItems) {
      const profile = profileById.get(expected.id)!;
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
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.maturityAssessment.status).toBe("not-ready");

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      for (const control of expected.controls) {
        expect(basic.args?.[control], `${expected.id} ${control} basic`).toBe(false);
        expect(recommended.args?.[control], `${expected.id} ${control} recommended`).toBe(true);
      }
      expect(basic.parameters?.controls?.include).toEqual(expected.controls);
      expect(recommended.parameters?.controls?.include).toEqual(expected.controls);
    }

    for (const id of preservedIds) {
      expect(profileById.get(id)?.storybook.basic.modulePath).not.toBe(storyPath);
      expect(profileById.get(id)?.storybook.enhanced.modulePath).not.toBe(storyPath);
    }

    const basicPointers = shard.profiles.map(
      ({ storybook }) => `${storybook.basic.modulePath}#${storybook.basic.exportName}`,
    );
    const enhancedPointers = shard.profiles.map(
      ({ storybook }) => `${storybook.enhanced.modulePath}#${storybook.enhanced.exportName}`,
    );
    expect(new Set(basicPointers).size).toBe(26);
    expect(new Set(enhancedPointers).size).toBe(26);
  });

  it("imports and renders every canonical component directly", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");
    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
      expect(renderStory(basic)).toContain(`data-story-item="${id}"`);
      expect(renderStory(recommended)).toContain(`data-story-item="${id}"`);
    }
    expect(source).not.toContain("P2FormControls");
    expect(source).not.toContain("ProductionWorkbench");
  });

  it("removes enhancement-specific UI and semantics from Basic output", () => {
    const rendered = Object.fromEntries(
      expectedItems.map(({ id, basic, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );

    for (const id of ["currency-field", "percentage-field"] as const) {
      expect(rendered[id]!.basic).not.toContain('data-slot="number-field-status"');
      expect(rendered[id]!.basic).not.toContain('data-slot="number-field-canonical-preview"');
      expect(rendered[id]!.recommended).toContain('data-slot="number-field-status"');
      expect(rendered[id]!.recommended).toContain('data-slot="number-field-canonical-preview"');
    }
    expect(rendered["range-slider"]!.basic).not.toContain('data-slot="slider-marks"');
    expect(rendered["range-slider"]!.basic).not.toContain('data-slot="slider-value-bubble"');
    expect(rendered["range-slider"]!.basic).not.toContain(
      'data-slot="range-slider-collision-status"',
    );
    expect(rendered["range-slider"]!.recommended).toContain('data-slot="slider-marks"');
    expect(rendered["range-slider"]!.recommended).toContain('data-slot="slider-value-bubble"');
    expect(rendered["range-slider"]!.recommended).toContain(
      'data-slot="range-slider-collision-status"',
    );
    expect(rendered.fieldset!.basic).not.toContain('data-slot="fieldset-selection-summary"');
    expect(rendered.fieldset!.recommended).toContain('data-slot="fieldset-selection-summary"');
    expect(rendered.form!.basic).not.toContain('data-slot="form-submission-status"');
    expect(rendered.form!.recommended).toContain('data-slot="form-submission-status"');
    expect(rendered.input!.basic).not.toContain('data-slot="input-clear"');
    expect(rendered.input!.recommended).toContain('data-slot="input-clear"');
    expect(rendered.textarea!.basic).not.toContain('data-slot="textarea-count"');
    expect(rendered.textarea!.basic).not.toContain('data-autogrow="true"');
    expect(rendered.textarea!.recommended).toContain('data-slot="textarea-count"');
    expect(rendered.textarea!.recommended).toContain('data-autogrow="true"');
    expect(rendered["password-field"]!.basic).not.toContain('data-slot="password-field-rules"');
    expect(rendered["password-field"]!.recommended).toContain('data-slot="password-field-rules"');
    expect(rendered["phone-field"]!.basic).not.toContain('data-slot="phone-field-canonical-input"');
    expect(rendered["phone-field"]!.basic).not.toContain('data-slot="phone-field-extension"');
    expect(rendered["phone-field"]!.recommended).toContain(
      'data-slot="phone-field-canonical-input"',
    );
    expect(rendered["phone-field"]!.recommended).toContain('data-slot="phone-field-extension"');
    expect(rendered["validation-summary"]!.basic).not.toContain("Focus first error");
    expect(rendered["validation-summary"]!.recommended).toContain("Focus first error");
    expect(rendered.checkbox!.basic).not.toContain('data-slot="checkbox-description"');
    expect(rendered.checkbox!.recommended).toContain('data-slot="checkbox-description"');
    expect(rendered["checkbox-group"]!.basic).not.toContain('data-slot="checkbox-group-error"');
    expect(rendered["checkbox-group"]!.recommended).toContain('data-slot="checkbox-group-error"');
    expect(rendered["native-select"]!.basic).not.toContain(
      'data-slot="native-select-selection-context"',
    );
    expect(rendered["native-select"]!.recommended).toContain(
      'data-slot="native-select-selection-context"',
    );
    expect(rendered["radio-group"]!.basic).not.toContain(
      'data-slot="radio-group-item-description"',
    );
    expect(rendered["radio-group"]!.recommended).toContain(
      'data-slot="radio-group-item-description"',
    );
    expect(rendered.switch!.basic).not.toContain('data-slot="switch-form-value"');
    expect(rendered.switch!.recommended).toContain('data-slot="switch-form-value"');
    expect(rendered["color-picker"]!.basic).not.toContain('data-slot="color-field-preview"');
    expect(rendered["color-picker"]!.basic).not.toContain('data-slot="color-field-contrast"');
    expect(rendered["color-picker"]!.basic).not.toContain('data-slot="color-picker-swatches"');
    expect(rendered["color-picker"]!.recommended).toContain('data-slot="color-field-preview"');
    expect(rendered["color-picker"]!.recommended).toContain('data-slot="color-field-contrast"');
    expect(rendered["color-picker"]!.recommended).toContain('data-slot="color-picker-swatches"');
    expect(rendered["pin-field"]!.basic).not.toContain("Waiting for complete entry.");
    expect(rendered["pin-field"]!.basic).toContain('data-paste-policy="allow"');
    expect(rendered["pin-field"]!.recommended).toContain("Waiting for complete entry.");
    expect(rendered["pin-field"]!.recommended).toContain('data-paste-policy="block"');
    expect(rendered.rating!.basic).not.toContain('data-slot="rating-clear"');
    expect(rendered.rating!.recommended).toContain('data-slot="rating-clear"');
  });
});
