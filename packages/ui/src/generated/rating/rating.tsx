// Generated from registry/source/components/rating/rating.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  forwardRef,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type AriaAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from "react";

import { mergeFieldIdRefs } from "../field/index.js";
import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./rating.css";

export type RatingValue = number | null;

export interface RatingLabelContext {
  /** Active provider locale for consumer-owned localized formatting. */
  readonly locale: string;
  /** Configured highest selectable rating. */
  readonly maximum: number;
  /** Rating option or committed value currently being labelled. */
  readonly value: number;
}

export interface RatingProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  "children" | "defaultValue" | "onChange"
> {
  /** Adds an explicit no-rating radio; false removes that option and cannot combine with required. */
  readonly allowClear?: boolean;
  /** Localized label for the optional no-rating choice and empty read-only value. */
  readonly clearLabel?: string;
  /** Initial rating for uncontrolled use and native form reset. */
  readonly defaultValue?: RatingValue;
  /** Optional persistent guidance associated with every rating option. */
  readonly description?: ReactNode;
  /** Disables every radio option and successful read-only hidden control. */
  readonly disabled?: boolean;
  /** Optional persistent error content associated with every rating option. */
  readonly error?: ReactNode;
  /** Native form owner id applied to rating radios or the read-only hidden input. */
  readonly form?: string;
  /** Returns a bounded localized accessible label for an editable rating option. */
  readonly formatOptionLabel?: (context: RatingLabelContext) => string;
  /** Returns bounded localized text for the committed read-only rating value. */
  readonly formatValueLabel?: (context: RatingLabelContext) => string;
  /** Applies invalid styling and aria-invalid alongside visible error content. */
  readonly invalid?: boolean;
  /** Persistent visible fieldset legend or read-only rating label. */
  readonly label: ReactNode;
  /** Number of whole editable options from one through ten; defaults to five. */
  readonly maximum?: number;
  /** Required native form field name used by radios and read-only serialization. */
  readonly name: string;
  /** Reports the next selected rating or null from the optional clear choice. */
  readonly onValueChange?: (value: RatingValue) => void;
  /** Replaces interactive radios with static stars, value text, and hidden serialization. */
  readonly readOnly?: boolean;
  /** Localized visible context identifying the static read-only presentation. */
  readonly readOnlyLabel?: string;
  /** Requires one numbered radio and disallows the optional no-rating choice. */
  readonly required?: boolean;
  /** Localized visible marker appended to the legend when required. */
  readonly requiredLabel?: string;
  /** Controlled rating; user selections are proposed through onValueChange. */
  readonly value?: RatingValue;
}

interface ProcessLike {
  /** Optional runtime environment used only to gate development diagnostics. */
  readonly env?: { readonly NODE_ENV?: string };
}

function isDevelopmentRuntime(): boolean {
  const viteProduction = (
    import.meta as ImportMeta & { readonly env?: { readonly PROD?: boolean } }
  ).env?.PROD;
  const runtime = globalThis as typeof globalThis & { readonly process?: ProcessLike };
  return viteProduction !== true && runtime.process?.env?.NODE_ENV !== "production";
}

function hasAccessibleContent(value: ReactNode): boolean {
  if (value === null || value === undefined || typeof value === "boolean") return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.some(hasAccessibleContent);
  if (isValidElement<{ readonly children?: ReactNode }>(value)) {
    return typeof value.type === "string" ? hasAccessibleContent(value.props.children) : true;
  }
  return true;
}

function isSemanticallyInvalid(value: AriaAttributes["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null): void {
  if (typeof ref === "function") ref(value);
  else if (ref !== null && ref !== undefined) ref.current = value;
}

const MAX_RATING_LABEL_CODE_POINTS = 256;

function assertRatingLabel(value: unknown, source: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new RangeError(`Mergora Rating ${source} must return non-empty text.`);
  }
  if (Array.from(value).length > MAX_RATING_LABEL_CODE_POINTS) {
    throw new RangeError(
      `Mergora Rating ${source} must not exceed ${MAX_RATING_LABEL_CODE_POINTS} Unicode code points.`,
    );
  }
  return value;
}

export function assertRatingMaximum(maximum: number): number {
  if (!Number.isInteger(maximum) || maximum < 1 || maximum > 10) {
    throw new RangeError("Mergora Rating maximum must be an integer from 1 through 10.");
  }
  return maximum;
}

export function assertRatingValue(
  value: RatingValue,
  maximum: number,
  options: {
    /** Allows fractional and zero values only for the static read-only presentation. */
    readonly readOnly: boolean;
  },
): RatingValue {
  if (value === null) return value;
  if (!Number.isFinite(value) || value < 0 || value > maximum) {
    throw new RangeError(`Mergora Rating value must be between 0 and ${maximum}.`);
  }
  if (!options.readOnly && (!Number.isInteger(value) || value === 0)) {
    throw new RangeError(
      "Mergora editable Rating values must be whole numbers starting at 1; use null for no rating.",
    );
  }
  return value;
}

export function ratingFillForPosition(value: RatingValue, position: number): number {
  if (value === null) return 0;
  return Math.max(0, Math.min(1, value - (position - 1)));
}

export function resolveRatingKeyboardIndex(input: {
  /** Zero-based index of the currently focused enabled radio. */
  readonly current: number;
  /** Logical direction used to mirror horizontal arrow navigation. */
  readonly direction: "ltr" | "rtl";
  /** Positive number of enabled radios participating in movement. */
  readonly itemCount: number;
  /** Keyboard key considered for Home, End, or directional movement. */
  readonly key: string;
}): number | null {
  const { current, direction, itemCount, key } = input;
  if (current < 0 || itemCount < 1) return null;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  let delta = 0;
  if (key === "ArrowDown") delta = 1;
  else if (key === "ArrowUp") delta = -1;
  else if (key === "ArrowRight") delta = direction === "rtl" ? -1 : 1;
  else if (key === "ArrowLeft") delta = direction === "rtl" ? 1 : -1;
  return delta === 0 ? null : (current + delta + itemCount) % itemCount;
}

export const Rating = forwardRef<HTMLDivElement, RatingProps>(function Rating(
  {
    "aria-describedby": ariaDescribedBy,
    "aria-invalid": ariaInvalid,
    allowClear = false,
    className,
    clearLabel: clearLabelProp,
    defaultValue,
    description,
    dir,
    disabled = false,
    error,
    form,
    formatOptionLabel,
    formatValueLabel,
    invalid = false,
    label,
    maximum: maximumProp = 5,
    name,
    onValueChange,
    readOnly = false,
    readOnlyLabel: readOnlyLabelProp,
    required = false,
    requiredLabel: requiredLabelProp,
    value,
    ...nativeProps
  },
  forwardedRef,
) {
  const maximum = assertRatingMaximum(maximumProp);
  if (name.trim().length === 0) {
    throw new RangeError("Mergora Rating name must not be empty or whitespace-only.");
  }
  if (value !== undefined && defaultValue !== undefined) {
    throw new RangeError("Mergora Rating cannot receive both value and defaultValue.");
  }
  if (required && allowClear) {
    throw new RangeError(
      "Mergora Rating cannot combine required with allowClear because a no-rating radio would satisfy native required validation.",
    );
  }
  const controlled = value !== undefined;
  const initialValue = assertRatingValue(defaultValue ?? null, maximum, { readOnly });
  const [uncontrolledValue, setUncontrolledValue] = useState<RatingValue>(initialValue);
  const [, forceControlledResetRender] = useState(0);
  const currentValue = assertRatingValue(controlled ? value : uncontrolledValue, maximum, {
    readOnly,
  });
  const context = useMergoraContext();
  const resolvedDirection = dir === "rtl" || dir === "ltr" ? dir : context.direction;
  const numberFormatter = new Intl.NumberFormat(context.locale, { maximumFractionDigits: 2 });
  const generatedId = useId().replaceAll(":", "");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const labelId = `mrg-rating-${generatedId}-label`;
  const descriptionId = hasAccessibleContent(description)
    ? `mrg-rating-${generatedId}-description`
    : undefined;
  const errorId = hasAccessibleContent(error) ? `mrg-rating-${generatedId}-error` : undefined;
  const resolvedInvalid = invalid || isSemanticallyInvalid(ariaInvalid) || errorId !== undefined;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    descriptionId,
    resolvedInvalid ? errorId : undefined,
  );
  const clearLabel = assertRatingLabel(
    useMergoraMessage("rating.clear", clearLabelProp ?? "No rating"),
    "clear label",
  );
  const readOnlyLabel = assertRatingLabel(
    useMergoraMessage("rating.readOnly", readOnlyLabelProp ?? "Read only"),
    "read-only label",
  );
  const requiredLabel = assertRatingLabel(
    useMergoraMessage("rating.required", requiredLabelProp ?? "Required"),
    "required label",
  );

  useEffect(() => {
    if (!isDevelopmentRuntime()) return;
    if (!hasAccessibleContent(label)) {
      console.warn("Mergora Rating requires a non-empty visible label.");
    }
  }, [label]);

  useEffect(() => {
    const formElement = firstInputRef.current?.form;
    if (formElement === null || formElement === undefined) return;
    const handleReset = (event: Event) => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
      resetTimer.current = setTimeout(() => {
        if (event.defaultPrevented) return;
        if (controlled) forceControlledResetRender((version) => version + 1);
        else setUncontrolledValue(initialValue);
      }, 0);
    };
    formElement.addEventListener("reset", handleReset);
    return () => {
      formElement.removeEventListener("reset", handleReset);
      if (resetTimer.current !== null) clearTimeout(resetTimer.current);
    };
  }, [controlled, form, initialValue]);

  const setRootRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      assignRef(forwardedRef, node);
    },
    [forwardedRef],
  );
  const select = (nextValue: RatingValue): void => {
    if (disabled || readOnly || Object.is(nextValue, currentValue)) return;
    if (!controlled) setUncontrolledValue(nextValue);
    onValueChange?.(nextValue);
  };
  const handleChange = (event: ChangeEvent<HTMLInputElement>): void => {
    select(event.currentTarget.value.length === 0 ? null : Number(event.currentTarget.value));
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.defaultPrevented || !(event.target instanceof HTMLInputElement)) return;
    const inputs = [
      ...event.currentTarget.querySelectorAll<HTMLInputElement>(
        '[data-slot="rating-input"]:not(:disabled)',
      ),
    ];
    const nextIndex = resolveRatingKeyboardIndex({
      current: inputs.indexOf(event.target),
      direction: resolvedDirection,
      itemCount: inputs.length,
      key: event.key,
    });
    if (nextIndex === null) return;
    const nextInput = inputs[nextIndex];
    if (nextInput === undefined) return;
    event.preventDefault();
    nextInput.focus();
    nextInput.click();
  };
  const resolveOptionLabel = (optionValue: number): string => {
    const labelContext = { locale: context.locale, maximum, value: optionValue } as const;
    const resolvedLabel =
      formatOptionLabel === undefined
        ? context.getMessage(
            "rating.option",
            ({ values }) => `${String(values.value)} out of ${String(values.maximum)}`,
            {
              maximum: numberFormatter.format(maximum),
              value: numberFormatter.format(optionValue),
            },
          )
        : formatOptionLabel(labelContext);
    return assertRatingLabel(
      resolvedLabel,
      formatOptionLabel === undefined ? "option message" : "formatOptionLabel",
    );
  };
  const resolveValueLabel = (ratingValue: number): string => {
    const labelContext = { locale: context.locale, maximum, value: ratingValue } as const;
    const resolvedLabel =
      formatValueLabel === undefined
        ? context.getMessage(
            "rating.value",
            ({ values }) => `${String(values.value)} out of ${String(values.maximum)}`,
            {
              maximum: numberFormatter.format(maximum),
              value: numberFormatter.format(ratingValue),
            },
          )
        : formatValueLabel(labelContext);
    return assertRatingLabel(
      resolvedLabel,
      formatValueLabel === undefined ? "value message" : "formatValueLabel",
    );
  };
  const options = Array.from({ length: maximum }, (_, index) => index + 1);

  return (
    <div
      {...nativeProps}
      aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
      className={className === undefined ? "mrg-rating" : `mrg-rating ${className}`}
      data-disabled={disabled || undefined}
      data-empty={currentValue === null || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-readonly={readOnly || undefined}
      data-slot="rating"
      dir={resolvedDirection}
      ref={setRootRef}
    >
      {readOnly ? (
        <div aria-describedby={describedBy} data-slot="rating-readonly">
          <span data-slot="rating-label" id={labelId}>
            {label}
          </span>
          <span data-slot="rating-readonly-state">{readOnlyLabel}</span>
          {currentValue === null ? (
            <span data-slot="rating-readonly-value">{clearLabel}</span>
          ) : (
            <>
              <span aria-hidden="true" data-slot="rating-readonly-stars">
                {options.map((position) => {
                  const fill = ratingFillForPosition(currentValue, position);
                  return (
                    <span
                      data-fill={fill === 1 ? "full" : fill === 0 ? "empty" : "partial"}
                      data-slot="rating-readonly-star"
                      key={position}
                    >
                      <span data-slot="rating-star-empty">☆</span>
                      <span data-slot="rating-star-fill" style={{ inlineSize: `${fill * 100}%` }}>
                        <span>★</span>
                      </span>
                    </span>
                  );
                })}
              </span>
              <span data-slot="rating-readonly-value">{resolveValueLabel(currentValue)}</span>
            </>
          )}
          {name.length > 0 && currentValue !== null ? (
            <input
              data-slot="rating-hidden-input"
              disabled={disabled}
              form={form}
              name={name}
              readOnly
              type="hidden"
              value={String(currentValue)}
            />
          ) : null}
        </div>
      ) : (
        <fieldset
          aria-describedby={describedBy}
          aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
          data-slot="rating-fieldset"
          disabled={disabled}
          form={form}
        >
          <legend data-slot="rating-label" id={labelId}>
            {label}
            {required ? <span data-slot="rating-required">{requiredLabel}</span> : null}
          </legend>
          <div data-slot="rating-options" onKeyDown={handleKeyDown}>
            {allowClear ? (
              <label data-selected={currentValue === null || undefined} data-slot="rating-clear">
                <input
                  aria-describedby={describedBy}
                  aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
                  checked={currentValue === null}
                  data-slot="rating-input"
                  disabled={disabled}
                  form={form}
                  name={name}
                  onChange={handleChange}
                  ref={firstInputRef}
                  type="radio"
                  value=""
                />
                <span data-slot="rating-clear-label">{clearLabel}</span>
                {currentValue === null ? (
                  <span aria-hidden="true" data-slot="rating-selected-mark">
                    ✓
                  </span>
                ) : null}
              </label>
            ) : null}
            {options.map((optionValue, index) => {
              const checked = currentValue === optionValue;
              const optionLabel = resolveOptionLabel(optionValue);
              return (
                <label
                  data-filled={
                    currentValue !== null && optionValue <= currentValue ? "true" : undefined
                  }
                  data-selected={checked || undefined}
                  data-slot="rating-option"
                  key={optionValue}
                >
                  <input
                    aria-describedby={describedBy}
                    aria-invalid={ariaInvalid ?? (resolvedInvalid || undefined)}
                    aria-label={optionLabel}
                    checked={checked}
                    data-slot="rating-input"
                    disabled={disabled}
                    form={form}
                    name={name}
                    onChange={handleChange}
                    ref={!allowClear && index === 0 ? firstInputRef : undefined}
                    required={required}
                    type="radio"
                    value={optionValue}
                  />
                  <span aria-hidden="true" data-slot="rating-option-star">
                    {currentValue !== null && optionValue <= currentValue ? "★" : "☆"}
                  </span>
                  <span aria-hidden="true" data-slot="rating-option-number">
                    {numberFormatter.format(optionValue)}
                  </span>
                  {checked ? (
                    <span aria-hidden="true" data-slot="rating-selected-mark">
                      ✓
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        </fieldset>
      )}
      {descriptionId === undefined ? null : (
        <p data-slot="rating-description" id={descriptionId}>
          {description}
        </p>
      )}
      {errorId === undefined ? null : (
        <p data-slot="rating-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
});

Rating.displayName = "Rating";
