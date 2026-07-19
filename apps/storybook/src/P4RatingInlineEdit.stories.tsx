import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { InlineEdit } from "../../../registry/source/components/inline-edit/inline-edit";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import { Rating, type RatingValue } from "../../../registry/source/components/rating/rating";

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
  gridTemplateColumns: "minmax(9rem, 0.35fr) minmax(0, 1fr)",
  paddingBlock: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const actionRailStyle = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-sm)",
} satisfies CSSProperties;

const primaryButtonStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: 0,
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

const secondaryButtonStyle = {
  ...primaryButtonStyle,
  background: "var(--mrg-semantic-color-background-canvas)",
  border:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-interactive)",
  color: "var(--mrg-semantic-color-foreground-primary)",
} satisfies CSSProperties;

function Canvas({
  children,
  direction = "ltr",
  locale = "en-US",
  messages,
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
  readonly messages?: Readonly<Record<string, string>>;
}) {
  return (
    <MergoraProvider
      direction={direction}
      locale={locale}
      {...(messages === undefined ? {} : { messages })}
    >
      <main style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

function RatingWorkbenchContent() {
  const [controlledValue, setControlledValue] = useState<RatingValue>(3);
  const [submission, setSubmission] = useState("No form inspection yet.");
  return (
    <form
      aria-label="Rating selection workbench"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const entries = [...new FormData(event.currentTarget).entries()].map(([name, entry]) => [
          name,
          String(entry),
        ]);
        setSubmission(JSON.stringify(Object.fromEntries(entries)));
      }}
    >
      <Rating
        allowClear
        defaultValue={4}
        description="Choose a whole-star result or explicitly choose no rating."
        label="Implementation quality"
        name="implementation-quality"
      />
      <Rating
        description="This value is controlled by the workbench state."
        label="Documentation clarity"
        name="documentation-clarity"
        onValueChange={setControlledValue}
        value={controlledValue}
      />
      <output aria-live="polite" data-testid="controlled-rating-output">
        Controlled rating: {controlledValue ?? "none"}
      </output>
      <div style={actionRailStyle}>
        <button style={primaryButtonStyle} type="submit">
          Inspect rating values
        </button>
        <button style={secondaryButtonStyle} type="reset">
          Restore rating defaults
        </button>
      </div>
      <output aria-live="polite" data-testid="rating-form-output">
        {submission}
      </output>
    </form>
  );
}

function AsyncEditorContent() {
  const [attempts, setAttempts] = useState(0);
  const [savedValues, setSavedValues] = useState<string[]>([]);
  return (
    <>
      <InlineEdit
        defaultValue="Evidence-led component library"
        description="Type “fail” to exercise persistent recovery; any other value succeeds after a short delay."
        editLabel="Edit product summary"
        label="Product summary"
        name="product-summary"
        onSave={async (candidate, { signal }) => {
          setAttempts((current) => current + 1);
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(resolve, 180);
            signal.addEventListener(
              "abort",
              () => {
                clearTimeout(timer);
                reject(new DOMException("Canceled", "AbortError"));
              },
              { once: true },
            );
          });
          if (candidate.toLowerCase().includes("fail")) {
            throw new Error("Prepared save failure");
          }
          setSavedValues((current) => [...current, candidate]);
        }}
        resolveSaveError={() => "The prepared save failed. Your draft is still available."}
        validate={(candidate) =>
          candidate.trim().length < 4 ? "Enter at least four visible characters." : undefined
        }
      />
      <output aria-live="polite" data-testid="save-attempts">
        Save attempts: {attempts}
      </output>
      <output aria-live="polite" data-testid="saved-values">
        Saved values: {savedValues.join(" | ") || "none"}
      </output>
    </>
  );
}

function ControlledConflictContent() {
  const [serverValue, setServerValue] = useState("Release notes draft");
  return (
    <>
      <InlineEdit
        editLabel="Edit controlled title"
        label="Controlled title"
        name="controlled-title"
        onValueChange={setServerValue}
        value={serverValue}
      />
      <button
        onClick={() => setServerValue("Externally revised title")}
        style={secondaryButtonStyle}
        type="button"
      >
        Apply external update
      </button>
      <output data-testid="server-value">Server value: {serverValue}</output>
    </>
  );
}

function FormSerializationContent() {
  const [submission, setSubmission] = useState("No form inspection yet.");
  return (
    <form
      aria-label="Inline Edit form workbench"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const entries = [...new FormData(event.currentTarget).entries()].map(([name, entry]) => [
          name,
          String(entry),
        ]);
        setSubmission(JSON.stringify(Object.fromEntries(entries)));
      }}
    >
      <InlineEdit
        defaultValue="Akhil"
        editLabel="Edit display name"
        label="Display name"
        name="display-name"
        required
      />
      <InlineEdit
        defaultValue="Published by the release pipeline"
        label="Release owner"
        name="release-owner"
        readOnly
      />
      <InlineEdit
        defaultValue="Internal only"
        disabled
        label="Disabled note"
        name="disabled-note"
      />
      <div style={actionRailStyle}>
        <button style={primaryButtonStyle} type="submit">
          Inspect saved values
        </button>
        <button style={secondaryButtonStyle} type="reset">
          Restore saved defaults
        </button>
      </div>
      <output aria-live="polite" data-testid="inline-form-output">
        {submission}
      </output>
    </form>
  );
}

const meta = {
  parameters: { layout: "fullscreen" },
  title: "P4/Rating and inline edit",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const RatingWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Rating selection workbench</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Every editable star is a native radio. Clear, keyboard selection, checked state, form
          values, and reset share that same browser-owned control model.
        </p>
      </header>
      <RatingWorkbenchContent />
    </Canvas>
  ),
};

export const RatingStateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Rating state rail</h1>
      <form aria-label="Rating state samples">
        <div style={stateRailStyle}>
          <section aria-label="Required empty rating" style={stateRowStyle}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Required and invalid</h2>
            <Rating
              error="Choose one rating before continuing."
              label="Release confidence"
              name="required-rating"
              required
            />
          </section>
          <section aria-label="Read-only fractional rating" style={stateRowStyle}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only fractional</h2>
            <Rating label="Review average" name="review-average" readOnly value={4.5} />
          </section>
          <section aria-label="Read-only empty rating" style={stateRowStyle}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only empty</h2>
            <Rating label="First review" name="first-review" readOnly value={null} />
          </section>
          <section aria-label="Disabled rating" style={stateRowStyle}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled</h2>
            <Rating defaultValue={3} disabled label="Archived score" name="archived-score" />
          </section>
          <section aria-label="Invalid selected rating" style={stateRowStyle}>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Selected with error</h2>
            <Rating
              defaultValue={2}
              error="A verified release needs at least three stars."
              label="Verification result"
              name="verification-result"
            />
          </section>
        </div>
      </form>
    </Canvas>
  ),
};

export const InlineEditWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Explicit view and edit transitions</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Moving focus away keeps the draft open. Save and Cancel remain visible, and only a
          successful save replaces the committed value.
        </p>
      </header>
      <InlineEdit
        defaultValue="Quality Passport"
        description="Enter saves; Escape cancels; outside blur keeps the draft."
        editLabel="Edit feature name"
        label="Feature name"
        name="feature-name"
      />
      <InlineEdit
        control="textarea"
        defaultValue={"Automated evidence is necessary.\nManual evidence remains required."}
        description="Control+Enter or Command+Enter saves. Enter inserts a newline."
        editLabel="Edit evidence note"
        label="Evidence note"
        name="evidence-note"
        textareaProps={{ rows: 5 }}
      />
    </Canvas>
  ),
};

export const AsyncFailureAndRecovery: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Async failure and recovery</h1>
      <AsyncEditorContent />
      <h2 style={{ marginBlockEnd: 0 }}>Controlled external change</h2>
      <ControlledConflictContent />
    </Canvas>
  ),
};

export const InlineEditStateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Inline Edit state rail</h1>
      <div style={stateRailStyle}>
        <section aria-label="Empty required editor" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Empty and required</h2>
          <InlineEdit
            defaultValue=""
            editLabel="Edit required alias"
            label="Public alias"
            name="public-alias"
            required
          />
        </section>
        <section aria-label="Read-only editor" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read only</h2>
          <InlineEdit
            defaultValue="Protected release branch"
            label="Repository policy"
            name="repository-policy"
            readOnly
          />
        </section>
        <section aria-label="Disabled editor" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled</h2>
          <InlineEdit defaultValue="Unavailable" disabled label="Mirror status" />
        </section>
        <section aria-label="External invalid editor" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>External error</h2>
          <InlineEdit
            defaultValue="draft"
            error="This name conflicts with an existing public export."
            editLabel="Edit conflicting export"
            label="Export name"
            name="export-name"
          />
        </section>
      </div>
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Saved-value serialization and reset</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        The hidden form control follows the committed value. An unsaved draft never leaks into
        FormData, and reset restores the uncontrolled default.
      </p>
      <FormSerializationContent />
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas
      direction="rtl"
      locale="ar-EG"
      messages={{
        "inlineEdit.cancel": "إلغاء",
        "inlineEdit.save": "حفظ",
        "rating.clear": "بلا تقييم",
        "rating.option": "{value} من {maximum}",
        "rating.value": "{value} من {maximum}",
      }}
    >
      <h1 style={{ margin: 0 }}>اختبار الاتجاه من اليمين إلى اليسار</h1>
      <Rating
        allowClear
        defaultValue={3}
        description="تعمل الأسهم بحسب الاتجاه المرئي."
        label="جودة التوثيق"
        name="rtl-rating"
      />
      <InlineEdit
        defaultValue="سجل جودة قابل للمراجعة"
        description="تظل المسودة محفوظة حتى الحفظ أو الإلغاء."
        editLabel="تعديل الوصف"
        label="الوصف"
        name="rtl-description"
      />
    </Canvas>
  ),
};

export const NarrowTouch: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ fontSize: "clamp(1.75rem, 8vw, 3rem)", margin: 0 }}>Narrow touch specimen</h1>
      <Rating
        allowClear
        defaultValue={5}
        description="Targets wrap without horizontal page scrolling."
        label="Mobile review"
        name="mobile-review"
      />
      <InlineEdit
        control="textarea"
        defaultValue="Long saved content wraps without clipping or hiding the visible actions."
        editLabel="Edit mobile note"
        label="Mobile note"
        name="mobile-note"
      />
    </Canvas>
  ),
};
