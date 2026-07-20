// Generated from registry/source/components/phone-field/phone-field.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type AriaAttributes,
  type ChangeEvent,
  type CompositionEvent,
  type CSSProperties,
  type FocusEvent,
  type FormEvent,
  type InputHTMLAttributes,
  type Ref,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./phone-field.css";

export type PhoneAdapterStatus = "empty" | "incomplete" | "invalid" | "valid";
export type PhoneFieldStatus = PhoneAdapterStatus | "composing";
export type PhoneAdapterPhase = "composition-end" | "input" | "render" | "reset";

export interface PhoneCountry {
  /** ISO 3166-1 alpha-2 code used only as adapter context. */
  readonly code: string;
  /** International calling prefix such as +1 or +91. */
  readonly callingCode: string;
  /** Localized visible country name. A flag or symbol alone is rejected. */
  readonly label: string;
}

export interface PhoneTextSelection {
  /** Native selection direction, or null when the browser does not expose one. */
  readonly direction: "backward" | "forward" | "none" | null;
  /** Exclusive UTF-16 selection end offset in the visible telephone value. */
  readonly end: number;
  /** Inclusive UTF-16 selection start offset in the visible telephone value. */
  readonly start: number;
}

export interface PhoneAdapterContext {
  /** Explicit country metadata constraining canonical E.164 output. */
  readonly country: PhoneCountry;
  /** Active provider locale available for deterministic formatting. */
  readonly locale: string;
  /** Hard character boundary applied to adapter input and display output. */
  readonly maxInputLength: number;
  /** Render, input, composition-end, or reset lifecycle phase being resolved. */
  readonly phase: PhoneAdapterPhase;
  /** Previously rendered display text available for stable caret mapping. */
  readonly previousDisplayValue: string;
  /** UTF-16 offsets matching HTMLInputElement selectionStart/selectionEnd. */
  readonly selection: PhoneTextSelection | null;
}

export interface PhoneAdapterResult {
  /** What remains visible in the native tel input. */
  readonly displayValue: string;
  /** Canonical E.164 value. It is present only for a valid result. */
  readonly e164: string | null;
  /** Adapter-owned caret mapping after formatting. */
  readonly selection: PhoneTextSelection | null;
  /** Empty, incomplete, invalid, or valid interpretation of the adapter output. */
  readonly status: PhoneAdapterStatus;
}

/**
 * A synchronous, deterministic adapter imported from trusted application code. Mergora does not
 * load adapters from JSON, registry metadata, URLs, or user-authored mask strings.
 */
export interface PhoneFormatAdapter {
  /** Bounded lowercase identifier used in validation diagnostics. */
  readonly id: string;
  /** Synchronously formats, validates, canonicalizes, and maps caret state. */
  readonly resolve: (input: string, context: PhoneAdapterContext) => PhoneAdapterResult;
}

export interface PhoneFieldValue {
  /** Explicit ISO country code supplied to the trusted adapter. */
  readonly countryCode: string;
  /** Exact bounded text currently rendered in the native telephone input. */
  readonly displayValue: string;
  /** Canonical E.164 value available only while adapter status is valid. */
  readonly e164: string | null;
  /** Current optional extension, or an empty string when extension support is off. */
  readonly extension: string;
  /** Adapter-owned caret mapping, or null when no mapping is required. */
  readonly selection: PhoneTextSelection | null;
  /** Adapter status, extended with composing while IME input remains provisional. */
  readonly status: PhoneFieldStatus;
}

export interface PhoneFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "name" | "onChange" | "type" | "value"
> {
  /** Trusted synchronous phone formatter, validator, and caret mapper. */
  readonly adapter: PhoneFormatAdapter;
  /** Explicit country metadata supplied to the adapter and visible context. */
  readonly country: PhoneCountry;
  /** Initial extension for uncontrolled use and form reset; requires extension support. */
  readonly defaultExtensionValue?: string;
  /** Initial visible phone text for uncontrolled use and native form reset. */
  readonly defaultValue?: string;
  /** Adds a separately labelled extension input; false removes its UI and successful control. */
  readonly extension?: boolean;
  /** Additional class name applied to the extension input. */
  readonly extensionClassName?: string;
  /** Required localized visible label when extension support is enabled. */
  readonly extensionLabel?: string;
  /** Positive accepted extension length cap; defaults to 12. */
  readonly extensionMaxLength?: number;
  /** Native form name assigned to the optional extension input. */
  readonly extensionName?: string;
  /** Controlled extension string; changes are proposed through callbacks. */
  readonly extensionValue?: string;
  /** Additional class name applied to the visible telephone input. */
  readonly inputClassName?: string;
  /** Boolean invalid fallback merged with adapter, ARIA, and Field state. */
  readonly invalid?: boolean;
  /** Localized native validation and visible recovery message for invalid input. */
  readonly invalidMessage?: string;
  /** Maximum accepted visible input length before the trusted adapter runs. */
  readonly maxInputLength?: number;
  /** Name of the hidden canonical E.164 form control. */
  readonly name?: string;
  /** Receives each edit to the optional extension string. */
  readonly onExtensionChange?: (extension: string) => void;
  /** Receives display, E.164, extension, selection, and adapter status updates. */
  readonly onValueChange?: (value: PhoneFieldValue) => void;
  /** Additional class name applied to the outer PhoneField wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer PhoneField wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Controlled visible phone text. */
  readonly value?: string;
}

const ADAPTER_ID_SEPARATORS = new Set(["-", ".", "_"]);

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

function containsControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function isAdapterId(value: string): boolean {
  if (value.length === 0 || value.length > 80) return false;
  let previousSeparator = false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    const alphaNumeric = (code >= 0x30 && code <= 0x39) || (code >= 0x61 && code <= 0x7a);
    const separator = ADAPTER_ID_SEPARATORS.has(character);
    if (!alphaNumeric && !separator) return false;
    if (separator && previousSeparator) return false;
    previousSeparator = separator;
  }
  return !previousSeparator;
}

function isCountryCode(value: string): boolean {
  if (value.length !== 2) return false;
  return [...value].every((character) => character >= "A" && character <= "Z");
}

function isCallingCode(value: string): boolean {
  if (value.length < 2 || value.length > 4 || value[0] !== "+") return false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined || character < "0" || character > "9") return false;
    if (index === 1 && character === "0") return false;
  }
  return true;
}

function isE164(value: string): boolean {
  if (value.length < 3 || value.length > 16 || value[0] !== "+") return false;
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (character === undefined || character < "0" || character > "9") return false;
    if (index === 1 && character === "0") return false;
  }
  return true;
}

function hasExplicitCountryText(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value);
}

function assertBoundedLength(value: number, label: string, maximum: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
    throw new RangeError(
      `Mergora PhoneField ${label} must be an integer from 1 through ${maximum}.`,
    );
  }
}

function assertSelection(selection: PhoneTextSelection | null, value: string, label: string): void {
  if (selection === null) return;
  if (
    !Number.isSafeInteger(selection.start) ||
    !Number.isSafeInteger(selection.end) ||
    selection.start < 0 ||
    selection.end < selection.start ||
    selection.end > value.length
  ) {
    throw new RangeError(
      `Mergora PhoneField adapter returned an out-of-bounds ${label} selection.`,
    );
  }
}

function assertCountry(country: PhoneCountry): void {
  if (!isCountryCode(country.code)) {
    throw new RangeError("Mergora PhoneField country.code must be an uppercase alpha-2 code.");
  }
  if (!isCallingCode(country.callingCode)) {
    throw new RangeError(
      "Mergora PhoneField country.callingCode must be a plus sign followed by one to three digits.",
    );
  }
  if (
    country.label.length === 0 ||
    country.label.length > 80 ||
    country.label !== country.label.normalize("NFC") ||
    country.label.trim() !== country.label ||
    containsControlCharacter(country.label) ||
    !hasExplicitCountryText(country.label)
  ) {
    throw new RangeError(
      "Mergora PhoneField country.label must be explicit localized NFC text, not a flag or symbol alone.",
    );
  }
}

function assertPhoneFieldProps(props: PhoneFieldProps): void {
  assertCountry(props.country);
  if (!isAdapterId(props.adapter.id)) {
    throw new RangeError(
      "Mergora PhoneField adapter.id must be a bounded lowercase identifier using letters, digits, dots, dashes, or underscores.",
    );
  }
  assertBoundedLength(props.maxInputLength ?? 64, "maxInputLength", 256);
  assertBoundedLength(props.extensionMaxLength ?? 12, "extensionMaxLength", 64);
  if (props.name !== undefined && props.name.trim().length === 0) {
    throw new RangeError("Mergora PhoneField name must not be empty or whitespace-only.");
  }
  if (props.extensionName !== undefined && props.extensionName.trim().length === 0) {
    throw new RangeError("Mergora PhoneField extensionName must not be empty or whitespace-only.");
  }
  if (props.extension === true) {
    if (
      props.extensionLabel === undefined ||
      props.extensionLabel.trim().length === 0 ||
      props.extensionLabel.length > 80 ||
      containsControlCharacter(props.extensionLabel)
    ) {
      throw new RangeError(
        "Mergora PhoneField extensionLabel must be non-empty localized text when extension support is enabled.",
      );
    }
  } else if (
    props.extensionValue !== undefined ||
    props.defaultExtensionValue !== undefined ||
    props.extensionName !== undefined ||
    props.onExtensionChange !== undefined
  ) {
    throw new RangeError(
      "Mergora PhoneField extension value, name, and callback props require extension={true}.",
    );
  }
}

export function applyPhoneFormatAdapter(
  adapter: PhoneFormatAdapter,
  input: string,
  context: PhoneAdapterContext,
): PhoneAdapterResult {
  if (!isAdapterId(adapter.id)) {
    throw new RangeError("Mergora PhoneField received an invalid adapter identifier.");
  }
  if (input.length > context.maxInputLength) {
    throw new RangeError(
      `Mergora PhoneField input exceeds the ${context.maxInputLength} character adapter boundary.`,
    );
  }
  assertSelection(context.selection, input, "input");
  const result = adapter.resolve(input, context);
  if (result.displayValue.length > context.maxInputLength) {
    throw new RangeError(
      `Mergora PhoneField adapter "${adapter.id}" produced an over-limit display value.`,
    );
  }
  if (!(["empty", "incomplete", "invalid", "valid"] as const).includes(result.status)) {
    throw new TypeError(`Mergora PhoneField adapter "${adapter.id}" returned an invalid status.`);
  }
  assertSelection(result.selection, result.displayValue, "output");
  if (context.selection !== null && result.displayValue !== input && result.selection === null) {
    throw new TypeError(
      `Mergora PhoneField adapter "${adapter.id}" changed visible text without returning caret mapping.`,
    );
  }
  if (result.status === "valid") {
    if (result.e164 === null || !isE164(result.e164)) {
      throw new TypeError(
        `Mergora PhoneField adapter "${adapter.id}" must return a canonical E.164 value for valid input.`,
      );
    }
    if (!result.e164.startsWith(context.country.callingCode)) {
      throw new TypeError(
        `Mergora PhoneField adapter "${adapter.id}" returned E.164 output outside the selected country calling code.`,
      );
    }
  } else if (result.e164 !== null) {
    throw new TypeError(
      `Mergora PhoneField adapter "${adapter.id}" must not return E.164 output for ${result.status} input.`,
    );
  }
  if (result.status === "invalid" && result.displayValue !== input) {
    throw new TypeError(
      `Mergora PhoneField adapter "${adapter.id}" must preserve invalid visible input for recovery.`,
    );
  }
  return result;
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

function selectionFromInput(input: HTMLInputElement): PhoneTextSelection | null {
  if (input.selectionStart === null || input.selectionEnd === null) return null;
  return {
    direction: input.selectionDirection,
    end: input.selectionEnd,
    start: input.selectionStart,
  };
}

export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(
  function PhoneField(props, forwardedRef) {
    assertPhoneFieldProps(props);
    const {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-labelledby": ariaLabelledBy,
      adapter,
      autoComplete = "tel",
      className,
      country,
      defaultExtensionValue = "",
      defaultValue = "",
      dir = "ltr",
      disabled = false,
      extension = false,
      extensionClassName,
      extensionLabel,
      extensionMaxLength = 12,
      extensionName,
      extensionValue,
      form,
      id,
      inputClassName,
      inputMode = "tel",
      invalid,
      invalidMessage: invalidMessageProp,
      maxInputLength = 64,
      name,
      onBlur,
      onCompositionEnd,
      onCompositionStart,
      onExtensionChange,
      onFocus,
      onInvalid,
      onValueChange,
      readOnly = false,
      required,
      rootClassName,
      rootStyle,
      value,
      ...nativeProps
    } = props;
    const field = useFieldControlState();
    const { locale } = useMergoraContext();
    const generatedId = useId().replaceAll(":", "");
    const inputRef = useRef<HTMLInputElement | null>(null);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSelection = useRef<{
      readonly displayValue: string;
      readonly selection: PhoneTextSelection;
    } | null>(null);
    const previousDisplayValue = useRef(defaultValue);
    const skipCompositionInput = useRef<string | null>(null);
    const controlled = value !== undefined;
    const extensionControlled = extensionValue !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const [uncontrolledExtension, setUncontrolledExtension] = useState(defaultExtensionValue);
    const [composing, setComposing] = useState(false);
    const [touched, setTouched] = useState(false);
    const currentInput = controlled ? value : uncontrolledValue;
    const currentExtension = extensionControlled ? extensionValue : uncontrolledExtension;
    const resolvedId = field?.controlId ?? id ?? `mrg-phone-field-${generatedId}`;
    const countryId = `${resolvedId}-country`;
    const extensionId = `${resolvedId}-extension`;
    const validationId = `${resolvedId}-validation`;
    const resolvedRequired = required ?? field?.required;
    const invalidMessage = useMergoraMessage(
      "phoneField.invalid",
      invalidMessageProp ?? "Enter a complete international phone number.",
    );
    const adapterResult = useMemo<PhoneAdapterResult>(
      () =>
        composing
          ? {
              displayValue: currentInput,
              e164: null,
              selection: null,
              status: currentInput.length === 0 ? "empty" : "incomplete",
            }
          : applyPhoneFormatAdapter(adapter, currentInput, {
              country,
              locale,
              maxInputLength,
              phase: "render",
              previousDisplayValue: previousDisplayValue.current,
              selection: null,
            }),
      [adapter, composing, country, currentInput, locale, maxInputLength],
    );
    const fieldValue: PhoneFieldValue = {
      countryCode: country.code,
      displayValue: adapterResult.displayValue,
      e164: composing ? null : adapterResult.e164,
      extension: extension ? currentExtension : "",
      selection: adapterResult.selection,
      status: composing ? "composing" : adapterResult.status,
    };
    const adapterInvalid =
      adapterResult.status === "invalid" ||
      (touched && adapterResult.status === "incomplete" && currentInput.length > 0);
    const resolvedInvalid =
      ariaInvalid !== undefined
        ? isSemanticallyInvalid(ariaInvalid)
        : invalid !== undefined
          ? invalid
          : (field?.invalid ?? false) || adapterInvalid;
    const describedBy = mergeFieldIdRefs(
      ariaDescribedBy,
      field?.descriptionId,
      countryId,
      resolvedInvalid ? field?.errorMessageId : undefined,
      adapterInvalid ? validationId : undefined,
    );
    const errorMessage = mergeFieldIdRefs(
      ariaErrorMessage,
      resolvedInvalid ? field?.errorMessageId : undefined,
      adapterInvalid ? validationId : undefined,
    );
    const labelledBy = ariaLabelledBy ?? field?.labelId;

    const setInputRef = useCallback(
      (node: HTMLInputElement | null) => {
        inputRef.current = node;
        assignRef(forwardedRef, node);
      },
      [forwardedRef],
    );

    const resolveInteractiveInput = useCallback(
      (
        input: string,
        selection: PhoneTextSelection | null,
        phase: Extract<PhoneAdapterPhase, "composition-end" | "input">,
      ): PhoneAdapterResult =>
        applyPhoneFormatAdapter(adapter, input, {
          country,
          locale,
          maxInputLength,
          phase,
          previousDisplayValue: previousDisplayValue.current,
          selection,
        }),
      [adapter, country, locale, maxInputLength],
    );

    const commitInput = useCallback(
      (
        input: string,
        selection: PhoneTextSelection | null,
        phase: Extract<PhoneAdapterPhase, "composition-end" | "input">,
      ) => {
        const result = resolveInteractiveInput(input, selection, phase);
        if (!controlled) setUncontrolledValue(result.displayValue);
        previousDisplayValue.current = result.displayValue;
        if (result.selection !== null) {
          pendingSelection.current = {
            displayValue: result.displayValue,
            selection: result.selection,
          };
        }
        onValueChange?.({
          countryCode: country.code,
          displayValue: result.displayValue,
          e164: result.e164,
          extension: extension ? currentExtension : "",
          selection: result.selection,
          status: result.status,
        });
      },
      [
        controlled,
        country.code,
        currentExtension,
        extension,
        onValueChange,
        resolveInteractiveInput,
      ],
    );

    useEffect(() => {
      previousDisplayValue.current = adapterResult.displayValue;
      const pending = pendingSelection.current;
      const input = inputRef.current;
      if (
        pending === null ||
        input === null ||
        input.value !== pending.displayValue ||
        globalThis.document?.activeElement !== input
      ) {
        return;
      }
      input.setSelectionRange(
        pending.selection.start,
        pending.selection.end,
        pending.selection.direction ?? undefined,
      );
      pendingSelection.current = null;
    }, [adapterResult.displayValue]);

    useEffect(() => {
      const input = inputRef.current;
      if (input === null) return;
      const blocksSubmission =
        !composing &&
        !disabled &&
        !readOnly &&
        currentInput.length > 0 &&
        (adapterResult.status === "invalid" || adapterResult.status === "incomplete");
      input.setCustomValidity(blocksSubmission ? invalidMessage : "");
      return () => input.setCustomValidity("");
    }, [adapterResult.status, composing, currentInput.length, disabled, invalidMessage, readOnly]);

    useEffect(() => {
      const input = inputRef.current;
      const ownedForm = input?.form ?? null;
      if (input === null || ownedForm === null || (controlled && extensionControlled)) return;
      const handleReset = (event: Event) => {
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          if (event.defaultPrevented) return;
          if (!controlled) setUncontrolledValue(defaultValue);
          if (!extensionControlled) setUncontrolledExtension(defaultExtensionValue);
          pendingSelection.current = null;
          previousDisplayValue.current = defaultValue;
          setComposing(false);
          setTouched(false);
        }, 0);
      };
      ownedForm.addEventListener("reset", handleReset);
      return () => {
        ownedForm.removeEventListener("reset", handleReset);
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      };
    }, [controlled, defaultExtensionValue, defaultValue, extensionControlled, form]);

    useEffect(() => {
      if (developmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
        console.warn(
          `Mergora PhoneField received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
        );
      }
    }, [field, id]);

    return (
      <span
        className={
          rootClassName === undefined ? "mrg-phone-field" : `mrg-phone-field ${rootClassName}`
        }
        data-adapter={adapter.id}
        data-disabled={disabled || undefined}
        data-invalid={resolvedInvalid || undefined}
        data-readonly={readOnly || undefined}
        data-slot="phone-field"
        data-status={fieldValue.status}
        style={rootStyle}
      >
        <span data-slot="phone-field-layout">
          <span data-slot="phone-field-control">
            <span data-slot="phone-field-country" id={countryId}>
              <span data-slot="phone-field-country-label">{country.label}</span>{" "}
              <bdi data-slot="phone-field-calling-code">{country.callingCode}</bdi>
            </span>
            <input
              {...nativeProps}
              aria-describedby={describedBy}
              aria-errormessage={errorMessage}
              aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
              aria-labelledby={labelledBy}
              autoComplete={autoComplete}
              className={["mrg-phone-field-input", className, inputClassName]
                .filter((entry): entry is string => entry !== undefined && entry.length > 0)
                .join(" ")}
              data-slot="phone-field-input"
              dir={dir}
              disabled={disabled}
              form={form}
              id={resolvedId}
              inputMode={inputMode}
              maxLength={maxInputLength}
              onBlur={(event: FocusEvent<HTMLInputElement>) => {
                setTouched(true);
                onBlur?.(event);
              }}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const input = event.currentTarget.value;
                if (skipCompositionInput.current === input) {
                  skipCompositionInput.current = null;
                  return;
                }
                skipCompositionInput.current = null;
                if (
                  composing ||
                  (event.nativeEvent as Event & { readonly isComposing?: boolean }).isComposing ===
                    true
                ) {
                  if (!controlled) setUncontrolledValue(input);
                  onValueChange?.({
                    countryCode: country.code,
                    displayValue: input,
                    e164: null,
                    extension: extension ? currentExtension : "",
                    selection: selectionFromInput(event.currentTarget),
                    status: "composing",
                  });
                  return;
                }
                commitInput(input, selectionFromInput(event.currentTarget), "input");
              }}
              onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => {
                setComposing(false);
                skipCompositionInput.current = event.currentTarget.value;
                commitInput(
                  event.currentTarget.value,
                  selectionFromInput(event.currentTarget),
                  "composition-end",
                );
                onCompositionEnd?.(event);
              }}
              onCompositionStart={(event: CompositionEvent<HTMLInputElement>) => {
                setComposing(true);
                skipCompositionInput.current = null;
                onCompositionStart?.(event);
              }}
              onFocus={(event: FocusEvent<HTMLInputElement>) => {
                onFocus?.(event);
              }}
              onInvalid={(event: FormEvent<HTMLInputElement>) => {
                setTouched(true);
                onInvalid?.(event);
              }}
              readOnly={readOnly}
              ref={setInputRef}
              required={resolvedRequired}
              type="tel"
              value={fieldValue.displayValue}
            />
          </span>
          {!extension ? null : (
            <label className="mrg-phone-field-extension" data-slot="phone-field-extension">
              <span data-slot="phone-field-extension-label">{extensionLabel}</span>
              <input
                className={extensionClassName}
                data-slot="phone-field-extension-input"
                disabled={disabled}
                form={form}
                id={extensionId}
                inputMode="numeric"
                maxLength={extensionMaxLength}
                name={extensionName}
                onChange={(event) => {
                  const nextExtension = event.currentTarget.value;
                  if (!extensionControlled) setUncontrolledExtension(nextExtension);
                  onExtensionChange?.(nextExtension);
                  onValueChange?.({ ...fieldValue, extension: nextExtension });
                }}
                pattern="[0-9]*"
                readOnly={readOnly}
                type="text"
                value={currentExtension}
              />
            </label>
          )}
        </span>
        {name === undefined ? null : (
          <input
            aria-hidden="true"
            data-slot="phone-field-canonical-input"
            disabled={disabled}
            form={form}
            name={name}
            readOnly
            tabIndex={-1}
            type="hidden"
            value={fieldValue.e164 ?? ""}
          />
        )}
        {!adapterInvalid ? null : (
          <span data-slot="phone-field-validation" id={validationId}>
            {invalidMessage}
          </span>
        )}
      </span>
    );
  },
);

PhoneField.displayName = "PhoneField";
