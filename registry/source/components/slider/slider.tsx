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
  /** Non-empty localized text rendered at the associated domain position. */
  readonly label: string;
  /** Finite in-domain value aligned exactly to the configured step. */
  readonly value: number;
}

export type SliderIntelligentMarkStrategy = "even" | "meaningful";

export interface SliderIntelligentMarksOptions {
  /** Maximum number of visible marks, including both endpoints. */
  readonly maximumVisible?: number;
  /** Meaningful chooses a human-scale interval; even fills the available mark budget. */
  readonly strategy?: SliderIntelligentMarkStrategy;
}

export interface SliderDomain {
  /** Finite inclusive upper endpoint reachable by whole steps. */
  readonly maximum: number;
  /** Finite inclusive lower endpoint strictly below maximum. */
  readonly minimum: number;
  /** Positive finite discrete interval spanning the complete domain. */
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
  /** IDs of persistent error text associated with every slider thumb. */
  readonly "aria-errormessage"?: string | undefined;
  /** Class name applied to the visual slider root. */
  readonly className?: string;
  /** Keeps ordered thumbs from crossing; currently only `clamp` is supported. */
  readonly collisionBehavior?: "clamp";
  /** Initial value or values for uncontrolled use. */
  readonly defaultValue?: T;
  /** Disables every thumb and prevents native value changes. */
  readonly disabled?: boolean;
  /** Associates every hidden range input with an external form by ID. */
  readonly form?: string;
  /** Intl options used for output, marks, bubbles, and accessible values. */
  readonly formatOptions?: Intl.NumberFormatOptions;
  /** Derives bounded localized marks; false removes generation and permits independent manual marks. */
  readonly intelligentMarks?: false | SliderIntelligentMarksOptions;
  /** Marks every thumb invalid and merges enclosing Field error relationships. */
  readonly invalid?: boolean;
  /** Curated labelled positions; omitting them removes manual mark UI and semantics. */
  readonly marks?: readonly SliderMark[];
  /** Finite upper domain endpoint; defaults to 100. */
  readonly maxValue?: number;
  /** Finite lower domain endpoint; defaults to 0. */
  readonly minValue?: number;
  /** Distinct native form names corresponding one-to-one with the thumbs. */
  readonly names?: readonly string[];
  /** Receives each value change during interaction. */
  readonly onChange?: (value: T) => void;
  /** Receives the final value when an interaction ends. */
  readonly onChangeEnd?: (value: T) => void;
  /** Track direction; defaults to `horizontal`. */
  readonly orientation?: SliderOrientation;
  /** Keeps each thumb focusable and successful in forms while preventing user changes. */
  readonly readOnly?: boolean;
  /** Localized fallback announced by browsers that do not expose aria-readonly on native ranges. */
  readonly readOnlyMessage?: string;
  /** Renders localized thumb bubbles; false removes their visual output entirely. */
  readonly showValueBubbles?: boolean;
  /** Renders the localized aggregate output; false removes the output element entirely. */
  readonly showOutput?: boolean;
  /** Positive discrete interval that must exactly span the domain; defaults to 1. */
  readonly step?: number;
  /** Inline style applied to the visual slider root. */
  readonly style?: CSSProperties;
  /** Positive number of semantic thumbs rendered by the shared base. */
  readonly thumbCount: number;
  /** Optional accessible names corresponding one-to-one with the thumbs. */
  readonly thumbLabels?: readonly string[];
  /** Controlled value or values aligned to the configured domain and step. */
  readonly value?: T;
}

export interface SliderProps extends Omit<
  SliderBaseProps<number>,
  "collisionBehavior" | "defaultValue" | "names" | "thumbCount" | "thumbLabels" | "value"
> {
  /** Initial single-thumb value for uncontrolled use; defaults to the minimum. */
  readonly defaultValue?: number;
  /** Native form name assigned to the slider's hidden range input. */
  readonly name?: string;
  /** Accessible name for the single slider thumb. */
  readonly thumbLabel?: string;
  /** Controlled single-thumb value aligned to the configured domain and step. */
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

function assertMaximumVisible(value: number): void {
  if (!Number.isSafeInteger(value) || value < 2 || value > 12) {
    throw new RangeError(
      "Mergora Slider intelligentMarks.maximumVisible must be an integer from 2 through 12.",
    );
  }
}

function meaningfulStepInterval(target: number): number {
  if (target <= 1) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(target));
  for (const factor of [1, 2, 2.5, 5, 10]) {
    const candidate = Math.round(factor * magnitude);
    if (candidate >= target) return candidate;
  }
  return Math.ceil(target);
}

function valueAtStepIndex(index: number, totalSteps: number, domain: SliderDomain): number {
  if (index === 0) return domain.minimum;
  if (index === totalSteps) return domain.maximum;
  return Number((domain.minimum + domain.step * index).toPrecision(15));
}

/** Creates a small immutable mark set without changing the slider's canonical value model. */
export function deriveIntelligentSliderMarks(
  domain: SliderDomain,
  options: SliderIntelligentMarksOptions = {},
  locale = "en-US",
  formatOptions: Intl.NumberFormatOptions = {},
): readonly SliderMark[] {
  const maximumVisible = options.maximumVisible ?? 7;
  const strategy = options.strategy ?? "meaningful";
  assertMaximumVisible(maximumVisible);
  if (strategy !== "even" && strategy !== "meaningful") {
    throw new RangeError(
      'Mergora Slider intelligentMarks.strategy must be "meaningful" or "even".',
    );
  }
  const totalSteps = Math.round((domain.maximum - domain.minimum) / domain.step);
  const markCount = Math.min(maximumVisible, totalSteps + 1);
  const indices = new Set<number>([0, totalSteps]);
  if (strategy === "even") {
    for (let index = 1; index < markCount - 1; index += 1) {
      indices.add(Math.round((index * totalSteps) / (markCount - 1)));
    }
  } else {
    const interval = meaningfulStepInterval(totalSteps / Math.max(1, maximumVisible - 1));
    for (let index = interval; index < totalSteps; index += interval) indices.add(index);
  }
  const formatter = new Intl.NumberFormat(locale, formatOptions);
  return [...indices]
    .sort((a, b) => a - b)
    .map((index) => {
      const value = valueAtStepIndex(index, totalSteps, domain);
      return { label: formatter.format(value), value };
    });
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
    intelligentMarks = false,
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
    showValueBubbles = false,
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
  if (intelligentMarks !== false && marks !== undefined) {
    throw new RangeError(
      "Mergora Slider cannot combine intelligentMarks with manual marks; set intelligentMarks to false to use marks.",
    );
  }
  const intelligentMarkOptions = intelligentMarks === false ? undefined : intelligentMarks;
  const normalizedMarks =
    intelligentMarkOptions === undefined
      ? normalizeSliderMarks(marks, domain)
      : deriveIntelligentSliderMarks(domain, intelligentMarkOptions, locale, formatOptions);
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
      data-intelligent-marks={
        intelligentMarkOptions?.strategy ?? (intelligentMarks ? "meaningful" : undefined)
      }
      data-orientation={orientation}
      data-readonly={readOnly || undefined}
      data-show-value-bubbles={showValueBubbles || undefined}
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
                  data-thumb-edge={
                    index === 0 ? "minimum" : index === thumbCount - 1 ? "maximum" : "intermediate"
                  }
                  data-thumb-index={index}
                  data-slot="slider-thumb"
                  inputRef={thumbInputRefs[index]!}
                  index={index}
                  isInvalid={resolvedInvalid}
                  key={index}
                >
                  {!showValueBubbles
                    ? null
                    : ({ state }) => (
                        <span
                          aria-hidden="true"
                          className="mrg-slider-value-bubble"
                          data-slot="slider-value-bubble"
                        >
                          {state.getThumbValueLabel(index)}
                        </span>
                      )}
                </AriaSliderThumb>
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
