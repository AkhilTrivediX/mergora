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
import "./masked-field.css";

export type MaskAdapterStatus = "empty" | "incomplete" | "invalid" | "valid";
export type MaskedFieldStatus = MaskAdapterStatus | "composing";
export type MaskSerialization = "formatted" | "raw";
export type MaskAdapterPhase = "composition-end" | "input" | "render" | "reset";

export interface MaskTextSelection {
  /** Native selection direction, or null when the browser does not expose one. */
  readonly direction: "backward" | "forward" | "none" | null;
  /** Exclusive UTF-16 selection end offset in the visible formatted value. */
  readonly end: number;
  /** Inclusive UTF-16 selection start offset in the visible formatted value. */
  readonly start: number;
}

export interface MaskAdapterContext {
  /** Active provider locale available for deterministic locale-aware formatting. */
  readonly locale: string;
  /** Hard character boundary applied to adapter input and output. */
  readonly maxInputLength: number;
  /** Render, input, composition-end, or reset lifecycle phase being resolved. */
  readonly phase: MaskAdapterPhase;
  /** Previously rendered formatted value available for stable caret mapping. */
  readonly previousFormattedValue: string;
  /** UTF-16 offsets matching HTMLInputElement selectionStart/selectionEnd. */
  readonly selection: MaskTextSelection | null;
}

export interface MaskAdapterResult {
  /** Exact bounded text rendered in the native input. */
  readonly formattedValue: string;
  /** Canonical literal-free value available for callbacks and raw serialization. */
  readonly rawValue: string;
  /** Adapter-owned caret mapping after literals or normalization are applied. */
  readonly selection: MaskTextSelection | null;
  /** Empty, incomplete, invalid, or valid interpretation of the adapter output. */
  readonly status: MaskAdapterStatus;
}

/**
 * A synchronous deterministic adapter imported from trusted application code. Serialized masks,
 * dynamic expressions, regular-expression strings, and remote executable definitions are not a
 * supported input surface.
 */
export interface DeterministicMaskAdapter {
  /** Bounded lowercase identifier used in validation diagnostics. */
  readonly id: string;
  /** Synchronously formats, validates, and maps caret state for trusted input. */
  readonly apply: (input: string, context: MaskAdapterContext) => MaskAdapterResult;
}

export interface MaskedFieldValue {
  /** Exact bounded text currently rendered in the native input. */
  readonly formattedValue: string;
  /** Canonical literal-free value produced by the trusted adapter. */
  readonly rawValue: string;
  /** Adapter-owned caret mapping, or null when no mapping is required. */
  readonly selection: MaskTextSelection | null;
  /** Raw or formatted value chosen by the serialization prop. */
  readonly serializedValue: string;
  /** Adapter status, extended with composing while IME input remains provisional. */
  readonly status: MaskedFieldStatus;
}

export interface MaskedFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "name" | "onChange" | "type" | "value"
> {
  /** Trusted synchronous formatter, validator, and caret-mapping implementation. */
  readonly adapter: DeterministicMaskAdapter;
  /** Initial visible input passed through the adapter for uncontrolled use and form reset. */
  readonly defaultValue?: string;
  /** Additional class name applied to the visible editable input. */
  readonly inputClassName?: string;
  /** Boolean invalid fallback merged with adapter, ARIA, and Field state. */
  readonly invalid?: boolean;
  /** Localized native validation and visible recovery message for invalid input. */
  readonly invalidMessage?: string;
  /** Hard boundary applied before and after the trusted synchronous adapter. */
  readonly maxInputLength?: number;
  /** Name of the hidden raw or formatted form control. */
  readonly name?: string;
  /** Receives formatted, raw, serialized, selection, and adapter status updates. */
  readonly onValueChange?: (value: MaskedFieldValue) => void;
  /** Additional class name applied to the outer MaskedField wrapper. */
  readonly rootClassName?: string;
  /** Inline style applied to the outer MaskedField wrapper. */
  readonly rootStyle?: CSSProperties;
  /** Selects raw or formatted hidden form serialization; defaults to `raw`. */
  readonly serialization?: MaskSerialization;
  /** Controlled visible input. The adapter determines the rendered formatted value. */
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

function assertBoundedLength(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1 || value > 4096) {
    throw new RangeError(
      "Mergora MaskedField maxInputLength must be an integer from 1 through 4096.",
    );
  }
}

function assertSelection(selection: MaskTextSelection | null, value: string, label: string): void {
  if (selection === null) return;
  if (
    !Number.isSafeInteger(selection.start) ||
    !Number.isSafeInteger(selection.end) ||
    selection.start < 0 ||
    selection.end < selection.start ||
    selection.end > value.length
  ) {
    throw new RangeError(
      `Mergora MaskedField adapter returned an out-of-bounds ${label} selection.`,
    );
  }
}

function assertMaskedFieldProps(props: MaskedFieldProps): void {
  if (!isAdapterId(props.adapter.id)) {
    throw new RangeError(
      "Mergora MaskedField adapter.id must be a bounded lowercase identifier using letters, digits, dots, dashes, or underscores.",
    );
  }
  assertBoundedLength(props.maxInputLength ?? 256);
  if (props.name !== undefined && props.name.trim().length === 0) {
    throw new RangeError("Mergora MaskedField name must not be empty or whitespace-only.");
  }
}

export function applyDeterministicMaskAdapter(
  adapter: DeterministicMaskAdapter,
  input: string,
  context: MaskAdapterContext,
): MaskAdapterResult {
  if (!isAdapterId(adapter.id)) {
    throw new RangeError("Mergora MaskedField received an invalid adapter identifier.");
  }
  if (input.length > context.maxInputLength) {
    throw new RangeError(
      `Mergora MaskedField input exceeds the ${context.maxInputLength} character adapter boundary.`,
    );
  }
  assertSelection(context.selection, input, "input");
  const result = adapter.apply(input, context);
  if (
    result.formattedValue.length > context.maxInputLength ||
    result.rawValue.length > context.maxInputLength
  ) {
    throw new RangeError(
      `Mergora MaskedField adapter "${adapter.id}" produced an over-limit value.`,
    );
  }
  if (!(["empty", "incomplete", "invalid", "valid"] as const).includes(result.status)) {
    throw new TypeError(`Mergora MaskedField adapter "${adapter.id}" returned an invalid status.`);
  }
  assertSelection(result.selection, result.formattedValue, "output");
  if (context.selection !== null && result.formattedValue !== input && result.selection === null) {
    throw new TypeError(
      `Mergora MaskedField adapter "${adapter.id}" changed visible text without returning caret mapping.`,
    );
  }
  if (
    result.status === "empty" &&
    (result.formattedValue.length > 0 || result.rawValue.length > 0)
  ) {
    throw new TypeError(
      `Mergora MaskedField adapter "${adapter.id}" returned non-empty output with empty status.`,
    );
  }
  if (result.status === "invalid" && result.formattedValue !== input) {
    throw new TypeError(
      `Mergora MaskedField adapter "${adapter.id}" must preserve invalid visible input for recovery.`,
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

function selectionFromInput(input: HTMLInputElement): MaskTextSelection | null {
  if (input.selectionStart === null || input.selectionEnd === null) return null;
  return {
    direction: input.selectionDirection,
    end: input.selectionEnd,
    start: input.selectionStart,
  };
}

export const MaskedField = forwardRef<HTMLInputElement, MaskedFieldProps>(
  function MaskedField(props, forwardedRef) {
    assertMaskedFieldProps(props);
    const {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-labelledby": ariaLabelledBy,
      adapter,
      className,
      defaultValue = "",
      dir = "auto",
      disabled = false,
      form,
      id,
      inputClassName,
      invalid,
      invalidMessage: invalidMessageProp,
      maxInputLength = 256,
      name,
      onBlur,
      onCompositionEnd,
      onCompositionStart,
      onFocus,
      onInvalid,
      onValueChange,
      readOnly = false,
      required,
      rootClassName,
      rootStyle,
      serialization = "raw",
      value,
      ...nativeProps
    } = props;
    const field = useFieldControlState();
    const { locale } = useMergoraContext();
    const generatedId = useId().replaceAll(":", "");
    const inputRef = useRef<HTMLInputElement | null>(null);
    const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingSelection = useRef<{
      readonly formattedValue: string;
      readonly selection: MaskTextSelection;
    } | null>(null);
    const previousFormattedValue = useRef(defaultValue);
    const skipCompositionInput = useRef<string | null>(null);
    const controlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
    const [composing, setComposing] = useState(false);
    const [touched, setTouched] = useState(false);
    const currentInput = controlled ? value : uncontrolledValue;
    const resolvedId = field?.controlId ?? id ?? `mrg-masked-field-${generatedId}`;
    const validationId = `${resolvedId}-validation`;
    const resolvedRequired = required ?? field?.required;
    const invalidMessage = useMergoraMessage(
      "maskedField.invalid",
      invalidMessageProp ?? "Enter a complete value in the requested format.",
    );
    const adapterResult = useMemo<MaskAdapterResult>(
      () =>
        composing
          ? {
              formattedValue: currentInput,
              rawValue: currentInput,
              selection: null,
              status: currentInput.length === 0 ? "empty" : "incomplete",
            }
          : applyDeterministicMaskAdapter(adapter, currentInput, {
              locale,
              maxInputLength,
              phase: "render",
              previousFormattedValue: previousFormattedValue.current,
              selection: null,
            }),
      [adapter, composing, currentInput, locale, maxInputLength],
    );
    const serializedValue =
      serialization === "raw" ? adapterResult.rawValue : adapterResult.formattedValue;
    const fieldValue: MaskedFieldValue = {
      formattedValue: adapterResult.formattedValue,
      rawValue: adapterResult.rawValue,
      selection: adapterResult.selection,
      serializedValue,
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
        selection: MaskTextSelection | null,
        phase: Extract<MaskAdapterPhase, "composition-end" | "input">,
      ): MaskAdapterResult =>
        applyDeterministicMaskAdapter(adapter, input, {
          locale,
          maxInputLength,
          phase,
          previousFormattedValue: previousFormattedValue.current,
          selection,
        }),
      [adapter, locale, maxInputLength],
    );

    const commitInput = useCallback(
      (
        input: string,
        selection: MaskTextSelection | null,
        phase: Extract<MaskAdapterPhase, "composition-end" | "input">,
      ) => {
        const result = resolveInteractiveInput(input, selection, phase);
        if (!controlled) setUncontrolledValue(result.formattedValue);
        previousFormattedValue.current = result.formattedValue;
        if (result.selection !== null) {
          pendingSelection.current = {
            formattedValue: result.formattedValue,
            selection: result.selection,
          };
        }
        onValueChange?.({
          formattedValue: result.formattedValue,
          rawValue: result.rawValue,
          selection: result.selection,
          serializedValue: serialization === "raw" ? result.rawValue : result.formattedValue,
          status: result.status,
        });
      },
      [controlled, onValueChange, resolveInteractiveInput, serialization],
    );

    useEffect(() => {
      previousFormattedValue.current = adapterResult.formattedValue;
      const pending = pendingSelection.current;
      const input = inputRef.current;
      if (
        pending === null ||
        input === null ||
        input.value !== pending.formattedValue ||
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
    }, [adapterResult.formattedValue]);

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
      if (input === null || ownedForm === null || controlled) return;
      const handleReset = (event: Event) => {
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
        resetTimer.current = setTimeout(() => {
          if (event.defaultPrevented) return;
          setUncontrolledValue(defaultValue);
          pendingSelection.current = null;
          previousFormattedValue.current = defaultValue;
          setComposing(false);
          setTouched(false);
        }, 0);
      };
      ownedForm.addEventListener("reset", handleReset);
      return () => {
        ownedForm.removeEventListener("reset", handleReset);
        if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      };
    }, [controlled, defaultValue, form]);

    useEffect(() => {
      if (developmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
        console.warn(
          `Mergora MaskedField received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
        );
      }
    }, [field, id]);

    return (
      <span
        className={
          rootClassName === undefined ? "mrg-masked-field" : `mrg-masked-field ${rootClassName}`
        }
        data-adapter={adapter.id}
        data-disabled={disabled || undefined}
        data-invalid={resolvedInvalid || undefined}
        data-readonly={readOnly || undefined}
        data-serialization={serialization}
        data-slot="masked-field"
        data-status={fieldValue.status}
        style={rootStyle}
      >
        <span data-slot="masked-field-control">
          <input
            {...nativeProps}
            aria-describedby={describedBy}
            aria-errormessage={errorMessage}
            aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
            aria-labelledby={labelledBy}
            className={["mrg-masked-field-input", className, inputClassName]
              .filter((entry): entry is string => entry !== undefined && entry.length > 0)
              .join(" ")}
            data-slot="masked-field-input"
            dir={dir}
            disabled={disabled}
            form={form}
            id={resolvedId}
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
                  formattedValue: input,
                  rawValue: input,
                  selection: selectionFromInput(event.currentTarget),
                  serializedValue: input,
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
            type="text"
            value={fieldValue.formattedValue}
          />
        </span>
        {name === undefined ? null : (
          <input
            aria-hidden="true"
            data-slot="masked-field-serialized-input"
            disabled={disabled}
            form={form}
            name={name}
            readOnly
            tabIndex={-1}
            type="hidden"
            value={fieldValue.serializedValue}
          />
        )}
        {!adapterInvalid ? null : (
          <span data-slot="masked-field-validation" id={validationId}>
            {invalidMessage}
          </span>
        )}
      </span>
    );
  },
);

MaskedField.displayName = "MaskedField";
