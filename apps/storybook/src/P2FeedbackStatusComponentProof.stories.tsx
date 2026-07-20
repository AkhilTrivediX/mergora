import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { Alert } from "../../../registry/source/components/alert/index.ts";
import { Badge } from "../../../registry/source/components/badge/index.ts";
import {
  Banner,
  type BannerPersistenceAdapter,
} from "../../../registry/source/components/banner/index.ts";
import { Callout } from "../../../registry/source/components/callout/index.ts";
import { EmptyState } from "../../../registry/source/components/empty-state/index.ts";
import { ErrorState } from "../../../registry/source/components/error-state/index.ts";
import { Meter } from "../../../registry/source/components/meter/index.ts";
import { NotificationCenter } from "../../../registry/source/components/notification-center/index.ts";
import { Progress } from "../../../registry/source/components/progress/index.ts";
import { MergoraProvider } from "../../../registry/source/components/provider/index.ts";
import { Skeleton } from "../../../registry/source/components/skeleton/index.ts";
import { BusyRegion, Spinner } from "../../../registry/source/components/spinner/index.ts";
import { ScreenReaderAnnouncer } from "../../../registry/source/components/sr-announcer/index.ts";
import { Status } from "../../../registry/source/components/status/index.ts";
import "mergora-tokens/tokens.css";

interface FeedbackStatusArgs {
  readonly animateSkeleton: boolean;
  readonly announceAlert: boolean;
  readonly announceBusyState: boolean;
  readonly announceReadChanges: boolean;
  readonly bulkActions: boolean;
  readonly grouped: boolean;
  readonly landmarkCallout: boolean;
  readonly liveQueue: boolean;
  readonly liveStatus: boolean;
  readonly persistBannerDismissal: boolean;
  readonly showBadgeSemantics: boolean;
  readonly showErrorDetails: boolean;
  readonly showMeterThresholds: boolean;
  readonly showProgressValue: boolean;
  readonly showRecoverySuggestions: boolean;
  readonly virtualized: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  inlineSize: "min(48rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const headingStyle: CSSProperties = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xs)",
};

const actionStyle: CSSProperties = {
  background: "var(--mrg-component-control-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-component-control-border)",
  borderRadius: "var(--mrg-component-control-radius)",
  color: "var(--mrg-component-control-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingBlock: "var(--mrg-semantic-density-control-padding-block)",
  paddingInline: "var(--mrg-semantic-density-control-padding-inline)",
};

function SpecimenFrame({
  announcer = false,
  children,
  description,
  itemId,
  title,
}: {
  readonly announcer?: boolean;
  readonly children: ReactNode;
  readonly description: string;
  readonly itemId: string;
  readonly title: string;
}): ReactElement {
  const surface = (
    <section aria-labelledby={`${itemId}-proof-title`} data-story-item={itemId} style={frameStyle}>
      <header style={headingStyle}>
        <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
          {title}
        </h2>
        <p
          style={{
            color: "var(--mrg-semantic-color-foreground-muted)",
            margin: 0,
            maxInlineSize: "65ch",
          }}
        >
          {description}
        </p>
      </header>
      {children}
    </section>
  );

  return (
    <MergoraProvider>
      {announcer ? (
        <ScreenReaderAnnouncer.Provider politeIntervalMs={50} assertiveIntervalMs={50}>
          {surface}
        </ScreenReaderAnnouncer.Provider>
      ) : (
        surface
      )}
    </MergoraProvider>
  );
}

function AlertSpecimen({ announce }: { readonly announce: boolean }): ReactElement {
  return (
    <SpecimenFrame
      announcer={announce}
      description={
        announce
          ? "The visible copy stays static while one concise summary enters the shared polite queue."
          : "A concise static message with no role, live region, or announcement queue."
      }
      itemId="alert"
      title="Alert"
    >
      <Alert
        {...(announce
          ? { announcement: "The review copy is ready.", live: "polite" as const }
          : { live: "off" as const })}
        description="Comments and version history remain attached to this copy."
        title="Review copy ready"
        variant="success"
      />
    </SpecimenFrame>
  );
}

function BadgeSpecimen({ semanticModes }: { readonly semanticModes: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        semanticModes
          ? "Status and bounded count modes add localized context without making the badge interactive."
          : "The category baseline is a compact, noninteractive label."
      }
      itemId="badge"
      title="Badge"
    >
      <div
        style={{
          alignItems: "center",
          display: "flex",
          flexWrap: "wrap",
          gap: "var(--mrg-semantic-density-control-gap)",
        }}
      >
        <Badge>Reference</Badge>
        {semanticModes ? (
          <>
            <Badge kind="status" variant="success">
              Synchronized
            </Badge>
            <Badge count={128} kind="count" label="Unread updates" maximum={99} />
          </>
        ) : null}
      </div>
    </SpecimenFrame>
  );
}

const bannerPersistence: BannerPersistenceAdapter = {
  read: () => undefined,
  write: () => undefined,
};

function BannerSpecimen({ persist }: { readonly persist: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        persist
          ? "Dismissal is available through an injected persistence adapter owned by the consumer."
          : "A non-dismissible page notice has no storage read, write, callback, or persistence state."
      }
      itemId="banner"
      title="Banner"
    >
      <Banner
        dismissible={persist}
        id={persist ? "component-proof-persisted" : "component-proof-static"}
        {...(persist ? { persistence: bannerPersistence } : {})}
        title="Workspace guidance updated"
        variant="info"
      >
        Existing work remains available while the guidance is reviewed.
      </Banner>
    </SpecimenFrame>
  );
}

function CalloutSpecimen({ landmark }: { readonly landmark: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        landmark
          ? "Important explanatory content becomes one correctly named complementary landmark."
          : "Ordinary supporting guidance stays deliberately non-live and outside landmark navigation."
      }
      itemId="callout"
      title="Callout"
    >
      <Callout
        {...(landmark ? { landmarkLabel: "Source review guidance" } : {})}
        title="Keep the original available"
        variant="tip"
      >
        Compare changes against the previous copy before replacing it.
      </Callout>
    </SpecimenFrame>
  );
}

function EmptyStateSpecimen({ suggestions }: { readonly suggestions: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        suggestions
          ? "Concrete recovery suggestions precede the consumer-owned action."
          : "The concise baseline keeps one native recovery action and no generated suggestion list."
      }
      itemId="empty-state"
      title="Empty state"
    >
      <EmptyState
        context="filtered"
        description="Adjust the current filters to recover the complete document list."
        primaryAction={
          <button style={actionStyle} type="button">
            Clear filters
          </button>
        }
        {...(suggestions
          ? {
              recoverySuggestions: {
                items: ["Remove the date filter", "Search by document title"],
                label: "Ways to recover",
              },
            }
          : {})}
        title="No documents match"
      />
    </SpecimenFrame>
  );
}

function ErrorStateSpecimen({ details }: { readonly details: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        details
          ? "Safe technical context is available through a native disclosure while retry stays primary."
          : "The baseline exposes concise recovery only; diagnostics are absent from the DOM and accessibility tree."
      }
      itemId="error-state"
      title="Error state"
    >
      <ErrorState
        description="Retry the request; local edits remain available."
        onRetry={() => undefined}
        recoverable
        {...(details ? { technicalDetails: "Request ID: public-example-18f2" } : {})}
        title="Could not refresh documents"
      />
    </SpecimenFrame>
  );
}

function MeterSpecimen({ thresholds }: { readonly thresholds: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        thresholds
          ? "Visible low, high, and optimum values are linked to the native meter as one description."
          : "The native meter keeps its visible label and value without generated threshold context."
      }
      itemId="meter"
      title="Meter"
    >
      <Meter
        high={85}
        label="Workspace capacity"
        low={55}
        optimum={35}
        showThresholdSummary={thresholds}
        value={68}
      />
    </SpecimenFrame>
  );
}

function ProgressSpecimen({ valueContext }: { readonly valueContext: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        valueContext
          ? "The localized visible percentage also supplies the native progress value text."
          : "The labelled native progress element remains usable without value-copy UI or aria-valuetext."
      }
      itemId="progress"
      title="Progress"
    >
      <Progress label="Preparing preview" showValue={valueContext} value={72} />
    </SpecimenFrame>
  );
}

function SkeletonSpecimen({ animated }: { readonly animated: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        animated
          ? "Purposeful pulse motion is enabled while the placeholder remains strictly decorative."
          : "The same logical footprint remains with motion and motion metadata removed."
      }
      itemId="skeleton"
      title="Skeleton"
    >
      <div style={{ display: "grid", gap: "var(--mrg-semantic-space-stack-sm)" }}>
        <Skeleton animated={animated} blockSize={24} inlineSize="72%" shape="rectangle" />
        <Skeleton animated={animated} blockSize={18} inlineSize="100%" />
        <Skeleton animated={animated} blockSize={18} inlineSize="56%" />
      </div>
    </SpecimenFrame>
  );
}

function SpinnerSpecimen({ announce }: { readonly announce: boolean }): ReactElement {
  return (
    <SpecimenFrame
      announcer={announce}
      description={
        announce
          ? "The named busy region announces only the start of this refresh through the shared queue."
          : "The visual spinner stays decorative; the named region owns aria-busy without live output."
      }
      itemId="spinner"
      title="Spinner and busy region"
    >
      <BusyRegion
        announce={announce}
        busy
        {...(announce ? { busyMessage: "Refreshing document list" } : {})}
        label="Document list"
      >
        <div
          style={{
            alignItems: "center",
            display: "flex",
            gap: "var(--mrg-semantic-density-control-gap)",
          }}
        >
          <Spinner />
          <span>Refreshing document list</span>
        </div>
      </BusyRegion>
    </SpecimenFrame>
  );
}

function StatusSpecimen({ live }: { readonly live: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description={
        live
          ? "The same non-color cue opts into atomic polite status semantics."
          : "Text, shape, and color communicate the static state without a role or live-region attributes."
      }
      itemId="status"
      title="Status"
    >
      <Status live={live ? "polite" : "off"} variant="success">
        All edits synchronized
      </Status>
    </SpecimenFrame>
  );
}

const notifications = [
  {
    category: "Reviews",
    createdAt: "2026-07-20T09:00:00",
    description: "Two comments need a response.",
    id: "review-comments",
    title: "Review comments added",
  },
  {
    category: "Workspace",
    createdAt: "2026-07-20T08:30:00",
    description: "The shared token set is ready to inspect.",
    id: "tokens-ready",
    read: true,
    title: "Token update ready",
  },
  {
    category: "Reviews",
    createdAt: "2026-07-20T08:00:00",
    description: "The document passed automated checks.",
    id: "checks-complete",
    title: "Checks complete",
  },
  {
    category: "Workspace",
    createdAt: "2026-07-20T07:30:00",
    description: "A collaborator shared a new reference.",
    id: "reference-shared",
    title: "Reference shared",
  },
  {
    category: "System",
    createdAt: "2026-07-20T07:00:00",
    description: "Version history remains available.",
    id: "history-ready",
    title: "Version history ready",
  },
] as const;

function NotificationCenterSpecimen({
  announceReadChanges,
  bulkActions,
  grouped,
  liveQueue,
  virtualized,
}: Pick<
  FeedbackStatusArgs,
  "announceReadChanges" | "bulkActions" | "grouped" | "liveQueue" | "virtualized"
>): ReactElement {
  const enhanced = announceReadChanges || bulkActions || grouped || liveQueue || virtualized;
  return (
    <SpecimenFrame
      description={
        enhanced
          ? "Queued arrivals, grouping, selection, windowing, and read announcements remain independently selectable."
          : "A complete flat notification stream renders without enhancement rails, controls, spacers, or live output."
      }
      itemId="notification-center"
      title="Notification center"
    >
      <NotificationCenter
        announceReadChanges={announceReadChanges}
        bulkActions={bulkActions}
        groupBy={grouped ? "category" : false}
        liveUpdatePolicy={liveQueue ? "queue" : false}
        notifications={notifications}
        {...(liveQueue
          ? { onRevealPending: () => undefined, pendingLiveCount: 3 }
          : { pendingLiveCount: 0 })}
        virtualWindow={
          virtualized ? { estimatedItemSize: 88, startIndex: 0, windowSize: 3 } : false
        }
      />
    </SpecimenFrame>
  );
}

const onlyControls = (...names: readonly (keyof FeedbackStatusArgs)[]) => ({
  controls: { include: names },
});

const meta = {
  args: {
    animateSkeleton: false,
    announceAlert: false,
    announceBusyState: false,
    announceReadChanges: false,
    bulkActions: false,
    grouped: false,
    landmarkCallout: false,
    liveQueue: false,
    liveStatus: false,
    persistBannerDismissal: false,
    showBadgeSemantics: false,
    showErrorDetails: false,
    showMeterThresholds: false,
    showProgressValue: false,
    showRecoverySuggestions: false,
    virtualized: false,
  },
  argTypes: {
    animateSkeleton: { control: "boolean", description: "Enable decorative pulse motion." },
    announceAlert: { control: "boolean", description: "Queue one concise Alert summary." },
    announceBusyState: {
      control: "boolean",
      description: "Announce the start of the named busy period.",
    },
    announceReadChanges: {
      control: "boolean",
      description: "Expose a polite read-state announcement output.",
    },
    bulkActions: { control: "boolean", description: "Add native selection and bulk actions." },
    grouped: { control: "boolean", description: "Group notifications by category." },
    landmarkCallout: {
      control: "boolean",
      description: "Promote the Callout to a named complementary landmark.",
    },
    liveQueue: {
      control: "boolean",
      description: "Queue arrivals until the reader explicitly reveals them.",
    },
    liveStatus: { control: "boolean", description: "Opt Status into atomic polite semantics." },
    persistBannerDismissal: {
      control: "boolean",
      description: "Inject consumer-owned dismissal persistence.",
    },
    showBadgeSemantics: {
      control: "boolean",
      description: "Add localized status and bounded count badge modes.",
    },
    showErrorDetails: {
      control: "boolean",
      description: "Add a native technical-details disclosure.",
    },
    showMeterThresholds: {
      control: "boolean",
      description: "Show and associate low, high, and optimum thresholds.",
    },
    showProgressValue: {
      control: "boolean",
      description: "Show localized progress value context.",
    },
    showRecoverySuggestions: {
      control: "boolean",
      description: "Add a labelled list of concrete recovery suggestions.",
    },
    virtualized: {
      control: "boolean",
      description: "Render a bounded notification window with measured spacers.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "Feedback/Status - component proof",
} satisfies Meta<FeedbackStatusArgs>;

export default meta;
type Story = StoryObj<FeedbackStatusArgs>;

export const BasicAlert: Story = {
  args: { announceAlert: false },
  name: "Alert - Basic",
  parameters: onlyControls("announceAlert"),
  render: (args) => <AlertSpecimen announce={args.announceAlert} />,
};

export const RecommendedAlert: Story = {
  args: { announceAlert: true },
  name: "Alert - Recommended Mergora",
  parameters: onlyControls("announceAlert"),
  render: (args) => <AlertSpecimen announce={args.announceAlert} />,
};

export const BasicBadge: Story = {
  args: { showBadgeSemantics: false },
  name: "Badge - Basic",
  parameters: onlyControls("showBadgeSemantics"),
  render: (args) => <BadgeSpecimen semanticModes={args.showBadgeSemantics} />,
};

export const RecommendedBadge: Story = {
  args: { showBadgeSemantics: true },
  name: "Badge - Recommended Mergora",
  parameters: onlyControls("showBadgeSemantics"),
  render: (args) => <BadgeSpecimen semanticModes={args.showBadgeSemantics} />,
};

export const BasicBanner: Story = {
  args: { persistBannerDismissal: false },
  name: "Banner - Basic",
  parameters: onlyControls("persistBannerDismissal"),
  render: (args) => <BannerSpecimen persist={args.persistBannerDismissal} />,
};

export const RecommendedBanner: Story = {
  args: { persistBannerDismissal: true },
  name: "Banner - Recommended Mergora",
  parameters: onlyControls("persistBannerDismissal"),
  render: (args) => <BannerSpecimen persist={args.persistBannerDismissal} />,
};

export const BasicCallout: Story = {
  args: { landmarkCallout: false },
  name: "Callout - Basic",
  parameters: onlyControls("landmarkCallout"),
  render: (args) => <CalloutSpecimen landmark={args.landmarkCallout} />,
};

export const RecommendedCallout: Story = {
  args: { landmarkCallout: true },
  name: "Callout - Recommended Mergora",
  parameters: onlyControls("landmarkCallout"),
  render: (args) => <CalloutSpecimen landmark={args.landmarkCallout} />,
};

export const BasicEmptyState: Story = {
  args: { showRecoverySuggestions: false },
  name: "Empty State - Basic",
  parameters: onlyControls("showRecoverySuggestions"),
  render: (args) => <EmptyStateSpecimen suggestions={args.showRecoverySuggestions} />,
};

export const RecommendedEmptyState: Story = {
  args: { showRecoverySuggestions: true },
  name: "Empty State - Recommended Mergora",
  parameters: onlyControls("showRecoverySuggestions"),
  render: (args) => <EmptyStateSpecimen suggestions={args.showRecoverySuggestions} />,
};

export const BasicErrorState: Story = {
  args: { showErrorDetails: false },
  name: "Error State - Basic",
  parameters: onlyControls("showErrorDetails"),
  render: (args) => <ErrorStateSpecimen details={args.showErrorDetails} />,
};

export const RecommendedErrorState: Story = {
  args: { showErrorDetails: true },
  name: "Error State - Recommended Mergora",
  parameters: onlyControls("showErrorDetails"),
  render: (args) => <ErrorStateSpecimen details={args.showErrorDetails} />,
};

export const BasicMeter: Story = {
  args: { showMeterThresholds: false },
  name: "Meter - Basic",
  parameters: onlyControls("showMeterThresholds"),
  render: (args) => <MeterSpecimen thresholds={args.showMeterThresholds} />,
};

export const RecommendedMeter: Story = {
  args: { showMeterThresholds: true },
  name: "Meter - Recommended Mergora",
  parameters: onlyControls("showMeterThresholds"),
  render: (args) => <MeterSpecimen thresholds={args.showMeterThresholds} />,
};

export const BasicProgress: Story = {
  args: { showProgressValue: false },
  name: "Progress - Basic",
  parameters: onlyControls("showProgressValue"),
  render: (args) => <ProgressSpecimen valueContext={args.showProgressValue} />,
};

export const RecommendedProgress: Story = {
  args: { showProgressValue: true },
  name: "Progress - Recommended Mergora",
  parameters: onlyControls("showProgressValue"),
  render: (args) => <ProgressSpecimen valueContext={args.showProgressValue} />,
};

export const BasicSkeleton: Story = {
  args: { animateSkeleton: false },
  name: "Skeleton - Basic",
  parameters: onlyControls("animateSkeleton"),
  render: (args) => <SkeletonSpecimen animated={args.animateSkeleton} />,
};

export const RecommendedSkeleton: Story = {
  args: { animateSkeleton: true },
  name: "Skeleton - Recommended Mergora",
  parameters: onlyControls("animateSkeleton"),
  render: (args) => <SkeletonSpecimen animated={args.animateSkeleton} />,
};

export const BasicSpinner: Story = {
  args: { announceBusyState: false },
  name: "Spinner - Basic",
  parameters: onlyControls("announceBusyState"),
  render: (args) => <SpinnerSpecimen announce={args.announceBusyState} />,
};

export const RecommendedSpinner: Story = {
  args: { announceBusyState: true },
  name: "Spinner - Recommended Mergora",
  parameters: onlyControls("announceBusyState"),
  render: (args) => <SpinnerSpecimen announce={args.announceBusyState} />,
};

export const BasicStatus: Story = {
  args: { liveStatus: false },
  name: "Status - Basic",
  parameters: onlyControls("liveStatus"),
  render: (args) => <StatusSpecimen live={args.liveStatus} />,
};

export const RecommendedStatus: Story = {
  args: { liveStatus: true },
  name: "Status - Recommended Mergora",
  parameters: onlyControls("liveStatus"),
  render: (args) => <StatusSpecimen live={args.liveStatus} />,
};

const notificationControls = [
  "liveQueue",
  "grouped",
  "bulkActions",
  "virtualized",
  "announceReadChanges",
] as const;

export const BasicNotificationCenter: Story = {
  args: {
    announceReadChanges: false,
    bulkActions: false,
    grouped: false,
    liveQueue: false,
    virtualized: false,
  },
  name: "Notification Center - Basic",
  parameters: onlyControls(...notificationControls),
  render: (args) => <NotificationCenterSpecimen {...args} />,
};

export const RecommendedNotificationCenter: Story = {
  args: {
    announceReadChanges: true,
    bulkActions: true,
    grouped: true,
    liveQueue: true,
    virtualized: true,
  },
  name: "Notification Center - Recommended Mergora",
  parameters: onlyControls(...notificationControls),
  render: (args) => <NotificationCenterSpecimen {...args} />,
};
