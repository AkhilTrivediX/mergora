import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  Listbox,
  type CollectionEntry,
  type CollectionKey,
} from "../../../registry/source/components/listbox/listbox.tsx";
import { Select } from "../../../registry/source/components/select/select.tsx";

const entries = [
  { key: "alpha", textValue: "Alpha" },
  { key: 2, textValue: "Two" },
] as const satisfies readonly CollectionEntry[];
const rootRef = createRef<HTMLDivElement>();

<Listbox
  defaultValue="alpha"
  entries={entries}
  label="Single"
  onValueChange={(next) => {
    expectTypeOf(next).toEqualTypeOf<CollectionKey | null>();
  }}
  ref={rootRef}
/>;

<Listbox
  defaultValue={["alpha", 2]}
  entries={entries}
  label="Multiple"
  onValueChange={(next) => {
    expectTypeOf(next).toEqualTypeOf<CollectionKey[]>();
  }}
  selectionMode="multiple"
/>;

<Select
  defaultValue="alpha"
  entries={entries}
  label="Single Select"
  onValueChange={(next) => {
    expectTypeOf(next).toEqualTypeOf<CollectionKey | null>();
  }}
  ref={rootRef}
/>;

<Listbox entries={entries} formatSelectionSummary={false} label="Summary disabled" value="alpha" />;

<Select
  entries={entries}
  formatSelectionSummary={({ visibleTextValues }) => visibleTextValues.join(", ")}
  label="Summary enabled"
  value="alpha"
/>;

// @ts-expect-error Multiple Listbox values are key arrays.
<Listbox entries={entries} label="Invalid multiple" selectionMode="multiple" value="alpha" />;

// @ts-expect-error Single Listbox values are one key or null.
<Listbox entries={entries} label="Invalid single" value={["alpha"]} />;

// @ts-expect-error Select is intentionally single-only; multiple selection is a separate component.
<Select entries={entries} label="Invalid Select mode" selectionMode="multiple" />;

// @ts-expect-error Select does not accept key arrays.
<Select entries={entries} label="Invalid Select value" value={["alpha"]} />;

describe("P4 collection foundation type surface", () => {
  it("keeps public keys and concrete root refs exact", () => {
    expectTypeOf(rootRef.current).toEqualTypeOf<HTMLDivElement | null>();
    expectTypeOf<CollectionKey>().toEqualTypeOf<string | number>();
  });
});
