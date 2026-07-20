import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactElement,
  type ReactNode,
} from "react";

import "mergora-tokens/tokens.css";
import { Checkbox } from "../../../registry/source/components/checkbox/index.ts";
import {
  CheckboxGroup,
  CheckboxGroupItem,
} from "../../../registry/source/components/checkbox-group/index.ts";
import {
  createSrgbColor,
  type SrgbColorValue,
} from "../../../registry/source/components/color-field/index.ts";
import { ColorPicker } from "../../../registry/source/components/color-picker/index.ts";
import { CurrencyField } from "../../../registry/source/components/currency-field/index.ts";
import { Field } from "../../../registry/source/components/field/index.ts";
import { Fieldset } from "../../../registry/source/components/fieldset/index.ts";
import { Form } from "../../../registry/source/components/form/index.ts";
import { Input } from "../../../registry/source/components/input/index.ts";
import { NativeSelect } from "../../../registry/source/components/native-select/index.ts";
import { PasswordField } from "../../../registry/source/components/password-field/index.ts";
import { PercentageField } from "../../../registry/source/components/percentage-field/index.ts";
import {
  PhoneField,
  type PhoneFormatAdapter,
} from "../../../registry/source/components/phone-field/index.ts";
import { PinField } from "../../../registry/source/components/pin-field/index.ts";
import { MergoraProvider } from "../../../registry/source/components/provider/index.ts";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../../registry/source/components/radio-group/index.ts";
import { RangeSlider } from "../../../registry/source/components/range-slider/index.ts";
import { Rating } from "../../../registry/source/components/rating/index.ts";
import { Switch } from "../../../registry/source/components/switch/index.ts";
import { Textarea } from "../../../registry/source/components/textarea/index.ts";
import { ValidationSummary } from "../../../registry/source/components/validation-summary/index.ts";

interface FieldsFormsProofArgs {
  readonly announceCollisions: boolean;
  readonly checkboxDescription: boolean;
  readonly checkboxGroupConstraints: boolean;
  readonly colorPickerContrast: boolean;
  readonly colorPickerPreview: boolean;
  readonly colorPickerSwatches: boolean;
  readonly fieldsetSelectionSummary: boolean;
  readonly formStatusState: boolean;
  readonly formSubmissionStatus: boolean;
  readonly inputClearAction: boolean;
  readonly intelligentMarks: boolean;
  readonly nativeSelectSelectionContext: boolean;
  readonly passwordRuleChecklist: boolean;
  readonly phoneCanonicalSerialization: boolean;
  readonly phoneExtension: boolean;
  readonly pinCompletionHook: boolean;
  readonly pinPastePolicy: boolean;
  readonly radioCardOptions: boolean;
  readonly ratingAllowClear: boolean;
  readonly showCanonicalPreview: boolean;
  readonly showValueBubbles: boolean;
  readonly statusRail: boolean;
  readonly switchFormSerialization: boolean;
  readonly textareaAutoGrow: boolean;
  readonly textareaCount: boolean;
  readonly validationFocusPolicy: boolean;
}

const frameStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  gap: "var(--mrg-semantic-space-stack-lg)",
  inlineSize: "min(46rem, calc(100vw - 2rem))",
  marginInline: "auto",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
} satisfies CSSProperties;

const railStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-sm)",
  paddingBlockStart: "var(--mrg-semantic-space-stack-md)",
} satisfies CSSProperties;

const actionRowStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-density-control-gap)",
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

const WHITE = createSrgbColor({ alpha: 255, blue: 255, green: 255, red: 255 });
const LIVING_GREEN = createSrgbColor({ alpha: 255, blue: 87, green: 122, red: 47 });
const DEEP_VIOLET = createSrgbColor({ alpha: 255, blue: 126, green: 58, red: 83 });

const phoneCountry = {
  callingCode: "+1",
  code: "US",
  label: "United States",
} as const;

const directPhoneAdapter: PhoneFormatAdapter = {
  id: "storybook.fields-forms-proof.v1",
  resolve(input, context) {
    const digits = [...input].filter((character) => character >= "0" && character <= "9").join("");
    if (digits.length === 0) {
      return {
        displayValue: "",
        e164: null,
        selection: context.selection,
        status: "empty",
      };
    }
    if (digits.length > 10 || digits.length !== input.length) {
      return {
        displayValue: input,
        e164: null,
        selection: context.selection,
        status: "invalid",
      };
    }
    return {
      displayValue: digits,
      e164: digits.length === 10 ? `${context.country.callingCode}${digits}` : null,
      selection: context.selection,
      status: digits.length === 10 ? "valid" : "incomplete",
    };
  },
};

function SpecimenFrame({
  children,
  description,
  itemId,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly itemId: string;
  readonly title: string;
}): ReactElement {
  return (
    <MergoraProvider>
      <main data-story-item={itemId} style={frameStyle}>
        <header>
          <h2 id={`${itemId}-proof-title`} style={{ margin: 0, textWrap: "balance" }}>
            {title}
          </h2>
          <p
            style={{
              color: "var(--mrg-semantic-color-foreground-muted)",
              marginBlock: "var(--mrg-semantic-space-stack-xs) 0",
              maxInlineSize: "65ch",
              textWrap: "pretty",
            }}
          >
            {description}
          </p>
        </header>
        {children}
      </main>
    </MergoraProvider>
  );
}

function CurrencyFieldSpecimen({
  showCanonicalPreview,
  statusRail,
}: Pick<FieldsFormsProofArgs, "showCanonicalPreview" | "statusRail">): ReactElement {
  return (
    <SpecimenFrame
      description="Localized editing preserves a canonical major-unit value for native forms."
      itemId="currency-field"
      title="Currency field"
    >
      <Field description="Accepted range: EUR 1,000 through EUR 10,000." label="Operating budget">
        <CurrencyField
          currency="EUR"
          defaultValue={6250}
          maxValue={10000}
          minValue={1000}
          name="operating-budget"
          showCanonicalPreview={showCanonicalPreview}
          statusRail={statusRail ? "auto" : false}
          step={250}
        />
      </Field>
    </SpecimenFrame>
  );
}

function PercentageFieldSpecimen({
  showCanonicalPreview,
  statusRail,
}: Pick<FieldsFormsProofArgs, "showCanonicalPreview" | "statusRail">): ReactElement {
  return (
    <SpecimenFrame
      description="Percentage text remains locale-aware while callbacks and forms use a fraction."
      itemId="percentage-field"
      title="Percentage field"
    >
      <Field description="The canonical value 0.18 represents 18%." label="Contingency target">
        <PercentageField
          defaultValue={0.18}
          maxValue={0.5}
          minValue={0}
          name="contingency-target"
          showCanonicalPreview={showCanonicalPreview}
          statusRail={statusRail ? "auto" : false}
          step={0.01}
        />
      </Field>
    </SpecimenFrame>
  );
}

function RangeSliderSpecimen({
  announceCollisions,
  intelligentMarks,
  showValueBubbles,
}: Pick<
  FieldsFormsProofArgs,
  "announceCollisions" | "intelligentMarks" | "showValueBubbles"
>): ReactElement {
  return (
    <SpecimenFrame
      description="Ordered thumbs retain their minimum and maximum identity when values meet."
      itemId="range-slider"
      title="Range slider"
    >
      <Field description="Use either thumb to adjust the review window." label="Review window">
        <RangeSlider
          announceCollisions={announceCollisions}
          defaultValue={[25, 75]}
          intelligentMarks={
            intelligentMarks ? { maximumVisible: 5, strategy: "meaningful" } : false
          }
          maxValue={100}
          minValue={0}
          names={["review-minimum", "review-maximum"]}
          showValueBubbles={showValueBubbles}
          step={5}
          thumbLabels={["Minimum review score", "Maximum review score"]}
        />
      </Field>
    </SpecimenFrame>
  );
}

function FieldsetSpecimen({
  fieldsetSelectionSummary,
}: Pick<FieldsFormsProofArgs, "fieldsetSelectionSummary">): ReactElement {
  return (
    <SpecimenFrame
      description="Legend, description, state, and optional selection context share one native fieldset."
      itemId="fieldset"
      title="Fieldset"
    >
      <Fieldset
        description="Choose the review channels that should stay active."
        legend="Review channels"
        selectionSummary={fieldsetSelectionSummary ? "1 of 3 channels selected" : undefined}
      >
        <Checkbox defaultChecked name="channels" value="email">
          Email
        </Checkbox>
        <Checkbox name="channels" value="dashboard">
          Dashboard
        </Checkbox>
        <Checkbox name="channels" value="archive">
          Archive
        </Checkbox>
      </Fieldset>
    </SpecimenFrame>
  );
}

function FormSpecimen({
  formStatusState,
  formSubmissionStatus,
}: Pick<FieldsFormsProofArgs, "formStatusState" | "formSubmissionStatus">): ReactElement {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();
  return (
    <SpecimenFrame
      description="Native submission remains intact while an optional stable status rail communicates progress."
      itemId="form"
      title="Form"
    >
      <Form
        aria-label="Document details"
        onSubmit={handleSubmit}
        submissionStatus={
          formSubmissionStatus
            ? {
                message: formStatusState ? "Saving document details…" : "Document details saved.",
                state: formStatusState ? "submitting" : "success",
              }
            : false
        }
      >
        <Field label="Document title">
          <Input defaultValue="Interface review" name="document-title" />
        </Field>
        <button style={actionStyle} type="submit">
          Save details
        </button>
      </Form>
    </SpecimenFrame>
  );
}

function InputSpecimen({
  inputClearAction,
}: Pick<FieldsFormsProofArgs, "inputClearAction">): ReactElement {
  return (
    <SpecimenFrame
      description="The native input can add a focus-preserving clear action without proxying text entry."
      itemId="input"
      title="Input"
    >
      <Field description="The clear action is independently optional." label="Document summary">
        <Input
          clearLabel="Clear document summary"
          clearable={inputClearAction}
          defaultValue="Ready for review"
          name="document-summary"
        />
      </Field>
    </SpecimenFrame>
  );
}

function TextareaSpecimen({
  textareaAutoGrow,
  textareaCount,
}: Pick<FieldsFormsProofArgs, "textareaAutoGrow" | "textareaCount">): ReactElement {
  return (
    <SpecimenFrame
      description="Autogrow and exact grapheme counting are separate aids around a native textarea."
      itemId="textarea"
      title="Textarea"
    >
      <Field description="Keep the handoff concise and actionable." label="Review notes">
        <Textarea
          autoGrow={textareaAutoGrow}
          defaultValue="Confirm the keyboard path before approval."
          maxGraphemes={120}
          maxRows={6}
          name="review-notes"
          rows={3}
          showCount={textareaCount}
        />
      </Field>
    </SpecimenFrame>
  );
}

function PasswordFieldSpecimen({
  passwordRuleChecklist,
}: Pick<FieldsFormsProofArgs, "passwordRuleChecklist">): ReactElement {
  return (
    <SpecimenFrame
      description="A consumer-defined checklist can explain recoverable requirements without replacing the password input."
      itemId="password-field"
      title="Password field"
    >
      <Field label="Workspace password">
        <PasswordField
          autoComplete="new-password"
          defaultValue="OpenWorkbench7"
          name="workspace-password"
          {...(passwordRuleChecklist
            ? {
                rules: [
                  {
                    id: "length",
                    label: "At least 12 characters",
                    validate: (value) => value.length >= 12,
                  },
                  {
                    id: "number",
                    label: "Contains a number",
                    validate: (value) => [...value].some((character) => /[0-9]/u.test(character)),
                  },
                ],
              }
            : {})}
        />
      </Field>
    </SpecimenFrame>
  );
}

function PhoneFieldSpecimen({
  phoneCanonicalSerialization,
  phoneExtension,
}: Pick<FieldsFormsProofArgs, "phoneCanonicalSerialization" | "phoneExtension">): ReactElement {
  return (
    <SpecimenFrame
      description="Visible national entry, exact E.164 serialization, and extension capture remain separate choices."
      itemId="phone-field"
      title="Phone field"
    >
      <Field
        description="Enter ten digits for this bounded demonstration adapter."
        label="Contact number"
      >
        <PhoneField
          adapter={directPhoneAdapter}
          country={phoneCountry}
          defaultValue="2125550198"
          extension={phoneExtension}
          {...(phoneExtension
            ? {
                defaultExtensionValue: "204",
                extensionLabel: "Extension",
                extensionName: "contact-extension",
              }
            : {})}
          {...(phoneCanonicalSerialization ? { name: "contact-phone" } : {})}
        />
      </Field>
    </SpecimenFrame>
  );
}

function ValidationSummarySpecimen({
  validationFocusPolicy,
}: Pick<FieldsFormsProofArgs, "validationFocusPolicy">): ReactElement {
  const [focusKey, setFocusKey] = useState(0);
  return (
    <SpecimenFrame
      description="Exact issue links remain available while focus recovery is an explicit, repeatable policy."
      itemId="validation-summary"
      title="Validation summary"
    >
      {validationFocusPolicy ? (
        <div style={actionRowStyle}>
          <button
            style={actionStyle}
            type="button"
            onClick={() => setFocusKey((value) => value + 1)}
          >
            Focus first error
          </button>
        </div>
      ) : null}
      <ValidationSummary
        focusPolicy={validationFocusPolicy ? "first-error" : "none"}
        heading="Resolve these details"
        issues={[
          { controlId: "proof-title", id: "missing-title", message: "Enter a document title." },
          { controlId: "proof-owner", id: "missing-owner", message: "Choose an owner." },
        ]}
        {...(validationFocusPolicy ? { focusKey } : {})}
      />
      <div style={railStyle}>
        <label htmlFor="proof-title">Document title</label>
        <input id="proof-title" />
        <label htmlFor="proof-owner">Owner</label>
        <select id="proof-owner">
          <option value="">Choose an owner</option>
          <option>Review team</option>
        </select>
      </div>
    </SpecimenFrame>
  );
}

function CheckboxSpecimen({
  checkboxDescription,
}: Pick<FieldsFormsProofArgs, "checkboxDescription">): ReactElement {
  return (
    <SpecimenFrame
      description="The visible label stays concise while optional context is linked through description semantics."
      itemId="checkbox"
      title="Checkbox"
    >
      <Checkbox
        defaultChecked
        description={
          checkboxDescription ? "Include keyboard, touch, and narrow-screen evidence." : undefined
        }
        name="include-evidence"
      >
        Include interaction evidence
      </Checkbox>
    </SpecimenFrame>
  );
}

function CheckboxGroupSpecimen({
  checkboxGroupConstraints,
}: Pick<FieldsFormsProofArgs, "checkboxGroupConstraints">): ReactElement {
  return (
    <SpecimenFrame
      description="Native checkboxes can share bounded selection validity and a visible recovery message."
      itemId="checkbox-group"
      title="Checkbox group"
    >
      <CheckboxGroup
        defaultValue={["keyboard"]}
        label="Evidence sources"
        name="evidence-sources"
        {...(checkboxGroupConstraints
          ? {
              constraintMessage: "Choose between two and three evidence sources.",
              maxSelected: 3,
              minSelected: 2,
            }
          : {})}
      >
        <CheckboxGroupItem value="keyboard">Keyboard</CheckboxGroupItem>
        <CheckboxGroupItem value="touch">Touch</CheckboxGroupItem>
        <CheckboxGroupItem value="screen-reader">Screen reader</CheckboxGroupItem>
      </CheckboxGroup>
    </SpecimenFrame>
  );
}

function NativeSelectSpecimen({
  nativeSelectSelectionContext,
}: Pick<FieldsFormsProofArgs, "nativeSelectSelectionContext">): ReactElement {
  return (
    <SpecimenFrame
      description="The platform picker stays native while optional selection consequences remain associated."
      itemId="native-select"
      title="Native select"
    >
      <Field label="Review density">
        <NativeSelect
          defaultValue="comfortable"
          name="review-density"
          selectionContext={
            nativeSelectSelectionContext
              ? "Comfortable density keeps descriptions visible in review tables."
              : undefined
          }
        >
          <option value="compact">Compact</option>
          <option value="comfortable">Comfortable</option>
          <option value="spacious">Spacious</option>
        </NativeSelect>
      </Field>
    </SpecimenFrame>
  );
}

function RadioGroupSpecimen({
  radioCardOptions,
}: Pick<FieldsFormsProofArgs, "radioCardOptions">): ReactElement {
  return (
    <SpecimenFrame
      description="Richer option comparison keeps native radios, roving focus, and form ownership."
      itemId="radio-group"
      title="Radio group"
    >
      <RadioGroup defaultValue="focused" label="Review mode" name="review-mode">
        <RadioGroupItem
          description={radioCardOptions ? "Show only unresolved evidence and blockers." : undefined}
          value="focused"
          variant={radioCardOptions ? "card" : "plain"}
        >
          Focused
        </RadioGroupItem>
        <RadioGroupItem
          description={radioCardOptions ? "Show every state and historical result." : undefined}
          value="complete"
          variant={radioCardOptions ? "card" : "plain"}
        >
          Complete
        </RadioGroupItem>
      </RadioGroup>
    </SpecimenFrame>
  );
}

function SwitchSpecimen({
  switchFormSerialization,
}: Pick<FieldsFormsProofArgs, "switchFormSerialization">): ReactElement {
  return (
    <SpecimenFrame
      description="A button-based switch can optionally serialize explicit on and off machine values."
      itemId="switch"
      title="Switch"
    >
      <Switch
        defaultValue
        {...(switchFormSerialization
          ? { name: "evidence-reminders", offValue: "disabled", onValue: "enabled" }
          : {})}
      >
        Evidence reminders
      </Switch>
    </SpecimenFrame>
  );
}

function ColorPickerSpecimen({
  colorPickerContrast,
  colorPickerPreview,
  colorPickerSwatches,
}: Pick<
  FieldsFormsProofArgs,
  "colorPickerContrast" | "colorPickerPreview" | "colorPickerSwatches"
>): ReactElement {
  const swatches: readonly SrgbColorValue[] = colorPickerSwatches
    ? [LIVING_GREEN, DEEP_VIOLET]
    : [];
  return (
    <SpecimenFrame
      description="Spatial and exact color entry can add preview, contrast, and named presets independently."
      itemId="color-picker"
      title="Color picker"
    >
      <Field label="Interface accent">
        <ColorPicker
          contrastBackground={WHITE}
          defaultValue={LIVING_GREEN}
          name="interface-accent"
          showContrast={colorPickerContrast}
          showPreview={colorPickerPreview}
          swatches={swatches}
          {...(colorPickerSwatches
            ? {
                getSwatchLabel: (_: SrgbColorValue, index: number) =>
                  ["Living green", "Deep violet"][index] ?? `Preset ${index + 1}`,
              }
            : {})}
        />
      </Field>
    </SpecimenFrame>
  );
}

function PinFieldSpecimen({
  pinCompletionHook,
  pinPastePolicy,
}: Pick<FieldsFormsProofArgs, "pinCompletionHook" | "pinPastePolicy">): ReactElement {
  const [completion, setCompletion] = useState("Waiting for complete entry.");
  return (
    <SpecimenFrame
      description="Secure entry can expose bounded completion integration and an explicit paste policy separately."
      itemId="pin-field"
      title="PIN field"
    >
      <Field description="Four reusable-secret digits." label="Workspace PIN">
        <PinField
          defaultValue="27"
          length={4}
          name="workspace-pin"
          pastePolicy={pinPastePolicy ? "block" : "allow"}
          purpose="reusable-secret"
          {...(pinCompletionHook
            ? {
                onComplete: (value: string) =>
                  setCompletion(`Complete PIN: ${value.length} digits`),
              }
            : {})}
          {...(pinPastePolicy
            ? {
                pasteBlockedMessage:
                  "Paste is disabled for this PIN policy. Type the digits instead.",
              }
            : {})}
        />
      </Field>
      {pinCompletionHook ? <output aria-live="polite">{completion}</output> : null}
    </SpecimenFrame>
  );
}

function RatingSpecimen({
  ratingAllowClear,
}: Pick<FieldsFormsProofArgs, "ratingAllowClear">): ReactElement {
  return (
    <SpecimenFrame
      description="Native radio choices can add an explicit no-rating value without proxy controls."
      itemId="rating"
      title="Rating"
    >
      <Rating
        allowClear={ratingAllowClear}
        clearLabel="No rating"
        defaultValue={4}
        description="Rate the clarity of the current review evidence."
        label="Evidence clarity"
        name="evidence-clarity"
      />
    </SpecimenFrame>
  );
}

const meta = {
  args: {
    announceCollisions: false,
    checkboxDescription: false,
    checkboxGroupConstraints: false,
    colorPickerContrast: false,
    colorPickerPreview: false,
    colorPickerSwatches: false,
    fieldsetSelectionSummary: false,
    formStatusState: false,
    formSubmissionStatus: false,
    inputClearAction: false,
    intelligentMarks: false,
    nativeSelectSelectionContext: false,
    passwordRuleChecklist: false,
    phoneCanonicalSerialization: false,
    phoneExtension: false,
    pinCompletionHook: false,
    pinPastePolicy: false,
    radioCardOptions: false,
    ratingAllowClear: false,
    showCanonicalPreview: false,
    showValueBubbles: false,
    statusRail: false,
    switchFormSerialization: false,
    textareaAutoGrow: false,
    textareaCount: false,
    validationFocusPolicy: false,
  },
  argTypes: {
    announceCollisions: { control: "boolean" },
    checkboxDescription: { control: "boolean" },
    checkboxGroupConstraints: { control: "boolean" },
    colorPickerContrast: { control: "boolean" },
    colorPickerPreview: { control: "boolean" },
    colorPickerSwatches: { control: "boolean" },
    fieldsetSelectionSummary: { control: "boolean" },
    formStatusState: { control: "boolean" },
    formSubmissionStatus: { control: "boolean" },
    inputClearAction: { control: "boolean" },
    intelligentMarks: { control: "boolean" },
    nativeSelectSelectionContext: { control: "boolean" },
    passwordRuleChecklist: { control: "boolean" },
    phoneCanonicalSerialization: { control: "boolean" },
    phoneExtension: { control: "boolean" },
    pinCompletionHook: { control: "boolean" },
    pinPastePolicy: { control: "boolean" },
    radioCardOptions: { control: "boolean" },
    ratingAllowClear: { control: "boolean" },
    showCanonicalPreview: { control: "boolean" },
    showValueBubbles: { control: "boolean" },
    statusRail: { control: "boolean" },
    switchFormSerialization: { control: "boolean" },
    textareaAutoGrow: { control: "boolean" },
    textareaCount: { control: "boolean" },
    validationFocusPolicy: { control: "boolean" },
  },
  parameters: { layout: "centered" },
  title: "P4/Fields and forms/Component proof",
} satisfies Meta<FieldsFormsProofArgs>;

export default meta;
type Story = StoryObj<FieldsFormsProofArgs>;

export const BasicCurrencyField: Story = {
  args: { showCanonicalPreview: false, statusRail: false },
  parameters: { controls: { include: ["statusRail", "showCanonicalPreview"] } },
  render: (args) => <CurrencyFieldSpecimen {...args} />,
};
export const RecommendedCurrencyField: Story = {
  args: { showCanonicalPreview: true, statusRail: true },
  parameters: { controls: { include: ["statusRail", "showCanonicalPreview"] } },
  render: (args) => <CurrencyFieldSpecimen {...args} />,
};

export const BasicPercentageField: Story = {
  args: { showCanonicalPreview: false, statusRail: false },
  parameters: { controls: { include: ["statusRail", "showCanonicalPreview"] } },
  render: (args) => <PercentageFieldSpecimen {...args} />,
};
export const RecommendedPercentageField: Story = {
  args: { showCanonicalPreview: true, statusRail: true },
  parameters: { controls: { include: ["statusRail", "showCanonicalPreview"] } },
  render: (args) => <PercentageFieldSpecimen {...args} />,
};

export const BasicRangeSlider: Story = {
  args: { announceCollisions: false, intelligentMarks: false, showValueBubbles: false },
  parameters: {
    controls: { include: ["intelligentMarks", "showValueBubbles", "announceCollisions"] },
  },
  render: (args) => <RangeSliderSpecimen {...args} />,
};
export const RecommendedRangeSlider: Story = {
  args: { announceCollisions: true, intelligentMarks: true, showValueBubbles: true },
  parameters: {
    controls: { include: ["intelligentMarks", "showValueBubbles", "announceCollisions"] },
  },
  render: (args) => <RangeSliderSpecimen {...args} />,
};

export const BasicFieldset: Story = {
  args: { fieldsetSelectionSummary: false },
  parameters: { controls: { include: ["fieldsetSelectionSummary"] } },
  render: (args) => <FieldsetSpecimen {...args} />,
};
export const RecommendedFieldset: Story = {
  args: { fieldsetSelectionSummary: true },
  parameters: { controls: { include: ["fieldsetSelectionSummary"] } },
  render: (args) => <FieldsetSpecimen {...args} />,
};

export const BasicForm: Story = {
  args: { formStatusState: false, formSubmissionStatus: false },
  parameters: { controls: { include: ["formSubmissionStatus", "formStatusState"] } },
  render: (args) => <FormSpecimen {...args} />,
};
export const RecommendedForm: Story = {
  args: { formStatusState: true, formSubmissionStatus: true },
  parameters: { controls: { include: ["formSubmissionStatus", "formStatusState"] } },
  render: (args) => <FormSpecimen {...args} />,
};

export const BasicInput: Story = {
  args: { inputClearAction: false },
  parameters: { controls: { include: ["inputClearAction"] } },
  render: (args) => <InputSpecimen {...args} />,
};
export const RecommendedInput: Story = {
  args: { inputClearAction: true },
  parameters: { controls: { include: ["inputClearAction"] } },
  render: (args) => <InputSpecimen {...args} />,
};

export const BasicTextarea: Story = {
  args: { textareaAutoGrow: false, textareaCount: false },
  parameters: { controls: { include: ["textareaAutoGrow", "textareaCount"] } },
  render: (args) => <TextareaSpecimen {...args} />,
};
export const RecommendedTextarea: Story = {
  args: { textareaAutoGrow: true, textareaCount: true },
  parameters: { controls: { include: ["textareaAutoGrow", "textareaCount"] } },
  render: (args) => <TextareaSpecimen {...args} />,
};

export const BasicPasswordField: Story = {
  args: { passwordRuleChecklist: false },
  parameters: { controls: { include: ["passwordRuleChecklist"] } },
  render: (args) => <PasswordFieldSpecimen {...args} />,
};
export const RecommendedPasswordField: Story = {
  args: { passwordRuleChecklist: true },
  parameters: { controls: { include: ["passwordRuleChecklist"] } },
  render: (args) => <PasswordFieldSpecimen {...args} />,
};

export const BasicPhoneField: Story = {
  args: { phoneCanonicalSerialization: false, phoneExtension: false },
  parameters: {
    controls: { include: ["phoneCanonicalSerialization", "phoneExtension"] },
  },
  render: (args) => <PhoneFieldSpecimen {...args} />,
};
export const RecommendedPhoneField: Story = {
  args: { phoneCanonicalSerialization: true, phoneExtension: true },
  parameters: {
    controls: { include: ["phoneCanonicalSerialization", "phoneExtension"] },
  },
  render: (args) => <PhoneFieldSpecimen {...args} />,
};

export const BasicValidationSummary: Story = {
  args: { validationFocusPolicy: false },
  parameters: { controls: { include: ["validationFocusPolicy"] } },
  render: (args) => <ValidationSummarySpecimen {...args} />,
};
export const RecommendedValidationSummary: Story = {
  args: { validationFocusPolicy: true },
  parameters: { controls: { include: ["validationFocusPolicy"] } },
  render: (args) => <ValidationSummarySpecimen {...args} />,
};

export const BasicCheckbox: Story = {
  args: { checkboxDescription: false },
  parameters: { controls: { include: ["checkboxDescription"] } },
  render: (args) => <CheckboxSpecimen {...args} />,
};
export const RecommendedCheckbox: Story = {
  args: { checkboxDescription: true },
  parameters: { controls: { include: ["checkboxDescription"] } },
  render: (args) => <CheckboxSpecimen {...args} />,
};

export const BasicCheckboxGroup: Story = {
  args: { checkboxGroupConstraints: false },
  parameters: { controls: { include: ["checkboxGroupConstraints"] } },
  render: (args) => <CheckboxGroupSpecimen {...args} />,
};
export const RecommendedCheckboxGroup: Story = {
  args: { checkboxGroupConstraints: true },
  parameters: { controls: { include: ["checkboxGroupConstraints"] } },
  render: (args) => <CheckboxGroupSpecimen {...args} />,
};

export const BasicNativeSelect: Story = {
  args: { nativeSelectSelectionContext: false },
  parameters: { controls: { include: ["nativeSelectSelectionContext"] } },
  render: (args) => <NativeSelectSpecimen {...args} />,
};
export const RecommendedNativeSelect: Story = {
  args: { nativeSelectSelectionContext: true },
  parameters: { controls: { include: ["nativeSelectSelectionContext"] } },
  render: (args) => <NativeSelectSpecimen {...args} />,
};

export const BasicRadioGroup: Story = {
  args: { radioCardOptions: false },
  parameters: { controls: { include: ["radioCardOptions"] } },
  render: (args) => <RadioGroupSpecimen {...args} />,
};
export const RecommendedRadioGroup: Story = {
  args: { radioCardOptions: true },
  parameters: { controls: { include: ["radioCardOptions"] } },
  render: (args) => <RadioGroupSpecimen {...args} />,
};

export const BasicSwitch: Story = {
  args: { switchFormSerialization: false },
  parameters: { controls: { include: ["switchFormSerialization"] } },
  render: (args) => <SwitchSpecimen {...args} />,
};
export const RecommendedSwitch: Story = {
  args: { switchFormSerialization: true },
  parameters: { controls: { include: ["switchFormSerialization"] } },
  render: (args) => <SwitchSpecimen {...args} />,
};

export const BasicColorPicker: Story = {
  args: { colorPickerContrast: false, colorPickerPreview: false, colorPickerSwatches: false },
  parameters: {
    controls: { include: ["colorPickerPreview", "colorPickerContrast", "colorPickerSwatches"] },
  },
  render: (args) => <ColorPickerSpecimen {...args} />,
};
export const RecommendedColorPicker: Story = {
  args: { colorPickerContrast: true, colorPickerPreview: true, colorPickerSwatches: true },
  parameters: {
    controls: { include: ["colorPickerPreview", "colorPickerContrast", "colorPickerSwatches"] },
  },
  render: (args) => <ColorPickerSpecimen {...args} />,
};

export const BasicPinField: Story = {
  args: { pinCompletionHook: false, pinPastePolicy: false },
  parameters: { controls: { include: ["pinCompletionHook", "pinPastePolicy"] } },
  render: (args) => <PinFieldSpecimen {...args} />,
};
export const RecommendedPinField: Story = {
  args: { pinCompletionHook: true, pinPastePolicy: true },
  parameters: { controls: { include: ["pinCompletionHook", "pinPastePolicy"] } },
  render: (args) => <PinFieldSpecimen {...args} />,
};

export const BasicRating: Story = {
  args: { ratingAllowClear: false },
  parameters: { controls: { include: ["ratingAllowClear"] } },
  render: (args) => <RatingSpecimen {...args} />,
};
export const RecommendedRating: Story = {
  args: { ratingAllowClear: true },
  parameters: { controls: { include: ["ratingAllowClear"] } },
  render: (args) => <RatingSpecimen {...args} />,
};
