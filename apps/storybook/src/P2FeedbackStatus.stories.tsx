import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Alert } from "../../../registry/source/components/alert/alert";
import { Badge } from "../../../registry/source/components/badge/badge";
import {
  Banner,
  createBannerStoragePersistence,
} from "../../../registry/source/components/banner/banner";
import { Callout } from "../../../registry/source/components/callout/callout";
import { EmptyState } from "../../../registry/source/components/empty-state/empty-state";
import { ErrorState } from "../../../registry/source/components/error-state/error-state";
import { Meter } from "../../../registry/source/components/meter/meter";
import { Progress } from "../../../registry/source/components/progress/progress";
import {
  MergoraProvider,
  type MergoraMessages,
} from "../../../registry/source/components/provider/provider";
import { Skeleton } from "../../../registry/source/components/skeleton/skeleton";
import { BusyRegion, Spinner } from "../../../registry/source/components/spinner/spinner";
import { ScreenReaderAnnouncer } from "../../../registry/source/components/sr-announcer/sr-announcer";
import { Status } from "../../../registry/source/components/status/status";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  maxInlineSize: "100%",
  minBlockSize: "100vh",
  minInlineSize: 0,
  overflowWrap: "anywhere",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "var(--mrg-semantic-size-content-default)",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
} satisfies CSSProperties;

const rowStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-inline-md)",
  minInlineSize: 0,
} satisfies CSSProperties;

const actionStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-action-border)",
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  cursor: "pointer",
  font: "inherit",
  minBlockSize: "2.75rem",
  minInlineSize: "2.75rem",
  paddingBlock: "var(--mrg-semantic-density-control-padding-block)",
  paddingInline: "var(--mrg-semantic-density-control-padding-inline)",
} satisfies CSSProperties;

function Canvas({
  announcer = false,
  announcerDedupeWindowMs,
  children,
  direction = "ltr",
  locale = direction === "rtl" ? "ar-EG" : "en-US",
  messages,
}: {
  readonly announcer?: boolean;
  readonly announcerDedupeWindowMs?: number;
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
  readonly messages?: MergoraMessages;
}) {
  const content = (
    <main style={canvasStyle}>
      <div style={workbenchStyle}>{children}</div>
    </main>
  );
  return (
    <MergoraProvider
      {...(messages === undefined ? {} : { messages })}
      direction={direction}
      locale={locale}
    >
      {announcer ? (
        <ScreenReaderAnnouncer.Provider
          {...(announcerDedupeWindowMs === undefined
            ? {}
            : { dedupeWindowMs: announcerDedupeWindowMs })}
        >
          {content}
        </ScreenReaderAnnouncer.Provider>
      ) : (
        content
      )}
    </MergoraProvider>
  );
}

function Workbench() {
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Feedback and status workbench</h1>
        <p style={{ marginBlockEnd: 0 }}>
          Static feedback stays quiet, live behavior is explicit, and status remains visible through
          text and shape as well as color.
        </p>
      </header>

      <section aria-labelledby="messages-heading" style={specimenStyle}>
        <h2 id="messages-heading" style={{ margin: 0 }}>
          Static messages
        </h2>
        <Alert
          actions={
            <button style={actionStyle} type="button">
              Review release
            </button>
          }
          description="The candidate is ready for independent verification."
          headingLevel={3}
          title="Verification requested"
          variant="info"
        />
        <Callout headingLevel={3} title="Evidence remains immutable" variant="tip">
          Each automated or manual result binds to the exact candidate digest it evaluated.
        </Callout>
        <Banner
          headingLevel={3}
          id="workbench-maintenance"
          title="Maintenance window"
          variant="warning"
        >
          Registry publishing pauses for five minutes while existing installs remain available.
        </Banner>
      </section>

      <section aria-labelledby="status-heading" style={specimenStyle}>
        <h2 id="status-heading" style={{ margin: 0 }}>
          Compact status
        </h2>
        <div style={rowStyle}>
          <Badge>Beta</Badge>
          <Badge kind="status" variant="success">
            Published
          </Badge>
          <Badge count={128} kind="count" label="Open review comments" maximum={99} />
          <Status variant="warning">Manual verification pending</Status>
        </div>
      </section>

      <section aria-labelledby="measurement-heading" style={specimenStyle}>
        <h2 id="measurement-heading" style={{ margin: 0 }}>
          Progress and measurement
        </h2>
        <Progress label="Package verification" value={72} />
        <Progress label="Registry indexing" />
        <Meter high={85} label="Bundle budget used" low={55} optimum={35} value={68} />
      </section>

      <section aria-labelledby="loading-heading" style={specimenStyle}>
        <h2 id="loading-heading" style={{ margin: 0 }}>
          Loading ownership
        </h2>
        <BusyRegion label="Catalog results" busy>
          <div style={rowStyle}>
            <Spinner />
            <span>Refreshing catalog results</span>
          </div>
          <Skeleton blockSize={18} inlineSize="72%" />
          <Skeleton blockSize={18} inlineSize="48%" />
        </BusyRegion>
      </section>

      <section aria-labelledby="recovery-heading" style={specimenStyle}>
        <h2 id="recovery-heading" style={{ margin: 0 }}>
          Empty and error recovery
        </h2>
        <EmptyState
          context="filtered"
          description="Remove one or more filters to see catalog entries."
          headingLevel={3}
          icon="?"
          primaryAction={
            <button style={actionStyle} type="button">
              Clear filters
            </button>
          }
          title="No matching components"
        />
        <ErrorState
          description="Check the connection and try the registry request again."
          headingLevel={3}
          onRetry={() => undefined}
          recoverable
          technicalDetails="Request ID: public-example-4f2a"
          title="Could not load the registry"
        />
      </section>
    </Canvas>
  );
}

function PersistenceSpecimen() {
  const restoreRef = useRef<HTMLButtonElement>(null);
  const [revision, setRevision] = useState(0);
  const persistence = useMemo(
    () => createBannerStoragePersistence(globalThis.localStorage, "mergora.story.banner."),
    [],
  );

  const restore = () => {
    persistence.write("persistent-release", false);
    setRevision((value) => value + 1);
  };

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Persistent banner recipe</h1>
      <p>
        Dismissal uses an injected storage adapter. This demo explicitly restores focus to the
        recovery control after the banner disappears.
      </p>
      <button onClick={restore} ref={restoreRef} style={actionStyle} type="button">
        Restore persisted banner
      </button>
      <Banner
        id="persistent-release"
        key={revision}
        onDismissedChange={(dismissed) => {
          if (dismissed) queueMicrotask(() => restoreRef.current?.focus());
        }}
        persistence={persistence}
        title="New registry release"
        variant="success"
      >
        Version 1.2.0 is available for independent review.
      </Banner>
    </Canvas>
  );
}

function RecoverySpecimen() {
  const [retryCount, setRetryCount] = useState(0);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Recovery states</h1>
      <EmptyState
        context="first-use"
        description="Create the first theme to establish reusable semantic tokens."
        primaryAction={
          <button style={actionStyle} type="button">
            Create theme
          </button>
        }
        secondaryAction={<a href="#learn">Learn about themes</a>}
        title="No themes yet"
      />
      <ErrorState
        description="The safe public error description does not expose raw exception content."
        onRetry={() => setRetryCount((value) => value + 1)}
        recoverable
        technicalDetails="Request ID: public-example-7a1c"
        title="Registry request failed"
      />
      <output aria-live="polite">Retry attempts: {retryCount}</output>
    </Canvas>
  );
}

function LivePolicySpecimen() {
  const [announcement, setAnnouncement] = useState<{
    readonly message: string;
    readonly priority: "assertive" | "polite";
    readonly revision: number;
  } | null>(null);

  const announce = (priority: "assertive" | "polite") => {
    setAnnouncement((current) => ({
      message:
        priority === "assertive"
          ? "Publishing is blocked by a digest mismatch."
          : "The draft was saved locally.",
      priority,
      revision: (current?.revision ?? 0) + 1,
    }));
  };

  return (
    <Canvas announcer>
      <h1 style={{ margin: 0 }}>Explicit live-region policy</h1>
      <p>
        Announcements begin only after a user-triggered state transition. Visual copy and actions
        remain outside the two persistent shared live regions.
      </p>
      <div style={rowStyle}>
        <button onClick={() => announce("polite")} style={actionStyle} type="button">
          Save draft
        </button>
        <button onClick={() => announce("assertive")} style={actionStyle} type="button">
          Check publish block
        </button>
      </div>
      {announcement === null ? (
        <Status>Waiting for a feedback transition</Status>
      ) : (
        <Alert
          actions={
            <button style={actionStyle} type="button">
              Review details
            </button>
          }
          announcement={`${announcement.message} Event ${announcement.revision}.`}
          key={`${announcement.priority}-${announcement.revision}`}
          live={announcement.priority}
          title={announcement.priority === "assertive" ? "Publish blocked" : "Draft saved"}
          variant={announcement.priority === "assertive" ? "error" : "success"}
        >
          {announcement.message}
        </Alert>
      )}
    </Canvas>
  );
}

function LoadingSpecimen() {
  const [busy, setBusy] = useState(false);
  return (
    <Canvas announcer announcerDedupeWindowMs={5_000}>
      <h1 style={{ margin: 0 }}>Loading states</h1>
      <button onClick={() => setBusy((value) => !value)} style={actionStyle} type="button">
        {busy ? "Finish refresh" : "Refresh results"}
      </button>
      <BusyRegion
        announce={busy}
        busy={busy}
        label="Search results"
        busyMessage="Refreshing search results"
      >
        {busy ? (
          <>
            <div style={rowStyle}>
              <Spinner size="large" />
              <span>Refreshing search results</span>
            </div>
            <Skeleton blockSize={24} inlineSize="100%" shape="rectangle" />
            <Skeleton blockSize={18} inlineSize="80%" />
            <Skeleton blockSize={18} inlineSize="55%" />
          </>
        ) : (
          <p style={{ margin: 0 }}>Results are ready.</p>
        )}
      </BusyRegion>
    </Canvas>
  );
}

function FeedbackVariantsSpecimen() {
  const alertVariants = ["info", "success", "warning", "error"] as const;
  const calloutVariants = ["note", "info", "tip", "warning"] as const;
  const bannerVariants = ["info", "success", "warning", "error"] as const;
  const statusVariants = ["neutral", "info", "success", "warning", "error"] as const;

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Complete feedback variants</h1>
      <section aria-labelledby="alert-variants" style={specimenStyle}>
        <h2 id="alert-variants" style={{ margin: 0 }}>
          Alert variants
        </h2>
        {alertVariants.map((variant) => (
          <Alert key={variant} title={`${variant} alert`} variant={variant}>
            Visible text and shape carry the {variant} meaning.
          </Alert>
        ))}
      </section>
      <section aria-labelledby="callout-variants" style={specimenStyle}>
        <h2 id="callout-variants" style={{ margin: 0 }}>
          Callout variants
        </h2>
        {calloutVariants.map((variant) => (
          <Callout key={variant} title={`${variant} callout`} variant={variant}>
            Explanatory {variant} guidance remains non-live.
          </Callout>
        ))}
      </section>
      <section aria-labelledby="banner-variants" style={specimenStyle}>
        <h2 id="banner-variants" style={{ margin: 0 }}>
          Banner variants
        </h2>
        {bannerVariants.map((variant) => (
          <Banner
            dismissible={false}
            id={`variant-${variant}`}
            key={variant}
            title={`${variant} banner`}
            variant={variant}
          >
            Page-level {variant} information remains visible without relying on color.
          </Banner>
        ))}
      </section>
      <section aria-labelledby="compact-variants" style={specimenStyle}>
        <h2 id="compact-variants" style={{ margin: 0 }}>
          Badge and status variants
        </h2>
        <div style={rowStyle}>
          <Badge>Category</Badge>
          {statusVariants.map((variant) => (
            <Badge kind="status" key={`badge-${variant}`} variant={variant}>
              {variant}
            </Badge>
          ))}
        </div>
        <div style={rowStyle}>
          {statusVariants.map((variant) => (
            <Status key={`status-${variant}`} variant={variant}>
              {variant} state
            </Status>
          ))}
        </div>
      </section>
      <section aria-labelledby="range-variants" style={specimenStyle}>
        <h2 id="range-variants" style={{ margin: 0 }}>
          Range and loading variants
        </h2>
        <Progress label="Determinate verification" value={72} />
        <Progress label="Indeterminate verification" />
        <Meter high={85} label="Bundle budget" low={55} optimum={35} value={68} />
        <div style={rowStyle}>
          <Spinner size="small" />
          <Spinner size="medium" />
          <Spinner size="large" />
        </div>
      </section>
      <section aria-labelledby="recovery-variants" style={specimenStyle}>
        <h2 id="recovery-variants" style={{ margin: 0 }}>
          Recovery variants
        </h2>
        <EmptyState
          context="search"
          description="Broaden the query to recover results."
          primaryAction={
            <button type="button" style={actionStyle}>
              Clear query
            </button>
          }
          title="No search results"
        />
        <ErrorState
          description="Retry the safe registry request."
          onRetry={() => undefined}
          recoverable
          title="Registry request failed"
        />
      </section>
    </Canvas>
  );
}

function ErrorInteractionsSpecimen() {
  const [retryCount, setRetryCount] = useState(0);
  const [reportCount, setReportCount] = useState(0);
  const errorStateProps = {
    description: "The public message keeps raw exception content private.",
    onRetry: () => setRetryCount((value) => value + 1),
    recoverable: true,
    technicalDetails: "Request ID: public-example-interaction",
    title: "Registry request failed",
  } as const;
  return (
    <Canvas announcer>
      <h1 style={{ margin: 0 }}>Error recovery interactions</h1>
      <button
        onClick={() => setReportCount((value) => value + 1)}
        style={actionStyle}
        type="button"
      >
        Report blocking error
      </button>
      {reportCount === 0 ? (
        <ErrorState {...errorStateProps} />
      ) : (
        <ErrorState
          {...errorStateProps}
          announcement={`Registry request failed. Retry is available. Event ${reportCount}.`}
          live="assertive"
        />
      )}
      <output>Retry attempts: {retryCount}</output>
    </Canvas>
  );
}

function BannerInteractionsSpecimen() {
  const [revision, setRevision] = useState(0);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Banner dismissal interactions</h1>
      <button onClick={() => setRevision((value) => value + 1)} style={actionStyle} type="button">
        Restore banner
      </button>
      <Banner id="interaction-banner" key={revision} title="Review the release" variant="warning">
        The dismiss control owns visible hover, active, and focus-visible states.
      </Banner>
    </Canvas>
  );
}

function HydratedBannerTree({
  onHydrated,
  persistence,
}: {
  readonly onHydrated: () => void;
  readonly persistence: ReturnType<typeof createBannerStoragePersistence>;
}) {
  useEffect(onHydrated, [onHydrated]);
  return (
    <Banner
      id="persisted-hidden"
      persistence={persistence}
      title="Persisted hidden maintenance notice"
    >
      This server markup hydrates directly into its persisted hidden state.
    </Banner>
  );
}

function BannerHydrationSpecimen() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    const storageKey = "mergora.story.hydration.persisted-hidden";
    globalThis.localStorage.setItem(storageKey, "dismissed");
    const persistence = createBannerStoragePersistence(
      globalThis.localStorage,
      "mergora.story.hydration.",
    );
    let everVisible = false;
    let sampleFrame = 0;
    let finishFrame = 0;
    let observer: MutationObserver | null = null;
    let hydrationRoot: ReturnType<typeof hydrateRoot> | null = null;
    const isVisible = () => {
      const banner = host.querySelector<HTMLElement>('[data-slot="banner"]');
      if (banner === null) return false;
      const style = getComputedStyle(banner);
      return !banner.hidden && style.display !== "none" && style.visibility !== "hidden";
    };
    const sample = () => {
      everVisible ||= isVisible();
      if (host.dataset.hydrated !== "true") sampleFrame = requestAnimationFrame(sample);
    };
    const markHydrated = () => {
      finishFrame = requestAnimationFrame(() => {
        finishFrame = requestAnimationFrame(() => {
          everVisible ||= isVisible();
          host.dataset.everVisible = String(everVisible);
          host.dataset.hydrated = "true";
        });
      });
    };
    const tree = <HydratedBannerTree onHydrated={markHydrated} persistence={persistence} />;

    host.dataset.hydrated = "pending";
    host.innerHTML = renderToString(tree);
    host.dataset.preHydrationVisible = String(isVisible());
    everVisible ||= isVisible();
    const banner = host.querySelector<HTMLElement>('[data-slot="banner"]');
    if (banner !== null) {
      observer = new MutationObserver(() => {
        everVisible ||= isVisible();
      });
      observer.observe(banner, { attributes: true, childList: true, subtree: true });
    }
    sampleFrame = requestAnimationFrame(sample);
    hydrationRoot = hydrateRoot(host, tree, {
      onRecoverableError(error) {
        host.dataset.hydrationError = error instanceof Error ? error.message : String(error);
      },
    });

    return () => {
      observer?.disconnect();
      cancelAnimationFrame(sampleFrame);
      cancelAnimationFrame(finishFrame);
      globalThis.localStorage.removeItem(storageKey);
      const root = hydrationRoot;
      queueMicrotask(() => root?.unmount());
    };
  }, []);

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Persisted Banner SSR hydration</h1>
      <div data-testid="banner-hydration-host" ref={hostRef} />
    </Canvas>
  );
}

function ContainedLayoutSpecimen() {
  const container = (inlineSize: string) =>
    ({
      border:
        "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
      boxSizing: "border-box",
      inlineSize,
      maxInlineSize: "100%",
      padding: "var(--mrg-semantic-space-stack-sm)",
    }) satisfies CSSProperties;

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Intrinsic contained layouts</h1>
      <p>The viewport is wide while each feedback component is embedded in a narrow region.</p>
      <div data-contained-width="240" style={container("15rem")}>
        <Banner
          actions={
            <button style={actionStyle} type="button">
              View maintenance status
            </button>
          }
          id="contained-240"
          title="A long maintenance announcement"
          variant="warning"
        >
          Existing installations keep working while the immutable catalog is rebuilt and checked.
        </Banner>
      </div>
      <div data-contained-width="320" style={container("20rem")}>
        <Banner
          actions={
            <button style={actionStyle} type="button">
              Review evidence
            </button>
          }
          id="contained-320"
          title="Independent verification requires evidence"
        >
          Actions reflow without clipping, overlap, or page-level horizontal scrolling.
        </Banner>
      </div>
    </Canvas>
  );
}

const localizedMessages = {
  "alert.warning": "Warnung",
  "badge.count": "{label}: {count}",
  "badge.status": "{variant}: {label}",
  "badge.success": "Erfolg",
  "banner.dismiss": "Meldung schließen",
  "banner.info": "Information",
  "callout.tip": "Tipp",
  "errorState.details": "Technische Details",
  "errorState.label": "Fehler",
  "errorState.retry": "Erneut versuchen",
  "progress.indeterminate": "In Bearbeitung",
  "spinner.busy": "Wird geladen",
  "status.warning": "Warnung",
  "status.variantLabel": "{variant}:",
} satisfies MergoraMessages;

const arabicMessages = {
  "alert.warning": "تحذير",
  "badge.count": "{label}: {count}",
  "badge.status": "{variant} — {label}",
  "badge.success": "نجاح",
  "callout.tip": "نصيحة",
  "progress.indeterminate": "قيد التنفيذ",
  "status.variantLabel": "{variant} —",
  "status.warning": "تحذير",
} satisfies MergoraMessages;

const meta = {
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Feedback Status",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const FeedbackWorkbench: Story = { render: () => <Workbench /> };

export const FeedbackVariants: Story = { render: () => <FeedbackVariantsSpecimen /> };

export const LivePolicy: Story = { render: () => <LivePolicySpecimen /> };

export const BannerPersistence: Story = { render: () => <PersistenceSpecimen /> };

export const BannerHydration: Story = { render: () => <BannerHydrationSpecimen /> };

export const LoadingStates: Story = { render: () => <LoadingSpecimen /> };

export const RecoveryStates: Story = { render: () => <RecoverySpecimen /> };

export const BannerInteractions: Story = { render: () => <BannerInteractionsSpecimen /> };

export const ErrorInteractions: Story = { render: () => <ErrorInteractionsSpecimen /> };

export const ContainedLayout: Story = { render: () => <ContainedLayoutSpecimen /> };

export const LocalizedMessages: Story = {
  render: () => (
    <Canvas locale="de-DE" messages={localizedMessages}>
      <h1 style={{ margin: 0 }}>Lokalisierte Rückmeldung</h1>
      <Alert
        description="Bitte prüfen Sie den Kandidaten."
        title="Prüfung erforderlich"
        variant="warning"
      />
      <Callout title="Nachweis prüfen" variant="tip">
        Vergleichen Sie den unveränderlichen Digest.
      </Callout>
      <Banner id="localized-banner" title="Neue Version verfügbar">
        Die neue Version kann jetzt unabhängig geprüft werden.
      </Banner>
      <div style={rowStyle}>
        <Badge kind="status" variant="success">
          Veröffentlicht
        </Badge>
        <Badge count={1234} kind="count" label="Prüfkommentare" maximum={99} />
        <Status variant="warning">Manuelle Prüfung ausstehend</Status>
      </div>
      <Progress label="Registrierung wird indexiert" />
      <ErrorState
        description="Prüfen Sie die Verbindung und versuchen Sie es erneut."
        onRetry={() => undefined}
        recoverable
        technicalDetails="Anfragekennung: öffentliches-beispiel"
        title="Registrierung konnte nicht geladen werden"
      />
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="en-US">
      <h1 style={{ margin: 0 }}>{"اختبار حالات الملاحظات"}</h1>
      <Alert description="راجع الدليل قبل النشر." title="التحقق مطلوب" variant="warning" />
      <Callout title="سجل ثابت" variant="tip">
        {"يرتبط كل دليل بالإصدار الذي تم اختباره."}
      </Callout>
      <div style={rowStyle}>
        <Badge kind="status" variant="success">
          {"تم النشر"}
        </Badge>
        <Badge count={128} kind="count" label="تعليقات المراجعة" maximum={99} />
        <Status variant="warning">{"التحقق اليدوي معلق"}</Status>
      </div>
      <Progress label="التحقق من الحزمة" value={72} />
    </Canvas>
  ),
};

export const LocalizedRightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="ar-EG" messages={arabicMessages}>
      <h1 style={{ margin: 0 }}>حالات الملاحظات المترجمة</h1>
      <Alert description="راجع الدليل قبل النشر." title="التحقق مطلوب" variant="warning" />
      <Callout title="سجل ثابت" variant="tip">
        يرتبط كل دليل بالإصدار الذي تم اختباره.
      </Callout>
      <div style={rowStyle}>
        <Badge kind="status" variant="success">
          تم النشر
        </Badge>
        <Badge count={128} kind="count" label="تعليقات المراجعة" maximum={99} />
        <Status variant="warning">التحقق اليدوي معلق</Status>
      </div>
      <Progress label="التحقق من الحزمة" value={72} />
    </Canvas>
  ),
};

export const NarrowLayout: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Narrow and long-content feedback</h1>
      <Alert
        description="This deliberately long localized-style message must wrap without clipping, overlap, horizontal document scrolling, or hiding the recovery action."
        title="Independent verification needs additional evidence before publication"
        variant="warning"
      />
      <Banner id="narrow-banner" title="A long registry maintenance announcement">
        Existing installations continue to work while the immutable catalog is rebuilt and checked.
      </Banner>
      <Progress label="Verifying an unusually descriptive package candidate" value={67} />
      <Meter
        label="Percentage of the documented bundle-size budget currently consumed"
        value={76}
      />
      <EmptyState
        context="search"
        description="Try a shorter phrase or remove several filters to recover the complete catalog."
        primaryAction={
          <button style={actionStyle} type="button">
            Clear all catalog filters
          </button>
        }
        title="No components match this deliberately long query"
      />
      <ErrorState
        description="Check the connection and retry; the public error copy wraps without exposing implementation details."
        onRetry={() => undefined}
        recoverable
        title="The registry could not be loaded at this narrow viewport"
      />
    </Canvas>
  ),
};
