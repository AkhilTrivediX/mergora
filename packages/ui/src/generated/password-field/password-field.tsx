// Generated from registry/source/components/password-field/password-field.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
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
import { useMergoraMessage } from "../provider/index.js";
import "./password-field.css";

export interface PasswordFieldRule {
  readonly id: string;
  readonly label: ReactNode;
  readonly validate: (value: string) => boolean;
}

export interface PasswordFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  readonly capsLockMessage?: string;
  readonly defaultValue?: string;
  readonly hidePasswordLabel?: string;
  readonly inputClassName?: string;
  readonly invalid?: boolean;
  readonly onChange?: (value: string) => void;
  readonly rootClassName?: string;
  readonly rootStyle?: CSSProperties;
  readonly ruleMetLabel?: string;
  readonly ruleUnmetLabel?: string;
  readonly rules?: readonly PasswordFieldRule[];
  readonly rulesLabel?: string;
  readonly showPasswordLabel?: string;
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

function assertPasswordRules(rules: readonly PasswordFieldRule[]): void {
  const ids = new Set<string>();
  for (const rule of rules) {
    if (rule.id.trim().length === 0) {
      throw new RangeError("Mergora PasswordField rule IDs must not be empty.");
    }
    if (ids.has(rule.id)) {
      throw new RangeError(`Mergora PasswordField rule ID "${rule.id}" must be unique.`);
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
    const currentValue = controlled ? value : uncontrolledValue;
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
      focused && capsLock ? capsLockId : undefined,
    );
    const errorMessage = mergeFieldIdRefs(
      ariaErrorMessage,
      resolvedInvalid ? field?.errorMessageId : undefined,
    );
    const labelledBy = ariaLabelledBy ?? field?.labelId;
    const showPasswordLabel = useMergoraMessage(
      "passwordField.showPassword",
      showPasswordLabelProp ?? "Show password",
    );
    const hidePasswordLabel = useMergoraMessage(
      "passwordField.hidePassword",
      hidePasswordLabelProp ?? "Hide password",
    );
    const capsLockMessage = useMergoraMessage(
      "passwordField.capsLock",
      capsLockMessageProp ?? "Caps Lock is on",
    );
    const rulesLabel = useMergoraMessage(
      "passwordField.rules",
      rulesLabelProp ?? "Password requirements",
    );
    const ruleMetLabel = useMergoraMessage("passwordField.ruleMet", ruleMetLabelProp ?? "Met");
    const ruleUnmetLabel = useMergoraMessage(
      "passwordField.ruleUnmet",
      ruleUnmetLabelProp ?? "Not met",
    );

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
        data-caps-lock={focused && capsLock ? "true" : undefined}
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
        <span
          aria-atomic="true"
          aria-live="polite"
          data-composing={composing || undefined}
          data-slot="password-field-caps-lock"
          id={capsLockId}
          role="status"
        >
          {focused && capsLock ? capsLockMessage : null}
        </span>
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
