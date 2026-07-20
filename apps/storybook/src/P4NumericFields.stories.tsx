import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { CurrencyField } from "../../../registry/source/components/currency-field/currency-field";
import { Field } from "../../../registry/source/components/field/field";
import { Form } from "../../../registry/source/components/form/form";
import { NumberField } from "../../../registry/source/components/number-field/number-field";
import { PercentageField } from "../../../registry/source/components/percentage-field/percentage-field";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  marginInline: "auto",
  maxInlineSize: "48rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const matrixStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 14rem), 1fr))",
} satisfies CSSProperties;

const specimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-md)",
} satisfies CSSProperties;

const buttonStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-action-border)",
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

const buttonRailStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-sm)",
} satisfies CSSProperties;

interface NumericEnhancementArgs {
  readonly scrub: boolean;
  readonly showCanonicalPreview: boolean;
  readonly statusRail: boolean;
}

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

function SubmitWorkbench({
  scrub = true,
  showCanonicalPreview = true,
  statusRail = true,
}: Partial<NumericEnhancementArgs> = {}) {
  const [result, setResult] = useState("No submission yet");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entries = Object.fromEntries(
      [...new FormData(event.currentTarget).entries()].map(([name, value]) => [
        name,
        String(value),
      ]),
    );
    setResult(JSON.stringify(entries));
  };

  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Project budget model</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Localized editing stays human-readable while submission keeps canonical numeric values.
          This scenario uses a generic monthly project budget from 1,000 to 10,000.
        </p>
      </header>
      <Form aria-label="Project budget model" onSubmit={handleSubmit}>
        <Field
          description="Allowed monthly range: EUR 1,000 to EUR 10,000."
          label="Monthly operating budget"
          required
        >
          <CurrencyField
            currency="EUR"
            defaultValue={8000}
            maxValue={10000}
            minValue={1000}
            name="monthly-budget"
            showCanonicalPreview={showCanonicalPreview}
            statusRail={statusRail ? "auto" : false}
            step={250}
          />
        </Field>
        <Field description="Stored as a fraction: 0.15 means 15%." label="Contingency target">
          <PercentageField
            defaultValue={0.15}
            maxValue={0.5}
            name="contingency-target"
            showCanonicalPreview={showCanonicalPreview}
            statusRail={statusRail ? "auto" : false}
            step={0.005}
          />
        </Field>
        <Field description="One decimal place, from 0 to 10." label="Review score">
          <NumberField
            defaultValue={8.5}
            maxValue={10}
            minValue={0}
            name="review-score"
            precision={1}
            scrub={scrub}
            showCanonicalPreview={showCanonicalPreview}
            statusRail={statusRail ? "auto" : false}
          />
        </Field>
        <div style={buttonRailStyle}>
          <button style={buttonStyle} type="submit">
            Preview canonical values
          </button>
          <button style={buttonStyle} type="reset">
            Restore numeric defaults
          </button>
        </div>
      </Form>
      <output aria-live="polite" data-testid="submission-result">
        {result}
      </output>
    </Canvas>
  );
}

const meta = {
  args: {
    scrub: true,
    showCanonicalPreview: true,
    statusRail: true,
  },
  argTypes: {
    scrub: { control: "boolean" },
    showCanonicalPreview: { control: "boolean" },
    statusRail: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  title: "P4/Numeric fields",
} satisfies Meta<NumericEnhancementArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductionWorkbench: Story = {
  render: (args) => <SubmitWorkbench {...args} />,
};

export const RecommendedMergora: Story = {
  render: (args) => <SubmitWorkbench {...args} />,
};

export const PlainBaseline: Story = {
  args: { scrub: false, showCanonicalPreview: false, statusRail: false },
  render: (args) => <SubmitWorkbench {...args} />,
};

export const LocaleMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Locale-aware value matrix</h1>
      <div style={matrixStyle}>
        {[
          { currency: "USD", direction: "ltr" as const, locale: "en-US", title: "English" },
          { currency: "EUR", direction: "ltr" as const, locale: "de-DE", title: "Deutsch" },
          { currency: "INR", direction: "ltr" as const, locale: "hi-IN", title: "हिन्दी" },
          { currency: "EGP", direction: "rtl" as const, locale: "ar-EG", title: "العربية" },
        ].map((example) => (
          <MergoraProvider
            direction={example.direction}
            key={example.locale}
            locale={example.locale}
          >
            <section aria-label={example.title} style={specimenStyle}>
              <h2 style={{ margin: 0 }}>{example.title}</h2>
              <Field label="Localized number">
                <NumberField defaultValue={1234567.89} precision={2} showStepper={false} />
              </Field>
              <Field label="Localized amount">
                <CurrencyField
                  currency={example.currency}
                  defaultValue={9876.5}
                  showStepper={false}
                />
              </Field>
              <Field label="Localized percentage">
                <PercentageField defaultValue={0.125} showStepper={false} />
              </Field>
            </section>
          </MergoraProvider>
        ))}
      </div>
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Production state matrix</h1>
      <div style={matrixStyle}>
        <section style={specimenStyle}>
          <Field description="Accepts a new numeric value." label="Empty">
            <NumberField name="empty-number" />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field label="Disabled amount">
            <CurrencyField currency="USD" defaultValue={6400} disabled name="disabled-amount" />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field label="Read-only allocation">
            <PercentageField defaultValue={0.4} readOnly />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field error="Use a value from 1 through 10." label="Invalid score">
            <NumberField defaultValue={12} maxValue={10} minValue={1} />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field label="Required budget" required>
            <CurrencyField currency="GBP" name="required-budget" />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field description="The percentage contract remains fractional." label="Extended growth">
            <PercentageField defaultValue={1.35} maxValue={3} />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const ScrubAndKeyboard: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Scrub, stepper, and keyboard parity</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        Drag the scrub handle horizontally, or focus it and use arrows, Page Up, Page Down, Home,
        and End. Every action updates the same spinbutton state.
      </p>
      <Field description="0 to 100 in half-point increments." label="Confidence score">
        <NumberField
          data-testid="scrub-field"
          defaultValue={50}
          maxValue={100}
          minValue={0}
          precision={1}
          scrub
          step={0.5}
        />
      </Field>
      <Field description="Wheel changes remain disabled by default." label="Monthly budget">
        <CurrencyField currency="USD" defaultValue={9000} maxValue={25000} minValue={1000} />
      </Field>
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => <SubmitWorkbench />,
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <h1 style={{ margin: 0 }}>قيم رقمية من اليمين إلى اليسار</h1>
      <Field description="القيمة المخفية رقم أساسي بدون تنسيق محلي." label="الميزانية الشهرية">
        <CurrencyField currency="EGP" defaultValue={7800} maxValue={20000} minValue={1000} />
      </Field>
      <Field description="القيمة الأساسية 0.275." label="نسبة التخصيص">
        <PercentageField defaultValue={0.275} />
      </Field>
      <Field label="عدد الوحدات">
        <NumberField defaultValue={1234.5} precision={1} />
      </Field>
    </Canvas>
  ),
};

function ControlledNumericSpecimen() {
  const [quantity, setQuantity] = useState(24);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Controlled and uncontrolled values</h1>
      <Field description="The consumer owns this canonical number." label="Controlled quantity">
        <NumberField
          maxValue={100}
          minValue={0}
          onChange={setQuantity}
          showCanonicalPreview
          statusRail="auto"
          value={quantity}
        />
      </Field>
      <output aria-live="polite">Controlled value: {quantity}</output>
      <Field description="Native reset restores the initial value." label="Uncontrolled quantity">
        <NumberField defaultValue={12} name="uncontrolled-quantity" showCanonicalPreview />
      </Field>
    </Canvas>
  );
}

export const ControlledAndUncontrolled: Story = {
  render: () => <ControlledNumericSpecimen />,
};

export const NarrowAndPreferences: Story = {
  render: () => (
    <Canvas>
      <div style={{ inlineSize: "min(100%, 20rem)", marginInline: "auto" }}>
        <h1 style={{ marginBlockStart: 0 }}>Narrow preference specimen</h1>
        <p style={{ maxInlineSize: "65ch" }}>
          Status context stacks below the control, forced colors retain structural boundaries, and
          no numeric behavior depends on motion.
        </p>
        <Field
          description="Fractional storage remains visible without crowding the input."
          label="Completion"
        >
          <PercentageField defaultValue={0.625} showCanonicalPreview statusRail="auto" />
        </Field>
      </div>
    </Canvas>
  ),
};
