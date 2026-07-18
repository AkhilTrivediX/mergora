import { createRef, type ReactElement } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import { Alert } from "../../../registry/source/components/alert/alert.tsx";
import { Badge } from "../../../registry/source/components/badge/badge.tsx";
import { Banner } from "../../../registry/source/components/banner/banner.tsx";
import { Callout } from "../../../registry/source/components/callout/callout.tsx";
import { EmptyState } from "../../../registry/source/components/empty-state/empty-state.tsx";
import { ErrorState } from "../../../registry/source/components/error-state/error-state.tsx";
import { Meter } from "../../../registry/source/components/meter/meter.tsx";
import { Progress } from "../../../registry/source/components/progress/progress.tsx";
import { Skeleton } from "../../../registry/source/components/skeleton/skeleton.tsx";
import { BusyRegion, Spinner } from "../../../registry/source/components/spinner/spinner.tsx";
import { Status } from "../../../registry/source/components/status/status.tsx";

const divRef = createRef<HTMLDivElement>();
const spanRef = createRef<HTMLSpanElement>();
const landmarkRef = createRef<HTMLElement>();
const progressRef = createRef<HTMLProgressElement>();
const meterRef = createRef<HTMLMeterElement>();

const validFixtures = [
  <Alert description="Body" key="alert" ref={divRef} title="Title" />,
  <Alert announcement="Saved." key="live-alert" live="polite" title="Saved">
    Body
  </Alert>,
  <Callout key="callout" ref={landmarkRef} title="Title">
    Body
  </Callout>,
  <Banner id="release" key="banner" ref={landmarkRef} title="Title">
    Body
  </Banner>,
  <Badge key="category" ref={spanRef}>
    Beta
  </Badge>,
  <Badge key="status" kind="status" ref={spanRef} variant="success">
    Published
  </Badge>,
  <Badge count={3} key="count" kind="count" label="Notifications" ref={spanRef} />,
  <Status key="status-line" ref={spanRef}>
    Ready
  </Status>,
  <Progress key="progress" label="Upload" ref={progressRef} value={25} />,
  <Meter key="meter" label="Storage" ref={meterRef} value={62} />,
  <Spinner key="spinner" ref={spanRef} />,
  <BusyRegion key="busy" label="Results" ref={divRef}>
    Results
  </BusyRegion>,
  <Skeleton key="skeleton" ref={spanRef} />,
  <EmptyState
    description="Try again."
    key="empty"
    primaryAction={<button type="button">Reset</button>}
    ref={landmarkRef}
    title="No results"
  />,
  <ErrorState
    description="Retry the request."
    key="error"
    onRetry={() => undefined}
    recoverable
    ref={landmarkRef}
    title="Could not load"
  />,
];

// @ts-expect-error Alert requires a title.
const invalidAlert = <Alert description="Body" />;
const invalidLiveAlert = (
  // @ts-expect-error Alert live modes require an explicit concise announcement.
  <Alert live="polite" title="Saved">
    Body
  </Alert>
);
const invalidQuietAnnouncement = (
  // @ts-expect-error Alert announcements require a polite or assertive live mode.
  <Alert announcement="Saved." title="Saved">
    Body
  </Alert>
);
const invalidAlertRole = (
  // @ts-expect-error Alert owns live-region roles through the shared announcer.
  <Alert role="alert" title="Saved">
    Body
  </Alert>
);
// @ts-expect-error Callout requires child content.
const invalidCallout = <Callout title="Title" />;
// @ts-expect-error Banner requires a stable id.
const invalidBanner = <Banner title="Title">Body</Banner>;
// @ts-expect-error Badge deliberately rejects interactive handlers.
const invalidInteractiveBadge = <Badge onClick={() => undefined}>Interactive</Badge>;
// @ts-expect-error Count badges require an accessible label.
const invalidCountBadge = <Badge count={3} kind="count" />;
// @ts-expect-error Count badges do not expose status variants.
const invalidCountVariant = <Badge count={3} kind="count" label="Count" variant="error" />;
// @ts-expect-error Progress requires a visible label.
const invalidProgress = <Progress value={20} />;
// @ts-expect-error Meter requires a current value.
const invalidMeter = <Meter label="Storage" />;
// @ts-expect-error Spinner is decorative and cannot own child text.
const invalidSpinner = <Spinner>Loading</Spinner>;
// @ts-expect-error BusyRegion requires exactly one accessible-name source.
const invalidUnnamedBusyRegion = <BusyRegion>Results</BusyRegion>;
const invalidDoubleNamedBusyRegion = (
  // @ts-expect-error BusyRegion accepts label or labelledBy, never both.
  <BusyRegion label="Results" labelledBy="results-title">
    Results
  </BusyRegion>
);
// @ts-expect-error Skeleton is decorative and cannot own child text.
const invalidSkeleton = <Skeleton>Loading</Skeleton>;
// @ts-expect-error EmptyState requires a primary recovery action.
const invalidEmptyState = <EmptyState description="Try again." title="No results" />;
const invalidRecoverableError = (
  // @ts-expect-error Recoverable errors require an onRetry callback.
  <ErrorState description="Retry." recoverable title="Could not load" />
);
const invalidUnrecoverableRetry = (
  // @ts-expect-error Unrecoverable errors cannot expose retry behavior.
  <ErrorState description="Contact support." onRetry={() => undefined} title="Unavailable" />
);

describe("P2 feedback and status type contract", () => {
  it("accepts the documented discriminated variants and native refs", () => {
    expect(validFixtures).toHaveLength(15);
    expectTypeOf(validFixtures).toMatchTypeOf<ReactElement[]>();
  });

  it("keeps negative compile-time fixtures in the compilation unit", () => {
    expect([
      invalidAlert,
      invalidLiveAlert,
      invalidQuietAnnouncement,
      invalidAlertRole,
      invalidCallout,
      invalidBanner,
      invalidInteractiveBadge,
      invalidCountBadge,
      invalidCountVariant,
      invalidProgress,
      invalidMeter,
      invalidSpinner,
      invalidUnnamedBusyRegion,
      invalidDoubleNamedBusyRegion,
      invalidSkeleton,
      invalidEmptyState,
      invalidRecoverableError,
      invalidUnrecoverableRetry,
    ]).toHaveLength(18);
  });
});
