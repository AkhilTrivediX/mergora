import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  ColorField,
  createSrgbColor,
  type ColorParseResult,
  type SrgbColorValue,
} from "../../../registry/source/components/color-field/color-field.tsx";
import { ColorPicker } from "../../../registry/source/components/color-picker/color-picker.tsx";

const rootRef = createRef<HTMLDivElement>();
const inputRef = createRef<HTMLInputElement>();
const color = createSrgbColor({ alpha: 128, blue: 153, green: 102, red: 51 });

<ColorField
  alphaPolicy="allow"
  contrastBackground={createSrgbColor({ alpha: 255, blue: 255, green: 255, red: 255 })}
  defaultValue={color}
  format="hsl"
  inputRef={inputRef}
  name="brand-color"
  onChange={(value) => value?.red}
  ref={rootRef}
/>;

<ColorPicker
  alphaPolicy="allow"
  defaultValue={color}
  getSwatchLabel={(value, index) => `${String(index + 1)} ${String(value.red)}`}
  inputRef={inputRef}
  onChange={(value) => value.alpha}
  ref={rootRef}
  swatches={[color]}
/>;

// @ts-expect-error Canonical values are typed colors, never CSS strings.
<ColorField value="#336699" />;

// @ts-expect-error Every typed color must declare the srgb space and all four byte channels.
<ColorPicker value={{ blue: 0, green: 0, red: 0 }} />;

// @ts-expect-error Alpha policy is explicit and closed to documented values.
<ColorPicker alphaPolicy="preserve" />;

describe("P4 color type surface", () => {
  it("keeps canonical value, parser, and ref contracts strict", () => {
    expectTypeOf(color).toEqualTypeOf<SrgbColorValue>();
    expectTypeOf<ColorParseResult>().toMatchTypeOf<
      | { readonly ok: true; readonly value: SrgbColorValue }
      | { readonly ok: false; readonly reason: string }
    >();
    expectTypeOf(rootRef.current).toEqualTypeOf<HTMLDivElement | null>();
    expectTypeOf(inputRef.current).toEqualTypeOf<HTMLInputElement | null>();
  });
});
