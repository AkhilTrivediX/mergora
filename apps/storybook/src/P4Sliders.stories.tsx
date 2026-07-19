import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/field";
import {
  RangeSlider,
  type RangeSliderValues,
} from "../../../registry/source/components/range-slider/range-slider";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import { Slider } from "../../../registry/source/components/slider/slider";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "clamp(1rem, 5vw, 4rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  marginInline: "auto",
  maxInlineSize: "58rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const splitStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  minInlineSize: 0,
} satisfies CSSProperties;

const buttonRailStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-sm)",
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

const headingStyle = { margin: 0, textWrap: "balance" } satisfies CSSProperties;
const proseStyle = { margin: 0, maxInlineSize: "68ch", textWrap: "pretty" } satisfies CSSProperties;

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

function ProductionForm() {
  const [result, setResult] = useState("No submission yet");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResult(
      JSON.stringify(
        Object.fromEntries(
          [...new FormData(event.currentTarget).entries()].map(([name, value]) => [
            name,
            String(value),
          ]),
        ),
      ),
    );
  };

  return (
    <Canvas>
      <header style={{ display: "grid", gap: "var(--mrg-semantic-space-stack-sm)" }}>
        <h1 style={headingStyle}>Budget allocation workbench</h1>
        <p style={proseStyle}>
          Visible currency formatting and canonical form values come from the same ordered project
          budget state.
        </p>
      </header>
      <form aria-label="Budget allocation" onSubmit={handleSubmit} style={specimenStyle}>
        <Field
          description="The first and second thumbs remain Minimum approved budget and Maximum approved budget even when they meet."
          label="Approved budget range"
        >
          <RangeSlider
            defaultValue={[4000, 10000]}
            formatOptions={{
              currency: "EUR",
              currencyDisplay: "code",
              maximumFractionDigits: 0,
              style: "currency",
            }}
            marks={[
              { label: "EUR 1k", value: 1000 },
              { label: "EUR 5k", value: 5000 },
              { label: "EUR 10k", value: 10000 },
            ]}
            maxValue={10000}
            minValue={1000}
            names={["budget-minimum", "budget-maximum"]}
            step={250}
            thumbLabels={["Minimum approved budget", "Maximum approved budget"]}
          />
        </Field>
        <Field
          description="Keyboard and drag changes use five percentage-point steps."
          label="Confidence threshold"
        >
          <Slider
            defaultValue={0.8}
            formatOptions={{ maximumFractionDigits: 0, style: "percent" }}
            marks={[
              { label: "0%", value: 0 },
              { label: "50%", value: 0.5 },
              { label: "100%", value: 1 },
            ]}
            maxValue={1}
            minValue={0}
            name="confidence-threshold"
            step={0.05}
          />
        </Field>
        <div style={buttonRailStyle}>
          <button style={buttonStyle} type="submit">
            Preview canonical values
          </button>
          <button style={buttonStyle} type="reset">
            Restore slider defaults
          </button>
        </div>
      </form>
      <output aria-live="polite" data-testid="submission-result">
        {result}
      </output>
    </Canvas>
  );
}

function ControlledRange() {
  const [value, setValue] = useState<RangeSliderValues>([40, 60]);
  return (
    <section style={specimenStyle}>
      <h2 style={headingStyle}>Controlled review window</h2>
      <Field description="The consumer owns both ordered boundaries." label="Review score window">
        <RangeSlider
          data-testid="controlled-range"
          maxValue={100}
          minValue={0}
          onChange={setValue}
          thumbLabels={["Minimum review score", "Maximum review score"]}
          value={value}
        />
      </Field>
      <output aria-live="polite" data-testid="controlled-output">
        {value.join(" to ")}
      </output>
    </section>
  );
}

const meta = {
  parameters: { layout: "fullscreen" },
  title: "P4/Sliders",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductionWorkbench: Story = {
  render: () => <ProductionForm />,
};

export const KeyboardAndCollision: Story = {
  render: () => (
    <Canvas>
      <h1 style={headingStyle}>Keyboard and collision policy</h1>
      <p style={proseStyle}>
        Use Arrow keys for one step, Page Up and Page Down for larger movement, and Home or End for
        boundaries. Range thumbs clamp at their neighbors instead of crossing or swapping names.
      </p>
      <Field
        description="The lower thumb can meet 60 but cannot pass it."
        label="Clamped delivery window"
      >
        <RangeSlider
          data-testid="collision-range"
          defaultValue={[40, 60]}
          maxValue={100}
          minValue={0}
          names={["delivery-start", "delivery-end"]}
          step={5}
          thumbLabels={["Delivery window start", "Delivery window end"]}
        />
      </Field>
      <Field
        description="All keyboard commands and direct manipulation update one value."
        label="Single value"
      >
        <Slider
          data-testid="keyboard-slider"
          defaultValue={50}
          maxValue={100}
          minValue={0}
          step={5}
        />
      </Field>
      <ControlledRange />
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={headingStyle}>Production state rail</h1>
      <form aria-label="Slider state samples" style={splitStyle}>
        <section style={specimenStyle}>
          <Field
            description="The named value is omitted from native submission."
            label="Disabled capacity"
          >
            <Slider defaultValue={30} disabled name="disabled-capacity" />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field
            description="Focusable, immutable, and still successful in forms."
            label="Read-only baseline"
          >
            <Slider defaultValue={72} name="readonly-baseline" readOnly />
          </Field>
        </section>
        <section style={specimenStyle}>
          <Field
            error="Choose a review window of at least 20 points."
            label="Invalid review window"
          >
            <RangeSlider
              defaultValue={[45, 55]}
              names={["invalid-minimum", "invalid-maximum"]}
              thumbLabels={["Invalid window minimum", "Invalid window maximum"]}
            />
          </Field>
        </section>
      </form>
    </Canvas>
  ),
};

export const DirectionAndOrientation: Story = {
  render: () => (
    <Canvas>
      <h1 style={headingStyle}>Direction and orientation workbench</h1>
      <div style={splitStyle}>
        <MergoraProvider direction="rtl" locale="ar-EG">
          <section aria-label="Arabic horizontal slider" style={specimenStyle}>
            <Field description="المفاتيح الأفقية تتبع اتجاه الكتابة." label="نطاق الميزانية">
              <RangeSlider
                defaultValue={[2500, 7500]}
                formatOptions={{
                  currency: "EGP",
                  maximumFractionDigits: 0,
                  style: "currency",
                }}
                marks={[
                  { label: "١٬٠٠٠", value: 1000 },
                  { label: "١٠٬٠٠٠", value: 10000 },
                ]}
                maxValue={10000}
                minValue={1000}
                step={250}
                thumbLabels={["الحد الأدنى للميزانية", "الحد الأقصى للميزانية"]}
              />
            </Field>
          </section>
        </MergoraProvider>
        <section aria-label="Vertical temperature slider" style={specimenStyle}>
          <Field
            description="The minimum remains at the physical bottom."
            label="Storage temperature"
          >
            <Slider
              defaultValue={4}
              formatOptions={{ style: "unit", unit: "celsius" }}
              marks={[
                { label: "0°C", value: 0 },
                { label: "5°C", value: 5 },
                { label: "10°C", value: 10 },
              ]}
              maxValue={10}
              minValue={0}
              orientation="vertical"
            />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => <ProductionForm />,
};

export const NarrowAndTouch: Story = {
  render: () => (
    <Canvas>
      <div style={{ inlineSize: "min(100%, 20rem)", marginInline: "auto" }}>
        <h1 style={headingStyle}>Narrow touch specimen</h1>
        <section style={specimenStyle}>
          <Field
            description="Endpoint labels remain while intermediate labels may hide."
            label="Mobile range"
          >
            <RangeSlider
              defaultValue={[25, 75]}
              marks={[
                { label: "0", value: 0 },
                { label: "25", value: 25 },
                { label: "50", value: 50 },
                { label: "75", value: 75 },
                { label: "100", value: 100 },
              ]}
              thumbLabels={["Mobile range minimum", "Mobile range maximum"]}
            />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};
