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
  type InputHTMLAttributes,
  type Ref,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraMessage } from "../provider/index.js";
import "./pin-field.css";

export type PinFieldDisplayMode = "secure" | "visible";
export type PinFieldPastePolicy = "allow" | "block";
export type PinFieldPurpose = "reusable-secret";

export interface PinFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "maxLength" | "onChange" | "type" | "value"
> {
  readonly defaultValue?: string;
  readonly displayMode?: PinFieldDisplayMode;
  readonly inputClassName?: string;
  readonly invalid?: boolean;
  readonly length?: number;
  readonly onChange?: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  readonly pasteBlockedMessage?: string;
  readonly pastePolicy?: PinFieldPastePolicy;
  readonly purpose: PinFieldPurpose;
  readonly purposeLabel?: string;
  readonly rootClassName?: string;
  readonly rootStyle?: CSSProperties;
  readonly value?: string;
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
}

function isSemanticallyInvalid(value: AriaAttributes["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function assertPinLength(length: number): void {
  if (!Number.isInteger(length) || length < 4 || length > 12) {
    throw new RangeError("Mergora PinField length must be an integer from 4 through 12.");
  }
}

function assertPinPurpose(purpose: unknown): asserts purpose is PinFieldPurpose {
  if (purpose !== "reusable-secret") {
    throw new TypeError('Mergora PinField purpose must be exactly "reusable-secret".');
  }
}

function normalizePinValue(candidate: string, maximumLength: number): string {
  return Array.from(candidate.normalize("NFKC"))
    .filter((character) => /[0-9]/u.test(character))
    .slice(0, maximumLength)
    .join("");
}

export const PinField = forwardRef<HTMLInputElement, PinFieldProps>(function PinField(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    "aria-labelledby": ariaLabelledBy,
    autoComplete = "current-password",
    className,
    defaultValue = "",
    dir = "ltr",
    disabled = false,
    displayMode = "secure",
    enterKeyHint = "done",
    form,
    id,
    inputClassName,
    inputMode = "numeric",
    invalid,
    length = 4,
    onChange,
    onComplete,
    onCompositionEnd,
    onCompositionStart,
    onPaste,
    pasteBlockedMessage: pasteBlockedMessageProp,
    pastePolicy = "allow",
    pattern = "[0-9]*",
    purpose,
    purposeLabel: purposeLabelProp,
    readOnly = false,
    required,
    rootClassName,
    rootStyle,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  assertPinLength(length);
  assertPinPurpose(purpose);
  const field = useFieldControlState();
  const generatedId = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const skipNextChange = useRef<string | null>(null);
  const controlled = value !== undefined;
  const normalizedDefault = normalizePinValue(defaultValue, length);
  const normalizedControlled = normalizePinValue(value ?? "", length);
  const [uncontrolledValue, setUncontrolledValue] = useState(normalizedDefault);
  const [compositionDraft, setCompositionDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const [pasteBlocked, setPasteBlocked] = useState(false);
  const currentValue = controlled ? normalizedControlled : uncontrolledValue;
  const lastCompleteValue = useRef<string | null>(
    currentValue.length === length ? currentValue : null,
  );
  const renderedValue = composing ? compositionDraft : currentValue;
  const resolvedId = field?.controlId ?? id ?? `mrg-pin-field-${generatedId}`;
  const purposeId = `${resolvedId}-purpose`;
  const pasteStatusId = `${resolvedId}-paste-status`;
  const resolvedInvalid =
    ariaInvalid !== undefined
      ? isSemanticallyInvalid(ariaInvalid)
      : invalid !== undefined
        ? invalid
        : (field?.invalid ?? false);
  const resolvedRequired = required ?? field?.required;
  const purposeLabel = useMergoraMessage(
    "pinField.purpose",
    purposeLabelProp ??
      (({ locale, values }) =>
        `Reusable security PIN: ${new Intl.NumberFormat(locale, { useGrouping: false }).format(
          Number(values.length),
        )} digits. This is not a one-time code.`),
    { length },
  );
  const pasteBlockedMessage = useMergoraMessage(
    "pinField.pasteBlocked",
    pasteBlockedMessageProp ?? "Pasting is disabled for this PIN field.",
  );
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    purposeId,
    pasteBlocked ? pasteStatusId : undefined,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );
  const labelledBy = ariaLabelledBy ?? field?.labelId;

  const setInputRef = useCallback(
    (node: HTMLInputElement | null) => {
      inputRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );

  useEffect(() => {
    if (!controlled) return;
    lastCompleteValue.current = currentValue.length === length ? currentValue : null;
  }, [controlled, currentValue, length]);

  const scheduleSelection = useCallback((position: number) => {
    if (selectionTimer.current !== null) clearTimeout(selectionTimer.current);
    selectionTimer.current = setTimeout(() => {
      const input = inputRef.current;
      if (input !== null && input.ownerDocument.activeElement === input) {
        input.setSelectionRange(position, position);
      }
    }, 0);
  }, []);

  const commitValue = useCallback(
    (candidate: string, caretPosition?: number) => {
      const nextValue = normalizePinValue(candidate, length);
      setPasteBlocked(false);
      if (!controlled) setUncontrolledValue(nextValue);
      onChange?.(nextValue);
      if (nextValue.length === length) {
        if (lastCompleteValue.current !== nextValue) {
          lastCompleteValue.current = nextValue;
          onComplete?.(nextValue);
        }
      } else {
        lastCompleteValue.current = null;
      }
      if (caretPosition !== undefined) {
        const prefix = candidate.slice(0, caretPosition);
        scheduleSelection(normalizePinValue(prefix, length).length);
      }
      return nextValue;
    },
    [controlled, length, onChange, onComplete, scheduleSelection],
  );

  useEffect(() => {
    const input = inputRef.current;
    if (controlled || input === null) return;
    const ownerForm = input.form;
    if (ownerForm === null) return;
    const handleReset = (event: Event) => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        if (event.defaultPrevented) return;
        composingRef.current = false;
        setComposing(false);
        setCompositionDraft("");
        setPasteBlocked(false);
        setUncontrolledValue(normalizedDefault);
        lastCompleteValue.current = normalizedDefault.length === length ? normalizedDefault : null;
      }, 0);
    };
    ownerForm.addEventListener("reset", handleReset);
    return () => {
      ownerForm.removeEventListener("reset", handleReset);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, [controlled, form, normalizedDefault]);

  useEffect(
    () => () => {
      if (selectionTimer.current !== null) clearTimeout(selectionTimer.current);
    },
    [],
  );

  return (
    <span
      className={rootClassName === undefined ? "mrg-pin-field" : `mrg-pin-field ${rootClassName}`}
      data-complete={currentValue.length === length || undefined}
      data-disabled={disabled || undefined}
      data-display-mode={displayMode}
      data-empty={currentValue.length === 0 || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-paste-policy={pastePolicy}
      data-purpose={purpose}
      data-readonly={readOnly || undefined}
      data-slot="pin-field"
      style={rootStyle}
    >
      <span
        className={className}
        data-composing={composing || undefined}
        data-slot="pin-field-control"
      >
        <input
          {...nativeProps}
          aria-describedby={describedBy}
          aria-errormessage={errorMessage}
          aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
          aria-labelledby={labelledBy}
          autoComplete={autoComplete}
          className={
            inputClassName === undefined
              ? "mrg-pin-field-input"
              : `mrg-pin-field-input ${inputClassName}`
          }
          data-slot="pin-field-input"
          dir={dir}
          disabled={disabled}
          enterKeyHint={enterKeyHint}
          form={form}
          id={resolvedId}
          inputMode={inputMode}
          maxLength={length}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (composingRef.current) {
              setCompositionDraft(event.currentTarget.value);
              return;
            }
            const normalized = normalizePinValue(event.currentTarget.value, length);
            if (skipNextChange.current === normalized) {
              skipNextChange.current = null;
              if (!controlled) setUncontrolledValue(normalized);
              return;
            }
            commitValue(event.currentTarget.value, event.currentTarget.selectionStart ?? undefined);
          }}
          onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => {
            composingRef.current = false;
            setComposing(false);
            setCompositionDraft("");
            const nextValue = commitValue(
              event.currentTarget.value,
              event.currentTarget.selectionStart ?? undefined,
            );
            skipNextChange.current = nextValue;
            onCompositionEnd?.(event);
          }}
          onCompositionStart={(event: CompositionEvent<HTMLInputElement>) => {
            composingRef.current = true;
            setComposing(true);
            setCompositionDraft(event.currentTarget.value);
            onCompositionStart?.(event);
          }}
          onPaste={(event) => {
            onPaste?.(event);
            if (event.defaultPrevented || readOnly) return;
            if (pastePolicy === "block") {
              event.preventDefault();
              setPasteBlocked(true);
              return;
            }
            const input = event.currentTarget;
            const pastedText = event.clipboardData.getData("text");
            const selectionStart = input.selectionStart ?? input.value.length;
            const selectionEnd = input.selectionEnd ?? selectionStart;
            const candidate =
              input.value.slice(0, selectionStart) + pastedText + input.value.slice(selectionEnd);
            event.preventDefault();
            commitValue(candidate, selectionStart + pastedText.length);
          }}
          pattern={pattern}
          readOnly={readOnly}
          ref={setInputRef}
          required={resolvedRequired}
          type={displayMode === "secure" ? "password" : "text"}
          value={renderedValue}
        />
        <span aria-hidden="true" data-slot="pin-field-segments">
          {Array.from({ length }, (_, index) => (
            <span data-slot="pin-field-segment" key={index} />
          ))}
        </span>
      </span>
      <span className="mrg-visually-hidden" data-slot="pin-field-purpose" id={purposeId}>
        {purposeLabel}
      </span>
      <span
        aria-atomic="true"
        aria-live="polite"
        data-slot="pin-field-paste-status"
        id={pasteStatusId}
        role="status"
      >
        {pasteBlocked ? pasteBlockedMessage : null}
      </span>
    </span>
  );
});

PinField.displayName = "PinField";
