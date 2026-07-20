import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import {
  ColorField,
  createSrgbColor,
  serializeColorValue,
  type SrgbColorValue,
} from "../../../registry/source/components/color-field/color-field";
import { ColorPicker } from "../../../registry/source/components/color-picker/color-picker";
import { Field } from "../../../registry/source/components/field/field";
import { Form } from "../../../registry/source/components/form/form";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";

const BRAND_GREEN = createSrgbColor({ alpha: 204, blue: 87, green: 122, red: 47 });
const VIOLET = createSrgbColor({ alpha: 255, blue: 126, green: 58, red: 83 });
const WHITE = createSrgbColor({ alpha: 255, blue: 255, green: 255, red: 255 });

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "clamp(1rem, 5vw, 3rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  marginInline: "auto",
  maxInlineSize: "52rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const matrixStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  borderRadius: "var(--mrg-semantic-radius-surface)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const actionsStyle = {
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

interface ColorEnhancementArgs {
  readonly colorFieldContrast: boolean;
  readonly colorFieldPreview: boolean;
  readonly colorPickerContrast: boolean;
  readonly colorPickerPreview: boolean;
  readonly colorPickerSwatches: boolean;
  readonly colorTextFormat: "hex" | "hsl" | "rgb";
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

function MergoraColorModes({
  colorFieldContrast,
  colorFieldPreview,
  colorPickerContrast,
  colorPickerPreview,
  colorPickerSwatches,
  colorTextFormat,
}: ColorEnhancementArgs) {
  const [submission, setSubmission] = useState("No canonical values submitted.");
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Mergora color controls</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Exact editing and native serialization remain available when preview, contrast, and preset
          aids are removed independently.
        </p>
      </header>
      <Form
        aria-label="Color control modes"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmission(
            JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())),
          );
        }}
      >
        <Field label="Accent color">
          <ColorField
            contrastBackground={WHITE}
            defaultValue={VIOLET}
            format={colorTextFormat}
            name="accent-color"
            showContrast={colorFieldContrast}
            showPreview={colorFieldPreview}
          />
        </Field>
        <Field label="Interface color">
          <ColorPicker
            contrastBackground={WHITE}
            defaultValue={BRAND_GREEN}
            format={colorTextFormat}
            name="interface-color"
            showContrast={colorPickerContrast}
            showPreview={colorPickerPreview}
            swatches={colorPickerSwatches ? [BRAND_GREEN, VIOLET] : []}
          />
        </Field>
        <div style={actionsStyle}>
          <button style={buttonStyle} type="submit">
            Inspect canonical values
          </button>
          <button style={buttonStyle} type="reset">
            Restore defaults
          </button>
        </div>
      </Form>
      <output aria-live="polite" data-testid="mergora-color-values">
        {submission}
      </output>
    </Canvas>
  );
}

function ProductionForm() {
  const [submission, setSubmission] = useState("No submission yet");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmission(JSON.stringify(Object.fromEntries(new FormData(event.currentTarget).entries())));
  };
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Brand color workbench</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Spatial, channel, preset, and exact text controls share one 8-bit sRGB value. The
          submitted value is canonical rather than the localized visible channel text.
        </p>
      </header>
      <Form aria-label="Brand color settings" onSubmit={handleSubmit}>
        <Field
          description="Transparency is allowed. Use the channel sliders or exact text when the two-dimensional area is not convenient."
          label="Primary brand color"
          required
        >
          <ColorPicker
            alphaPolicy="allow"
            contrastBackground={WHITE}
            defaultValue={BRAND_GREEN}
            name="brand-color"
          />
        </Field>
        <div style={actionsStyle}>
          <button style={buttonStyle} type="submit">
            Preview canonical value
          </button>
          <button style={buttonStyle} type="reset">
            Restore color default
          </button>
        </div>
      </Form>
      <output aria-live="polite" data-testid="color-submission">
        {submission}
      </output>
    </Canvas>
  );
}

function ControlledPickerWorkbench() {
  const [committed, setCommitted] = useState(VIOLET);
  const [requested, setRequested] = useState<SrgbColorValue | null>(null);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Controlled color ownership</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        Picker changes are requests. The visible value remains parent-owned until the request is
        explicitly applied.
      </p>
      <Field label="Parent-owned color">
        <ColorPicker data-testid="controlled-picker" onChange={setRequested} value={committed} />
      </Field>
      <p data-testid="committed-color">
        Committed: <bdi>{serializeColorValue(committed, "allow")}</bdi>
      </p>
      <p data-testid="requested-color">
        Requested:{" "}
        <bdi>{requested === null ? "none" : serializeColorValue(requested, "allow")}</bdi>
      </p>
      <button
        disabled={requested === null}
        onClick={() => {
          if (requested !== null) {
            setCommitted(requested);
            setRequested(null);
          }
        }}
        style={buttonStyle}
        type="button"
      >
        Apply requested color
      </button>
    </Canvas>
  );
}

function DelayedControlledTextWorkbench() {
  const [accepted, setAccepted] = useState(VIOLET);
  const [requested, setRequested] = useState<SrgbColorValue | null>(null);
  const [requestCount, setRequestCount] = useState(0);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Delayed controlled text commit</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        A valid text request remains visible while the accepted preview and form value wait for the
        parent. Repeating Enter does not send the same request twice.
      </p>
      <Field label="Reviewed color">
        <ColorField
          defaultValue={VIOLET}
          name="reviewed-color"
          onChange={(next) => {
            setRequested(next);
            setRequestCount((count) => count + 1);
          }}
          value={accepted}
        />
      </Field>
      <p data-testid="accepted-text-color">
        Accepted: <bdi>{serializeColorValue(accepted, "opaque")}</bdi>
      </p>
      <p data-testid="requested-text-color">
        Requested:{" "}
        <bdi>{requested === null ? "none" : serializeColorValue(requested, "opaque")}</bdi>
      </p>
      <p data-testid="text-request-count">Requests: {requestCount}</p>
      <button
        disabled={requested === null}
        onClick={() => {
          if (requested !== null) {
            setAccepted(requested);
            setRequested(null);
          }
        }}
        style={buttonStyle}
        type="button"
      >
        Accept text request
      </button>
    </Canvas>
  );
}

const meta = {
  args: {
    colorFieldContrast: true,
    colorFieldPreview: true,
    colorPickerContrast: true,
    colorPickerPreview: true,
    colorPickerSwatches: true,
    colorTextFormat: "hex",
  },
  argTypes: {
    colorFieldContrast: { control: "boolean" },
    colorFieldPreview: { control: "boolean" },
    colorPickerContrast: { control: "boolean" },
    colorPickerPreview: { control: "boolean" },
    colorPickerSwatches: { control: "boolean" },
    colorTextFormat: { control: "select", options: ["hex", "rgb", "hsl"] },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P4/Color fields",
} satisfies Meta<ColorEnhancementArgs>;

export default meta;
type Story = StoryObj<ColorEnhancementArgs>;

export const BasicDefaults: Story = {
  args: {
    colorFieldContrast: false,
    colorFieldPreview: false,
    colorPickerContrast: false,
    colorPickerPreview: false,
    colorPickerSwatches: false,
    colorTextFormat: "hex",
  },
  render: (args) => <MergoraColorModes {...args} />,
};

export const RecommendedMergora: Story = {
  render: (args) => <MergoraColorModes {...args} />,
};

export const ProductionWorkbench: Story = {
  render: () => <ProductionForm />,
};

export const ColorFieldWorkbench: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Exact color entry and conversion</h1>
      <div style={matrixStyle}>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Hex with alpha</h2>
          <Field description="Canonical submission always includes alpha." label="Overlay color">
            <ColorField
              alphaPolicy="allow"
              defaultValue={BRAND_GREEN}
              format="hex"
              name="overlay"
            />
          </Field>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>RGB</h2>
          <Field label="RGB color">
            <ColorField alphaPolicy="allow" defaultValue={VIOLET} format="rgb" />
          </Field>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>HSL</h2>
          <Field label="HSL color">
            <ColorField alphaPolicy="opaque" defaultValue={VIOLET} format="hsl" />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const KeyboardAndPointerParity: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Keyboard, pointer, and touch parity</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        Use the two-dimensional area with pointer or touch. For keyboard and switch access, hue,
        saturation, brightness, opacity, presets, and exact text are separate named controls.
      </p>
      <Field label="Interface accent">
        <ColorPicker defaultValue={BRAND_GREEN} />
      </Field>
    </Canvas>
  ),
};

export const ValidationAndRecovery: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Invalid and incomplete text recovery</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        Enter keeps a valid value, invalid text remains editable, and Escape restores the last valid
        canonical color without submitting the draft.
      </p>
      <Field description="Opaque colors only; alpha input is rejected." label="Text color" required>
        <ColorField
          alphaPolicy="opaque"
          defaultValue={VIOLET}
          name="text-color"
          placeholder="#rrggbb"
        />
      </Field>
    </Canvas>
  ),
};

export const ControlledOwnership: Story = {
  render: () => <ControlledPickerWorkbench />,
};

export const DelayedControlledText: Story = {
  render: () => <DelayedControlledTextWorkbench />,
};

export const AdverseStateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Adverse state matrix</h1>
      <div style={matrixStyle}>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Empty field</h2>
          <Field label="Optional color">
            <ColorField />
          </Field>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Disabled picker</h2>
          <Field label="Unavailable color">
            <ColorPicker defaultValue={VIOLET} disabled />
          </Field>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Read-only picker</h2>
          <Field label="Audited color">
            <ColorPicker defaultValue={BRAND_GREEN} readOnly />
          </Field>
        </section>
        <section style={specimenStyle}>
          <h2 style={{ margin: 0 }}>Field error</h2>
          <Field error="Choose a reviewed palette value." label="Unreviewed color">
            <ColorField alphaPolicy="opaque" defaultValue={VIOLET} />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const RightToLeftAndNarrow: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <h1 style={{ margin: 0 }}>اختيار اللون من اليمين إلى اليسار</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        يمكن استخدام أشرطة القنوات أو الإدخال النصي بدلًا من المساحة ثنائية الأبعاد.
      </p>
      <Field description="القيمة المرسلة ثابتة وغير محلية." label="لون الواجهة">
        <ColorPicker
          defaultValue={BRAND_GREEN}
          fieldMessages={{
            alphaNotAllowed: "يقبل هذا الحقل ألوانًا معتمة فقط.",
            contrastAtOrAbove: "عند الحد المرجعي المحدد أو أعلى منه",
            contrastBelow: "أقل من الحد المرجعي المحدد",
            contrastLabel: "التباين المرجعي",
            contrastUnavailable: "لا تتوفر نسبة التباين حتى يتم تحديد لون صالح.",
            emptyPreview: "لم يتم تحديد لون",
            invalidSyntax: "أدخل لونًا سداسيًا أو RGB أو HSL.",
            outOfRange: "إحدى قنوات اللون أو أكثر خارج النطاق المدعوم.",
            previewLabel: "معاينة اللون المحدد",
            required: "أدخل لونًا.",
            verificationNote: "تحقق من حجم النص والألوان النهائية المعروضة بشكل مستقل.",
          }}
          messages={{
            alphaLabel: "العتامة",
            areaLabel: "التشبع والسطوع",
            brightnessLabel: "السطوع",
            channelHeading: "عناصر تحكم القنوات بلوحة المفاتيح",
            hueLabel: "درجة اللون",
            pickerLabel: "عناصر اختيار اللون",
            saturationLabel: "التشبع",
            swatchLabel: "عينة اللون",
            swatchesLabel: "ألوان جاهزة",
          }}
        />
      </Field>
    </Canvas>
  ),
};
