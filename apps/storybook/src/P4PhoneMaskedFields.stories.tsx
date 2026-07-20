import { useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/field";
import {
  MaskedField,
  type DeterministicMaskAdapter,
  type MaskTextSelection,
} from "../../../registry/source/components/masked-field/masked-field";
import {
  PhoneField,
  type PhoneFormatAdapter,
  type PhoneTextSelection,
} from "../../../registry/source/components/phone-field/phone-field";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";

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
  maxInlineSize: "56rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const stateRailStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
} satisfies CSSProperties;

const stateRowStyle = {
  alignItems: "start",
  borderBlockEnd:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  gridTemplateColumns: "minmax(8rem, 0.35fr) minmax(0, 1fr)",
  paddingBlock: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const outputStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  borderRadius: "var(--mrg-semantic-radius-compact)",
  display: "block",
  fontFamily: "var(--mrg-semantic-font-family-code)",
  fontSize: "var(--mrg-semantic-font-size-label)",
  marginBlockStart: "var(--mrg-semantic-space-stack-sm)",
  overflowWrap: "anywhere",
  padding: "var(--mrg-semantic-space-inset-md)",
} satisfies CSSProperties;

interface PhoneMaskedEnhancementArgs {
  readonly maskedCanonicalSerialization: boolean;
  readonly phoneCanonicalSerialization: boolean;
  readonly phoneExtension: boolean;
}

const buttonStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: 0,
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

const secondaryButtonStyle = {
  ...buttonStyle,
  background: "var(--mrg-semantic-color-background-canvas)",
  border:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-interactive)",
  color: "var(--mrg-semantic-color-foreground-primary)",
} satisfies CSSProperties;

const buttonRailStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-sm)",
} satisfies CSSProperties;

const unitedStates = {
  callingCode: "+1",
  code: "US",
  label: "United States",
} as const;

const india = {
  callingCode: "+91",
  code: "IN",
  label: "India",
} as const;

const egyptArabic = {
  callingCode: "+20",
  code: "EG",
  label: "Ù…ØµØ±",
} as const;

function isAsciiDigit(character: string): boolean {
  return character >= "0" && character <= "9";
}

function isAsciiLetter(character: string): boolean {
  const upper = character.toUpperCase();
  return upper >= "A" && upper <= "Z" && upper.length === 1;
}

function mapDigitSelection(input: string, output: string, offset: number): number {
  let significantBeforeCaret = 0;
  for (const character of input.slice(0, offset)) {
    if (isAsciiDigit(character)) significantBeforeCaret += 1;
  }
  if (significantBeforeCaret === 0) return 0;
  let seen = 0;
  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];
    if (character !== undefined && isAsciiDigit(character)) seen += 1;
    if (seen === significantBeforeCaret) return index + 1;
  }
  return output.length;
}

function mapPhoneSelection(
  input: string,
  output: string,
  selection: PhoneTextSelection | null,
): PhoneTextSelection | null {
  if (selection === null) return null;
  return {
    direction: selection.direction,
    end: mapDigitSelection(input, output, selection.end),
    start: mapDigitSelection(input, output, selection.start),
  };
}

function formatTenNationalDigits(digits: string): string {
  const groups = [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 10)].filter(
    (group) => group.length > 0,
  );
  return groups.join(" ");
}

/** Deliberately limited Storybook adapter: exact ten-digit national examples only. */
const fixedTenDigitPhoneAdapter: PhoneFormatAdapter = {
  id: "storybook.fixed-ten-digit.v1",
  resolve(input, context) {
    let digits = "";
    for (const character of input) {
      if (isAsciiDigit(character)) {
        digits += character;
      } else if (character !== " " && character !== "-" && character !== "(" && character !== ")") {
        return { displayValue: input, e164: null, selection: context.selection, status: "invalid" };
      }
    }
    if (digits.length === 0) {
      return input.length === 0
        ? { displayValue: "", e164: null, selection: context.selection, status: "empty" }
        : { displayValue: input, e164: null, selection: context.selection, status: "invalid" };
    }
    if (digits.length > 10) {
      return { displayValue: input, e164: null, selection: context.selection, status: "invalid" };
    }
    const displayValue = formatTenNationalDigits(digits);
    return {
      displayValue,
      e164: digits.length === 10 ? `${context.country.callingCode}${digits}` : null,
      selection: mapPhoneSelection(input, displayValue, context.selection),
      status: digits.length === 10 ? "valid" : "incomplete",
    };
  },
};

function mapMaskSelection(
  input: string,
  output: string,
  selection: MaskTextSelection | null,
): MaskTextSelection | null {
  if (selection === null) return null;
  const mapOffset = (offset: number): number => {
    let significantBeforeCaret = 0;
    for (const character of input.slice(0, offset)) {
      if (isAsciiDigit(character) || isAsciiLetter(character)) significantBeforeCaret += 1;
    }
    if (significantBeforeCaret === 0) return 0;
    let seen = 0;
    for (let index = 0; index < output.length; index += 1) {
      const character = output[index];
      if (character !== undefined && (isAsciiDigit(character) || isAsciiLetter(character))) {
        seen += 1;
      }
      if (seen === significantBeforeCaret) return index + 1;
    }
    return output.length;
  };
  return {
    direction: selection.direction,
    end: mapOffset(selection.end),
    start: mapOffset(selection.start),
  };
}

function formatProductCode(raw: string): string {
  return [raw.slice(0, 2), raw.slice(2, 6), raw.slice(6, 8)]
    .filter((group) => group.length > 0)
    .join("-");
}

const productCodeMaskAdapter: DeterministicMaskAdapter = {
  id: "storybook.product-code.v1",
  apply(input, context) {
    let rawValue = "";
    for (const character of input) {
      if (character === "-") continue;
      rawValue += character.toUpperCase();
    }
    if (rawValue.length === 0) {
      return input.length === 0
        ? { formattedValue: "", rawValue: "", selection: context.selection, status: "empty" }
        : {
            formattedValue: input,
            rawValue: input,
            selection: context.selection,
            status: "invalid",
          };
    }
    if (rawValue.length > 8) {
      return {
        formattedValue: input,
        rawValue: input,
        selection: context.selection,
        status: "invalid",
      };
    }
    for (let index = 0; index < rawValue.length; index += 1) {
      const character = rawValue[index];
      const expectedLetter = index < 2 || index >= 6;
      if (
        character === undefined ||
        (expectedLetter ? !isAsciiLetter(character) : !isAsciiDigit(character))
      ) {
        return {
          formattedValue: input,
          rawValue: input,
          selection: context.selection,
          status: "invalid",
        };
      }
    }
    const formattedValue = formatProductCode(rawValue);
    return {
      formattedValue,
      rawValue,
      selection: mapMaskSelection(input, formattedValue, context.selection),
      status: rawValue.length === 8 ? "valid" : "incomplete",
    };
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
      <main style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

function ControlledPhoneWorkbench() {
  const [phone, setPhone] = useState("");
  const [extension, setExtension] = useState("");
  const [resolved, setResolved] = useState("No canonical value yet");
  return (
    <form aria-label="Callback request">
      <Field
        description="This specimen adapter supports exactly ten national digits; the country name and calling code stay explicit."
        label="Telephone number"
        required
      >
        <PhoneField
          adapter={fixedTenDigitPhoneAdapter}
          country={unitedStates}
          extension
          extensionLabel="Extension"
          extensionValue={extension}
          name="phone"
          onExtensionChange={setExtension}
          onValueChange={(next) => {
            setPhone(next.displayValue);
            setExtension(next.extension);
            setResolved(
              JSON.stringify({ e164: next.e164, extension: next.extension, status: next.status }),
            );
          }}
          placeholder="415 555 2671"
          required
          value={phone}
        />
      </Field>
      <output aria-live="polite" data-testid="phone-value" style={outputStyle}>
        {resolved}
      </output>
    </form>
  );
}

function ControlledMaskWorkbench() {
  const [input, setInput] = useState("");
  const [resolved, setResolved] = useState("No formatted value yet");
  const terminalCount = useRef(0);
  const [visibleTerminalCount, setVisibleTerminalCount] = useState(0);
  return (
    <Field
      description="Two letters, four digits, then two letters. Raw form value: AB2048QZ."
      label="Inventory code"
      required
    >
      <div>
        <MaskedField
          adapter={productCodeMaskAdapter}
          autoComplete="off"
          inputMode="text"
          maxInputLength={10}
          name="inventory-code"
          onValueChange={(next) => {
            setInput(next.formattedValue);
            if (next.status !== "composing") {
              terminalCount.current += 1;
              setVisibleTerminalCount(terminalCount.current);
            }
            setResolved(
              JSON.stringify({
                formatted: next.formattedValue,
                raw: next.rawValue,
                serialized: next.serializedValue,
                status: next.status,
              }),
            );
          }}
          placeholder="AB-2048-QZ"
          required
          value={input}
        />
        <output aria-live="polite" data-testid="mask-value" style={outputStyle}>
          {resolved}
        </output>
        <output data-testid="mask-terminal-count" style={outputStyle}>
          Terminal adapter commits: {visibleTerminalCount}
        </output>
      </div>
    </Field>
  );
}

function ResetWorkbench() {
  const [submission, setSubmission] = useState("No submission yet");
  return (
    <form
      aria-label="Phone and masked value serialization"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        setSubmission(
          JSON.stringify({
            extension: String(data.get("contact-extension") ?? ""),
            formattedCode: String(data.get("formatted-code") ?? ""),
            phone: String(data.get("contact-phone") ?? ""),
            rawCode: String(data.get("raw-code") ?? ""),
            readOnlyExtension: String(data.get("readonly-extension") ?? ""),
            readOnlyPhone: String(data.get("readonly-phone") ?? ""),
            disabledPhonePresent: data.has("disabled-phone"),
            disabledExtensionPresent: data.has("disabled-extension"),
          }),
        );
      }}
    >
      <Field label="Primary phone">
        <PhoneField
          adapter={fixedTenDigitPhoneAdapter}
          country={india}
          defaultExtensionValue="204"
          defaultValue="9876543210"
          extension
          extensionLabel="Extension"
          extensionName="contact-extension"
          name="contact-phone"
        />
      </Field>
      <Field description="Submitted without separators." label="Raw inventory code">
        <MaskedField
          adapter={productCodeMaskAdapter}
          defaultValue="AB2048QZ"
          maxInputLength={10}
          name="raw-code"
          serialization="raw"
        />
      </Field>
      <Field description="Submitted with separators." label="Formatted inventory code">
        <MaskedField
          adapter={productCodeMaskAdapter}
          defaultValue="CD4096RX"
          maxInputLength={10}
          name="formatted-code"
          serialization="formatted"
        />
      </Field>
      <Field
        description="Read-only canonical values remain successful form controls."
        label="Read-only phone"
      >
        <PhoneField
          adapter={fixedTenDigitPhoneAdapter}
          country={unitedStates}
          defaultExtensionValue="88"
          defaultValue="2125550188"
          extension
          extensionLabel="Read-only extension"
          extensionName="readonly-extension"
          name="readonly-phone"
          readOnly
        />
      </Field>
      <Field
        description="Disabled canonical values are omitted from FormData."
        label="Disabled phone"
      >
        <PhoneField
          adapter={fixedTenDigitPhoneAdapter}
          country={unitedStates}
          defaultExtensionValue="99"
          defaultValue="6465550100"
          disabled
          extension
          extensionLabel="Disabled extension"
          extensionName="disabled-extension"
          name="disabled-phone"
        />
      </Field>
      <div style={buttonRailStyle}>
        <button style={buttonStyle} type="submit">
          Inspect form values
        </button>
        <button style={secondaryButtonStyle} type="reset">
          Restore defaults
        </button>
      </div>
      <output aria-live="polite" data-testid="form-values" style={outputStyle}>
        {submission}
      </output>
    </form>
  );
}

function DelayedControlledMaskWorkbench() {
  const [input, setInput] = useState("AB-2048-QZ");
  const [pending, setPending] = useState(false);
  return (
    <Field
      description="The parent applies each valid formatted value after 240 ms; the adapter caret map remains pending until that exact value renders."
      label="Delayed inventory code"
    >
      <div>
        <MaskedField
          adapter={productCodeMaskAdapter}
          data-testid="delayed-mask"
          maxInputLength={10}
          onValueChange={(next) => {
            setPending(true);
            setTimeout(() => {
              setInput(next.formattedValue);
              setPending(false);
            }, 240);
          }}
          value={input}
        />
        <output aria-live="polite" data-testid="delayed-mask-state" style={outputStyle}>
          {pending ? "Parent update pending" : `Rendered: ${input}`}
        </output>
      </div>
    </Field>
  );
}

function MergoraPhoneMaskedModes({
  maskedCanonicalSerialization = true,
  phoneCanonicalSerialization = true,
  phoneExtension = true,
}: Partial<PhoneMaskedEnhancementArgs> = {}) {
  const [submission, setSubmission] = useState("Submit to inspect native values.");

  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Canonical contact and identifier entry</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Deterministic formatting remains in the visible native editors; canonical form values and
          extension capture can be removed independently.
        </p>
      </header>
      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          setSubmission(
            JSON.stringify(
              Object.fromEntries(
                [...new FormData(event.currentTarget).entries()].map(([name, value]) => [
                  name,
                  String(value),
                ]),
              ),
            ),
          );
        }}
      >
        <Field description="The visible national format stays editable." label="Support phone">
          <PhoneField
            adapter={fixedTenDigitPhoneAdapter}
            country={unitedStates}
            defaultValue="4155552671"
            extension={phoneExtension}
            {...(phoneExtension
              ? {
                  defaultExtensionValue: "204",
                  extensionLabel: "Extension",
                  extensionName: "support-extension",
                }
              : {})}
            {...(phoneCanonicalSerialization ? { name: "support-phone" } : {})}
          />
        </Field>
        <Field
          description="The adapter keeps a stable formatted view and raw identifier."
          label="Inventory code"
        >
          <MaskedField
            adapter={productCodeMaskAdapter}
            defaultValue="AB2048QZ"
            maxInputLength={10}
            {...(maskedCanonicalSerialization ? { name: "inventory-code" } : {})}
            serialization="raw"
          />
        </Field>
        <button style={buttonStyle} type="submit">
          Inspect native values
        </button>
      </form>
      <output aria-live="polite" data-testid="enhancement-form-values" style={outputStyle}>
        {submission}
      </output>
    </Canvas>
  );
}

const meta = {
  args: {
    maskedCanonicalSerialization: true,
    phoneCanonicalSerialization: true,
    phoneExtension: true,
  },
  argTypes: {
    maskedCanonicalSerialization: { control: "boolean" },
    phoneCanonicalSerialization: { control: "boolean" },
    phoneExtension: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  title: "P4/Phone and masked fields",
} satisfies Meta<PhoneMaskedEnhancementArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {
  args: {
    maskedCanonicalSerialization: false,
    phoneCanonicalSerialization: false,
    phoneExtension: false,
  },
  render: (args) => <MergoraPhoneMaskedModes {...args} />,
};

export const RecommendedMergora: Story = {
  render: (args) => <MergoraPhoneMaskedModes {...args} />,
};

export const PhoneWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>International phone values without invented metadata</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Formatting, validity, E.164 output, and caret mapping belong to an explicit adapter. The
          native tel input retains paste, autocomplete, IME, editor commands, and mobile behavior.
        </p>
      </header>
      <ControlledPhoneWorkbench />
    </Canvas>
  ),
};

export const MaskedWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Raw and formatted values stay inspectable</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          This local code adapter is deliberately narrow. It never comes from a mask string or
          remote definition, and invalid input remains visible for correction.
        </p>
      </header>
      <ControlledMaskWorkbench />
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Canonical, raw, and formatted form serialization</h1>
      <ResetWorkbench />
    </Canvas>
  ),
};

export const DelayedControlledCaret: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Caret mapping survives delayed controlled ownership</h1>
      <DelayedControlledMaskWorkbench />
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Phone and mask adverse-state rail</h1>
      <div style={stateRailStyle}>
        <section aria-label="Incomplete phone" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Incomplete phone</h2>
          <Field description="The adapter has not produced E.164 yet." label="Support line">
            <PhoneField
              adapter={fixedTenDigitPhoneAdapter}
              country={{
                callingCode: "+1",
                code: "US",
                label: "United States of America — long localized country label",
              }}
              defaultValue="41555"
            />
          </Field>
        </section>
        <section aria-label="Invalid phone" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Invalid phone</h2>
          <Field label="Escalation line">
            <PhoneField
              adapter={fixedTenDigitPhoneAdapter}
              country={unitedStates}
              defaultValue="call-me"
              invalidMessage="Use ten national digits. The unsupported text remains available to edit."
            />
          </Field>
        </section>
        <section aria-label="Read-only phone" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only phone</h2>
          <Field label="Verified contact">
            <PhoneField
              adapter={fixedTenDigitPhoneAdapter}
              country={unitedStates}
              defaultValue="4155552671"
              readOnly
            />
          </Field>
        </section>
        <section aria-label="Disabled phone" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled phone</h2>
          <Field label="Archived contact">
            <PhoneField
              adapter={fixedTenDigitPhoneAdapter}
              country={unitedStates}
              defaultValue="4155552671"
              disabled
            />
          </Field>
        </section>
        <section aria-label="Invalid mask" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Invalid mask</h2>
          <Field label="Inventory code">
            <MaskedField
              adapter={productCodeMaskAdapter}
              defaultValue="AB_wrong"
              invalidMessage="Use two letters, four digits, then two letters. Your text was not removed."
              maxInputLength={16}
            />
          </Field>
        </section>
        <section aria-label="Read-only mask" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only mask</h2>
          <Field label="Imported inventory code">
            <MaskedField
              adapter={productCodeMaskAdapter}
              defaultValue="AB2048QZ"
              maxInputLength={10}
              readOnly
            />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const RightToLeftAndNarrow: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <div style={{ inlineSize: "min(100%, 18rem)", marginInline: "auto" }}>
        <h1 style={{ marginBlockStart: 0 }}>
          Ø¥Ø¯Ø®Ø§Ù„ Ø¶ÙŠÙ‘Ù‚ Ù…Ù† Ø§Ù„ÙŠÙ…ÙŠÙ† Ø¥Ù„Ù‰ Ø§Ù„ÙŠØ³Ø§Ø±
        </h1>
        <Field
          description="Ø§Ø³Ù… Ø§Ù„Ø¯ÙˆÙ„Ø© ÙˆØ±Ù…Ø² Ø§Ù„Ø§ØªØµØ§Ù„ Ù…ÙƒØªÙˆØ¨Ø§Ù† Ø¨ÙˆØ¶ÙˆØ­."
          label="Ø±Ù‚Ù… Ø§Ù„Ù‡Ø§ØªÙ"
        >
          <PhoneField
            adapter={fixedTenDigitPhoneAdapter}
            country={egyptArabic}
            defaultValue="1012345678"
            extension
            extensionLabel="Ø§Ù„ØªØ­ÙˆÙŠÙ„Ø©"
            invalidMessage="Ø£Ø¯Ø®Ù„ Ø¹Ø´Ø±Ø© Ø£Ø±Ù‚Ø§Ù… ÙˆØ·Ù†ÙŠØ© ÙƒØ§Ù…Ù„Ø©."
          />
        </Field>
        <Field
          description="Ø­Ø±ÙØ§Ù†ØŒ Ø£Ø±Ø¨Ø¹Ø© Ø£Ø±Ù‚Ø§Ù…ØŒ Ø«Ù… Ø­Ø±ÙØ§Ù†."
          label="Ø±Ù…Ø² Ø§Ù„Ù…Ø®Ø²ÙˆÙ†"
        >
          <MaskedField
            adapter={productCodeMaskAdapter}
            defaultValue="AB2048QZ"
            invalidMessage="ØªØ­Ù‚Ù‚ Ù…Ù† ØªØ±ØªÙŠØ¨ Ø§Ù„Ø­Ø±ÙˆÙ ÙˆØ§Ù„Ø£Ø±Ù‚Ø§Ù…."
            maxInputLength={10}
          />
        </Field>
      </div>
    </Canvas>
  ),
};
