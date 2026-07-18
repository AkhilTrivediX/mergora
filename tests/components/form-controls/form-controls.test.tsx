import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import { Checkbox } from "../../../registry/source/components/checkbox/checkbox.tsx";
import {
  CheckboxGroup,
  CheckboxGroupItem,
  getCheckboxGroupConstraint,
} from "../../../registry/source/components/checkbox-group/checkbox-group.tsx";
import { Field, mergeFieldIdRefs } from "../../../registry/source/components/field/field.tsx";
import { Fieldset } from "../../../registry/source/components/fieldset/fieldset.tsx";
import { Form } from "../../../registry/source/components/form/form.tsx";
import { Input } from "../../../registry/source/components/input/input.tsx";
import { NativeSelect } from "../../../registry/source/components/native-select/native-select.tsx";
import { MergoraProvider } from "../../../registry/source/components/provider/provider.tsx";
import {
  RadioGroup,
  RadioGroupItem,
  resolveRadioGroupIndex,
} from "../../../registry/source/components/radio-group/radio-group.tsx";
import { Switch } from "../../../registry/source/components/switch/switch.tsx";
import {
  countTextareaGraphemes,
  formatTextareaCount,
  Textarea,
  type TextareaProps,
} from "../../../registry/source/components/textarea/textarea.tsx";
import {
  formatValidationErrorCount,
  ValidationSummary,
} from "../../../registry/source/components/validation-summary/validation-summary.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "field",
  "fieldset",
  "form",
  "validation-summary",
  "input",
  "textarea",
  "native-select",
  "checkbox",
  "checkbox-group",
  "radio-group",
  "switch",
] as const;
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

describe("P2 form controls canonical records", () => {
  it("ships exactly the complete twelve-file companion set for all eleven items", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      expect(files.size, itemId).toBe(12);
      for (const suffix of recordSuffixes) expect(files).toContain(`${itemId}.${suffix}`);
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain(`${itemId}-css.d.ts`);
      expect(files).toContain("index.ts");
      expect(files).toContain("README.md");
    }
  });

  it("keeps exact five-key descriptors and explicit cross-item dependencies", () => {
    const expectedDependencies = {
      checkbox: ["field"],
      "checkbox-group": ["checkbox", "field", "provider"],
      field: [],
      fieldset: ["field"],
      form: [],
      input: ["field"],
      "native-select": ["field"],
      "radio-group": ["field"],
      switch: ["provider"],
      textarea: ["field", "provider"],
      "validation-summary": ["provider"],
    } satisfies Record<(typeof itemIds)[number], readonly string[]>;
    for (const itemId of itemIds) {
      const source = readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`);
      expect(Object.keys(source).sort(), itemId).toEqual([
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
        outputRole: "component",
      });
    }
  });

  it("validates metadata and the complete required state policy", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<unknown>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
    }
  });

  it("keeps every maturity and evidence claim source-present and unreleased", () => {
    for (const itemId of itemIds) {
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      const status = readJson<Record<string, unknown>>(itemId, `${itemId}.status.json`);
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
      expect(records).not.toMatch(/"recordedEvidence"\s*:\s*\[[^\]]+\]/u);
      expect(status).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        releaseStatus: "unreleased",
      });
    }
  });
});

describe("field and validation relationships", () => {
  it("generates unique IDs for two fields and merges descriptions without duplication", () => {
    expect(mergeFieldIdRefs("alpha beta", "beta gamma", undefined)).toBe("alpha beta gamma");
    const markup = renderToStaticMarkup(
      <>
        <Field description="First description" error="First error" label="First field" required>
          <Input name="first" />
        </Field>
        <Field description="Second description" label="Second field">
          <Input name="second" />
        </Field>
      </>,
    );
    const ids = [...markup.matchAll(/id="(mrg-field-[^"]+)"/gu)].map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(markup).toContain("First description");
    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("aria-errormessage=");
    expect(markup.match(/<label/gu)).toHaveLength(2);
  });

  it("uses unique summary heading IDs, encoded fragments, and no empty live announcement", () => {
    const markup = renderToStaticMarkup(
      <>
        <ValidationSummary
          issues={[{ controlId: "account:email", id: "email", message: "Email is invalid" }]}
        />
        <ValidationSummary empty="No issues" issues={[]} renderWhenEmpty />
      </>,
    );
    const headingIds = [...markup.matchAll(/id="(mrg-validation-summary-[^"]+-heading)"/gu)].map(
      (match) => match[1],
    );
    expect(headingIds).toHaveLength(2);
    expect(new Set(headingIds).size).toBe(2);
    expect(markup).toContain('href="#account%3Aemail"');
    expect(markup).toContain('aria-live="assertive"');
    expect(markup).toContain('aria-live="off"');
    expect(markup).not.toContain("0 form errors");
  });

  it("rejects malformed summary identities and Field control IDs deterministically", () => {
    expect(() =>
      renderToStaticMarkup(<ValidationSummary headingId="   " issues={[]} renderWhenEmpty />),
    ).toThrow(/headingId/u);
    expect(() =>
      renderToStaticMarkup(
        <ValidationSummary issues={[{ controlId: "control", id: " ", message: "Invalid" }]} />,
      ),
    ).toThrow(/issue id/u);
    expect(() =>
      renderToStaticMarkup(
        <ValidationSummary issues={[{ controlId: " ", id: "issue", message: "Invalid" }]} />,
      ),
    ).toThrow(/controlId/u);
    expect(() =>
      renderToStaticMarkup(
        <ValidationSummary
          issues={[
            { controlId: "first", id: "duplicate", message: "First" },
            { controlId: "second", id: "duplicate", message: "Second" },
          ]}
        />,
      ),
    ).toThrow(/duplicate issue id/u);
    expect(() =>
      renderToStaticMarkup(
        <Field controlId={" \t "} label="Invalid field">
          <Input />
        </Field>,
      ),
    ).toThrow(/controlId/u);
    expect(() =>
      renderToStaticMarkup(
        <ValidationSummary
          heading=""
          issues={[{ controlId: "control", id: "issue", message: "Invalid" }]}
        />,
      ),
    ).toThrow(/heading/u);
    expect(() =>
      renderToStaticMarkup(
        <ValidationSummary issues={[{ controlId: "control", id: "issue", message: "" }]} />,
      ),
    ).toThrow(/message/u);
  });

  it("uses provider keys for built-ins while explicit strings and formatters win", () => {
    const localized = renderToStaticMarkup(
      <MergoraProvider
        locale="de-DE"
        messages={{
          "checkboxGroup.minimum": ({ locale, values }) =>
            `Mindestens ${new Intl.NumberFormat(locale).format(Number(values.minimum))} erforderlich`,
          "switch.off": "Deaktiviert",
          "textarea.countWithMaximum": ({ locale, values }) =>
            `Maximum ${new Intl.NumberFormat(locale).format(Number(values.maximum))}; aktuell ${new Intl.NumberFormat(locale).format(Number(values.current))}`,
          "validationSummary.errorCount": ({ locale, values }) =>
            `Fehler insgesamt: ${new Intl.NumberFormat(locale).format(Number(values.count))}`,
          "validationSummary.heading": "Formular prüfen",
        }}
      >
        <ValidationSummary
          issues={[
            { controlId: "first", id: "first", message: "First" },
            { controlId: "second", id: "second", message: "Second" },
          ]}
        />
        <Textarea defaultValue="ab" maxLength={1234} showCount />
        <CheckboxGroup label="Paths" minSelected={2} name="paths">
          <CheckboxGroupItem value="source">Source</CheckboxGroupItem>
          <CheckboxGroupItem value="package">Package</CheckboxGroupItem>
        </CheckboxGroup>
        <Switch>Updates</Switch>
      </MergoraProvider>,
    );
    expect(localized).toContain("Formular prüfen");
    expect(localized).toContain("Fehler insgesamt: 2");
    expect(localized).toContain("Maximum 1.234; aktuell 2");
    expect(localized).toContain("Mindestens 2 erforderlich");
    expect(localized).toContain("Deaktiviert");

    const explicit = renderToStaticMarkup(
      <MergoraProvider
        messages={{
          "checkboxGroup.minimum": "Provider group",
          "switch.off": "Provider off",
          "textarea.count": "Provider count",
          "validationSummary.errorCount": "Provider count",
          "validationSummary.heading": "Provider heading",
        }}
      >
        <ValidationSummary
          formatAnnouncement={(count) => `Explicit ${count}`}
          heading="Explicit heading"
          issues={[{ controlId: "field", id: "field", message: "Invalid" }]}
        />
        <Textarea formatCount={() => "Explicit count"} showCount />
        <CheckboxGroup constraintMessage="Explicit group" label="Paths" required name="paths">
          <CheckboxGroupItem value="source">Source</CheckboxGroupItem>
        </CheckboxGroup>
        <Switch offLabel="Explicit off">Updates</Switch>
      </MergoraProvider>,
    );
    expect(explicit).toContain("Explicit heading");
    expect(explicit).toContain("Explicit 1");
    expect(explicit).toContain("Explicit count");
    expect(explicit).toContain("Explicit group");
    expect(explicit).toContain("Explicit off");
    expect(explicit).not.toContain("Provider heading");
  });

  it("keeps item descriptions outside labels and references unique description IDs", () => {
    const markup = renderToStaticMarkup(
      <>
        <Checkbox description="Checkbox detail">Checkbox name</Checkbox>
        <RadioGroup description="Group detail" label="Mode" name="mode">
          <RadioGroupItem description="Source detail" value="source">
            Source name
          </RadioGroupItem>
          <RadioGroupItem description="Package detail" value="package">
            Package name
          </RadioGroupItem>
        </RadioGroup>
      </>,
    );
    expect(markup).toMatch(/<\/label><span data-slot="checkbox-description"/u);
    expect(markup).toMatch(/<\/label><span data-slot="radio-group-item-description"/u);
    const descriptionIds = [
      ...markup.matchAll(/id="(mrg-(?:checkbox|radio-item)-[^"]+-description)"/gu),
    ].map((match) => match[1]);
    expect(descriptionIds).toHaveLength(3);
    expect(new Set(descriptionIds).size).toBe(3);
    for (const id of descriptionIds) expect(markup).toContain(id);
  });

  it("treats null descriptions and errors as absent instead of empty invalid content", () => {
    const markup = renderToStaticMarkup(
      <>
        <Field description={null} error={null} label="Field">
          <Input />
        </Field>
        <Fieldset description={null} error={null} legend="Fieldset" />
        <CheckboxGroup description={null} error={null} label="Checks" name="checks">
          <CheckboxGroupItem value="one">One</CheckboxGroupItem>
        </CheckboxGroup>
        <RadioGroup description={null} error={null} label="Radios" name="radios">
          <RadioGroupItem value="one">One</RadioGroupItem>
        </RadioGroup>
      </>,
    );
    expect(markup).not.toContain('data-invalid="true"');
    expect(markup).not.toMatch(
      /data-slot="(?:field|fieldset|checkbox-group|radio-group)-(?:description|error)"/u,
    );
  });
});

describe("native form semantics", () => {
  it("preserves authentication, mobile, native select, and server-compatible markup", () => {
    const markup = renderToStaticMarkup(
      <Form action="/account" method="post">
        <Field label="Username">
          <Input autoComplete="username" name="username" />
        </Field>
        <Field label="Password">
          <Input autoComplete="current-password" name="password" type="password" />
        </Field>
        <Field label="Telephone">
          <Input autoComplete="tel" inputMode="tel" name="telephone" type="tel" />
        </Field>
        <Field label="Regions">
          <NativeSelect multiple name="regions">
            <option value="apac">Asia Pacific</option>
            <option value="eu">Europe</option>
          </NativeSelect>
        </Field>
      </Form>,
    );
    expect(markup).toMatch(/^<form/u);
    expect(markup).toContain('action="/account"');
    expect(markup).toContain('autoComplete="username"');
    expect(markup).toContain('autoComplete="current-password"');
    expect(markup).toContain('inputMode="tel"');
    expect(markup).toContain('multiple=""');
    expect(markup).not.toContain("onpaste");
  });

  it("keeps Field IDs authoritative and preserves native aria-invalid tokens", () => {
    const markup = renderToStaticMarkup(
      <>
        <Field controlId="input-owner" error="Spelling needs review" label="Input">
          <Input aria-invalid="spelling" id="ignored-input-id" />
        </Field>
        <Field controlId="textarea-owner" error="Grammar needs review" label="Textarea">
          <Textarea aria-invalid="grammar" id="ignored-textarea-id" />
        </Field>
        <Field controlId="select-owner" error="Selection needs review" label="Select">
          <NativeSelect aria-invalid="spelling" id="ignored-select-id">
            <option>One</option>
          </NativeSelect>
        </Field>
        <Field controlId="checkbox-owner" error="Choice needs review" label="Checkbox">
          <Checkbox aria-invalid="grammar" id="ignored-checkbox-id" />
        </Field>
      </>,
    );
    for (const id of ["input-owner", "textarea-owner", "select-owner", "checkbox-owner"]) {
      expect(markup).toContain(`id="${id}"`);
      expect(markup).toContain(`for="${id}"`);
    }
    expect(markup).not.toContain("ignored-");
    expect(markup.match(/aria-invalid="spelling"/gu)).toHaveLength(2);
    expect(markup.match(/aria-invalid="grammar"/gu)).toHaveLength(2);
    expect(markup.match(/aria-errormessage=/gu)).toHaveLength(4);

    const explicitlyValid = renderToStaticMarkup(
      <Field controlId="valid-override" description="Help" error="Field error" label="Override">
        <Input aria-invalid={false} />
      </Field>,
    );
    const inputTag = explicitlyValid.match(/<input[^>]+>/u)?.[0] ?? "";
    expect(inputTag).toContain('aria-invalid="false"');
    expect(inputTag).toContain("valid-override-description");
    expect(inputTag).not.toContain("valid-override-error");
    expect(inputTag).not.toContain("aria-errormessage");
  });

  it("preserves exact native aria-invalid grammar tokens across compound groups", () => {
    const markup = renderToStaticMarkup(
      <>
        <CheckboxGroup aria-invalid="grammar" label="Checks" name="checks">
          <CheckboxGroupItem value="one">One</CheckboxGroupItem>
          <CheckboxGroupItem value="two">Two</CheckboxGroupItem>
        </CheckboxGroup>
        <RadioGroup aria-invalid="spelling" label="Radios" name="radios">
          <RadioGroupItem value="one">One</RadioGroupItem>
          <RadioGroupItem value="two">Two</RadioGroupItem>
        </RadioGroup>
      </>,
    );
    expect(markup.match(/aria-invalid="grammar"/gu)).toHaveLength(3);
    expect(markup.match(/aria-invalid="spelling"/gu)).toHaveLength(3);
    expect(markup).not.toContain('aria-invalid="true"');
  });

  it("rejects interactive hidden adornments and hides select chevrons for listboxes", () => {
    expect(() =>
      renderToStaticMarkup(<Input endAdornment={<button type="button">Reveal</button>} />),
    ).toThrow(/decorative, non-focusable/u);
    expect(() =>
      renderToStaticMarkup(<Input startAdornment={<span tabIndex={-1}>Focusable</span>} />),
    ).toThrow(/decorative, non-focusable/u);
    const markup = renderToStaticMarkup(
      <>
        <NativeSelect aria-label="Multiple" multiple>
          <option>One</option>
        </NativeSelect>
        <NativeSelect aria-label="Sized" size={3}>
          <option>One</option>
        </NativeSelect>
        <NativeSelect aria-label="Picker">
          <option>One</option>
        </NativeSelect>
      </>,
    );
    expect(markup.match(/data-slot="native-select-indicator"/gu)).toHaveLength(1);
    expect(markup.match(/data-listbox="true"/gu)).toHaveLength(2);
  });

  it("propagates external form ownership to every compound successful control", () => {
    const markup = renderToStaticMarkup(
      <>
        <form id="external-controls" />
        <CheckboxGroup form="external-controls" label="Checks" name="checks">
          <CheckboxGroupItem value="one">One</CheckboxGroupItem>
          <CheckboxGroupItem value="two">Two</CheckboxGroupItem>
        </CheckboxGroup>
        <RadioGroup form="external-controls" label="Radios" name="radios">
          <RadioGroupItem value="one">One</RadioGroupItem>
          <RadioGroupItem value="two">Two</RadioGroupItem>
        </RadioGroup>
        <Textarea aria-label="Notes" form="external-controls" name="notes" />
        <Switch form="external-controls" name="updates">
          Updates
        </Switch>
      </>,
    );
    expect(markup.match(/form="external-controls"/gu)).toHaveLength(9);
  });

  it("renders switch state with a stable name and explicit successful on or off value", () => {
    const off = renderToStaticMarkup(
      <Switch name="updates" offValue="disabled" onValue="enabled">
        Release updates
      </Switch>,
    );
    const on = renderToStaticMarkup(
      <Switch name="updates" offValue="disabled" onValue="enabled" value>
        Release updates
      </Switch>,
    );
    const external = renderToStaticMarkup(
      <>
        <form id="external" />
        <Switch form="external" name="external-updates">
          External release updates
        </Switch>
      </>,
    );
    expect(off).toContain('role="switch"');
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('name="updates"');
    expect(off).toContain('value="disabled"');
    expect(off).toContain('data-slot="switch-state-label"');
    expect(off).toContain('aria-hidden="true"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('value="enabled"');
    expect(off).toContain("Release updates");
    expect(on).toContain("Release updates");
    expect(external.match(/form="external"/gu)).toHaveLength(2);
    expect(external).toContain('type="button"');
  });

  it("validates deterministic group constraints and RTL radio movement", () => {
    expect(getCheckboxGroupConstraint(0, 1, 2)).toBe("minimum");
    expect(getCheckboxGroupConstraint(1, 1, 2)).toBeNull();
    expect(getCheckboxGroupConstraint(3, 1, 2)).toBe("maximum");
    expect(
      resolveRadioGroupIndex({ current: 0, direction: "ltr", itemCount: 3, key: "ArrowRight" }),
    ).toBe(1);
    expect(
      resolveRadioGroupIndex({ current: 0, direction: "rtl", itemCount: 3, key: "ArrowRight" }),
    ).toBe(2);
    expect(
      resolveRadioGroupIndex({ current: 1, direction: "rtl", itemCount: 3, key: "Home" }),
    ).toBe(0);
    expect(resolveRadioGroupIndex({ current: 1, direction: "ltr", itemCount: 3, key: "End" })).toBe(
      2,
    );
  });

  it("rejects invalid textarea limits and checkbox-group constraints before rendering", () => {
    expect(() => renderToStaticMarkup(<Textarea maxRows={0} />)).toThrow(RangeError);
    expect(() => renderToStaticMarkup(<Textarea maxRows={Number.NaN} />)).toThrow(RangeError);
    expect(() => renderToStaticMarkup(<Textarea maxLength={-1} />)).toThrow(RangeError);
    expect(() => renderToStaticMarkup(<Textarea maxGraphemes={-1} />)).toThrow(RangeError);
    expect(() =>
      renderToStaticMarkup(
        <Textarea {...({ maxGraphemes: 2, maxLength: 2 } as unknown as TextareaProps)} />,
      ),
    ).toThrow(/mutually exclusive/u);
    expect(() =>
      renderToStaticMarkup(<Textarea graphemeLimitMessage=" " maxGraphemes={2} />),
    ).toThrow(/graphemeLimitMessage/u);
    expect(() =>
      renderToStaticMarkup(
        <CheckboxGroup label="Invalid" minSelected={2} maxSelected={1} name="invalid" />,
      ),
    ).toThrow(RangeError);
    expect(() =>
      renderToStaticMarkup(<CheckboxGroup label="Invalid" minSelected={1.5} name="invalid" />),
    ).toThrow(RangeError);
  });

  it("rejects blank and duplicate compound names, values, and ambiguous switch values", () => {
    expect(() =>
      renderToStaticMarkup(
        <CheckboxGroup label="Checks" name=" ">
          <CheckboxGroupItem value="one">One</CheckboxGroupItem>
        </CheckboxGroup>,
      ),
    ).toThrow(/name/u);
    expect(() =>
      renderToStaticMarkup(
        <CheckboxGroup label="Checks" name="checks">
          <CheckboxGroupItem value="same">One</CheckboxGroupItem>
          <CheckboxGroupItem value="same">Two</CheckboxGroupItem>
        </CheckboxGroup>,
      ),
    ).toThrow(/duplicate item value/u);
    expect(() =>
      renderToStaticMarkup(
        <RadioGroup label="Radios" name="radios">
          <RadioGroupItem value=" ">One</RadioGroupItem>
        </RadioGroup>,
      ),
    ).toThrow(/item value/u);
    expect(() =>
      renderToStaticMarkup(
        <RadioGroup label="Radios" name="radios">
          <RadioGroupItem value="same">One</RadioGroupItem>
          <RadioGroupItem value="same">Two</RadioGroupItem>
        </RadioGroup>,
      ),
    ).toThrow(/duplicate item value/u);
    expect(() => renderToStaticMarkup(<Switch name=" ">Updates</Switch>)).toThrow(/name/u);
    expect(() => renderToStaticMarkup(<Switch form=" ">Updates</Switch>)).toThrow(/form/u);
    expect(() =>
      renderToStaticMarkup(
        <Switch offValue="same" onValue="same">
          Updates
        </Switch>,
      ),
    ).toThrow(/distinct/u);
  });

  it("keeps user-facing count and error-count formatters deterministic", () => {
    expect(formatTextareaCount(4, 12)).toBe("4 of 12 characters");
    expect(formatTextareaCount(4, undefined)).toBe("4 characters");
    expect(formatValidationErrorCount(1)).toBe("1 form error");
    expect(formatValidationErrorCount(2)).toBe("2 form errors");
    expect(formatTextareaCount(2, 1234, "de-DE")).toBe("2 of 1.234 characters");
    expect(formatTextareaCount("😀".length, undefined)).toBe("2 characters");
  });

  it("counts extended grapheme clusters while preserving native UTF-16 count mode", () => {
    expect(countTextareaGraphemes("👨‍👩‍👧‍👦")).toBe(1);
    expect(countTextareaGraphemes("e\u0301")).toBe(1);
    expect(countTextareaGraphemes("🇮🇳")).toBe(1);
    expect(countTextareaGraphemes("👨‍👩‍👧‍👦e\u0301🙂")).toBe(3);

    const graphemes = renderToStaticMarkup(
      <Textarea defaultValue={"👨‍👩‍👧‍👦e\u0301🙂"} maxGraphemes={2} showCount />,
    );
    expect(graphemes).toContain("3 of 2 characters");
    expect(graphemes).toContain('data-count-unit="grapheme"');
    expect(graphemes).toContain('aria-invalid="true"');

    const codeUnits = renderToStaticMarkup(<Textarea defaultValue="😀" maxLength={4} showCount />);
    expect(codeUnits).toContain("2 of 4 characters");
    expect(codeUnits).toContain('data-count-unit="code-unit"');

    const explicit = renderToStaticMarkup(
      <Textarea
        defaultValue="👩‍💻"
        formatCount={(current, maximum) => `Explicit ${current}/${String(maximum)}`}
        maxGraphemes={2}
        showCount
      />,
    );
    expect(explicit).toContain("Explicit 1/2");
  });

  it("treats disabled and unknown checkbox selections as non-successful for constraints", () => {
    const disabledSelection = renderToStaticMarkup(
      <CheckboxGroup defaultValue={["locked"]} label="Checks" name="checks" required>
        <CheckboxGroupItem disabled value="locked">
          Locked
        </CheckboxGroupItem>
        <CheckboxGroupItem value="available">Available</CheckboxGroupItem>
      </CheckboxGroup>,
    );
    expect(disabledSelection).toContain('data-invalid="true"');
    expect(disabledSelection).toContain("Select at least 1 option");

    const unknownSelection = renderToStaticMarkup(
      <CheckboxGroup label="Checks" name="checks" required value={["unknown"]}>
        <CheckboxGroupItem value="available">Available</CheckboxGroupItem>
      </CheckboxGroup>,
    );
    expect(unknownSelection).toContain('data-invalid="true"');
    expect(unknownSelection).toContain("Select at least 1 option");
  });

  it("preserves native fieldset and checkbox-group required semantics in SSR", () => {
    const markup = renderToStaticMarkup(
      <Fieldset disabled legend="Disabled group">
        <Input name="excluded" />
      </Fieldset>,
    );
    const group = renderToStaticMarkup(
      <CheckboxGroup label="At least one" name="paths" required>
        <CheckboxGroupItem value="keyboard">Keyboard</CheckboxGroupItem>
        <CheckboxGroupItem disabled value="touch">
          Touch
        </CheckboxGroupItem>
      </CheckboxGroup>,
    );
    expect(markup).toMatch(/^<fieldset/u);
    expect(markup).toContain("<legend");
    expect(markup).toContain('disabled=""');
    expect(group.match(/required=/gu)).toBeNull();
    expect(group.match(/name="paths"/gu)).toHaveLength(2);
  });
});
