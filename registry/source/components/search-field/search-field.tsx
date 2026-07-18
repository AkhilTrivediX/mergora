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
import "./search-field.css";

export type SearchFieldStatus =
  | { readonly state: "idle" }
  | { readonly message: string; readonly state: "loading" | "results" | "empty" | "error" };

export interface SearchFieldProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "defaultValue" | "onChange" | "type" | "value"
> {
  readonly clearLabel?: string;
  readonly defaultValue?: string;
  readonly inputClassName?: string;
  readonly invalid?: boolean;
  readonly onChange?: (value: string) => void;
  readonly resultsId?: string;
  readonly rootClassName?: string;
  readonly rootStyle?: CSSProperties;
  readonly status?: SearchFieldStatus;
  readonly submitLabel?: string;
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

function developmentRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  const runtime = globalThis as typeof globalThis & {
    readonly process?: { readonly env?: { readonly NODE_ENV?: string } };
  };
  return viteProduction !== true && runtime.process?.env?.NODE_ENV !== "production";
}

export const SearchField = forwardRef<HTMLInputElement, SearchFieldProps>(function SearchField(
  {
    "aria-busy": ariaBusy,
    "aria-controls": ariaControls,
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-invalid": ariaInvalid,
    "aria-labelledby": ariaLabelledBy,
    className,
    clearLabel: clearLabelProp,
    defaultValue = "",
    disabled = false,
    id,
    inputClassName,
    invalid,
    onChange,
    onCompositionEnd,
    onCompositionStart,
    readOnly = false,
    required,
    resultsId,
    rootClassName,
    rootStyle,
    status = { state: "idle" },
    submitLabel,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const field = useFieldControlState();
  const generatedId = useId().replaceAll(":", "");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controlled = value !== undefined;
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue);
  const [composing, setComposing] = useState(false);
  const currentValue = controlled ? value : uncontrolledValue;
  const resolvedId = field?.controlId ?? id ?? `mrg-search-field-${generatedId}`;
  const statusId = `${resolvedId}-search-status`;
  const resolvedInvalid =
    status.state === "error" ||
    (ariaInvalid !== undefined
      ? isSemanticallyInvalid(ariaInvalid)
      : invalid !== undefined
        ? invalid
        : (field?.invalid ?? false));
  const resolvedRequired = required ?? field?.required;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    status.state === "idle" ? undefined : statusId,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
    status.state === "error" ? statusId : undefined,
  );
  const controls = mergeFieldIdRefs(ariaControls, resultsId);
  const labelledBy = ariaLabelledBy ?? field?.labelId;
  const clearLabel = useMergoraMessage("searchField.clear", clearLabelProp ?? "Clear search");
  const busy = status.state === "loading" || ariaBusy === true || ariaBusy === "true";

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
        setComposing(false);
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
        `Mergora SearchField received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
      );
    }
  }, [field, id]);

  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    const nextValue = event.currentTarget.value;
    if (!controlled) setUncontrolledValue(nextValue);
    onChange?.(nextValue);
  };
  const clear = (): void => {
    if (disabled || readOnly || composing || currentValue.length === 0) return;
    if (!controlled && inputRef.current !== null) {
      inputRef.current.value = "";
      setUncontrolledValue("");
    }
    onChange?.("");
    inputRef.current?.focus({ preventScroll: true });
  };

  return (
    <span
      aria-busy={busy || undefined}
      className={
        rootClassName === undefined ? "mrg-search-field" : `mrg-search-field ${rootClassName}`
      }
      data-disabled={disabled || undefined}
      data-empty={currentValue.length === 0 || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-readonly={readOnly || undefined}
      data-slot="search-field"
      data-status={status.state}
      style={rootStyle}
    >
      <span className={className} data-slot="search-field-control">
        <input
          {...nativeProps}
          aria-busy={ariaBusy}
          aria-controls={controls}
          aria-describedby={describedBy}
          aria-errormessage={errorMessage}
          aria-invalid={
            status.state === "error" ? true : (ariaInvalid ?? (resolvedInvalid || undefined))
          }
          aria-labelledby={labelledBy}
          className={
            inputClassName === undefined
              ? "mrg-search-field-input"
              : `mrg-search-field-input ${inputClassName}`
          }
          defaultValue={controlled ? undefined : defaultValue}
          disabled={disabled}
          id={resolvedId}
          onChange={handleChange}
          onCompositionEnd={(event: CompositionEvent<HTMLInputElement>) => {
            setComposing(false);
            onCompositionEnd?.(event);
          }}
          onCompositionStart={(event: CompositionEvent<HTMLInputElement>) => {
            setComposing(true);
            onCompositionStart?.(event);
          }}
          readOnly={readOnly}
          ref={setInputRef}
          required={resolvedRequired}
          type="search"
          value={controlled ? value : undefined}
        />
        <button
          aria-controls={resolvedId}
          aria-label={clearLabel}
          className="mrg-search-field-clear"
          data-slot="search-field-clear"
          disabled={disabled || readOnly || composing || currentValue.length === 0}
          onClick={clear}
          type="button"
        >
          <span aria-hidden="true">×</span>
        </button>
        {submitLabel === undefined ? null : (
          <button
            className="mrg-search-field-submit"
            data-slot="search-field-submit"
            disabled={disabled || composing}
            type="submit"
          >
            {submitLabel}
          </button>
        )}
      </span>
      {status.state === "idle" ? null : (
        <span
          aria-atomic="true"
          aria-live={status.state === "error" ? "assertive" : "polite"}
          data-slot="search-field-status"
          data-status={status.state}
          id={statusId}
          role={status.state === "error" ? "alert" : "status"}
        >
          {status.message}
        </span>
      )}
    </span>
  );
});

SearchField.displayName = "SearchField";
