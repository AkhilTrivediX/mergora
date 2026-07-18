import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import { OtpField } from "../../../registry/source/components/otp-field/otp-field.tsx";
import { PinField } from "../../../registry/source/components/pin-field/pin-field.tsx";

const inputRef = createRef<HTMLInputElement>();

<OtpField
  characterSet="alphanumeric"
  groups={[2, 2, 2]}
  onChange={(value) => value.toUpperCase()}
  onComplete={(value) => value.length}
  ref={inputRef}
  value="A19B20"
/>;

<PinField
  displayMode="visible"
  length={6}
  onChange={(value) => value.padStart(6, "0")}
  pastePolicy="block"
  purpose="reusable-secret"
  ref={inputRef}
  value="735102"
/>;

// @ts-expect-error PinField requires an explicit reusable-secret purpose.
<PinField />;

// @ts-expect-error OTP is the wrong purpose for a reusable PIN field.
<PinField purpose="one-time-code" />;

// @ts-expect-error OtpField owns the native input type.
<OtpField type="password" />;

// @ts-expect-error PinField owns the native input type.
<PinField purpose="reusable-secret" type="number" />;

// @ts-expect-error Group total, rather than maxLength, owns OTP length.
<OtpField maxLength={6} />;

<OtpField
  // @ts-expect-error Specialist value callbacks receive strings rather than native events.
  onChange={(event: React.ChangeEvent<HTMLInputElement>) => event.currentTarget.value}
/>;

describe("P4 OTP and PIN type surface", () => {
  it("keeps string values and native input refs strict", () => {
    expectTypeOf(inputRef.current).toEqualTypeOf<HTMLInputElement | null>();
  });
});
