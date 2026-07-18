"use client";

import {
  Button as AriaButton,
  Group as AriaGroup,
  Input as AriaInput,
  NumberField as AriaNumberField,
  NumberFieldStateContext,
  type NumberFieldProps as AriaNumberFieldProps,
} from "react-aria-components/NumberField";
import { I18nProvider as AriaI18nProvider } from "react-aria-components/I18nProvider";
import {
  forwardRef,
  useContext,
  useEffect,
  useRef,
  type AriaAttributes,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type Ref,
} from "react";

import { mergeFieldIdRefs, useFieldControlState } from "../field/index.js";
import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
import "./number-field.css";

export type NumericFieldKind = "currency" | "number" | "percentage";

export interface NumberFieldProps extends Omit<
  AriaNumberFieldProps,
  | "children"
  | "className"
  | "decrementAriaLabel"
  | "formatOptions"
  | "id"
  | "incrementAriaLabel"
  | "isDisabled"
  | "isInvalid"
  | "isReadOnly"
  | "isRequired"
  | "style"
> {
  readonly "aria-errormessage"?: string | undefined;
  readonly "aria-invalid"?: AriaAttributes["aria-invalid"];
  /** Enables value changes from a focused input's wheel event. Disabled by default. */
  readonly allowWheel?: boolean;
  readonly className?: string;
  readonly decrementLabel?: string;
  readonly disabled?: boolean;
  readonly formatOptions?: Intl.NumberFormatOptions;
  readonly id?: string;
  readonly incrementLabel?: string;
  readonly inputClassName?: string;
  readonly inputRef?: Ref<HTMLInputElement>;
  readonly inputStyle?: CSSProperties;
  readonly invalid?: boolean;
  /** Maximum accepted/displayed decimal places. Also supplies the default step. */
  readonly precision?: number;
  readonly readOnly?: boolean;
  readonly required?: boolean;
  /** Adds a pointer-drag and keyboard-operable scrub handle. */
  readonly scrub?: boolean;
  readonly scrubLabel?: string;
  /** Horizontal CSS pixels required for one scrub step. */
  readonly scrubSensitivity?: number;
  readonly showStepper?: boolean;
  readonly style?: CSSProperties;
}

export interface StepNumericValueOptions {
  readonly maximum?: number | undefined;
  readonly minimum?: number | undefined;
  readonly precision?: number | undefined;
  readonly step: number;
}

export function numericStepPrecision(step: number): number {
  if (!Number.isFinite(step) || step <= 0) {
    throw new RangeError("Mergora NumberField step must be a finite number above zero.");
  }
  const text = step.toString().toLowerCase();
  const [coefficient, exponentText] = text.split("e");
  const exponent = exponentText === undefined ? 0 : Number(exponentText);
  const fraction = coefficient?.split(".")[1]?.length ?? 0;
  return Math.max(0, Math.min(15, fraction - exponent));
}

export function stepNumericValue(
  value: number,
  stepCount: number,
  options: StepNumericValueOptions,
): number {
  if (!Number.isSafeInteger(stepCount)) {
    throw new RangeError("Mergora NumberField step count must be a safe integer.");
  }
  const precision = options.precision ?? numericStepPrecision(options.step);
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 15) {
    throw new RangeError("Mergora NumberField precision must be an integer from 0 through 15.");
  }
  const origin = Number.isFinite(value) ? value : (options.minimum ?? 0);
  let next = Number((origin + options.step * stepCount).toFixed(precision));
  if (options.minimum !== undefined) next = Math.max(options.minimum, next);
  if (options.maximum !== undefined) next = Math.min(options.maximum, next);
  return Object.is(next, -0) ? 0 : next;
}

export function resolveNumberFormatOptions(
  options: Intl.NumberFormatOptions = {},
  precision?: number,
): Intl.NumberFormatOptions {
  if (precision === undefined) return { ...options };
  if (!Number.isSafeInteger(precision) || precision < 0 || precision > 15) {
    throw new RangeError("Mergora NumberField precision must be an integer from 0 through 15.");
  }
  if (options.minimumFractionDigits !== undefined && options.minimumFractionDigits > precision) {
    throw new RangeError("Mergora NumberField minimumFractionDigits cannot exceed its precision.");
  }
  return { ...options, maximumFractionDigits: precision };
}

function isSemanticallyInvalid(value: AriaAttributes["aria-invalid"]): boolean {
  return value === true || value === "true" || value === "grammar" || value === "spelling";
}

function finiteOrEmpty(value: number | undefined, label: string): void {
  if (value !== undefined && !Number.isFinite(value) && !Number.isNaN(value)) {
    throw new RangeError(`Mergora NumberField ${label} must be finite or NaN for an empty value.`);
  }
}

function assertNumberFieldProps(props: NumberFieldProps): void {
  finiteOrEmpty(props.value, "value");
  finiteOrEmpty(props.defaultValue, "defaultValue");
  for (const [label, value] of [
    ["minValue", props.minValue],
    ["maxValue", props.maxValue],
  ] as const) {
    if (value !== undefined && !Number.isFinite(value)) {
      throw new RangeError(`Mergora NumberField ${label} must be finite.`);
    }
  }
  if (
    props.minValue !== undefined &&
    props.maxValue !== undefined &&
    props.minValue > props.maxValue
  ) {
    throw new RangeError("Mergora NumberField minValue cannot exceed maxValue.");
  }
  if (props.step !== undefined && (!Number.isFinite(props.step) || props.step <= 0)) {
    throw new RangeError("Mergora NumberField step must be a finite number above zero.");
  }
  if (
    props.scrubSensitivity !== undefined &&
    (!Number.isFinite(props.scrubSensitivity) || props.scrubSensitivity < 2)
  ) {
    throw new RangeError("Mergora NumberField scrubSensitivity must be at least 2 CSS pixels.");
  }
  if (props.name !== undefined && props.name.trim().length === 0) {
    throw new RangeError("Mergora NumberField name must not be empty or whitespace-only.");
  }
  if (props.form !== undefined && props.form.trim().length === 0) {
    throw new RangeError("Mergora NumberField form must not be empty or whitespace-only.");
  }
  resolveNumberFormatOptions(props.formatOptions, props.precision);
}

interface NumericScrubControlProps {
  readonly disabled: boolean;
  readonly inputId: string | undefined;
  readonly label: string;
  readonly maximum: number | undefined;
  readonly minimum: number | undefined;
  readonly precision: number | undefined;
  readonly readOnly: boolean;
  readonly sensitivity: number;
  readonly step: number;
}

function NumericScrubControl({
  disabled,
  inputId,
  label,
  maximum,
  minimum,
  precision,
  readOnly,
  sensitivity,
  step,
}: NumericScrubControlProps) {
  const state = useContext(NumberFieldStateContext);
  const pointerId = useRef<number | null>(null);
  const pointerOrigin = useRef(0);
  const valueOrigin = useRef(0);
  const lastStepCount = useRef(0);
  if (state === null) {
    throw new Error("Mergora numeric scrub controls require a NumberField state context.");
  }

  const setBySteps = (origin: number, count: number): void => {
    state.setNumberValue(stepNumericValue(origin, count, { maximum, minimum, precision, step }));
  };
  const finishPointer = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (pointerId.current !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    pointerId.current = null;
    lastStepCount.current = 0;
  };

  return (
    <button
      aria-controls={inputId}
      aria-label={label}
      className="mrg-number-field-scrub"
      data-slot="number-field-scrub"
      disabled={disabled || readOnly}
      onKeyDown={(event: ReactKeyboardEvent<HTMLButtonElement>) => {
        if (event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
        if (event.key === "ArrowUp" || event.key === "ArrowRight") {
          event.preventDefault();
          state.increment();
        } else if (event.key === "ArrowDown" || event.key === "ArrowLeft") {
          event.preventDefault();
          state.decrement();
        } else if (event.key === "PageUp" || event.key === "PageDown") {
          event.preventDefault();
          setBySteps(state.numberValue, event.key === "PageUp" ? 10 : -10);
        } else if (event.key === "Home" && minimum !== undefined) {
          event.preventDefault();
          state.decrementToMin();
        } else if (event.key === "End" && maximum !== undefined) {
          event.preventDefault();
          state.incrementToMax();
        }
      }}
      onPointerCancel={finishPointer}
      onPointerDown={(event) => {
        if (
          disabled ||
          readOnly ||
          !event.isPrimary ||
          (event.pointerType === "mouse" && event.button !== 0)
        ) {
          return;
        }
        event.preventDefault();
        pointerId.current = event.pointerId;
        pointerOrigin.current = event.clientX;
        valueOrigin.current = Number.isFinite(state.numberValue)
          ? state.numberValue
          : (minimum ?? 0);
        lastStepCount.current = 0;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (pointerId.current !== event.pointerId) return;
        const count = Math.trunc((event.clientX - pointerOrigin.current) / sensitivity);
        if (count === lastStepCount.current) return;
        lastStepCount.current = count;
        setBySteps(valueOrigin.current, count);
      }}
      onPointerUp={finishPointer}
      type="button"
    >
      <span aria-hidden="true">↔</span>
    </button>
  );
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

export interface NumericFieldBaseProps extends NumberFieldProps {
  readonly currencyCode?: string | undefined;
  readonly kind: NumericFieldKind;
  readonly valueScale?: "fraction" | undefined;
}

export const NumericFieldBase = forwardRef<HTMLDivElement, NumericFieldBaseProps>(
  function NumericFieldBase(props, ref) {
    assertNumberFieldProps(props);
    const {
      "aria-describedby": ariaDescribedBy,
      "aria-errormessage": ariaErrorMessage,
      "aria-invalid": ariaInvalid,
      "aria-labelledby": ariaLabelledBy,
      allowWheel = false,
      className,
      commitBehavior = "validate",
      currencyCode,
      decrementLabel: decrementLabelProp,
      disabled = false,
      formatOptions,
      id,
      incrementLabel: incrementLabelProp,
      inputClassName,
      inputRef,
      inputStyle,
      invalid,
      kind,
      precision,
      readOnly = false,
      required,
      scrub = false,
      scrubLabel: scrubLabelProp,
      scrubSensitivity = 8,
      showStepper = true,
      step: stepProp,
      style,
      valueScale,
      ...ariaProps
    } = props;
    const field = useFieldControlState();
    const { locale } = useMergoraContext();
    const incrementLabel = useMergoraMessage(
      "numberField.increment",
      incrementLabelProp ?? "Increase value",
    );
    const decrementLabel = useMergoraMessage(
      "numberField.decrement",
      decrementLabelProp ?? "Decrease value",
    );
    const scrubLabel = useMergoraMessage("numberField.scrub", scrubLabelProp ?? "Scrub value");
    const resolvedId = field?.controlId ?? id;
    const resolvedInvalid =
      ariaInvalid !== undefined
        ? isSemanticallyInvalid(ariaInvalid)
        : invalid !== undefined
          ? invalid
          : (field?.invalid ?? false);
    const resolvedRequired = required ?? field?.required ?? false;
    const describedBy = mergeFieldIdRefs(
      ariaDescribedBy,
      field?.descriptionId,
      resolvedInvalid ? field?.errorMessageId : undefined,
    );
    const errorMessage = mergeFieldIdRefs(
      ariaErrorMessage,
      resolvedInvalid ? field?.errorMessageId : undefined,
    );
    const labelledBy = ariaLabelledBy ?? field?.labelId;
    const resolvedFormatOptions = resolveNumberFormatOptions(formatOptions, precision);
    const step = stepProp ?? (precision === undefined ? 1 : 10 ** -precision);
    const rootSlot = kind === "number" ? "number-field" : `${kind}-field`;
    const rootClassName = [
      "mrg-number-field",
      kind === "number" ? null : `mrg-${kind}-field`,
      className,
    ]
      .filter((value): value is string => value !== null && value !== undefined && value !== "")
      .join(" ");
    const rootRelationshipProps = {
      ...(describedBy === undefined ? {} : { "aria-describedby": describedBy }),
      ...(errorMessage === undefined ? {} : { "aria-errormessage": errorMessage }),
      ...(labelledBy === undefined ? {} : { "aria-labelledby": labelledBy }),
      ...(resolvedId === undefined ? {} : { id: resolvedId }),
      ...(style === undefined ? {} : { style }),
    };
    const inputAccessibilityProps = {
      ...(ariaInvalid === undefined ? {} : { "aria-invalid": ariaInvalid }),
      ...(inputStyle === undefined ? {} : { style: inputStyle }),
    };
    const inputReferenceProps = inputRef === undefined ? {} : { ref: inputRef };

    useEffect(() => {
      if (developmentRuntime() && field !== null && id !== undefined && id !== field.controlId) {
        console.warn(
          `Mergora ${kind} field received id "${id}" inside Field; Field controlId "${field.controlId}" is authoritative.`,
        );
      }
    }, [field, id, kind]);

    return (
      <AriaI18nProvider locale={locale}>
        <AriaNumberField
          {...ariaProps}
          {...rootRelationshipProps}
          className={rootClassName}
          commitBehavior={commitBehavior}
          data-currency={currencyCode}
          data-format-style={kind}
          data-has-scrub={scrub || undefined}
          data-has-stepper={showStepper || undefined}
          data-slot={rootSlot}
          data-value-scale={valueScale}
          decrementAriaLabel={decrementLabel}
          formatOptions={resolvedFormatOptions}
          incrementAriaLabel={incrementLabel}
          isDisabled={disabled}
          isInvalid={resolvedInvalid}
          isReadOnly={readOnly}
          isRequired={resolvedRequired}
          isWheelDisabled={!allowWheel}
          ref={ref}
          step={step}
        >
          <AriaGroup className="mrg-number-field-group" data-slot="number-field-group">
            {!scrub ? null : (
              <NumericScrubControl
                disabled={disabled}
                inputId={resolvedId}
                label={scrubLabel}
                maximum={ariaProps.maxValue}
                minimum={ariaProps.minValue}
                precision={precision}
                readOnly={readOnly}
                sensitivity={scrubSensitivity}
                step={step}
              />
            )}
            {!showStepper ? null : (
              <AriaButton
                className="mrg-number-field-stepper"
                data-slot="number-field-decrement"
                slot="decrement"
              >
                <span aria-hidden="true">−</span>
              </AriaButton>
            )}
            <AriaInput
              {...inputAccessibilityProps}
              {...inputReferenceProps}
              className={
                inputClassName === undefined
                  ? "mrg-number-field-input"
                  : `mrg-number-field-input ${inputClassName}`
              }
              data-slot="number-field-input"
            />
            {!showStepper ? null : (
              <AriaButton
                className="mrg-number-field-stepper"
                data-slot="number-field-increment"
                slot="increment"
              >
                <span aria-hidden="true">+</span>
              </AriaButton>
            )}
          </AriaGroup>
        </AriaNumberField>
      </AriaI18nProvider>
    );
  },
);

NumericFieldBase.displayName = "NumericFieldBase";

export const NumberField = forwardRef<HTMLDivElement, NumberFieldProps>(
  function NumberField(props, ref) {
    return <NumericFieldBase {...props} kind="number" ref={ref} />;
  },
);

NumberField.displayName = "NumberField";
