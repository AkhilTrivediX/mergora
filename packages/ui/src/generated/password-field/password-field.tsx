// Generated from registry/source/components/password-field/password-field.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Fragment,
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AriaAttributes,
  type CSSProperties,
  type ChangeEvent,
  type CompositionEvent,
  type FocusEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraContext } from "../provider/index.js";
import "./password-field.css";

export interface PasswordFieldRule {
  /** Stable unique requirement identity used as the rendered list key. */
  readonly id: string;
  /** Non-empty visible requirement description. */
  readonly label: ReactNode;
  /** Deterministic predicate evaluated against the complete current password. */
  readonly validate: (value: string) => boolean;
}

export interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  /** Localized polite status shown only while focused Caps Lock is detected. */
  readonly capsLockMessage?: string;
  /** Initial password for uncontrolled use and native form reset; defaults to empty. */
  readonly defaultValue?: string;
  /** Localized accessible and visible label used while the password is revealed. */
  readonly hidePasswordLabel?: string;
  /** Additional class name applied to the native password input. */
  readonly inputClassName?: string;
  /** Boolean invalid fallback merged with explicit ARIA and enclosing Field state. */
  readonly invalid?: boolean;
  /** Receives native password edits as the complete current string. */
  readonly onChange?: (value: string) => void;
  /** Additional class name applied to the outer PasswordField wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer PasswordField wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Localized text identifying a currently satisfied requirement. */
  readonly ruleMetLabel?: string;
  /** Localized text identifying a currently unsatisfied requirement. */
  readonly ruleUnmetLabel?: string;
  /** Deterministic labelled requirements; an empty array removes the complete status list. */
  readonly rules?: readonly PasswordFieldRule[];
  /** Localized accessible name for the password-requirements list. */
  readonly rulesLabel?: string;
  /** Localized accessible and visible label used while the password is concealed. */
  readonly showPasswordLabel?: string;
  /** Controlled password string; changes are proposed through `onChange`. */
  readonly value?: string;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") {
    ref(value);
  } else if (ref !== null && ref !== undefined) {
    ref.current = value;
  }
}

function isSemanticallyInvalid(value: AriaAttributes["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    if (value.type === Fragment) return hasAccessibleContent(value.props.children);
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function assertNonEmptyPasswordLabel(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RangeError(`Mergora PasswordField ${name} must be a non-empty string.`);
  }
}

function assertPasswordRules(rules: readonly PasswordFieldRule[]): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (rule.id.trim().length === 0) {
      throw new RangeError("Mergora PasswordField rule IDs must not be empty.");
    }
    if (ids.has(rule.id)) {
      throw new RangeError(`Mergora PasswordField rule ID "${rule.id}" must be unique.`);
    }
    if (!hasAccessibleContent(rule.label)) {
      throw new RangeError(`Mergora PasswordField rule "${rule.id}" requires a non-empty label.`);
    }
    ids.add(rule.id);
  }
}

function developmentRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  const runtime = globalThis as typeof globalThis & {
    readonly process?: { readonly env?: { readonly NODE_ENV?: string } };
  };
  return viteProduction !== true && runtime.process?.env?.NODE_ENV !== "production";
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(
    {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-labelledby": ariaLabelledBy,
      capsLockMessage: capsLockMessageProp,
      className,
      defaultValue = "",
      disabled = false,
      hidePasswordLabel: hidePasswordLabelProp,
      id,
      inputClassName,
      invalid,
      onBlur,
      onChange,
      onCompositionEnd,
      onCompositionStart,
      onFocus,
      onKeyDown,
      onKeyUp,
      readOnly = false,
      required,
      rootClassName,
      rootStyle,
      ruleMetLabel: ruleMetLabelProp,
      ruleUnmetLabel: ruleUnmetLabelProp,
      rules = [],
      rulesLabel: rulesLabelProp,
      showPasswordLabel: showPasswordLabelProp,
      value,
      ...nativeProps
    },
    forwardedRef,
  ) {
    assertPasswordRules(rules);
    const field = useFieldControlState();
    const generatedId = useId().replaceAll(":", "");
    const inputRef = useRef<HTMLInputElement | null>(null);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const controlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const [capsLock, setCapsLock] = useState(false);
    const [composing, setComposing] = useState(false);
    const [focused, setFocused] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const { getMessage } = useMergoraContext();
    const currentValue = controlled ? value : uncontrolledValue;
    const capsLockActive = focused && capsLock;
    const resolvedId = field?.controlId ?? id ?? `mrg-password-field-${generatedId}`;
    const rulesId = `${resolvedId}-rules`;
    const capsLockId = `${resolvedId}-caps-lock`;
    const resolvedInvalid =
      ariaInvalid !== undefined
        ? isSemanticallyInvalid(ariaInvalid)
        : invalid !== undefined
          ? invalid
          : (field?.invalid ?? false);
    const resolvedRequired = required ?? field?.required;
    const describedBy = mergeFieldIdRefs(
      ariaDescribedBy,
      field?.descriptionId,
      resolvedInvalid ? field?.errorMessageId : undefined,
      rules.length > 0 ? rulesId : undefined,
      capsLockActive ? capsLockId : undefined,
    );
    const errorMessage = mergeFieldIdRefs(
      ariaErrorMessage,
      resolvedInvalid ? field?.errorMessageId : undefined,
    );
    const labelledBy = ariaLabelledBy ?? field?.labelId;
    for (const [labelName, label] of [
      ["showPasswordLabel", showPasswordLabelProp],
      ["hidePasswordLabel", hidePasswordLabelProp],
      ["capsLockMessage", capsLockMessageProp],
    ] as const) {
      if (label !== undefined) assertNonEmptyPasswordLabel(label, labelName);
    }
    if (rules.length > 0) {
      for (const [labelName, label] of [
        ["rulesLabel", rulesLabelProp],
        ["ruleMetLabel", ruleMetLabelProp],
        ["ruleUnmetLabel", ruleUnmetLabelProp],
      ] as const) {
        if (label !== undefined) assertNonEmptyPasswordLabel(label, labelName);
      }
    }
    const resolveRequiredMessage = (key: string, fallback: string, name: string): string => {
      const message = getMessage(key, fallback);
      assertNonEmptyPasswordLabel(message, name);
      return message;
    };
    const showPasswordLabel = resolveRequiredMessage(
      "passwordField.showPassword",
      showPasswordLabelProp ?? "Show password",
      "showPasswordLabel",
    );
    const hidePasswordLabel = resolveRequiredMessage(
      "passwordField.hidePassword",
      hidePasswordLabelProp ?? "Hide password",
      "hidePasswordLabel",
    );
    const capsLockMessage = capsLockActive
      ? resolveRequiredMessage(
          "passwordField.capsLock",
          capsLockMessageProp ?? "Caps Lock is on",
          "capsLockMessage",
        )
      : undefined;
    const rulesLabel =
      rules.length > 0
        ? resolveRequiredMessage(
            "passwordField.rules",
            rulesLabelProp ?? "Password requirements",
            "rulesLabel",
          )
        : undefined;
    const ruleMetLabel =
      rules.length > 0
        ? resolveRequiredMessage("passwordField.ruleMet", ruleMetLabelProp ?? "Met", "ruleMetLabel")
        : undefined;
    const ruleUnmetLabel =
      rules.length > 0
        ? resolveRequiredMessage(
            "passwordField.ruleUnmet",
            ruleUnmetLabelProp ?? "Not met",
            "ruleUnmetLabel",
          )
        : undefined;

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        assignRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    useEffect(() => {
      const input = inputRef.current;
      if (controlled || input === null) return;
      const form = input.form;
      if (form === null) return;
      const handleReset = (event: Event) => {
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          if (event.defaultPrevented) return;
          setUncontrolledValue(input.value);
          setCapsLock(false);
          setRevealed(false);
        }, 0);
      };
      form.addEventListener("reset", handleReset);
      return () => {
        form.removeEventListener("reset", handleReset);
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      };
    }, [controlled, nativeProps.form]);

    useEffect(() => {
      if (developmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
        console.warn(
          `Mergora PasswordField received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
        );
      }
    }, [field, id]);

    const syncCapsLock = (event: KeyboardEvent<HTMLInputElement>): void => {
      setCapsLock(event.getModifierState("CapsLock"));
    };
    const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
      const nextValue = event.currentTarget.value;
      if (!controlled) setUncontrolledValue(nextValue);
      onChange?.(nextValue);
    };

    return (
      <span
        className={
          rootClassName === undefined ? "mrg-password-field" : `mrg-password-field ${rootClassName}`
        }
        data-caps-lock={capsLockActive ? "true" : undefined}
        data-disabled={disabled || undefined}
        data-empty={currentValue.length === 0 || undefined}
        data-invalid={resolvedInvalid || undefined}
        data-readonly={readOnly || undefined}
        data-revealed={revealed || undefined}
        data-slot="password-field"
        style={rootStyle}
      >
        <span className={className} data-slot="password-field-control">
          <input
            {...nativeProps}
            aria-describedby={describedBy}
            aria-errormessage={errorMessage}
            aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
            aria-labelledby={labelledBy}
            className={
              inputClassName === undefined
                ? "mrg-password-field-input"
                : `mrg-password-field-input ${inputClassName}`
            }
            defaultValue={controlled ? undefined : defaultValue}
            disabled={disabled}
            id={resolvedId}
            onBlur={(event: FocusEvent<HTMLInputElement>) => {
              setFocused(false);
              setCapsLock(false);
              onBlur?.(event);
            }}
            onChange={handleChange}
            onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => {
              setComposing(false);
              onCompositionEnd?.(event);
            }}
            onCompositionStart={(event: CompositionEvent<HTMLInputElement>) => {
              setComposing(true);
              onCompositionStart?.(event);
            }}
            onFocus={(event: FocusEvent<HTMLInputElement>) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
              syncCapsLock(event);
              onKeyDown?.(event);
            }}
            onKeyUp={(event: KeyboardEvent<HTMLInputElement>) => {
              syncCapsLock(event);
              onKeyUp?.(event);
            }}
            readOnly={readOnly}
            ref={setInputRef}
            required={resolvedRequired}
            type={revealed ? "text" : "password"}
            value={controlled ? value : undefined}
          />
          <button
            aria-controls={resolvedId}
            aria-label={revealed ? hidePasswordLabel : showPasswordLabel}
            aria-pressed={revealed}
            className="mrg-password-field-reveal"
            data-slot="password-field-reveal"
            disabled={disabled}
            onClick={() => {
              setRevealed((current) => !current);
              inputRef.current?.focus({ preventScroll: true });
            }}
            type="button"
          >
            {revealed ? hidePasswordLabel : showPasswordLabel}
          </button>
        </span>
        {capsLockActive ? (
          <span
            aria-atomic="true"
            aria-live="polite"
            data-composing={composing || undefined}
            data-slot="password-field-caps-lock"
            id={capsLockId}
            role="status"
          >
            {capsLockMessage}
          </span>
        ) : null}
        {rules.length === 0 ? null : (
          <ul aria-label={rulesLabel} data-slot="password-field-rules" id={rulesId}>
            {rules.map((rule) => {
              const met = rule.validate(currentValue);
              return (
                <li data-met={met ? "true" : "false"} data-slot="password-field-rule" key={rule.id}>
                  <span data-slot="password-field-rule-state">
                    {met ? ruleMetLabel : ruleUnmetLabel}:
                  </span>{" "}
                  <span>{rule.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </span>
    );
  },
);

PasswordField.displayName = "PasswordField";
