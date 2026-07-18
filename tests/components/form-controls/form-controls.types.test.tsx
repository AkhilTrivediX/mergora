import { createRef, type ChangeEvent } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  Checkbox,
  type CheckboxProps,
} from "../../../registry/source/components/checkbox/checkbox.tsx";
import {
  CheckboxGroup,
  CheckboxGroupItem,
  type CheckboxGroupProps,
} from "../../../registry/source/components/checkbox-group/checkbox-group.tsx";
import { Field, type FieldProps } from "../../../registry/source/components/field/field.tsx";
import {
  Fieldset,
  type FieldsetProps,
} from "../../../registry/source/components/fieldset/fieldset.tsx";
import { Form, type FormProps } from "../../../registry/source/components/form/form.tsx";
import { Input, type InputProps } from "../../../registry/source/components/input/input.tsx";
import {
  NativeSelect,
  type NativeSelectProps,
} from "../../../registry/source/components/native-select/native-select.tsx";
import {
  RadioGroup,
  RadioGroupItem,
  type RadioGroupProps,
} from "../../../registry/source/components/radio-group/radio-group.tsx";
import { Switch, type SwitchProps } from "../../../registry/source/components/switch/switch.tsx";
import {
  Textarea,
  type TextareaProps,
} from "../../../registry/source/components/textarea/textarea.tsx";
import {
  ValidationSummary,
  type ValidationSummaryProps,
} from "../../../registry/source/components/validation-summary/validation-summary.tsx";

const inputRef = createRef<HTMLInputElement>();
const textareaRef = createRef<HTMLTextAreaElement>();
const selectRef = createRef<HTMLSelectElement>();
const fieldsetRef = createRef<HTMLFieldSetElement>();
const formRef = createRef<HTMLFormElement>();
const buttonRef = createRef<HTMLButtonElement>();

const serverAction = async (_data: FormData): Promise<void> => undefined;
const rhfRegistration = {
  name: "email",
  onBlur: (_event: ChangeEvent<HTMLInputElement>) => undefined,
  onChange: (_event: ChangeEvent<HTMLInputElement>) => undefined,
  ref: inputRef,
} satisfies InputProps & { readonly ref: typeof inputRef };
const tanstackField = {
  name: "displayName",
  onBlur: (_event: ChangeEvent<HTMLInputElement>) => undefined,
  onChange: (_event: ChangeEvent<HTMLInputElement>) => undefined,
  value: "Workbench",
} satisfies InputProps;

const validFixtures = [
  <Form action={serverAction} key="form" ref={formRef} />,
  <Field key="field" label="Email">
    <Input {...rhfRegistration} autoComplete="email" rootClassName="root" type="email" />
  </Field>,
  <Fieldset key="fieldset" legend="Options" ref={fieldsetRef} />,
  <ValidationSummary headingLevel={3} issues={[]} key="summary" />,
  <Input {...tanstackField} inputMode="text" key="input" ref={inputRef} />,
  <Textarea
    autoGrow
    key="textarea"
    maxGraphemes={120}
    maxRows={4}
    ref={textareaRef}
    rootStyle={{ inlineSize: 320 }}
  />,
  <NativeSelect key="select" multiple ref={selectRef} rootClassName="root">
    <option value="one">One</option>
  </NativeSelect>,
  <Checkbox key="checkbox" ref={inputRef} rootClassName="root">
    Retain source
  </Checkbox>,
  <CheckboxGroup
    key="checkbox-group"
    label="Gates"
    name="gates"
    nativeValidationMessage="Choose one"
  >
    <CheckboxGroupItem value="unit">Unit</CheckboxGroupItem>
  </CheckboxGroup>,
  <RadioGroup key="radio-group" label="Mode" name="mode" ref={fieldsetRef}>
    <RadioGroupItem
      aria-invalid="spelling"
      className="native-radio"
      rootClassName="radio-root"
      rootStyle={{ inlineSize: 320 }}
      style={{ accentColor: "currentcolor" }}
      value="source"
    >
      Source
    </RadioGroupItem>
  </RadioGroup>,
  <Switch key="switch" name="updates" ref={buttonRef}>
    Updates
  </Switch>,
];

// @ts-expect-error Field requires a visible label.
const invalidField = <Field />;
// @ts-expect-error Fieldset requires a legend.
const invalidFieldset = <Fieldset />;
// @ts-expect-error CheckboxGroup requires a stable submission name.
const invalidCheckboxGroup = <CheckboxGroup label="Gates" />;
// @ts-expect-error RadioGroup requires a stable submission name.
const invalidRadioGroup = <RadioGroup label="Mode" />;
// @ts-expect-error Radio items require a visible label.
const invalidRadioItem = <RadioGroupItem value="source" />;
// @ts-expect-error Switch requires a stable visible label.
const invalidSwitch = <Switch />;
// @ts-expect-error Switch deliberately excludes fake hidden-input required semantics.
const invalidRequiredSwitch = <Switch required>Updates</Switch>;
// @ts-expect-error Input invalid state is boolean.
const invalidInput = <Input invalid="true" />;
// @ts-expect-error Textarea maxRows is numeric.
const invalidTextarea = <Textarea maxRows="4" />;
// @ts-expect-error Textarea maxGraphemes is numeric.
const invalidGraphemeLimit = <Textarea maxGraphemes="4" />;
// @ts-expect-error Native and grapheme limits are deliberately mutually exclusive.
const invalidCombinedTextareaLimits = <Textarea maxGraphemes={4} maxLength={4} />;
// @ts-expect-error Summary heading levels are real h2-h6 levels.
const invalidSummary = <ValidationSummary headingLevel={1} issues={[]} />;

describe("P2 form controls type surface", () => {
  it("keeps native refs, server actions, and dependency-free adapter props strict", () => {
    expectTypeOf<FieldProps>().toBeObject();
    expectTypeOf<FieldsetProps>().toBeObject();
    expectTypeOf<FormProps>().toBeObject();
    expectTypeOf<ValidationSummaryProps>().toBeObject();
    expectTypeOf<InputProps>().toBeObject();
    expectTypeOf<TextareaProps>().toBeObject();
    expectTypeOf<NativeSelectProps>().toBeObject();
    expectTypeOf<CheckboxProps>().toBeObject();
    expectTypeOf<CheckboxGroupProps>().toBeObject();
    expectTypeOf<RadioGroupProps>().toBeObject();
    expectTypeOf<SwitchProps>().toBeObject();
    expect(validFixtures).toHaveLength(11);
    expect([
      invalidField,
      invalidFieldset,
      invalidCheckboxGroup,
      invalidRadioGroup,
      invalidRadioItem,
      invalidSwitch,
      invalidRequiredSwitch,
      invalidInput,
      invalidTextarea,
      invalidGraphemeLimit,
      invalidCombinedTextareaLimits,
      invalidSummary,
    ]).toHaveLength(12);
  });
});
