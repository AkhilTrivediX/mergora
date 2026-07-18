import { createRef, type ReactElement } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import { ErrorState } from "../../../registry/source/components/error-state/error-state.tsx";
import { BusyRegion, Spinner } from "../../../registry/source/components/spinner/spinner.tsx";

const sectionRef = createRef<HTMLElement>();
const divRef = createRef<HTMLDivElement>();
const spanRef = createRef<HTMLSpanElement>();

const validFixtures = [
  <ErrorState
    description="Persistent guidance."
    key="quiet-error"
    ref={sectionRef}
    title="Error"
  />,
  <ErrorState
    announcement="Saving failed."
    description="Retry the request."
    key="polite-error"
    live="polite"
    ref={sectionRef}
    title="Could not save"
  />,
  <ErrorState
    announcement="Checkout failed."
    description="Review the payment method and retry."
    key="recoverable-error"
    live="assertive"
    onRetry={() => undefined}
    recoverable
    ref={sectionRef}
    title="Payment was not submitted"
  />,
  <BusyRegion key="quiet-busy" label="Results" ref={divRef}>
    Results
  </BusyRegion>,
  <BusyRegion
    announce
    busy={false}
    busyMessage="Refreshing results"
    key="announcing-busy"
    labelledBy="results-title"
    ref={divRef}
  >
    Results
  </BusyRegion>,
  <Spinner key="spinner" ref={spanRef} size="large" />,
];

const missingErrorAnnouncement = (
  // @ts-expect-error Polite and assertive ErrorState modes require a concise announcement.
  <ErrorState description="Retry." live="polite" title="Could not save" />
);
const quietErrorAnnouncement = (
  // @ts-expect-error Static ErrorState mode cannot accept an announcement.
  <ErrorState announcement="Unexpected" description="Retry." title="Could not save" />
);
const explicitQuietErrorAnnouncement = (
  // @ts-expect-error Explicit live=off cannot accept an announcement.
  <ErrorState announcement="Unexpected" description="Retry." live="off" title="Could not save" />
);
const invalidErrorRole = (
  // @ts-expect-error ErrorState owns its non-live section semantics.
  <ErrorState description="Retry." role="alert" title="Could not save" />
);
const invalidErrorLiveOverride = (
  // @ts-expect-error Native aria-live cannot bypass ErrorState's announcement policy.
  <ErrorState aria-live="assertive" description="Retry." title="Could not save" />
);
const invalidRecoverableError = (
  // @ts-expect-error Recoverable ErrorState requires onRetry.
  <ErrorState description="Retry." recoverable title="Could not save" />
);
const invalidUnrecoverableRetry = (
  // @ts-expect-error Unrecoverable ErrorState cannot accept retry behavior.
  <ErrorState description="Contact support." onRetry={() => undefined} title="Unavailable" />
);
const invalidBusyRole = (
  // @ts-expect-error BusyRegion owns role=region.
  <BusyRegion label="Results" role="status">
    Results
  </BusyRegion>
);
const invalidBusyStateOverride = (
  // @ts-expect-error BusyRegion owns aria-busy through its busy prop.
  <BusyRegion aria-busy label="Results">
    Results
  </BusyRegion>
);
const invalidDoubleNamedBusyRegion = (
  // @ts-expect-error BusyRegion accepts label or labelledBy, never both.
  <BusyRegion label="Results" labelledBy="results-title">
    Results
  </BusyRegion>
);
const invalidSpinnerLabel = (
  // @ts-expect-error Spinner is decorative and cannot expose an accessible name.
  <Spinner aria-label="Loading" />
);
const invalidFocusableSpinner = (
  // @ts-expect-error An aria-hidden Spinner cannot become a focus target.
  <Spinner tabIndex={0} />
);

describe("feedback announcer type contracts", () => {
  it("accepts explicit announcement policies and native refs", () => {
    expect(validFixtures).toHaveLength(6);
    expectTypeOf(validFixtures).toMatchTypeOf<ReactElement[]>();
  });

  it("keeps negative compile-time fixtures in the compilation unit", () => {
    expect([
      missingErrorAnnouncement,
      quietErrorAnnouncement,
      explicitQuietErrorAnnouncement,
      invalidErrorRole,
      invalidErrorLiveOverride,
      invalidRecoverableError,
      invalidUnrecoverableRetry,
      invalidBusyRole,
      invalidBusyStateOverride,
      invalidDoubleNamedBusyRegion,
      invalidSpinnerLabel,
      invalidFocusableSpinner,
    ]).toHaveLength(12);
  });
});
