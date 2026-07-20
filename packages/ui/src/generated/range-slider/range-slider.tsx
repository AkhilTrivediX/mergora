// Generated from registry/source/components/range-slider/range-slider.tsx by @mergora-internal/source-transformer. Do not edit.
"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { useMergoraContext, useMergoraMessage } from "../provider/index.js";
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
  /** Announces the first pair of thumbs when they meet. No live region exists when disabled. */
  readonly announceCollisions?: boolean;
  /** Initial ordered values for uncontrolled use; defaults to both domain endpoints. */
  readonly defaultValue?: RangeSliderValues;
  /** Distinct native form names corresponding one-to-one with range thumbs. */
  readonly names?: readonly [string, string, ...string[]];
  /** Receives each ordered range value change during interaction. */
  readonly onChange?: (value: RangeSliderValues) => void;
  /** Receives the final ordered range values when interaction ends. */
  readonly onChangeEnd?: (value: RangeSliderValues) => void;
  /** Accessible boundary names corresponding one-to-one with range thumbs. */
  readonly thumbLabels?: readonly [string, string, ...string[]];
  /** Controlled ordered range values; thumbs may meet but never cross. */
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

interface RangeSliderCollisionAnnouncerHandle {
  readonly publish: (values: RangeSliderValues) => void;
}

interface RangeSliderCollisionAnnouncerProps {
  readonly formatOptions: Intl.NumberFormatOptions | undefined;
  readonly minimum: number;
}

const RangeSliderCollisionAnnouncer = forwardRef<
  RangeSliderCollisionAnnouncerHandle,
  RangeSliderCollisionAnnouncerProps
>(function RangeSliderCollisionAnnouncer({ formatOptions, minimum }, ref) {
  const collisionMessage = useMergoraMessage(
    "rangeSlider.collision",
    "Range limits meet at {value}.",
  );
  const { locale } = useMergoraContext();
  const [announcement, setAnnouncement] = useState("");

  useImperativeHandle(
    ref,
    () => ({
      publish: (values) => {
        const collisionIndex = values.findIndex(
          (current, index) => index > 0 && values[index - 1] === current,
        );
        if (collisionIndex < 0) {
          setAnnouncement("");
          return;
        }
        const formatter = new Intl.NumberFormat(locale, formatOptions);
        setAnnouncement(
          collisionMessage.replace("{value}", formatter.format(values[collisionIndex] ?? minimum)),
        );
      },
    }),
    [collisionMessage, formatOptions, locale, minimum],
  );

  return (
    <span
      aria-atomic="true"
      aria-live="polite"
      className="mrg-slider-visually-hidden"
      data-slot="range-slider-collision-status"
      role="status"
    >
      {announcement}
    </span>
  );
});

RangeSliderCollisionAnnouncer.displayName = "RangeSliderCollisionAnnouncer";

export const RangeSlider = forwardRef<HTMLDivElement, RangeSliderProps>(
  function RangeSlider(props, ref) {
    const {
      announceCollisions = false,
      collisionBehavior = "clamp",
      defaultValue,
      formatOptions,
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
    const collisionAnnouncerRef = useRef<RangeSliderCollisionAnnouncerHandle>(null);
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
    const publishChange = (next: number[]): void => {
      const typedNext = next as RangeSliderValues;
      if (announceCollisions) {
        collisionAnnouncerRef.current?.publish(typedNext);
      }
      onChange?.(typedNext);
    };

    return (
      <>
        <SliderBase<number[]>
          {...baseProps}
          {...valueProps}
          {...nameProps}
          {...(formatOptions === undefined ? {} : { formatOptions })}
          collisionBehavior={collisionBehavior}
          maxValue={domain.maximum}
          minValue={domain.minimum}
          {...(announceCollisions || onChange !== undefined ? { onChange: publishChange } : {})}
          {...(onChangeEnd === undefined
            ? {}
            : { onChangeEnd: (next) => onChangeEnd(next as RangeSliderValues) })}
          ref={ref}
          step={domain.step}
          thumbCount={resolvedValues.length}
          thumbLabels={resolvedThumbLabels}
        />
        {!announceCollisions ? null : (
          <RangeSliderCollisionAnnouncer
            formatOptions={formatOptions}
            minimum={domain.minimum}
            ref={collisionAnnouncerRef}
          />
        )}
      </>
    );
  },
);

RangeSlider.displayName = "RangeSlider";
