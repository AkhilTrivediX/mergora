import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  MaskedField,
  type DeterministicMaskAdapter,
  type MaskedFieldValue,
} from "../../../registry/source/components/masked-field/masked-field.tsx";
import {
  PhoneField,
  type PhoneFieldValue,
  type PhoneFormatAdapter,
} from "../../../registry/source/components/phone-field/phone-field.tsx";

const inputRef = createRef<HTMLInputElement>();

const phoneAdapter = {
  id: "types.phone.v1",
  resolve: (input, context) => ({
    displayValue: input,
    e164: input.length === 10 ? `+1${input}` : null,
    selection: context.selection,
    status: input.length === 10 ? "valid" : input.length === 0 ? "empty" : "incomplete",
  }),
} satisfies PhoneFormatAdapter;

const maskAdapter = {
  id: "types.mask.v1",
  apply: (input, context) => ({
    formattedValue: input,
    rawValue: input.replaceAll("-", ""),
    selection: context.selection,
    status: input.length === 0 ? "empty" : input.length === 8 ? "valid" : "incomplete",
  }),
} satisfies DeterministicMaskAdapter;

<PhoneField
  adapter={phoneAdapter}
  country={{ callingCode: "+1", code: "US", label: "United States" }}
  extension
  extensionLabel="Extension"
  extensionName="phone-extension"
  name="phone"
  onValueChange={(next: PhoneFieldValue) => next.e164}
  ref={inputRef}
  value="4155552671"
/>;

<MaskedField
  adapter={maskAdapter}
  name="inventory-code"
  onValueChange={(next: MaskedFieldValue) => next.rawValue}
  ref={inputRef}
  serialization="formatted"
  value="AB-2048-QZ"
/>;

// @ts-expect-error PhoneField requires an explicit country context.
<PhoneField adapter={phoneAdapter} />;

// @ts-expect-error PhoneField requires a trusted formatter/parser adapter.
<PhoneField country={{ callingCode: "+1", code: "US", label: "United States" }} />;

<PhoneField
  adapter={phoneAdapter}
  country={{ callingCode: "+1", code: "US", label: "United States" }}
  // @ts-expect-error PhoneField owns native tel input type.
  type="text"
/>;

// @ts-expect-error MaskedField requires a trusted deterministic adapter.
<MaskedField />;

// @ts-expect-error Serialized mask identifiers are not executable adapter inputs.
<MaskedField adapter="AA-0000-AA" />;

// @ts-expect-error MaskedField owns native input type.
<MaskedField adapter={maskAdapter} type="tel" />;

// @ts-expect-error Serialization is an explicit raw/formatted choice.
<MaskedField adapter={maskAdapter} serialization="canonical" />;

<PhoneField
  adapter={phoneAdapter}
  country={{ callingCode: "+1", code: "US", label: "United States" }}
  // @ts-expect-error Typed callbacks receive PhoneFieldValue, not native change events.
  onValueChange={(event: React.ChangeEvent<HTMLInputElement>) => event.currentTarget.value}
/>;

describe("P4 phone and masked-field type surface", () => {
  it("keeps typed value callbacks and native input refs strict", () => {
    expectTypeOf(inputRef.current).toEqualTypeOf<HTMLInputElement | null>();
  });
});
