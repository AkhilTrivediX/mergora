import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import { CurrencyField } from "../../../registry/source/components/currency-field/currency-field.tsx";
import { NumberField } from "../../../registry/source/components/number-field/number-field.tsx";
import { PercentageField } from "../../../registry/source/components/percentage-field/percentage-field.tsx";

const rootRef = createRef<HTMLDivElement>();
const inputRef = createRef<HTMLInputElement>();

<NumberField
  defaultValue={12.5}
  formatOptions={{ useGrouping: true }}
  inputRef={inputRef}
  maxValue={100}
  minValue={0}
  onChange={(value) => value.toFixed(2)}
  precision={2}
  ref={rootRef}
  scrub
  step={0.25}
/>;

<CurrencyField
  allowNegative
  currency="EUR"
  currencyDisplay="code"
  currencySign="accounting"
  defaultValue={-1250.5}
  formatOptions={{ useGrouping: true }}
  precision={2}
/>;

<PercentageField
  defaultValue={0.125}
  formatOptions={{ signDisplay: "auto" }}
  maxValue={2}
  minValue={-1}
  precision={2}
  step={0.005}
/>;

// @ts-expect-error Currency is an explicit required part of the value contract.
<CurrencyField defaultValue={10} />;

// @ts-expect-error Currency formatting cannot be replaced with a different Intl style.
<CurrencyField currency="USD" formatOptions={{ style: "percent" }} />;

// @ts-expect-error Percentage formatting cannot replace the percent style.
<PercentageField formatOptions={{ style: "currency" }} />;

// @ts-expect-error Canonical values are numbers rather than localized strings.
<NumberField value="1,25" />;

describe("P4 numeric-field type surface", () => {
  it("keeps canonical value and ref contracts strict", () => {
    expectTypeOf(rootRef.current).toEqualTypeOf<HTMLDivElement | null>();
    expectTypeOf(inputRef.current).toEqualTypeOf<HTMLInputElement | null>();
  });
});
