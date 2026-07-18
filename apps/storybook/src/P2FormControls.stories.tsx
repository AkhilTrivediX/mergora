import {
  StrictMode,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";

import "mergora-tokens/tokens.css";
import { Checkbox } from "../../../registry/source/components/checkbox/checkbox";
import {
  CheckboxGroup,
  CheckboxGroupItem,
} from "../../../registry/source/components/checkbox-group/checkbox-group";
import { Field } from "../../../registry/source/components/field/field";
import { Fieldset } from "../../../registry/source/components/fieldset/fieldset";
import { Form } from "../../../registry/source/components/form/form";
import { Input } from "../../../registry/source/components/input/input";
import { NativeSelect } from "../../../registry/source/components/native-select/native-select";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import {
  RadioGroup,
  RadioGroupItem,
} from "../../../registry/source/components/radio-group/radio-group";
import { Switch } from "../../../registry/source/components/switch/switch";
import { Textarea } from "../../../registry/source/components/textarea/textarea";
import {
  ValidationSummary,
  type ValidationIssue,
} from "../../../registry/source/components/validation-summary/validation-summary";

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
  maxInlineSize: "44rem",
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

function Canvas({
  children,
  direction = "ltr",
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
}) {
  return (
    <main dir={direction} style={canvasStyle}>
      <div style={workbenchStyle}>{children}</div>
    </main>
  );
}

function HydrationTree() {
  return (
    <StrictMode>
      <MergoraProvider
        locale="ja-JP"
        messages={{
          "textarea.graphemeLimit": ({ locale, values }) =>
            `${new Intl.NumberFormat(locale).format(Number(values.maximum))}文字以内で入力してください。`,
        }}
      >
        <Form aria-label="Hydrated form">
          <Field description="Hydrated description" label="Hydrated name" required>
            <Input name="hydrated-name" />
          </Field>
          <Field label="Hydrated notes">
            <Textarea defaultValue="👩‍💻" maxGraphemes={2} name="hydrated-notes" showCount />
          </Field>
          <Checkbox description="Hydrated checkbox description">Hydrated checkbox</Checkbox>
          <CheckboxGroup label="Hydrated checks" name="hydrated-checks" required>
            <CheckboxGroupItem value="one">Hydrated first check</CheckboxGroupItem>
          </CheckboxGroup>
          <RadioGroup label="Hydrated radios" name="hydrated-radios" required>
            <RadioGroupItem value="one">Hydrated first radio</RadioGroupItem>
          </RadioGroup>
          <ValidationSummary
            issues={[
              {
                controlId: "hydration-missing-control",
                id: "hydration-issue",
                message: "Hydrated issue",
              },
            ]}
          />
        </Form>
      </MergoraProvider>
    </StrictMode>
  );
}

function HydrationWorkbench() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const hydrationRootRef = useRef<Root | null>(null);
  const recoverableErrorRef = useRef(false);
  const [result, setResult] = useState("pending");

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    host.innerHTML = renderToString(<HydrationTree />);
    hydrationRootRef.current = hydrateRoot(host, <HydrationTree />, {
      onRecoverableError: (error) => {
        recoverableErrorRef.current = true;
        setResult(`recoverable-error: ${String(error)}`);
      },
    });
    const frame = requestAnimationFrame(() => {
      if (!recoverableErrorRef.current) setResult("hydrated");
    });
    return () => {
      cancelAnimationFrame(frame);
      const hydrationRoot = hydrationRootRef.current;
      hydrationRootRef.current = null;
      queueMicrotask(() => hydrationRoot?.unmount());
    };
  }, []);

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>SSR hydration identities</h1>
      <output data-testid="hydration-result">{result}</output>
      <div data-testid="hydration-host" ref={hostRef} />
    </Canvas>
  );
}

function SubmitWorkbench() {
  const [result, setResult] = useState("No submission yet");
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const entries = [...new FormData(event.currentTarget).entries()].map(([name, value]) => [
      name,
      String(value),
    ]);
    setResult(JSON.stringify(entries));
  };
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Native form workbench</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "68ch" }}>
          Every editable value remains a native successful control with visible labels, persistent
          descriptions, and reset behavior.
        </p>
      </header>
      <Form aria-label="Profile settings" onSubmit={handleSubmit}>
        <Field description="Used for account notices." label="Email address" required>
          <Input
            autoComplete="email"
            inputMode="email"
            name="email"
            placeholder="name@example.com"
            type="email"
          />
        </Field>
        <Field description="Do not include private credentials." label="Release notes">
          <Textarea autoGrow maxLength={120} maxRows={4} name="notes" showCount />
        </Field>
        <Field label="Primary region" required>
          <NativeSelect defaultValue="" name="region">
            <option disabled value="">
              Choose a region
            </option>
            <option value="apac">Asia Pacific</option>
            <option value="eu">Europe</option>
            <option value="us">United States</option>
          </NativeSelect>
        </Field>
        <Fieldset
          description="Native fieldset disabled propagation remains available."
          legend="Evidence"
        >
          <Checkbox defaultChecked name="audit" value="included">
            Include audit evidence
          </Checkbox>
        </Fieldset>
        <CheckboxGroup
          defaultValue={["keyboard"]}
          description="Choose one or two verification paths."
          label="Verification paths"
          maxSelected={2}
          minSelected={1}
          name="verification"
        >
          <CheckboxGroupItem description="Required before release." value="keyboard">
            Keyboard review
          </CheckboxGroupItem>
          <CheckboxGroupItem description="Current browser and AT versions." value="screen-reader">
            Screen-reader review
          </CheckboxGroupItem>
          <CheckboxGroupItem value="touch">Touch review</CheckboxGroupItem>
        </CheckboxGroup>
        <RadioGroup defaultValue="source" label="Distribution mode" name="distribution" required>
          <RadioGroupItem description="Editable files are installed into the app." value="source">
            Source
          </RadioGroupItem>
          <RadioGroupItem disabled value="cdn">
            CDN unavailable
          </RadioGroupItem>
          <RadioGroupItem description="Versioned package imports." value="package" variant="card">
            Package
          </RadioGroupItem>
        </RadioGroup>
        <Switch defaultValue name="notifications" offValue="disabled" onValue="enabled">
          Release notifications
        </Switch>
        <div style={buttonRailStyle}>
          <button style={buttonStyle} type="submit">
            Submit native values
          </button>
          <button style={buttonStyle} type="reset">
            Reset defaults
          </button>
        </div>
      </Form>
      <output aria-live="polite" data-testid="submission-output">
        {result}
      </output>
    </Canvas>
  );
}

function AsyncValidationWorkbench() {
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([]);
  const [attempt, setAttempt] = useState(0);
  const [pending, setPending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    setIssues([]);
    timerRef.current = setTimeout(() => {
      setIssues([
        {
          controlId: "account:email",
          id: "email-invalid",
          message: "Enter a valid email address.",
        },
        { controlId: "account-region", id: "region-missing", message: "Choose an account region." },
      ]);
      setAttempt((value) => value + 1);
      setPending(false);
    }, 80);
  };
  const emailError = issues.some((issue) => issue.id === "email-invalid")
    ? "Enter a valid email address."
    : undefined;
  const regionError = issues.some((issue) => issue.id === "region-missing")
    ? "Choose an account region."
    : undefined;
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Async validation and error focus</h1>
      <ValidationSummary
        focusKey={attempt}
        focusPolicy="summary"
        heading="Resolve these fields"
        issues={issues}
      />
      <Form noValidate onSubmit={submit}>
        <Field controlId="account:email" error={emailError} label="Account email" required>
          <Input autoComplete="email" inputMode="email" name="email" type="email" />
        </Field>
        <Field controlId="account-region" error={regionError} label="Account region" required>
          <NativeSelect defaultValue="" name="region">
            <option value="">Choose a region</option>
            <option value="asia">Asia</option>
          </NativeSelect>
        </Field>
        <button disabled={pending} style={buttonStyle} type="submit">
          {pending ? "Checking account" : "Validate account"}
        </button>
      </Form>
    </Canvas>
  );
}

function ResetWorkbench() {
  const [submitted, setSubmitted] = useState("No submission yet");
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Native reset and successful controls</h1>
      <Form
        aria-label="Reset evidence"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(JSON.stringify([...new FormData(event.currentTarget).entries()]));
        }}
      >
        <Field label="Workspace name">
          <Input defaultValue="Workbench" name="workspace" />
        </Field>
        <Field label="Summary">
          <Textarea defaultValue="Original evidence" name="summary" showCount />
        </Field>
        <Checkbox defaultChecked defaultIndeterminate name="retained" value="yes">
          Retain source
        </Checkbox>
        <Checkbox disabled defaultChecked name="disabled-value" value="excluded">
          Disabled value
        </Checkbox>
        <CheckboxGroup defaultValue={["unit"]} label="Gates" name="gates">
          <CheckboxGroupItem value="unit">Unit</CheckboxGroupItem>
          <CheckboxGroupItem value="browser">Browser</CheckboxGroupItem>
        </CheckboxGroup>
        <RadioGroup defaultValue="draft" label="Release channel" name="channel">
          <RadioGroupItem value="draft">Draft</RadioGroupItem>
          <RadioGroupItem value="stable">Stable</RadioGroupItem>
        </RadioGroup>
        <Switch defaultValue name="sync" offValue="no" onValue="yes">
          Synchronize source
        </Switch>
        <div style={buttonRailStyle}>
          <button style={buttonStyle} type="submit">
            Inspect FormData
          </button>
          <button style={buttonStyle} type="reset">
            Restore defaults
          </button>
        </div>
      </Form>
      <output data-testid="reset-output">{submitted}</output>
    </Canvas>
  );
}

function AdapterWorkbench() {
  const rhfRegistration = {
    autoComplete: "email",
    name: "rhf-email",
    onBlur: () => undefined,
    onChange: () => undefined,
  } satisfies InputHTMLAttributes<HTMLInputElement>;
  const tanstackField = {
    name: "tanstack-display-name",
    onBlur: () => undefined,
    onChange: () => undefined,
  } satisfies InputHTMLAttributes<HTMLInputElement>;
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Adapter boundaries</h1>
      <p>
        These are native prop shapes returned by form adapters; Mergora imports neither adapter at
        runtime.
      </p>
      <Form>
        <Field label="React Hook Form email">
          <Input {...rhfRegistration} type="email" />
        </Field>
        <Field label="TanStack Form display name">
          <Input
            name={tanstackField.name}
            onBlur={tanstackField.onBlur}
            onChange={tanstackField.onChange}
          />
        </Field>
      </Form>
    </Canvas>
  );
}

function StateMatrixWorkbench() {
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Form-control state matrix</h1>
      <ValidationSummary
        heading="Resolve the state examples"
        issues={[
          {
            controlId: "state-invalid-input",
            id: "state-invalid-input-issue",
            message: "Correct the invalid text value.",
          },
        ]}
      />
      <Form aria-label="Form-control states">
        <Field
          controlId="state-invalid-input"
          description="The description precedes the persistent error."
          error="Correct the invalid text value."
          label="Invalid required text"
          required
        >
          <Input aria-invalid="spelling" defaultValue="Draft" name="invalid-text" />
        </Field>
        <Field label="Disabled text">
          <Input defaultValue="Unavailable" disabled name="disabled-text" />
        </Field>
        <Field label="Read-only text">
          <Input name="readonly-text" readOnly value="Immutable" />
        </Field>
        <Field error="Shorten this note." label="Invalid grapheme-limited notes" required>
          <Textarea
            aria-invalid="grammar"
            defaultValue="👨‍👩‍👧‍👦a"
            maxGraphemes={1}
            name="invalid-notes"
            showCount
          />
        </Field>
        <Field label="Read-only notes">
          <Textarea readOnly value="Read-only evidence" />
        </Field>
        <Field label="Disabled notes">
          <Textarea defaultValue="Unavailable evidence" disabled />
        </Field>
        <Field error="Choose an available region." label="Invalid region" required>
          <NativeSelect aria-invalid="spelling" defaultValue="" name="invalid-region">
            <option value="">Choose a region</option>
            <option value="apac">Asia Pacific</option>
          </NativeSelect>
        </Field>
        <Field label="Disabled region">
          <NativeSelect defaultValue="apac" disabled>
            <option value="apac">Asia Pacific</option>
          </NativeSelect>
        </Field>
        <Fieldset
          aria-invalid="grammar"
          error="Review this disabled evidence."
          legend="Fieldset states"
        >
          <Checkbox defaultChecked disabled>
            Disabled evidence
          </Checkbox>
        </Fieldset>
        <Checkbox aria-invalid="grammar" required>
          Invalid required confirmation
        </Checkbox>
        <CheckboxGroup
          aria-invalid="grammar"
          error="Choose at least one verification path."
          label="Invalid required checks"
          name="invalid-checks"
          required
        >
          <CheckboxGroupItem value="keyboard">Keyboard</CheckboxGroupItem>
          <CheckboxGroupItem value="screen-reader">Screen reader</CheckboxGroupItem>
        </CheckboxGroup>
        <CheckboxGroup disabled label="Disabled checks" name="disabled-checks">
          <CheckboxGroupItem value="unavailable">Unavailable check</CheckboxGroupItem>
        </CheckboxGroup>
        <RadioGroup
          aria-invalid="spelling"
          error="Choose a distribution mode."
          label="Invalid required radios"
          name="invalid-radios"
          required
        >
          <RadioGroupItem value="source">Source</RadioGroupItem>
          <RadioGroupItem value="package">Package</RadioGroupItem>
        </RadioGroup>
        <RadioGroup disabled label="Disabled radios" name="disabled-radios">
          <RadioGroupItem value="unavailable">Unavailable radio</RadioGroupItem>
        </RadioGroup>
        <Switch disabled>Disabled switch</Switch>
        <Switch defaultValue>Enabled switch</Switch>
      </Form>
      <Form aria-label="Empty form" />
    </Canvas>
  );
}

function GraphemeLimitWorkbench() {
  const [submission, setSubmission] = useState("No grapheme submission yet");
  const [controlledValue, setControlledValue] = useState("👩‍💻");
  const pendingControlledValue = useRef(controlledValue);
  return (
    <MergoraProvider
      locale="ja-JP"
      messages={{
        "textarea.countWithMaximum": ({ locale, values }) =>
          `${new Intl.NumberFormat(locale).format(Number(values.current))}/${new Intl.NumberFormat(locale).format(Number(values.maximum))} 文字`,
        "textarea.graphemeLimit": ({ locale, values }) =>
          `${new Intl.NumberFormat(locale).format(Number(values.maximum))}文字以内で入力してください。`,
      }}
    >
      <Canvas>
        <h1 style={{ margin: 0 }}>Grapheme-safe textarea limits</h1>
        <Form
          aria-label="Grapheme limit form"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmission(JSON.stringify([...new FormData(event.currentTarget).entries()]));
          }}
        >
          <Field
            description="Emoji, combining marks, paste, undo, and IME input are never truncated."
            label="User-perceived characters"
          >
            <Textarea defaultValue="👩‍💻" maxGraphemes={2} name="grapheme-notes" showCount />
          </Field>
          <Field label="Explicit counter formatter">
            <Textarea
              defaultValue={"e\u0301"}
              formatCount={(current, maximum) => `Explicit ${current}/${maximum}`}
              maxGraphemes={2}
              readOnly
              showCount
            />
          </Field>
          <Field label="Controlled parent catch-up">
            <Textarea
              maxGraphemes={2}
              onChange={(event) => {
                pendingControlledValue.current = event.currentTarget.value;
              }}
              onCompositionEnd={(event) => {
                pendingControlledValue.current = event.currentTarget.value;
              }}
              showCount
              value={controlledValue}
            />
          </Field>
          <div style={buttonRailStyle}>
            <button style={buttonStyle} type="submit">
              Submit grapheme value
            </button>
            <button style={buttonStyle} type="reset">
              Reset grapheme value
            </button>
            <button
              onClick={() => setControlledValue(pendingControlledValue.current)}
              style={buttonStyle}
              type="button"
            >
              Apply controlled catch-up
            </button>
          </div>
        </Form>
        <output data-testid="grapheme-submission">{submission}</output>
      </Canvas>
    </MergoraProvider>
  );
}

function IndeterminateWorkbench() {
  const [controlledMixed, setControlledMixed] = useState(true);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Indeterminate and labelled descriptions</h1>
      <Checkbox
        description="The owner intentionally keeps this mixed after activation."
        indeterminate={controlledMixed}
        name="controlled-selection"
        onCheckedChange={() => undefined}
      >
        Controlled mixed selection
      </Checkbox>
      <button onClick={() => setControlledMixed(false)} style={buttonStyle} type="button">
        Resolve controlled mixed state
      </button>
      <Checkbox defaultIndeterminate description="Some child rows are selected." name="selection">
        Select all rows
      </Checkbox>
      <Checkbox description="The description is not part of the accessible name." name="plain">
        Include annotations
      </Checkbox>
    </Canvas>
  );
}

function AuditEdgeWorkbench() {
  const [disableFirst, setDisableFirst] = useState(false);
  const [showFirst, setShowFirst] = useState(true);
  const [focusKey, setFocusKey] = useState(1);
  const [focusCount, setFocusCount] = useState(0);
  const [issues, setIssues] = useState<readonly ValidationIssue[]>([
    { controlId: "missing-audit-control", id: "missing", message: "Missing control" },
  ]);
  const [autoGrow, setAutoGrow] = useState(true);
  const [submission, setSubmission] = useState("No external submission yet");
  const [radioClicks, setRadioClicks] = useState(0);
  const [radioChanges, setRadioChanges] = useState(0);
  const [controlledRadioChanges, setControlledRadioChanges] = useState(0);
  const [controlledCheckChanges, setControlledCheckChanges] = useState(0);
  const [controlledSwitchChanges, setControlledSwitchChanges] = useState(0);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Form-control audit edges</h1>
      <ValidationSummary
        data-testid="fallback-summary"
        focusKey={focusKey}
        focusPolicy="first-error"
        issues={issues}
        onFocus={() => setFocusCount((count) => count + 1)}
      />
      <output data-testid="summary-focus-count">{focusCount}</output>
      <div style={buttonRailStyle}>
        <button
          onClick={() =>
            setIssues([
              {
                controlId: "missing-audit-control",
                id: "missing",
                message: "Still missing",
              },
            ])
          }
          style={buttonStyle}
          type="button"
        >
          Refresh same focus key
        </button>
        <button onClick={() => setFocusKey((key) => key + 1)} style={buttonStyle} type="button">
          Apply new focus key
        </button>
      </div>
      <Form
        aria-label="External owner"
        id="external-owner"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmission(JSON.stringify([...new FormData(event.currentTarget).entries()]));
        }}
      >
        <div style={buttonRailStyle}>
          <button style={buttonStyle} type="submit">
            Submit external controls
          </button>
          <button style={buttonStyle} type="reset">
            Reset external controls
          </button>
        </div>
      </Form>
      <Field label="External account name">
        <Input defaultValue="Original account" form="external-owner" name="external-account" />
      </Field>
      <Field label="External regions">
        <NativeSelect
          defaultValue={["apac", "eu"]}
          form="external-owner"
          multiple
          name="external-regions"
          size={3}
        >
          <option value="apac">Asia Pacific</option>
          <option value="eu">Europe</option>
          <option value="us">United States</option>
        </NativeSelect>
      </Field>
      <Checkbox defaultChecked form="external-owner" name="external-standalone" value="included">
        External standalone check
      </Checkbox>
      <CheckboxGroup
        form="external-owner"
        label="External checks"
        name="external-checks"
        nativeValidationMessage="Choose at least one external check."
        required
      >
        {showFirst ? (
          <CheckboxGroupItem disabled={disableFirst} value="first">
            First external check
          </CheckboxGroupItem>
        ) : null}
        <CheckboxGroupItem value="second">Second external check</CheckboxGroupItem>
      </CheckboxGroup>
      <Form data-testid="disabled-selected-form">
        <CheckboxGroup
          defaultValue={["locked"]}
          label="Enabled successful selections"
          name="enabled-selections"
          required
        >
          <CheckboxGroupItem disabled value="locked">
            Locked disabled selection
          </CheckboxGroupItem>
          <CheckboxGroupItem value="available">Available selection</CheckboxGroupItem>
        </CheckboxGroup>
      </Form>
      <div style={buttonRailStyle}>
        <button
          onClick={() => setDisableFirst((current) => !current)}
          style={buttonStyle}
          type="button"
        >
          Toggle first check disabled
        </button>
        <button
          onClick={() => setShowFirst((current) => !current)}
          style={buttonStyle}
          type="button"
        >
          Toggle first check mounted
        </button>
      </div>
      <RadioGroup
        defaultValue="source"
        form="external-owner"
        label="External distribution"
        name="external-radio"
        onValueChange={() => setRadioChanges((count) => count + 1)}
      >
        <RadioGroupItem onClick={() => setRadioClicks((count) => count + 1)} value="source">
          External source
        </RadioGroupItem>
        <RadioGroupItem onClick={() => setRadioClicks((count) => count + 1)} value="package">
          External package
        </RadioGroupItem>
      </RadioGroup>
      <output data-testid="radio-events">
        {radioClicks} clicks; {radioChanges} changes
      </output>
      <RadioGroup
        label="Controlled lag distribution"
        name="controlled-radio"
        onValueChange={() => setControlledRadioChanges((count) => count + 1)}
        value="source"
      >
        <RadioGroupItem value="source">Controlled source</RadioGroupItem>
        <RadioGroupItem value="package">Controlled package</RadioGroupItem>
      </RadioGroup>
      <output data-testid="controlled-radio-events">{controlledRadioChanges}</output>
      <CheckboxGroup
        label="Controlled lag checks"
        name="controlled-checks"
        onValueChange={() => setControlledCheckChanges((count) => count + 1)}
        value={["first"]}
      >
        <CheckboxGroupItem value="first">Controlled first</CheckboxGroupItem>
        <CheckboxGroupItem value="second">Controlled second</CheckboxGroupItem>
      </CheckboxGroup>
      <output data-testid="controlled-check-events">{controlledCheckChanges}</output>
      <Field label="External notes">
        <Textarea
          autoGrow={autoGrow}
          defaultValue="line one"
          form="external-owner"
          maxLength={200}
          maxRows={6}
          name="external-notes"
          showCount
        />
      </Field>
      <button onClick={() => setAutoGrow((current) => !current)} style={buttonStyle} type="button">
        Toggle notes autogrow
      </button>
      <Switch
        defaultValue
        form="external-owner"
        name="external-switch"
        offValue="disabled"
        onValue="enabled"
      >
        External updates
      </Switch>
      <Switch disabled>Disabled updates</Switch>
      <Switch onClick={(event) => event.preventDefault()}>Prevented updates</Switch>
      <Switch
        form="external-owner"
        name="controlled-switch"
        onValueChange={() => setControlledSwitchChanges((count) => count + 1)}
        value={false}
      >
        Controlled updates
      </Switch>
      <output data-testid="controlled-switch-events">{controlledSwitchChanges}</output>
      <output data-testid="external-submission">{submission}</output>
    </Canvas>
  );
}

function InvalidUsageDiagnosticsWorkbench() {
  return (
    <Canvas>
      <Field label="">
        <Input />
        <Input />
      </Field>
      <Fieldset legend="" />
      <Checkbox>{""}</Checkbox>
      <CheckboxGroup label="" name="diagnostic-checks" value={["missing"]}>
        <CheckboxGroupItem value="one">{""}</CheckboxGroupItem>
      </CheckboxGroup>
      <CheckboxGroup label="Empty checks" name="empty-diagnostic-checks" />
      <RadioGroup label="" name="diagnostic-radios" value="missing">
        <RadioGroupItem value="one">{""}</RadioGroupItem>
      </RadioGroup>
      <RadioGroup label="Empty radios" name="empty-diagnostic-radios" />
      <Switch offLabel="" onLabel="">
        {""}
      </Switch>
    </Canvas>
  );
}

const meta = {
  component: Form,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Form Controls",
} satisfies Meta<typeof Form>;

export default meta;
type Story = StoryObj<typeof meta>;

export const CompositionWorkbench: Story = { render: () => <SubmitWorkbench /> };
export const AsyncValidation: Story = { render: () => <AsyncValidationWorkbench /> };
export const DisabledAndReset: Story = { render: () => <ResetWorkbench /> };
export const AdapterExamples: Story = { render: () => <AdapterWorkbench /> };
export const AuditEdges: Story = { render: () => <AuditEdgeWorkbench /> };
export const StateMatrix: Story = { render: () => <StateMatrixWorkbench /> };
export const GraphemeLimits: Story = { render: () => <GraphemeLimitWorkbench /> };
export const HydrationIdentities: Story = { render: () => <HydrationWorkbench /> };
export const InvalidUsageDiagnostics: Story = {
  parameters: { docs: { disable: true } },
  render: () => <InvalidUsageDiagnosticsWorkbench />,
};

export const LocalizedDefaults: Story = {
  render: () => (
    <MergoraProvider
      locale="de-DE"
      messages={{
        "checkboxGroup.minimum": ({ locale, values }) =>
          `Mindestens ${new Intl.NumberFormat(locale).format(Number(values.minimum))} auswählen.`,
        "switch.off": "Aus",
        "switch.on": "Ein",
        "textarea.countWithMaximum": ({ locale, values }) =>
          `${new Intl.NumberFormat(locale).format(Number(values.current))} von ${new Intl.NumberFormat(locale).format(Number(values.maximum))} Zeichen`,
        "validationSummary.errorCount": ({ locale, values }) =>
          `Fehler gesamt: ${new Intl.NumberFormat(locale).format(Number(values.count))}`,
        "validationSummary.heading": "Formular prüfen",
      }}
    >
      <Canvas>
        <h1 style={{ margin: 0 }}>Provider-localized form defaults</h1>
        <ValidationSummary
          issues={[{ controlId: "localized-name", id: "localized", message: "Name fehlt" }]}
        />
        <Field controlId="localized-name" label="Name">
          <Textarea defaultValue="Zwei" maxLength={1234} showCount />
        </Field>
        <CheckboxGroup label="Prüfungen" name="localized-checks" required>
          <CheckboxGroupItem value="source">Quelle</CheckboxGroupItem>
        </CheckboxGroup>
        <Switch>Aktualisierungen</Switch>
      </Canvas>
    </MergoraProvider>
  ),
};

export const AuthenticationAndMobile: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Accessible authentication inputs</h1>
      <Form autoComplete="on">
        <Field label="Username" required>
          <Input autoCapitalize="none" autoComplete="username" name="username" spellCheck={false} />
        </Field>
        <Field
          description="Paste and password-manager fill remain available."
          label="Password"
          required
        >
          <Input autoComplete="current-password" name="password" type="password" />
        </Field>
        <Field label="Mobile number">
          <Input autoComplete="tel" inputMode="tel" name="telephone" type="tel" />
        </Field>
      </Form>
    </Canvas>
  ),
};

export const IndeterminateCheckbox: Story = {
  render: () => <IndeterminateWorkbench />,
};

export const EmptyComposition: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Empty composition boundaries</h1>
      <ValidationSummary empty="No validation issues." issues={[]} renderWhenEmpty />
      <ValidationSummary
        empty="A second independent summary is also quiet."
        heading="Secondary validation region"
        issues={[]}
        renderWhenEmpty
      />
      <Fieldset legend="No optional filters selected">
        <p style={{ margin: 0 }}>Filters can be added without changing group semantics.</p>
      </Fieldset>
      <Form data-testid="all-disabled-form">
        <CheckboxGroup label="Unavailable verification paths" name="unavailable" required>
          <CheckboxGroupItem disabled value="manual">
            Manual review unavailable
          </CheckboxGroupItem>
          <CheckboxGroupItem disabled value="automated">
            Automated review unavailable
          </CheckboxGroupItem>
        </CheckboxGroup>
      </Form>
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <MergoraProvider
      direction="rtl"
      locale="ar-EG"
      messages={{ "switch.off": "متوقف", "switch.on": "مفعّل" }}
    >
      <Canvas direction="rtl">
        <h1 style={{ margin: 0 }}>نموذج التحقق</h1>
        <Field description="أدخل عنوانًا صالحًا." label="البريد الإلكتروني" required>
          <Input autoComplete="email" inputMode="email" name="email" type="email" />
        </Field>
        <RadioGroup defaultValue="source" label="طريقة التوزيع" name="mode">
          <RadioGroupItem value="source">المصدر</RadioGroupItem>
          <RadioGroupItem value="package">الحزمة</RadioGroupItem>
          <RadioGroupItem value="cdn">شبكة التوزيع</RadioGroupItem>
        </RadioGroup>
        <RadioGroup defaultValue="source" label="Prevented movement" name="prevented-mode">
          <RadioGroupItem
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") event.preventDefault();
            }}
            value="source"
          >
            Protected source
          </RadioGroupItem>
          <RadioGroupItem value="package">Protected package</RadioGroupItem>
          <RadioGroupItem value="cdn">Protected CDN</RadioGroupItem>
        </RadioGroup>
        <Switch defaultValue name="updates">
          إشعارات التحديث
        </Switch>
      </Canvas>
    </MergoraProvider>
  ),
};

export const NarrowReflow: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>320 CSS pixel form reflow</h1>
      <Field
        description="Diese ausführliche Beschreibung bleibt bei vierhundert Prozent Zoom vollständig lesbar."
        label="Sehr lange Bezeichnung für die Arbeitsbereichsbenachrichtigung"
        layout="inline"
      >
        <Input name="expanded-label" />
      </Field>
      <CheckboxGroup
        label="Sehr ausführliche Auswahl der unabhängigen Verifikationspfade"
        layout="columns"
        name="expanded-gates"
      >
        <CheckboxGroupItem value="source">Bearbeitbarer Quellcode</CheckboxGroupItem>
        <CheckboxGroupItem value="package">Versioniertes Komponentenpaket</CheckboxGroupItem>
      </CheckboxGroup>
    </Canvas>
  ),
};
