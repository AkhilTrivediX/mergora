"use client";

import "./authentication-kit.css";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type HTMLAttributes,
  type ReactNode,
} from "react";

import { Button } from "../../components/button/button.js";
import { Field } from "../../components/field/field.js";
import { Input } from "../../components/input/input.js";
import { OtpField } from "../../components/otp-field/otp-field.js";
import { PasswordField } from "../../components/password-field/password-field.js";

export type AuthenticationFlow =
  "sign-in" | "sign-up" | "password-reset" | "passkey" | "mfa" | "recovery-code";

export type AuthenticationResult =
  | {
      /** Discriminated result status controlling status or alert presentation and recovery behavior. */
      readonly status: "success";
      /** Consumer-provided result message rendered after the request completes. */
      readonly message: string;
    }
  | {
      /** Discriminated result status controlling status or alert presentation and recovery behavior. */
      readonly status: "error";
      /** Consumer-provided result message rendered after the request completes. */
      readonly message: string;
    }
  | {
      /** Discriminated result status controlling status or alert presentation and recovery behavior. */
      readonly status: "rate-limited";
      /** Consumer-provided result message rendered after the request completes. */
      readonly message: string;
      /** Non-negative consumer-supplied countdown duration for optional retry recovery. */
      readonly retryAfterSeconds: number;
    };

export interface AuthenticationRequest {
  /** String-valued native FormData entries collected after browser constraint validation succeeds. */
  readonly fields: Readonly<Record<string, string>>;
  /** Authentication flow that owned the submitted native form controls. */
  readonly flow: AuthenticationFlow;
}

export interface AuthenticationKitProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "onSubmit"
> {
  /** Non-empty unique flow collection used by validation and optional flow navigation. */
  readonly availableFlows?: readonly AuthenticationFlow[];
  /** Initial selected flow for uncontrolled use; it must exist in `availableFlows`. */
  readonly defaultFlow?: AuthenticationFlow;
  /** Disables navigation and all form controls while retaining readable authentication context. */
  readonly disabled?: boolean;
  /** Controlled selected flow; use with `onFlowChange` and omit `defaultFlow`. */
  readonly flow?: AuthenticationFlow;
  /** Main page heading, defaulting to domain-neutral account-access copy. */
  readonly heading?: ReactNode;
  /** Externally controlled busy state reflected by form `aria-busy` and submit progress. */
  readonly loading?: boolean;
  /** Reports enabled controlled or uncontrolled flow navigation changes. */
  readonly onFlowChange?: (flow: AuthenticationFlow) => void;
  /** Runs once when an enabled rate-limit recovery countdown reaches zero. */
  readonly onRateLimitReady?: () => void;
  /** Handles a browser-validated request with an abort signal; omission disables submission. */
  readonly onSubmit?: (
    request: AuthenticationRequest,
    signal: AbortSignal,
  ) => AuthenticationResult | Promise<AuthenticationResult>;
  /** Prevents submission and reset mutation while preserving native field values for review. */
  readonly readOnly?: boolean;
  /** Adds available-flow navigation; false removes its UI and flow-change interactions. */
  readonly showFlowNavigation?: boolean;
  /** Adds countdown recovery for rate-limited results; false removes its timer, output, and callback. */
  readonly showRateLimitRecovery?: boolean;
  /** Adds an explicit consumer-owned security-boundary note; false removes the aside entirely. */
  readonly showSecurityContext?: boolean;
}

const FLOW_LABELS: Readonly<Record<AuthenticationFlow, string>> = {
  "sign-in": "Sign in",
  "sign-up": "Create account",
  "password-reset": "Reset password",
  passkey: "Use a passkey",
  mfa: "Verification code",
  "recovery-code": "Recovery code",
};

function assertFlows(flows: readonly AuthenticationFlow[], selected: AuthenticationFlow): void {
  if (flows.length === 0 || new Set(flows).size !== flows.length) {
    throw new RangeError("Mergora AuthenticationKit flows must be non-empty and unique.");
  }
  if (!flows.includes(selected)) {
    throw new RangeError("Mergora AuthenticationKit selected flow must be available.");
  }
}

function formFields(form: HTMLFormElement): Readonly<Record<string, string>> {
  const fields: Record<string, string> = {};
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") fields[name] = value;
  }
  return fields;
}

export const AuthenticationKit = forwardRef<HTMLDivElement, AuthenticationKitProps>(
  function AuthenticationKit(
    {
      availableFlows = ["sign-in"],
      className,
      defaultFlow = availableFlows[0] ?? "sign-in",
      disabled = false,
      flow,
      heading = "Account access",
      loading = false,
      onFlowChange,
      onRateLimitReady,
      onSubmit,
      readOnly = false,
      showFlowNavigation = false,
      showRateLimitRecovery = false,
      showSecurityContext = false,
      ...props
    },
    ref,
  ) {
    const controlled = flow !== undefined;
    const [uncontrolledFlow, setUncontrolledFlow] = useState(defaultFlow);
    const selectedFlow = flow ?? uncontrolledFlow;
    assertFlows(availableFlows, selectedFlow);
    const generatedId = useId().replaceAll(":", "");
    const formId = `mrg-authentication-${generatedId}`;
    const requestController = useRef<AbortController | null>(null);
    const [result, setResult] = useState<AuthenticationResult | null>(null);
    const [pending, setPending] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
    const readyNotified = useRef(false);

    useEffect(() => () => requestController.current?.abort(), []);

    useEffect(() => {
      if (!showRateLimitRecovery || result?.status !== "rate-limited") {
        setRemainingSeconds(null);
        readyNotified.current = false;
        return;
      }
      setRemainingSeconds(result.retryAfterSeconds);
      readyNotified.current = false;
    }, [result, showRateLimitRecovery]);

    useEffect(() => {
      if (!showRateLimitRecovery || remainingSeconds === null || remainingSeconds <= 0) {
        if (showRateLimitRecovery && remainingSeconds === 0 && !readyNotified.current) {
          readyNotified.current = true;
          onRateLimitReady?.();
        }
        return;
      }
      const timer = globalThis.setTimeout(
        () =>
          setRemainingSeconds((current) => (current === null ? null : Math.max(0, current - 1))),
        1000,
      );
      return () => globalThis.clearTimeout(timer);
    }, [onRateLimitReady, remainingSeconds, showRateLimitRecovery]);

    const changeFlow = (next: AuthenticationFlow): void => {
      if (next === selectedFlow || disabled || pending) return;
      requestController.current?.abort();
      setResult(null);
      if (!controlled) setUncontrolledFlow(next);
      onFlowChange?.(next);
    };

    const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
      event.preventDefault();
      if (disabled || readOnly || pending || onSubmit === undefined) return;
      if (!event.currentTarget.reportValidity()) return;
      requestController.current?.abort();
      const controller = new AbortController();
      requestController.current = controller;
      setPending(true);
      setResult(null);
      try {
        const nextResult = await onSubmit(
          { fields: formFields(event.currentTarget), flow: selectedFlow },
          controller.signal,
        );
        if (!controller.signal.aborted) setResult(nextResult);
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({
            status: "error",
            message: error instanceof Error ? error.message : "The request could not continue.",
          });
        }
      } finally {
        if (!controller.signal.aborted) setPending(false);
      }
    };

    const formContent = (() => {
      switch (selectedFlow) {
        case "sign-up":
          return (
            <>
              <Field label="Name" required>
                <Input autoComplete="name" disabled={disabled} name="name" readOnly={readOnly} />
              </Field>
              <Field label="Email address" required>
                <Input
                  autoComplete="email"
                  disabled={disabled}
                  inputMode="email"
                  name="email"
                  readOnly={readOnly}
                  required
                  type="email"
                />
              </Field>
              <Field
                description="Use a unique password. Password managers and paste remain available."
                label="Password"
                required
              >
                <PasswordField
                  autoComplete="new-password"
                  disabled={disabled}
                  name="password"
                  readOnly={readOnly}
                  required
                />
              </Field>
            </>
          );
        case "password-reset":
          return (
            <Field
              description="If the account is eligible, the service can send recovery instructions."
              label="Email address"
              required
            >
              <Input
                autoComplete="email"
                disabled={disabled}
                inputMode="email"
                name="email"
                readOnly={readOnly}
                required
                type="email"
              />
            </Field>
          );
        case "mfa":
          return (
            <Field
              description="Paste or enter the complete code from the trusted authenticator."
              label="Verification code"
              required
            >
              <OtpField
                disabled={disabled}
                groups={[3, 3]}
                name="verificationCode"
                readOnly={readOnly}
                required
              />
            </Field>
          );
        case "recovery-code":
          return (
            <Field
              description="Each recovery code can be accepted only once by the consumer service."
              label="Recovery code"
              required
            >
              <Input
                autoComplete="off"
                disabled={disabled}
                name="recoveryCode"
                readOnly={readOnly}
                required
              />
            </Field>
          );
        case "passkey":
          return (
            <p data-slot="authentication-passkey-context">
              Continue with a passkey managed by this device. Credential discovery and verification
              remain consumer-owned.
            </p>
          );
        case "sign-in":
          return (
            <>
              <Field label="Email address" required>
                <Input
                  autoComplete="username"
                  disabled={disabled}
                  inputMode="email"
                  name="email"
                  readOnly={readOnly}
                  required
                  type="email"
                />
              </Field>
              <Field label="Password" required>
                <PasswordField
                  autoComplete="current-password"
                  disabled={disabled}
                  name="password"
                  readOnly={readOnly}
                  required
                />
              </Field>
            </>
          );
      }
    })();

    return (
      <div
        {...props}
        className={
          className === undefined ? "mrg-authentication-kit" : `mrg-authentication-kit ${className}`
        }
        data-flow={selectedFlow}
        data-slot="authentication-kit"
        ref={ref}
      >
        <header data-slot="authentication-header">
          <h1>{heading}</h1>
          <p>{FLOW_LABELS[selectedFlow]}</p>
        </header>
        {showFlowNavigation ? (
          <nav aria-label="Account access options" data-slot="authentication-flow-navigation">
            <ul>
              {availableFlows.map((candidate) => (
                <li key={candidate}>
                  <button
                    aria-current={candidate === selectedFlow ? "page" : undefined}
                    disabled={disabled || pending}
                    onClick={() => changeFlow(candidate)}
                    type="button"
                  >
                    {FLOW_LABELS[candidate]}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div data-slot="authentication-main">
          <form
            aria-busy={loading || pending || undefined}
            id={formId}
            onReset={(event) => {
              if (readOnly) {
                event.preventDefault();
                return;
              }
              setResult(null);
            }}
            onSubmit={(event) => void submit(event)}
          >
            {formContent}
            {result === null ? null : (
              <div
                data-slot="authentication-result"
                role={result.status === "success" ? "status" : "alert"}
              >
                {result.message}
              </div>
            )}
            {showRateLimitRecovery && remainingSeconds !== null ? (
              <output aria-live="polite" data-slot="authentication-rate-limit-recovery">
                {remainingSeconds > 0
                  ? `Another attempt is available in ${String(remainingSeconds)} seconds.`
                  : "Another attempt is available now."}
              </output>
            ) : null}
            <div data-slot="authentication-actions">
              <Button
                disabled={disabled || readOnly || onSubmit === undefined}
                pending={loading || pending}
                pendingLabel="Checking access"
                type="submit"
              >
                {FLOW_LABELS[selectedFlow]}
              </Button>
              <Button disabled={disabled || readOnly || pending} type="reset" variant="quiet">
                Clear form
              </Button>
            </div>
          </form>
          {showSecurityContext ? (
            <aside data-slot="authentication-security-context">
              <h2>Security boundary</h2>
              <p>
                The consumer owns identity verification, credentials, sessions, rate limits,
                authorization, audit records, and account recovery.
              </p>
            </aside>
          ) : null}
        </div>
      </div>
    );
  },
);

AuthenticationKit.displayName = "AuthenticationKit";

export const AuthenticationPage = AuthenticationKit;
