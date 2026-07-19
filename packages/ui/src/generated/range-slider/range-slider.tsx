// Generated from registry/source/components/range-slider/range-slider.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef } from "react";

import { useMergoraMessage } from "../provider/index.js";
import {
  SliderBase,
  assertSliderValues,
  resolveSliderDomain,
  type SliderBaseProps,
} from "../slider/index.js";
import "./range-slider.css";

export type RangeSliderValues = [number, number, ...number[]];

export interface RangeSliderProps extends Omit<
  SliderBaseProps<number[]>,
  | "collisionBehavior"
  | "defaultValue"
  | "names"
  | "onChange"
  | "onChangeEnd"
  | "thumbCount"
  | "thumbLabels"
  | "value"
> {
  /** Thumbs may meet, but their indices never swap or cross. */
  readonly collisionBehavior?: "clamp";
  readonly defaultValue?: RangeSliderValues;
  readonly names?: readonly [string, string, ...string[]];
  readonly onChange?: (value: RangeSliderValues) => void;
  readonly onChangeEnd?: (value: RangeSliderValues) => void;
  readonly thumbLabels?: readonly [string, string, ...string[]];
  readonly value?: RangeSliderValues;
}

function assertOrderedValues(values: readonly number[]): void {
  if (values.length < 2) {
    throw new RangeError("Mergora RangeSlider requires at least two thumbs.");
  }
  for (let index = 1; index < values.length; index += 1) {
    if (
      (values[index - 1] ?? Number.POSITIVE_INFINITY) > (values[index] ?? Number.NEGATIVE_INFINITY)
    ) {
      throw new RangeError(
        "Mergora RangeSlider values must be ordered from minimum to maximum; thumbs cannot cross.",
      );
    }
  }
}

export const RangeSlider = forwardRef<HTMLDivElement, RangeSliderProps>(
  function RangeSlider(props, ref) {
    const {
      collisionBehavior = "clamp",
      defaultValue,
      maxValue = 100,
      minValue = 0,
      names,
      onChange,
      onChangeEnd,
      step = 1,
      thumbLabels,
      value,
      ...baseProps
    } = props;
    const minimumLabel = useMergoraMessage("rangeSlider.minimum", "Minimum value");
    const maximumLabel = useMergoraMessage("rangeSlider.maximum", "Maximum value");
    const intermediateLabel = useMergoraMessage("rangeSlider.intermediate", "Value {index}");
    const domain = resolveSliderDomain(minValue, maxValue, step);
    if (value !== undefined && defaultValue !== undefined) {
      throw new RangeError("Mergora RangeSlider cannot receive both value and defaultValue.");
    }
    const resolvedValues = value ?? defaultValue ?? [domain.minimum, domain.maximum];
    assertOrderedValues(resolvedValues);
    assertSliderValues(resolvedValues, domain);
    const resolvedThumbLabels =
      thumbLabels ??
      resolvedValues.map((_, index) => {
        if (index === 0) return minimumLabel;
        if (index === resolvedValues.length - 1) return maximumLabel;
        return intermediateLabel.replace("{index}", String(index + 1));
      });
    const valueProps = value === undefined ? { defaultValue: resolvedValues } : { value };
    const nameProps = names === undefined ? {} : { names };

    return (
      <SliderBase<number[]>
        {...baseProps}
        {...valueProps}
        {...nameProps}
        collisionBehavior={collisionBehavior}
        maxValue={domain.maximum}
        minValue={domain.minimum}
        onChange={(next) => onChange?.(next as RangeSliderValues)}
        onChangeEnd={(next) => onChangeEnd?.(next as RangeSliderValues)}
        ref={ref}
        step={domain.step}
        thumbCount={resolvedValues.length}
        thumbLabels={resolvedThumbLabels}
      />
    );
  },
);

RangeSlider.displayName = "RangeSlider";
