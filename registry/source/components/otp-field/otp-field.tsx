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
import "./otp-field.css";

export type OtpFieldCharacterSet = "alphanumeric" | "numeric";

export interface OtpFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "maxLength" | "onChange" | "type" | "value"
> {
  readonly characterSet?: OtpFieldCharacterSet;
  readonly defaultValue?: string;
  readonly groupingLabel?: string;
  readonly groups?: readonly number[];
  readonly inputClassName?: string;
  readonly invalid?: boolean;
  readonly onChange?: (value: string) => void;
  readonly onComplete?: (value: string) => void;
  readonly rootClassName?: string;
  readonly rootStyle?: CSSProperties;
  readonly value?: string;
}

const DEFAULT_GROUPS = [3, 3] as const;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
}

function isSemanticallyInvalid(value: AriaAttributes["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function assertGroups(groups: readonly number[]): number {
  if (groups.length === 0) {
    throw new RangeError("Mergora OtpField groups must contain at least one group.");
  }
  let total = 0;
  for (const size of groups) {
    if (!Number.isInteger(size) || size < 1 || size > 12) {
      throw new RangeError("Mergora OtpField group sizes must be integers from 1 through 12.");
    }
    total += size;
  }
  if (total < 4 || total > 12) {
    throw new RangeError("Mergora OtpField must contain from 4 through 12 characters.");
  }
  return total;
}

function normalizeOtpValue(
  candidate: string,
  characterSet: OtpFieldCharacterSet,
  maximumLength: number,
): string {
  const normalized = candidate.normalize("NFKC");
  const accepted = Array.from(normalized).filter((character) =>
    characterSet === "numeric" ? /[0-9]/u.test(character) : /[0-9A-Za-z]/u.test(character),
  );
  return accepted.slice(0, maximumLength).join("");
}

export const OtpField = forwardRef<HTMLInputElement, OtpFieldProps>(function OtpField(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    "aria-labelledby": ariaLabelledBy,
    autoComplete = "one-time-code",
    characterSet = "numeric",
    className,
    defaultValue = "",
    dir = "ltr",
    disabled = false,
    enterKeyHint = "done",
    form,
    groupingLabel: groupingLabelProp,
    groups = DEFAULT_GROUPS,
    id,
    inputClassName,
    inputMode,
    invalid,
    onChange,
    onComplete,
    onCompositionEnd,
    onCompositionStart,
    onPaste,
    pattern,
    readOnly = false,
    required,
    rootClassName,
    rootStyle,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const maximumLength = assertGroups(groups);
  const field = useFieldControlState();
  const generatedId = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const composingRef = useRef(false);
  const skipNextChange = useRef<string | null>(null);
  const controlled = value !== undefined;
  const normalizedDefault = normalizeOtpValue(defaultValue, characterSet, maximumLength);
  const normalizedControlled = normalizeOtpValue(value ?? "", characterSet, maximumLength);
  const [uncontrolledValue, setUncontrolledValue] = useState(normalizedDefault);
  const [compositionDraft, setCompositionDraft] = useState("");
  const [composing, setComposing] = useState(false);
  const currentValue = controlled ? normalizedControlled : uncontrolledValue;
  const lastCompleteValue = useRef<string | null>(
    currentValue.length === maximumLength ? currentValue : null,
  );
  const renderedValue = composing ? compositionDraft : currentValue;
  const resolvedId = field?.controlId ?? id ?? `mrg-otp-field-${generatedId}`;
  const groupingId = `${resolvedId}-grouping`;
  const resolvedInvalid =
    ariaInvalid !== undefined
      ? isSemanticallyInvalid(ariaInvalid)
      : invalid !== undefined
        ? invalid
        : (field?.invalid ?? false);
  const resolvedRequired = required ?? field?.required;
  const groupingLabel = useMergoraMessage(
    "otpField.grouping",
    groupingLabelProp ??
      (({ locale, values }) => {
        const lengthValue = Number(values.maximumLength);
        const groupValues = Array.isArray(values.groups) ? values.groups : [];
        const numberFormat = new Intl.NumberFormat(locale, { useGrouping: false });
        const listFormat = new Intl.ListFormat(locale, { style: "long", type: "conjunction" });
        return `One-time code: ${numberFormat.format(lengthValue)} characters, grouped ${listFormat.format(
          groupValues.map((size) => numberFormat.format(Number(size))),
        )}.`;
      }),
    { groups, maximumLength },
  );
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    groupingId,
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
    lastCompleteValue.current = currentValue.length === maximumLength ? currentValue : null;
  }, [controlled, currentValue, maximumLength]);

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
      const nextValue = normalizeOtpValue(candidate, characterSet, maximumLength);
      if (!controlled) setUncontrolledValue(nextValue);
      onChange?.(nextValue);
      if (nextValue.length === maximumLength) {
        if (lastCompleteValue.current !== nextValue) {
          lastCompleteValue.current = nextValue;
          onComplete?.(nextValue);
        }
      } else {
        lastCompleteValue.current = null;
      }
      if (caretPosition !== undefined) {
        const prefix = candidate.slice(0, caretPosition);
        scheduleSelection(normalizeOtpValue(prefix, characterSet, maximumLength).length);
      }
      return nextValue;
    },
    [characterSet, controlled, maximumLength, onChange, onComplete, scheduleSelection],
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
        setUncontrolledValue(normalizedDefault);
        lastCompleteValue.current =
          normalizedDefault.length === maximumLength ? normalizedDefault : null;
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
      className={rootClassName === undefined ? "mrg-otp-field" : `mrg-otp-field ${rootClassName}`}
      data-character-set={characterSet}
      data-complete={currentValue.length === maximumLength || undefined}
      data-disabled={disabled || undefined}
      data-empty={currentValue.length === 0 || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-readonly={readOnly || undefined}
      data-slot="otp-field"
      style={rootStyle}
    >
      <span
        className={className}
        data-composing={composing || undefined}
        data-slot="otp-field-control"
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
              ? "mrg-otp-field-input"
              : `mrg-otp-field-input ${inputClassName}`
          }
          data-slot="otp-field-input"
          dir={dir}
          disabled={disabled}
          enterKeyHint={enterKeyHint}
          form={form}
          id={resolvedId}
          inputMode={inputMode ?? (characterSet === "numeric" ? "numeric" : "text")}
          maxLength={maximumLength}
          onChange={(event: ChangeEvent<HTMLInputElement>) => {
            if (composingRef.current) {
              setCompositionDraft(event.currentTarget.value);
              return;
            }
            const normalized = normalizeOtpValue(
              event.currentTarget.value,
              characterSet,
              maximumLength,
            );
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
            const input = event.currentTarget;
            const pastedText = event.clipboardData.getData("text");
            const selectionStart = input.selectionStart ?? input.value.length;
            const selectionEnd = input.selectionEnd ?? selectionStart;
            const candidate =
              input.value.slice(0, selectionStart) + pastedText + input.value.slice(selectionEnd);
            event.preventDefault();
            commitValue(candidate, selectionStart + pastedText.length);
          }}
          pattern={pattern ?? (characterSet === "numeric" ? "[0-9]*" : "[0-9A-Za-z]*")}
          readOnly={readOnly}
          ref={setInputRef}
          required={resolvedRequired}
          type="text"
          value={renderedValue}
        />
        <span aria-hidden="true" data-slot="otp-field-grouping">
          {groups.map((size, groupIndex) => (
            <span data-slot="otp-field-group" key={`${groupIndex}-${size}`}>
              {Array.from({ length: size }, (_, cellIndex) => (
                <span data-slot="otp-field-cell" key={cellIndex} />
              ))}
            </span>
          ))}
        </span>
      </span>
      <span className="mrg-visually-hidden" data-slot="otp-field-grouping-label" id={groupingId}>
        {groupingLabel}
      </span>
    </span>
  );
});

OtpField.displayName = "OtpField";
