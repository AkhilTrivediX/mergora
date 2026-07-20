import { describe, expect, it } from "vitest";

import { Callout } from "../../../registry/source/components/callout/callout.tsx";
import { Skeleton } from "../../../registry/source/components/skeleton/skeleton.tsx";
import { Status } from "../../../registry/source/components/status/status.tsx";

const invalidCalloutRole = (
  // @ts-expect-error Callout owns its landmark role.
  <Callout role="alert" title="Title">
    Body
  </Callout>
);
const invalidCalloutLabel = (
  // @ts-expect-error Callout owns the accessible name of its optional landmark.
  <Callout aria-label="Override" title="Title">
    Body
  </Callout>
);
// @ts-expect-error Status owns its optional live-region role.
const invalidStatusRole = <Status role="alert">Ready</Status>;
// @ts-expect-error Status owns its live-region attributes.
const invalidStatusLive = <Status aria-live="assertive">Ready</Status>;
// @ts-expect-error Skeleton is always hidden from accessibility APIs.
const invalidSkeletonHidden = <Skeleton aria-hidden={false} />;
// @ts-expect-error Skeleton cannot receive an accessible name.
const invalidSkeletonLabelledBy = <Skeleton aria-labelledby="loading-label" />;
// @ts-expect-error Skeleton cannot expose fake child content.
const invalidSkeletonChildren = <Skeleton>Loading</Skeleton>;

describe("P2 feedback semantic ownership type contract", () => {
  it("keeps compile-time negative fixtures in the compilation unit", () => {
    expect([
      invalidCalloutRole,
      invalidCalloutLabel,
      invalidStatusRole,
      invalidStatusLive,
      invalidSkeletonHidden,
      invalidSkeletonLabelledBy,
      invalidSkeletonChildren,
    ]).toHaveLength(7);
  });
});
