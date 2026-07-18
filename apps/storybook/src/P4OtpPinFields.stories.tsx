import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/field";
import { OtpField } from "../../../registry/source/components/otp-field/otp-field";
import { PinField } from "../../../registry/source/components/pin-field/pin-field";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";

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
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "64rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const heroStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  borderRadius: "var(--mrg-semantic-radius-surface)",
  color: "var(--mrg-semantic-color-action-foreground)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  padding: "clamp(1.25rem, 5vw, 3.5rem)",
} satisfies CSSProperties;

const specimenStyle = {
  alignItems: "start",
  borderBlockEnd:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 18rem), 1fr))",
  paddingBlock: "var(--mrg-semantic-space-inset-xl)",
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
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 11rem), 1fr))",
  paddingBlock: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const policyListStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-sm)",
  listStyle: "none",
  margin: 0,
  padding: 0,
} satisfies CSSProperties;

const policyItemStyle = {
  alignItems: "baseline",
  display: "grid",
  gap: "var(--mrg-semantic-space-inline-sm)",
  gridTemplateColumns: "auto minmax(0, 1fr)",
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

const outputStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  borderRadius: "var(--mrg-semantic-radius-control)",
  display: "block",
  fontFamily: "var(--mrg-semantic-font-family-machine)",
  fontSize: "var(--mrg-semantic-font-size-code)",
  minBlockSize: "2.75rem",
  overflowWrap: "anywhere",
  padding: "var(--mrg-semantic-space-inset-md)",
} satisfies CSSProperties;

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

function SubmissionWorkbench() {
  const [completion, setCompletion] = useState("Waiting for code entry.");
  const [completionCount, setCompletionCount] = useState(0);
  const [submission, setSubmission] = useState("No form submission yet.");

  return (
    <Canvas>
      <header style={heroStyle}>
        <div>
          <h1
            style={{
              fontSize: "clamp(2rem, 6vw, 4rem)",
              letterSpacing: "-0.025em",
              lineHeight: 1.02,
              margin: 0,
              textWrap: "balance",
            }}
          >
            Access proofing station
          </h1>
        </div>
        <p style={{ margin: 0, maxInlineSize: "55ch", textWrap: "pretty" }}>
          A one-time code and a reusable PIN are two different credentials. Both remain one native
          field; reaching the expected length never submits the form automatically.
        </p>
      </header>

      <form
        aria-label="Access proofing"
        onSubmit={(event: FormEvent<HTMLFormElement>) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setSubmission(
            JSON.stringify({
              pin: String(data.get("access-pin") ?? ""),
              verificationCode: String(data.get("verification-code") ?? ""),
            }),
          );
        }}
      >
        <div style={specimenStyle}>
          <section>
            <h2 style={{ marginBlockStart: 0 }}>Temporary verification</h2>
            <Field
              description="Paste or autofill the six-character code. Completion does not verify it."
              label="Verification code"
              required
            >
              <OtpField
                autoComplete="one-time-code"
                groups={[3, 3]}
                name="verification-code"
                onComplete={() => {
                  setCompletionCount((count) => count + 1);
                  setCompletion("Code length reached; the form remains unsubmitted.");
                }}
                required
              />
            </Field>
          </section>

          <section>
            <h2 style={{ marginBlockStart: 0 }}>Reusable secret</h2>
            <Field
              description="This PIN is reusable. It is masked and is not an OTP."
              label="Access PIN"
              required
            >
              <PinField
                autoComplete="current-password"
                defaultValue="2468"
                name="access-pin"
                purpose="reusable-secret"
                required
              />
            </Field>
          </section>
        </div>

        <ul aria-label="Field policy" style={policyListStyle}>
          {[
            "One native input and one tab stop per credential",
            "Paste and browser autofill remain available by default",
            "No automatic submission, verification, or cognitive test",
          ].map((policy) => (
            <li key={policy} style={policyItemStyle}>
              <span aria-hidden="true">✓</span>
              <span>{policy}</span>
            </li>
          ))}
        </ul>

        <div style={buttonRailStyle}>
          <button style={buttonStyle} type="submit">
            Inspect native values
          </button>
          <button style={secondaryButtonStyle} type="reset">
            Restore credential defaults
          </button>
        </div>
      </form>

      <div>
        <p aria-live="polite" data-testid="completion-state">
          {completion}
        </p>
        <p data-testid="completion-count">Completion notifications: {completionCount}</p>
        <output aria-live="polite" data-testid="submission-result" style={outputStyle}>
          {submission}
        </output>
      </div>
    </Canvas>
  );
}

function ControlledWorkbench() {
  const [otp, setOtp] = useState("914");
  const [pin, setPin] = useState("73");
  const [otpCompletionCount, setOtpCompletionCount] = useState(0);
  const [pinCompletionCount, setPinCompletionCount] = useState(0);

  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Controlled ownership, visible at every step</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          External controls update the same values the native inputs edit. Partial and complete
          states stay inspectable without moving focus.
        </p>
      </header>
      <div style={specimenStyle}>
        <section>
          <Field description={`Current value: ${otp || "empty"}`} label="Controlled code">
            <OtpField
              groups={[3, 3]}
              onChange={setOtp}
              onComplete={() => setOtpCompletionCount((count) => count + 1)}
              value={otp}
            />
          </Field>
          <div style={buttonRailStyle}>
            <button onClick={() => setOtp("914205")} style={secondaryButtonStyle} type="button">
              Set complete code
            </button>
            <button onClick={() => setOtp("")} style={secondaryButtonStyle} type="button">
              Clear code
            </button>
          </div>
        </section>
        <section>
          <Field description={`Current length: ${pin.length}`} label="Controlled reusable PIN">
            <PinField
              displayMode="visible"
              onChange={setPin}
              onComplete={() => setPinCompletionCount((count) => count + 1)}
              purpose="reusable-secret"
              value={pin}
            />
          </Field>
          <div style={buttonRailStyle}>
            <button onClick={() => setPin("7351")} style={secondaryButtonStyle} type="button">
              Set complete PIN
            </button>
            <button onClick={() => setPin("")} style={secondaryButtonStyle} type="button">
              Clear PIN
            </button>
          </div>
        </section>
      </div>
      <output aria-live="polite" data-testid="controlled-values" style={outputStyle}>
        {JSON.stringify({ otp, pin })}
      </output>
      <output aria-live="polite" data-testid="controlled-completions" style={outputStyle}>
        {JSON.stringify({ otp: otpCompletionCount, pin: pinCompletionCount })}
      </output>
    </Canvas>
  );
}

function DelayedParentWorkbench() {
  const [otpCandidate, setOtpCandidate] = useState("No OTP candidate yet.");
  const [pinCandidate, setPinCandidate] = useState("No PIN candidate yet.");
  const [otpCompletionCount, setOtpCompletionCount] = useState(0);
  const [pinCompletionCount, setPinCompletionCount] = useState(0);

  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Delayed parent ownership</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          The parent observes candidates but deliberately keeps the authoritative values partial.
          Repeating an unchanged complete candidate must not duplicate completion notifications.
        </p>
      </header>
      <div style={specimenStyle}>
        <Field label="Delayed code">
          <OtpField
            groups={[3, 3]}
            onChange={setOtpCandidate}
            onComplete={() => setOtpCompletionCount((count) => count + 1)}
            value="12"
          />
        </Field>
        <Field label="Delayed reusable PIN">
          <PinField
            displayMode="visible"
            onChange={setPinCandidate}
            onComplete={() => setPinCompletionCount((count) => count + 1)}
            purpose="reusable-secret"
            value="7"
          />
        </Field>
      </div>
      <output aria-live="polite" data-testid="delayed-candidates" style={outputStyle}>
        {JSON.stringify({ otp: otpCandidate, pin: pinCandidate })}
      </output>
      <output aria-live="polite" data-testid="delayed-completions" style={outputStyle}>
        {JSON.stringify({ otp: otpCompletionCount, pin: pinCompletionCount })}
      </output>
    </Canvas>
  );
}

const meta = {
  parameters: { layout: "fullscreen" },
  title: "P4/OTP PIN fields",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const EntryWorkbench: Story = {
  render: () => <SubmissionWorkbench />,
};

export const FormSerializationAndReset: Story = {
  render: () => <SubmissionWorkbench />,
};

export const ControlledOwnership: Story = {
  render: () => <ControlledWorkbench />,
};

export const DelayedParentOwnership: Story = {
  render: () => <DelayedParentWorkbench />,
};

export const PastePolicyWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Paste policy is an explicit tradeoff</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Native paste is the default. Blocking is available only as a named application policy,
          announces what happened, and never reads clipboard contents.
        </p>
      </header>
      <div style={stateRailStyle}>
        <section aria-label="Native paste allowed" style={stateRowStyle}>
          <div>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Allow</h2>
            <p style={{ marginBlockEnd: 0 }}>Browser and password-manager friendly.</p>
          </div>
          <Field label="Paste allowed PIN">
            <PinField displayMode="visible" pastePolicy="allow" purpose="reusable-secret" />
          </Field>
        </section>
        <section aria-label="Paste blocked by policy" style={stateRowStyle}>
          <div>
            <h2 style={{ fontSize: "1rem", margin: 0 }}>Block</h2>
            <p style={{ marginBlockEnd: 0 }}>Use only after a documented policy review.</p>
          </div>
          <Field label="Paste blocked PIN">
            <PinField pastePolicy="block" purpose="reusable-secret" />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const StateRail: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Credential field state rail</h1>
      <div style={stateRailStyle}>
        <section aria-label="Empty one-time code" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Empty</h2>
          <Field description="Awaiting a six-character code." label="Empty code">
            <OtpField groups={[3, 3]} />
          </Field>
        </section>
        <section aria-label="Read-only one-time code" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only</h2>
          <Field label="Archived code">
            <OtpField defaultValue="731904" groups={[3, 3]} readOnly />
          </Field>
        </section>
        <section aria-label="Disabled one-time code" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled</h2>
          <Field label="Expired code">
            <OtpField defaultValue="421907" disabled groups={[3, 3]} />
          </Field>
        </section>
        <section aria-label="Read-only reusable PIN" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only PIN</h2>
          <Field label="Archived reusable PIN">
            <PinField defaultValue="5284" purpose="reusable-secret" readOnly />
          </Field>
        </section>
        <section aria-label="Disabled reusable PIN" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled PIN</h2>
          <Field label="Unavailable reusable PIN">
            <PinField defaultValue="5284" disabled purpose="reusable-secret" />
          </Field>
        </section>
        <section aria-label="Invalid one-time code" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Error</h2>
          <Field
            error="That code has expired. Request a new code."
            label="Expired verification code"
          >
            <OtpField defaultValue="105204" groups={[3, 3]} invalid />
          </Field>
        </section>
        <section aria-label="Secure reusable PIN" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Secure PIN</h2>
          <Field label="Masked reusable PIN">
            <PinField defaultValue="5284" purpose="reusable-secret" />
          </Field>
        </section>
        <section aria-label="Visible reusable PIN" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Visible PIN</h2>
          <Field
            description="Visible mode exposes this reusable secret on screen."
            label="Visible reusable PIN"
          >
            <PinField defaultValue="5284" displayMode="visible" purpose="reusable-secret" />
          </Field>
        </section>
        <section aria-label="Invalid reusable PIN" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>PIN error</h2>
          <Field error="The PIN was not accepted. Check it and try again." label="Rejected PIN">
            <PinField defaultValue="0000" invalid purpose="reusable-secret" />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <header>
        <h1 style={{ marginBlock: 0 }}>إدخال رموز الاعتماد من اليمين إلى اليسار</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          تبقى التسميات والرسائل باتجاه الصفحة، بينما يحافظ الرمز الرقمي على ترتيب أرقامه.
        </p>
      </header>
      <div style={specimenStyle}>
        <Field description="رمز مؤقت من ستة أرقام، مقسّم إلى مجموعتين." label="رمز التحقق">
          <OtpField
            defaultValue="731904"
            groupingLabel="رمز مؤقت من ستة أرقام، مقسّم إلى ثلاثة وثلاثة."
            groups={[3, 3]}
          />
        </Field>
        <Field
          description="رقم سري قابل لإعادة الاستخدام، وليس رمزًا لمرة واحدة."
          label="الرقم السري"
        >
          <PinField
            defaultValue="5284"
            pasteBlockedMessage="اللصق معطّل في حقل الرقم السري هذا."
            purpose="reusable-secret"
            purposeLabel="رقم سري قابل لإعادة الاستخدام من أربعة أرقام، وليس رمزًا لمرة واحدة."
          />
        </Field>
      </div>
    </Canvas>
  ),
};
