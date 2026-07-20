import { createRef, type ReactElement } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  Banner,
  type BannerPersistenceAdapter,
} from "../../../registry/source/components/banner/banner.tsx";

const landmarkRef = createRef<HTMLElement>();
const persistence: BannerPersistenceAdapter = {
  read: () => undefined,
  write: () => undefined,
};

const validBanners = [
  <Banner dismissed={false} id="controlled" key="controlled" ref={landmarkRef} title="Title">
    Body
  </Banner>,
  <Banner
    defaultDismissed
    id="uncontrolled"
    key="uncontrolled"
    persistence={persistence}
    title="Title"
  >
    Body
  </Banner>,
  <Banner
    aria-describedby="description"
    data-consumer="preserved"
    id="native"
    key="native"
    tabIndex={-1}
    title="Title"
  >
    Body
  </Banner>,
];

const controlledWithPersistence = (
  // @ts-expect-error Controlled dismissal cannot accept persistence.
  <Banner dismissed={false} id="invalid-persistence" persistence={persistence} title="Title">
    Body
  </Banner>
);
const controlledWithDefault = (
  // @ts-expect-error Controlled dismissal cannot accept an uncontrolled default.
  <Banner defaultDismissed dismissed={false} id="invalid-default" title="Title">
    Body
  </Banner>
);
const uncontrolledWithUndefinedControl = (
  // @ts-expect-error exactOptionalPropertyTypes rejects an explicit undefined control value.
  <Banner dismissed={undefined} id="undefined-control" title="Title">
    Body
  </Banner>
);
const bannerWithRole = (
  // @ts-expect-error Banner owns the root landmark role.
  <Banner id="role" role="alert" title="Title">
    Body
  </Banner>
);
const bannerWithAriaLabel = (
  // @ts-expect-error Banner owns its accessible name.
  <Banner aria-label="Override" id="name" title="Title">
    Body
  </Banner>
);
const bannerWithLiveRegion = (
  // @ts-expect-error Banner is deliberately non-live.
  <Banner aria-live="assertive" id="live" title="Title">
    Body
  </Banner>
);
const bannerWithForcedHidden = (
  // @ts-expect-error Banner visibility is owned by dismissed state.
  <Banner hidden id="hidden" title="Title">
    Body
  </Banner>
);

describe("Banner type-level ownership", () => {
  it("accepts the controlled, uncontrolled, and safe native contracts", () => {
    expect(validBanners).toHaveLength(3);
    expectTypeOf(validBanners).toMatchTypeOf<ReactElement[]>();
  });

  it("keeps negative compile-time fixtures in the compilation unit", () => {
    expect([
      controlledWithPersistence,
      controlledWithDefault,
      uncontrolledWithUndefinedControl,
      bannerWithRole,
      bannerWithAriaLabel,
      bannerWithLiveRegion,
      bannerWithForcedHidden,
    ]).toHaveLength(7);
  });
});
