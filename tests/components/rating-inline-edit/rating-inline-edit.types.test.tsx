import { createRef } from "react";
import { describe, expectTypeOf, it } from "vitest";

import {
  InlineEdit,
  type InlineEditSaveContext,
} from "../../../registry/source/components/inline-edit/inline-edit.tsx";
import { Rating, type RatingValue } from "../../../registry/source/components/rating/rating.tsx";

const rootRef = createRef<HTMLDivElement>();
const rating: RatingValue = 4;

<Rating
  allowClear
  defaultValue={rating}
  label="Implementation quality"
  name="quality"
  onValueChange={(next) => next?.toFixed(0)}
  ref={rootRef}
/>;

<Rating label="Average" name="average" readOnly value={4.5} />;

<InlineEdit
  defaultValue="Quality Passport"
  inputProps={{ autoComplete: "organization-title", inputMode: "text" }}
  label="Feature"
  name="feature"
  onSave={async (value, context: InlineEditSaveContext) => {
    value.toUpperCase();
    context.previousValue.toUpperCase();
    await Promise.resolve(context.signal.aborted);
  }}
  ref={rootRef}
/>;

<InlineEdit
  control="textarea"
  label="Notes"
  textareaProps={{ maxLength: 500, rows: 6 }}
  value="Controlled notes"
/>;

// @ts-expect-error Editable ratings use canonical numbers rather than star strings.
<Rating label="Invalid" name="invalid" value="five" />;

// @ts-expect-error Inline Edit controlled values are strings.
<InlineEdit label="Invalid" value={5} />;

// @ts-expect-error Managed editor values stay on InlineEdit rather than nested native props.
<InlineEdit inputProps={{ value: "nested" }} label="Invalid" />;

// @ts-expect-error Blur cancellation is intentionally excluded because it can silently discard drafts.
<InlineEdit blurBehavior="cancel" label="Invalid" />;

describe("P4 Rating and Inline Edit type surface", () => {
  it("keeps roots, canonical values, and async contexts strict", () => {
    expectTypeOf(rootRef.current).toEqualTypeOf<HTMLDivElement | null>();
    expectTypeOf(rating).toEqualTypeOf<number>();
  });
});
