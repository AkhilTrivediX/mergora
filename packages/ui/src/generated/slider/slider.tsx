// Generated from registry/source/components/slider/slider.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import {
  Slider as AriaSlider,
  SliderFill as AriaSliderFill,
  SliderOutput as AriaSliderOutput,
  SliderThumb as AriaSliderThumb,
  SliderTrack as AriaSliderTrack,
  type SliderProps as AriaSliderProps,
} from "react-aria-components/Slider";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  createRef,
  forwardRef,
  useEffect,
  useMemo,
  useRef,
  useId,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type Ref,
  type RefAttributes,
  type TouchEvent as ReactTouchEvent,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./slider.css";

export type SliderOrientation = "horizontal" | "vertical";

export interface SliderMark {
  readonly label: string;
  readonly value: number;
}

export interface SliderDomain {
  readonly maximum: number;
  readonly minimum: number;
  readonly step: number;
}

export interface SliderBaseProps<T extends number | number[]> extends Omit<
  AriaSliderProps<T>,
  | "children"
  | "className"
  | "defaultValue"
  | "formatOptions"
  | "isDisabled"
  | "maxValue"
  | "minValue"
  | "onChange"
  | "onChangeEnd"
  | "orientation"
  | "style"
  | "value"
> {
  readonly "aria-errormessage"?: string | undefined;
  readonly className?: string;
  readonly collisionBehavior?: "clamp";
  readonly defaultValue?: T;
  readonly disabled?: boolean;
  readonly form?: string;
  readonly formatOptions?: Intl.NumberFormatOptions;
  readonly invalid?: boolean;
  readonly marks?: readonly SliderMark[];
  readonly maxValue?: number;
  readonly minValue?: number;
  readonly names?: readonly string[];
  readonly onChange?: (value: T) => void;
  readonly onChangeEnd?: (value: T) => void;
  readonly orientation?: SliderOrientation;
  /** Keeps each thumb focusable and successful in forms while preventing user changes. */
  readonly readOnly?: boolean;
  /** Localized fallback announced by browsers that do not expose aria-readonly on native ranges. */
  readonly readOnlyMessage?: string;
  readonly showOutput?: boolean;
  readonly step?: number;
  readonly style?: CSSProperties;
  readonly thumbCount: number;
  readonly thumbLabels?: readonly string[];
  readonly value?: T;
}

export interface SliderProps extends Omit<
  SliderBaseProps<number>,
  "collisionBehavior" | "defaultValue" | "names" | "thumbCount" | "thumbLabels" | "value"
> {
  readonly defaultValue?: number;
  readonly name?: string;
  readonly thumbLabel?: string;
  readonly value?: number;
}

const VALUE_KEYS = new Set([
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
]);

function nonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined && value.trim().length === 0) {
    throw new RangeError(`Mergora Slider ${label} must not be empty or whitespace-only.`);
  }
}

export function resolveSliderDomain(minimum = 0, maximum = 100, step = 1): SliderDomain {
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    throw new RangeError("Mergora Slider minimum and maximum must be finite numbers.");
  }
  if (minimum >= maximum) {
    throw new RangeError("Mergora Slider minimum must be less than its maximum.");
  }
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("Mergora Slider step must be a finite number above zero.");
  }
  const steps = (maximum - minimum) / step;
  if (Math.abs(steps - Math.round(steps)) > 1e-8 * Math.max(1, Math.abs(steps))) {
    throw new RangeError(
      "Mergora Slider maximum must be reachable from its minimum using whole steps.",
    );
  }
  return { maximum, minimum, step };
}

export function sliderValueIsAligned(value: number, domain: SliderDomain): boolean {
  if (!Number.isFinite(value) || value < domain.minimum || value > domain.maximum) return false;
  const steps = (value - domain.minimum) / domain.step;
  return Math.abs(steps - Math.round(steps)) <= 1e-8 * Math.max(1, Math.abs(steps));
}

export function sliderValueToPercent(value: number, domain: SliderDomain): number {
  if (!sliderValueIsAligned(value, domain)) {
    throw new RangeError("Mergora Slider values must be in range and aligned to its step.");
  }
  return ((value - domain.minimum) / (domain.maximum - domain.minimum)) * 100;
}

export function normalizeSliderMarks(
  marks: readonly SliderMark[] | undefined,
  domain: SliderDomain,
): readonly SliderMark[] {
  if (marks === undefined) return [];
  const seen = new Set<number>();
  return marks
    .map((mark) => {
      if (mark.label.trim().length === 0) {
        throw new RangeError("Mergora Slider mark labels must not be empty.");
      }
      if (!sliderValueIsAligned(mark.value, domain)) {
        throw new RangeError(
          `Mergora Slider mark ${String(mark.value)} must be in range and aligned to its step.`,
        );
      }
      if (seen.has(mark.value)) {
        throw new RangeError(`Mergora Slider mark ${String(mark.value)} is duplicated.`);
      }
      seen.add(mark.value);
      return { label: mark.label, value: mark.value };
    })
    .sort((a, b) => a.value - b.value);
}

export function assertSliderValues(values: readonly number[], domain: SliderDomain): void {
  for (const value of values) {
    if (!sliderValueIsAligned(value, domain)) {
      throw new RangeError(
        `Mergora Slider value ${String(value)} must be in range and aligned to its step.`,
      );
    }
  }
}

function preventPointerChange(
  event:
    | ReactMouseEvent<HTMLDivElement>
    | ReactPointerEvent<HTMLDivElement>
    | ReactTouchEvent<HTMLDivElement>,
): void {
  event.preventDefault();
  event.stopPropagation();
}

function preventKeyboardChange(event: ReactKeyboardEvent<HTMLDivElement>): void {
  if (!VALUE_KEYS.has(event.key)) return;
  event.preventDefault();
  event.stopPropagation();
}

function assertBaseProps<T extends number | number[]>(
  props: SliderBaseProps<T>,
  domain: SliderDomain,
): void {
  if (!Number.isSafeInteger(props.thumbCount) || props.thumbCount < 1) {
    throw new RangeError("Mergora Slider thumbCount must be a positive safe integer.");
  }
  if (props.value !== undefined && props.defaultValue !== undefined) {
    throw new RangeError("Mergora Slider cannot receive both value and defaultValue.");
  }
  const value = props.value ?? props.defaultValue;
  if (value !== undefined) {
    const values: readonly number[] = Array.isArray(value) ? value : [value as number];
    if (values.length !== props.thumbCount) {
      throw new RangeError("Mergora Slider value count must match thumbCount.");
    }
    assertSliderValues(values, domain);
  }
  if (props.thumbLabels !== undefined) {
    if (props.thumbLabels.length !== props.thumbCount) {
      throw new RangeError("Mergora Slider thumb label count must match thumbCount.");
    }
    const labels = props.thumbLabels.map((label) => label.trim().toLowerCase());
    if (labels.some((label) => label.length === 0) || new Set(labels).size !== labels.length) {
      throw new RangeError("Mergora Slider thumb labels must be non-empty and distinct.");
    }
  }
  if (props.names !== undefined) {
    if (props.names.length !== props.thumbCount) {
      throw new RangeError("Mergora Slider form name count must match thumbCount.");
    }
    const names = props.names.map((name) => name.trim());
    if (names.some((name) => name.length === 0) || new Set(names).size !== names.length) {
      throw new RangeError("Mergora Slider form names must be non-empty and distinct.");
    }
  }
  nonEmpty(props.form, "form");
}

function SliderBaseInner<T extends number | number[]>(
  props: SliderBaseProps<T>,
  ref: Ref<HTMLDivElement>,
): ReactElement {
  const {
    "aria-describedby": ariaDescribedBy,
    "aria-errormessage": ariaErrorMessage,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    className,
    collisionBehavior,
    defaultValue,
    disabled = false,
    form,
    formatOptions,
    id,
    invalid,
    marks,
    maxValue = 100,
    minValue = 0,
    names,
    onChange,
    onChangeEnd,
    orientation = "horizontal",
    readOnly = false,
    readOnlyMessage: readOnlyMessageProp,
    showOutput = true,
    step = 1,
    style,
    thumbCount,
    thumbLabels,
    value,
    ...ariaProps
  } = props;
  const field = useFieldControlState();
  const { locale } = useMergoraContext();
  const fallbackThumbLabel = useMergoraMessage("slider.value", "Value");
  const readOnlyMessage = useMergoraMessage(
    "slider.readOnly",
    readOnlyMessageProp ?? "Read-only: value cannot be changed.",
  );
  const readOnlyStatusId = `mrg-slider-readonly-${useId().replaceAll(":", "")}`;
  const domain = resolveSliderDomain(minValue, maxValue, step);
  assertBaseProps(props, domain);
  nonEmpty(readOnlyMessageProp, "readOnlyMessage");
  const normalizedMarks = normalizeSliderMarks(marks, domain);
  const resolvedInvalid = invalid ?? field?.invalid ?? false;
  const describedBy = mergeFieldIdRefs(
    ariaDescribedBy,
    field?.descriptionId,
    resolvedInvalid ? field?.errorMessageId : undefined,
    readOnly ? readOnlyStatusId : undefined,
  );
  const errorMessage = mergeFieldIdRefs(
    ariaErrorMessage,
    resolvedInvalid ? field?.errorMessageId : undefined,
  );
  const labelledBy = ariaLabelledBy ?? field?.labelId;
  const resolvedDefaultValue =
    defaultValue ?? ((thumbCount === 1 ? domain.minimum : undefined) as T | undefined);
  const valueProps =
    value === undefined
      ? resolvedDefaultValue === undefined
        ? {}
        : { defaultValue: resolvedDefaultValue }
      : { value: value };
  const rootClassName = ["mrg-slider", thumbCount > 1 ? "mrg-range-slider" : null, className]
    .filter((item): item is string => item !== null && item !== undefined && item !== "")
    .join(" ");
  const thumbInputRefs = useMemo(
    () => Array.from({ length: thumbCount }, () => createRef<HTMLInputElement>()),
    [thumbCount],
  );
  const originalInputIds = useRef(new WeakMap<HTMLInputElement, string>());

  useEffect(() => {
    const resolvedInputId = field?.controlId ?? id;
    for (const [index, inputRef] of thumbInputRefs.entries()) {
      const input = inputRef.current;
      if (input === null) continue;
      if (!originalInputIds.current.has(input)) originalInputIds.current.set(input, input.id);
      if (index === 0)
        input.id = resolvedInputId ?? originalInputIds.current.get(input) ?? input.id;
      if (readOnly) input.setAttribute("aria-readonly", "true");
      else input.removeAttribute("aria-readonly");

      const explicitThumbLabel = thumbLabels?.[index];
      if (explicitThumbLabel !== undefined) {
        input.setAttribute("aria-label", explicitThumbLabel);
        input.removeAttribute("aria-labelledby");
      } else if (labelledBy !== undefined) {
        input.setAttribute("aria-labelledby", labelledBy);
        input.removeAttribute("aria-label");
      } else {
        input.setAttribute("aria-label", ariaLabel ?? fallbackThumbLabel);
        input.removeAttribute("aria-labelledby");
      }
      if (describedBy === undefined) input.removeAttribute("aria-describedby");
      else input.setAttribute("aria-describedby", describedBy);
      if (errorMessage === undefined) input.removeAttribute("aria-errormessage");
      else input.setAttribute("aria-errormessage", errorMessage);
    }
    const inputs = thumbInputRefs.flatMap((inputRef) =>
      inputRef.current === null ? [] : [inputRef.current],
    );
    const root = inputs[0]?.closest('[data-slot="slider"], [data-slot="range-slider"]');
    const output = root?.querySelector('[data-slot="slider-output"]');
    if (output !== null && output !== undefined) {
      output.setAttribute("for", inputs.map((input) => input.id).join(" "));
    }
  });

  return (
    <div
      className={rootClassName}
      data-collision-behavior={collisionBehavior}
      data-disabled={disabled || undefined}
      data-has-marks={normalizedMarks.length > 0 || undefined}
      data-invalid={resolvedInvalid || undefined}
      data-orientation={orientation}
      data-readonly={readOnly || undefined}
      data-slot={thumbCount > 1 ? "range-slider" : "slider"}
      onKeyDownCapture={readOnly ? preventKeyboardChange : undefined}
      onMouseDownCapture={readOnly ? preventPointerChange : undefined}
      onPointerDownCapture={readOnly ? preventPointerChange : undefined}
      onTouchStartCapture={readOnly ? preventPointerChange : undefined}
      ref={ref}
      style={style}
    >
      {!readOnly ? null : (
        <span
          className="mrg-slider-visually-hidden"
          data-slot="slider-readonly-status"
          id={readOnlyStatusId}
        >
          {readOnlyMessage}
        </span>
      )}
      <AriaI18nProvider locale={locale}>
        <AriaSlider
          {...ariaProps}
          {...valueProps}
          {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
          {...(errorMessage === undefined ? {} : { "aria-errormessage": errorMessage })}
          {...(ariaLabel === undefined ? {} : { "aria-label": ariaLabel })}
          {...(labelledBy === undefined ? {} : { "aria-labelledby": labelledBy })}
          {...(formatOptions === undefined ? {} : { formatOptions })}
          {...(onChange === undefined ? {} : { onChange })}
          {...(onChangeEnd === undefined ? {} : { onChangeEnd })}
          className="mrg-slider-control"
          isDisabled={disabled}
          maxValue={domain.maximum}
          minValue={domain.minimum}
          orientation={orientation}
          step={domain.step}
        >
          {!showOutput ? null : (
            <AriaSliderOutput className="mrg-slider-output" data-slot="slider-output" />
          )}
          <AriaSliderTrack className="mrg-slider-track" data-slot="slider-track">
            <div aria-hidden="true" className="mrg-slider-rail" data-slot="slider-rail">
              <AriaSliderFill className="mrg-slider-fill" data-slot="slider-fill" />
            </div>
            {Array.from({ length: thumbCount }, (_, index) => {
              const explicitLabel = thumbLabels?.[index];
              const thumbLabelledBy = explicitLabel === undefined ? labelledBy : undefined;
              const resolvedThumbLabel =
                explicitLabel ??
                (thumbLabelledBy === undefined ? (ariaLabel ?? fallbackThumbLabel) : undefined);
              return (
                <AriaSliderThumb
                  {...(describedBy === undefined ? {} : { "aria-describedby": describedBy })}
                  {...(errorMessage === undefined ? {} : { "aria-errormessage": errorMessage })}
                  {...(resolvedThumbLabel === undefined
                    ? {}
                    : { "aria-label": resolvedThumbLabel })}
                  {...(thumbLabelledBy === undefined ? {} : { "aria-labelledby": thumbLabelledBy })}
                  {...(readOnly ? { "aria-readonly": true as const } : {})}
                  {...(form === undefined ? {} : { form })}
                  {...(index === 0 && (field?.controlId ?? id) !== undefined
                    ? { id: field?.controlId ?? id }
                    : {})}
                  {...(names?.[index] === undefined ? {} : { name: names[index] })}
                  className="mrg-slider-thumb"
                  data-slot="slider-thumb"
                  inputRef={thumbInputRefs[index]!}
                  index={index}
                  isInvalid={resolvedInvalid}
                  key={index}
                />
              );
            })}
            {normalizedMarks.length === 0 ? null : (
              <div aria-hidden="true" className="mrg-slider-marks" data-slot="slider-marks">
                {normalizedMarks.map((mark) => {
                  const position = sliderValueToPercent(mark.value, domain);
                  const markStyle = {
                    "--mrg-slider-mark-position": `${String(position)}%`,
                  } as CSSProperties;
                  return (
                    <span
                      className="mrg-slider-mark"
                      data-edge={
                        mark.value === domain.minimum
                          ? "minimum"
                          : mark.value === domain.maximum
                            ? "maximum"
                            : undefined
                      }
                      data-slot="slider-mark"
                      key={mark.value}
                      style={markStyle}
                    >
                      <span className="mrg-slider-mark-tick" />
                      <span className="mrg-slider-mark-label">{mark.label}</span>
                    </span>
                  );
                })}
              </div>
            )}
          </AriaSliderTrack>
        </AriaSlider>
      </AriaI18nProvider>
    </div>
  );
}

export const SliderBase = forwardRef(SliderBaseInner) as <T extends number | number[]>(
  props: SliderBaseProps<T> & RefAttributes<HTMLDivElement>,
) => ReactElement;

export const Slider = forwardRef<HTMLDivElement, SliderProps>(function Slider(props, ref) {
  const {
    defaultValue,
    maxValue = 100,
    minValue = 0,
    name,
    thumbLabel,
    value,
    ...baseProps
  } = props;
  nonEmpty(name, "name");
  nonEmpty(thumbLabel, "thumbLabel");
  if (value !== undefined && defaultValue !== undefined) {
    throw new RangeError("Mergora Slider cannot receive both value and defaultValue.");
  }
  const valueProps = value === undefined ? { defaultValue: defaultValue ?? minValue } : { value };
  const nameProps = name === undefined ? {} : { names: [name] };
  const labelProps = thumbLabel === undefined ? {} : { thumbLabels: [thumbLabel] };
  return (
    <SliderBase<number>
      {...baseProps}
      {...valueProps}
      {...nameProps}
      {...labelProps}
      maxValue={maxValue}
      minValue={minValue}
      ref={ref}
      thumbCount={1}
    />
  );
});

Slider.displayName = "Slider";
