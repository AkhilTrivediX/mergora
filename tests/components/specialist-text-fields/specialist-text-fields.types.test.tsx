import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  PasswordField,
  type PasswordFieldRule,
} from "../../../registry/source/components/password-field/password-field.tsx";
import {
  SearchField,
  type SearchFieldStatus,
} from "../../../registry/source/components/search-field/search-field.tsx";

const inputRef = createRef<HTMLInputElement>();
const rules = [
  {
    id: "length",
    label: "At least 12 characters",
    validate: (value: string) => value.length >= 12,
  },
] satisfies readonly PasswordFieldRule[];

<PasswordField
  autoComplete="new-password"
  onChange={(value) => value.toUpperCase()}
  ref={inputRef}
  rules={rules}
  value="Mergora!2026"
/>;

<SearchField
  onChange={(value) => value.trim()}
  resultsId="catalog-results"
  status={{ message: "Loading results…", state: "loading" }}
  submitLabel="Search"
  value="dialog"
/>;

const idle = { state: "idle" } satisfies SearchFieldStatus;
const empty = { message: "No results.", state: "empty" } satisfies SearchFieldStatus;
void idle;
void empty;

// @ts-expect-error PasswordField owns the specialist input type.
<PasswordField type="email" />;

// @ts-expect-error SearchField owns the specialist input type.
<SearchField type="text" />;

// @ts-expect-error Non-idle search state requires explicit localized status text.
<SearchField status={{ state: "loading" }} />;

<SearchField
  // @ts-expect-error Specialist value callbacks receive strings rather than native events.
  onChange={(event: React.ChangeEvent<HTMLInputElement>) => event.currentTarget.value}
/>;

describe("P4 specialist text-field type surface", () => {
  it("keeps string value and native input ref contracts strict", () => {
    expectTypeOf(inputRef.current).toEqualTypeOf<HTMLInputElement | null>();
  });
});
