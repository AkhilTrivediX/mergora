import { useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Field } from "../../../registry/source/components/field/field";
import { PasswordField } from "../../../registry/source/components/password-field/password-field";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import {
  SearchField,
  type SearchFieldStatus,
} from "../../../registry/source/components/search-field/search-field";

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
  maxInlineSize: "54rem",
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

const passwordRules = [
  {
    id: "length",
    label: "At least 12 characters",
    validate: (value: string) => value.length >= 12,
  },
  {
    id: "mixed-case",
    label: "Uppercase and lowercase letters",
    validate: (value: string) => /[A-Z]/u.test(value) && /[a-z]/u.test(value),
  },
  {
    id: "number",
    label: "At least one number",
    validate: (value: string) => /\d/u.test(value),
  },
] as const;

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

function SearchWorkbenchContent() {
  const catalog = ["Contract audit", "Quality Passport", "Semantic Sync"] as const;
  const [query, setQuery] = useState("contract");
  const [submitted, setSubmitted] = useState("No search submitted");
  const matches = catalog.filter((item) => item.toLowerCase().includes(query.toLowerCase()));
  const status: SearchFieldStatus =
    query.length === 0
      ? { state: "idle" }
      : matches.length === 0
        ? { message: `No results for “${query}”.`, state: "empty" }
        : {
            message: `${matches.length} ${matches.length === 1 ? "result" : "results"} available.`,
            state: "results",
          };

  return (
    <form
      aria-label="Component catalog search"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSubmitted(`Submitted query: ${query}`);
      }}
      role="search"
    >
      <Field description="Search names and production evidence." label="Catalog query">
        <SearchField
          name="query"
          onChange={setQuery}
          placeholder="Search components"
          resultsId="catalog-results"
          status={status}
          submitLabel="Search"
          value={query}
        />
      </Field>
      <ul aria-label="Catalog results" id="catalog-results">
        {matches.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <output aria-live="polite" data-testid="search-submission">
        {submitted}
      </output>
    </form>
  );
}

function ResetWorkbenchContent() {
  const [submission, setSubmission] = useState("No submission yet");
  return (
    <form
      aria-label="Native specialist field reset"
      onSubmit={(event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const password = String(data.get("account-password") ?? "");
        setSubmission(
          JSON.stringify({
            passwordLength: password.length,
            query: String(data.get("documentation-query") ?? ""),
          }),
        );
      }}
    >
      <Field label="Account password">
        <PasswordField
          autoComplete="current-password"
          defaultValue="Workbench!2026"
          name="account-password"
          rules={passwordRules}
        />
      </Field>
      <Field label="Documentation query">
        <SearchField defaultValue="accessibility" name="documentation-query" submitLabel="Find" />
      </Field>
      <div style={buttonRailStyle}>
        <button style={buttonStyle} type="submit">
          Inspect native values
        </button>
        <button style={secondaryButtonStyle} type="reset">
          Restore defaults
        </button>
      </div>
      <output aria-live="polite" data-testid="form-submission">
        {submission}
      </output>
    </form>
  );
}

const meta = {
  parameters: { layout: "fullscreen" },
  title: "P4/Specialist text fields",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const AuthenticationWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Credential entry without hidden interference</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Paste, autofill, password-manager discovery, native validation, and form ownership remain
          browser behavior. Requirement text reflects policy, not a speculative strength score.
        </p>
      </header>
      <form aria-label="Sign in">
        <Field description="Use the password saved for this account." label="Password" required>
          <PasswordField
            autoComplete="current-password"
            name="password"
            placeholder="Enter your password"
            required
          />
        </Field>
        <button style={buttonStyle} type="submit">
          Continue
        </button>
      </form>
    </Canvas>
  ),
};

export const RuleAndRevealWorkbench: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Policy status and explicit revelation</h1>
      <Field
        description="Every rule is visible and programmatically described."
        label="New password"
      >
        <PasswordField
          autoComplete="new-password"
          defaultValue="Mergora!2026"
          name="new-password"
          rules={passwordRules}
        />
      </Field>
    </Canvas>
  ),
};

export const CapsLockAndKeyboard: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Keyboard modifier state</h1>
      <p style={{ margin: 0, maxInlineSize: "68ch" }}>
        Focus the input and toggle Caps Lock. The status is announced without preventing any key,
        paste, or composition event.
      </p>
      <Field label="Password">
        <PasswordField autoComplete="current-password" data-testid="caps-password" />
      </Field>
    </Canvas>
  ),
};

export const SearchWorkbench: Story = {
  render: () => (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Search with current-result context</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Enter submits the containing search form. Clearing is a separate reversible action and
          results remain consumer-owned.
        </p>
      </header>
      <SearchWorkbenchContent />
    </Canvas>
  ),
};

export const ResultStateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Result-state association</h1>
      <div style={stateRailStyle}>
        {[
          {
            label: "Loading",
            status: { message: "Searching the component catalog…", state: "loading" } as const,
            value: "dialog",
          },
          {
            label: "Results",
            status: { message: "12 results available.", state: "results" } as const,
            value: "field",
          },
          {
            label: "No results",
            status: { message: "No results for “teleporter”.", state: "empty" } as const,
            value: "teleporter",
          },
          {
            label: "Error",
            status: {
              message: "Search is unavailable. Check your connection and try again.",
              state: "error",
            } as const,
            value: "popover",
          },
        ].map((example) => {
          const resultsId = `${example.label.toLowerCase().replaceAll(" ", "-")}-results`;
          return (
            <section aria-label={example.label} key={example.label} style={stateRowStyle}>
              <h2 style={{ fontSize: "1rem", margin: 0 }}>{example.label}</h2>
              <div>
                <Field label={`${example.label} query`}>
                  <SearchField
                    defaultValue={example.value}
                    resultsId={resultsId}
                    status={example.status}
                  />
                </Field>
                <div aria-label={`${example.label} results`} id={resultsId} role="region">
                  {example.status.state === "results" ? "Consumer-rendered result region." : null}
                </div>
              </div>
            </section>
          );
        })}
      </div>
    </Canvas>
  ),
};

export const StateMatrix: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Specialist field state rail</h1>
      <div style={stateRailStyle}>
        <section aria-label="Disabled password" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled password</h2>
          <Field label="Managed credential">
            <PasswordField autoComplete="current-password" defaultValue="Managed!2026" disabled />
          </Field>
        </section>
        <section aria-label="Read-only password" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only password</h2>
          <Field label="Imported credential">
            <PasswordField defaultValue="Imported!2026" readOnly />
          </Field>
        </section>
        <section aria-label="Invalid password" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Invalid password</h2>
          <Field error="Use the account password, not the recovery code." label="Password">
            <PasswordField autoComplete="current-password" defaultValue="recovery-code" />
          </Field>
        </section>
        <section aria-label="Disabled search" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Disabled search</h2>
          <Field label="Archived catalog">
            <SearchField defaultValue="button" disabled />
          </Field>
        </section>
        <section aria-label="Read-only search" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Read-only search</h2>
          <Field label="Saved query">
            <SearchField defaultValue="accessibility" readOnly />
          </Field>
        </section>
        <section aria-label="Required search" style={stateRowStyle}>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Required search</h2>
          <Field error="Enter a catalog query." label="Catalog query" required>
            <SearchField name="required-query" required />
          </Field>
        </section>
      </div>
    </Canvas>
  ),
};

export const FormSerializationAndReset: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Native form serialization and reset</h1>
      <ResetWorkbenchContent />
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG">
      <h1 style={{ margin: 0 }}>حقول متخصصة من اليمين إلى اليسار</h1>
      <Field description="لا يتم منع اللصق أو الملء التلقائي." label="كلمة المرور">
        <PasswordField
          autoComplete="current-password"
          capsLockMessage="مفتاح الأحرف الكبيرة مفعّل"
          hidePasswordLabel="إخفاء كلمة المرور"
          rules={[
            {
              id: "rtl-length",
              label: "اثنا عشر حرفًا على الأقل",
              validate: (candidate) => candidate.length >= 12,
            },
          ]}
          rulesLabel="متطلبات كلمة المرور"
          showPasswordLabel="إظهار كلمة المرور"
        />
      </Field>
      <Field label="البحث في المكوّنات">
        <SearchField
          clearLabel="مسح البحث"
          defaultValue="إمكانية الوصول"
          resultsId="rtl-results"
          status={{ message: "ثلاث نتائج متاحة.", state: "results" }}
          submitLabel="بحث"
        />
      </Field>
      <ul aria-label="نتائج البحث" id="rtl-results">
        <li>حقل</li>
        <li>زر</li>
        <li>مربع حوار</li>
      </ul>
    </Canvas>
  ),
};
