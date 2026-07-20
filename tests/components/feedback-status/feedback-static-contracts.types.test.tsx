import { createRef, type ReactElement } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import { Badge, type BadgeProps } from "../../../registry/source/components/badge/badge.tsx";
import {
  EmptyState,
  type EmptyStateProps,
} from "../../../registry/source/components/empty-state/empty-state.tsx";
import { Meter, type MeterProps } from "../../../registry/source/components/meter/meter.tsx";
import {
  Progress,
  type ProgressProps,
} from "../../../registry/source/components/progress/progress.tsx";

const spanRef = createRef<HTMLSpanElement>();
const sectionRef = createRef<HTMLElement>();
const progressRef = createRef<HTMLProgressElement>();
const meterRef = createRef<HTMLMeterElement>();

const validFixtures = [
  <Badge key="category" ref={spanRef}>
    Long category labels remain fully readable
  </Badge>,
  <Badge key="status" kind="status" ref={spanRef} variant="success">
    Published
  </Badge>,
  <Badge count={1234} key="count" kind="count" label="Notifications" maximum={99} />,
  <EmptyState
    description="Try a broader query."
    key="empty"
    primaryAction={<button type="button">Reset</button>}
    recoverySuggestions={{ items: ["Remove one filter"], label: "Ways to recover" }}
    ref={sectionRef}
    secondaryAction={<a href="/help">Help</a>}
    title="No results"
  />,
  <Progress key="progress" label="Upload" ref={progressRef} showValue={false} value={20} />,
  <Meter key="meter" label="Storage" ref={meterRef} showThresholdSummary value={62} />,
];

const invalidBadgeAnimationHandler: BadgeProps = {
  children: "Animated",
  // @ts-expect-error Badge rejects every React event handler.
  onAnimationEnd: () => undefined,
};
const invalidBadgeCaptureHandler: BadgeProps = {
  children: "Focused",
  // @ts-expect-error Badge rejects capture event handlers too.
  onFocusCapture: () => undefined,
};
// @ts-expect-error Badge does not accept generic accessible-name overrides.
const invalidBadgeAriaLabel: BadgeProps = { "aria-label": "Override", children: "Beta" };
const invalidBadgeAriaLabelledBy: BadgeProps = {
  // @ts-expect-error Badge does not accept generic accessible-name references.
  "aria-labelledby": "external-label",
  children: "Beta",
};
// @ts-expect-error Badge does not accept editable content.
const invalidBadgeEditable: BadgeProps = { children: "Beta", contentEditable: true };
// @ts-expect-error Badge does not accept drag state.
const invalidBadgeDraggable: BadgeProps = { children: "Beta", draggable: true };
const invalidBadgeHtml: BadgeProps = {
  children: "Beta",
  // @ts-expect-error Badge does not accept dangerous HTML replacement.
  dangerouslySetInnerHTML: { __html: "Beta" },
};
// @ts-expect-error Badge does not accept access keys.
const invalidBadgeAccessKey: BadgeProps = { accessKey: "b", children: "Beta" };
// @ts-expect-error Badge does not accept focus overrides.
const invalidBadgeTabIndex: BadgeProps = { children: "Beta", tabIndex: 0 };
// @ts-expect-error Badge does not accept role overrides.
const invalidBadgeRole: BadgeProps = { children: "Beta", role: "button" };

const invalidEmptyTextAction: EmptyStateProps = {
  description: "Try again.",
  // @ts-expect-error EmptyState primaryAction must be a React element.
  primaryAction: "Retry",
  title: "No results",
};
const invalidEmptyNullAction: EmptyStateProps = {
  description: "Try again.",
  // @ts-expect-error EmptyState primaryAction cannot be null.
  primaryAction: null,
  title: "No results",
};
const invalidEmptySecondaryAction: EmptyStateProps = {
  description: "Try again.",
  primaryAction: <button type="button">Retry</button>,
  // @ts-expect-error EmptyState secondaryAction must be a React element when provided.
  secondaryAction: "Help",
  title: "No results",
};

// @ts-expect-error Progress owns its native role.
const invalidProgressRole: ProgressProps = { label: "Upload", role: "presentation" };
// @ts-expect-error Progress owns its accessible name through the visible label.
const invalidProgressAriaLabel: ProgressProps = { "aria-label": "Override", label: "Upload" };
// @ts-expect-error Progress owns its native value semantics.
const invalidProgressAriaValue: ProgressProps = { "aria-valuenow": 40, label: "Upload" };
const invalidProgressAriaValueText: ProgressProps = {
  // @ts-expect-error Progress owns its localized aria-valuetext.
  "aria-valuetext": "Override",
  label: "Upload",
};

// @ts-expect-error Meter owns its native role.
const invalidMeterRole: MeterProps = { label: "Storage", role: "presentation", value: 20 };
const invalidMeterAriaLabelledBy: MeterProps = {
  // @ts-expect-error Meter owns its accessible name through the visible label.
  "aria-labelledby": "other-label",
  label: "Storage",
  value: 20,
};
const invalidMeterAriaRange: MeterProps = {
  // @ts-expect-error Meter owns its native value semantics.
  "aria-valuemax": 400,
  label: "Storage",
  value: 20,
};
const invalidMeterAriaValueText: MeterProps = {
  // @ts-expect-error Meter owns its localized aria-valuetext.
  "aria-valuetext": "Override",
  label: "Storage",
  value: 20,
};

const compileTimeFixtures = [
  invalidBadgeAnimationHandler,
  invalidBadgeCaptureHandler,
  invalidBadgeAriaLabel,
  invalidBadgeAriaLabelledBy,
  invalidBadgeEditable,
  invalidBadgeDraggable,
  invalidBadgeHtml,
  invalidBadgeAccessKey,
  invalidBadgeTabIndex,
  invalidBadgeRole,
  invalidEmptyTextAction,
  invalidEmptyNullAction,
  invalidEmptySecondaryAction,
  invalidProgressRole,
  invalidProgressAriaLabel,
  invalidProgressAriaValue,
  invalidProgressAriaValueText,
  invalidMeterRole,
  invalidMeterAriaLabelledBy,
  invalidMeterAriaRange,
  invalidMeterAriaValueText,
];

describe("P2 static feedback compile-time contract", () => {
  it("accepts native refs and the documented static variants", () => {
    expect(validFixtures).toHaveLength(6);
    expectTypeOf(validFixtures).toMatchTypeOf<ReactElement[]>();
  });

  it("keeps all negative fixtures in this compilation unit", () => {
    expect(compileTimeFixtures).toHaveLength(21);
  });
});
