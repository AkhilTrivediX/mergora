import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  RangeSlider,
  type RangeSliderValues,
} from "../../../registry/source/components/range-slider/range-slider.tsx";
import { Slider } from "../../../registry/source/components/slider/slider.tsx";

const rootRef = createRef<HTMLDivElement>();

<Slider
  defaultValue={0.5}
  formatOptions={{ style: "percent" }}
  marks={[
    { label: "Start", value: 0 },
    { label: "End", value: 1 },
  ]}
  maxValue={1}
  minValue={0}
  name="confidence"
  onChange={(value) => value.toFixed(2)}
  ref={rootRef}
  step={0.05}
/>;

<RangeSlider
  defaultValue={[10, 50, 90]}
  names={["minimum", "target", "maximum"]}
  onChange={(value) => value[0].toFixed(0)}
  thumbLabels={["Minimum score", "Target score", "Maximum score"]}
/>;

const controlled: RangeSliderValues = [3500, 12000];
<RangeSlider
  collisionBehavior="clamp"
  maxValue={12000}
  minValue={3500}
  step={250}
  thumbLabels={["Minimum monthly salary", "Maximum monthly salary"]}
  value={controlled}
/>;

// @ts-expect-error Slider values are canonical numbers rather than localized strings.
<Slider value="50%" />;

// @ts-expect-error RangeSlider requires at least two values.
<RangeSlider value={[50]} />;

// @ts-expect-error Crossing and thumb swapping are not supported policies.
<RangeSlider collisionBehavior="swap" value={[20, 80]} />;

// @ts-expect-error Range form names require at least two entries.
<RangeSlider names={["only-one"]} value={[20, 80]} />;

describe("P4 slider type surface", () => {
  it("keeps refs and ordered tuple values strict", () => {
    expectTypeOf(rootRef.current).toEqualTypeOf<HTMLDivElement | null>();
    expectTypeOf(controlled).toEqualTypeOf<RangeSliderValues>();
  });
});
