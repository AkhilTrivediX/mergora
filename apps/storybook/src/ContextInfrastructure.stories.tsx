import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState, type CSSProperties, type ReactElement } from "react";

import { ClientOnly } from "../../../registry/source/components/client-only/index";
import { Direction, useDirection } from "../../../registry/source/components/direction/index";
import { FocusRing } from "../../../registry/source/components/focus-ring/index";
import { LayerManager } from "../../../registry/source/components/layer-manager/index";
import { Portal } from "../../../registry/source/components/portal/index";
import { Presence } from "../../../registry/source/components/presence/index";
import {
  MergoraProvider,
  useMergoraContext,
  type MergoraDensity,
  type MergoraReducedMotion,
} from "../../../registry/source/components/provider/index";
import { Slot } from "../../../registry/source/components/slot/index";
import {
  ScreenReaderAnnouncer,
  useAnnouncer,
} from "../../../registry/source/components/sr-announcer/index";
import { VisuallyHidden } from "../../../registry/source/components/visually-hidden/index";

interface InfrastructureStoryArgs {
  readonly announcementRepeats: boolean;
  readonly clientReadyNotification: boolean;
  readonly density: MergoraDensity;
  readonly directionIsolation: boolean;
  readonly layerEnvironment: boolean;
  readonly portalFallback: boolean;
  readonly presenceInitialEnter: boolean;
  readonly providerAsChild: boolean;
  readonly reducedMotion: MergoraReducedMotion;
  readonly revealSkipLink: boolean;
  readonly slotHandler: boolean;
  readonly strongFocus: boolean;
}

const frame: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "flex",
  flexDirection: "column",
  gap: "var(--mrg-semantic-space-stack-lg)",
  inlineSize: "min(54rem, calc(100vw - 2rem))",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const specimen: CSSProperties = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  borderInlineStart:
    "var(--mrg-semantic-border-width-emphasis) solid var(--mrg-semantic-color-brand-living)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-sm)",
  paddingBlockStart: "var(--mrg-semantic-space-stack-md)",
  paddingInlineStart: "var(--mrg-semantic-space-inline-md)",
};

const actions: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-density-control-gap)",
};

const action: CSSProperties = {
  background: "var(--mrg-component-control-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-component-control-border)",
  borderRadius: "var(--mrg-component-control-radius)",
  color: "var(--mrg-component-control-foreground)",
  minBlockSize: "var(--mrg-semantic-density-control-height)",
  paddingBlock: "var(--mrg-semantic-density-control-padding-block)",
  paddingInline: "var(--mrg-semantic-density-control-padding-inline)",
};

const readout: CSSProperties = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xs)",
  gridTemplateColumns: "minmax(7rem, auto) minmax(0, 1fr)",
  margin: 0,
};

function ContextReadout(): ReactElement {
  const context = useMergoraContext();
  const direction = useDirection();
  return (
    <dl style={readout}>
      <dt>Locale</dt>
      <dd>{context.locale}</dd>
      <dt>Direction</dt>
      <dd>{direction}</dd>
      <dt>Time zone</dt>
      <dd>{context.timeZone}</dd>
      <dt>Density</dt>
      <dd>{context.density}</dd>
      <dt>Save message</dt>
      <dd>{context.getMessage("save", "Save")}</dd>
    </dl>
  );
}

function AnnouncerControls({ allowRepeats = false }: { readonly allowRepeats?: boolean }) {
  const { announce, clear } = useAnnouncer();
  return (
    <div style={actions}>
      <button
        type="button"
        style={action}
        onClick={() =>
          announce(
            { key: "saved", defaultMessage: "Workspace saved" },
            allowRepeats ? { dedupe: false } : undefined,
          )
        }
      >
        Queue polite update
      </button>
      <button
        type="button"
        style={action}
        onClick={() => announce("Connection lost", { priority: "assertive" })}
      >
        Queue urgent error
      </button>
      {allowRepeats ? (
        <button
          type="button"
          style={action}
          onClick={() => announce("Workspace saved", { dedupe: false })}
        >
          Repeat intentionally
        </button>
      ) : null}
      <button type="button" style={action} onClick={clear}>
        Clear queue
      </button>
    </div>
  );
}

function FoundationWorkbench(args: InfrastructureStoryArgs): ReactElement {
  const [clientReadyCount, setClientReadyCount] = useState(0);
  const [layerOpen, setLayerOpen] = useState(true);
  const [present, setPresent] = useState(true);
  const [slotActivations, setSlotActivations] = useState(0);
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const registerTarget = useCallback((node: HTMLDivElement | null) => setTarget(node), []);

  const content = (
    <main id="foundation-workbench" style={frame}>
      {args.revealSkipLink ? (
        <VisuallyHidden as="a" href="#foundation-primary-action" revealOnFocus>
          Jump to the primary workbench action
        </VisuallyHidden>
      ) : (
        <VisuallyHidden>Foundation utilities preserve native semantics.</VisuallyHidden>
      )}

      <header>
        <p style={{ color: "var(--mrg-semantic-color-brand-violet)", margin: 0 }}>
          Mergora foundation
        </p>
        <h1 style={{ marginBlock: "var(--mrg-semantic-space-stack-xs) 0" }}>
          Context and infrastructure workbench
        </h1>
        <p style={{ color: "var(--mrg-semantic-color-foreground-muted)" }}>
          Native structure stays authoritative while context, focus, layering, and announcements
          share one predictable policy.
        </p>
      </header>

      <section aria-labelledby="context-heading" style={specimen}>
        <h2 id="context-heading">Localized direction boundary</h2>
        <Direction.Boundary direction="rtl" isolate={args.directionIsolation}>
          <p>
            Review state: <bdi>قيد المراجعة</bdi>
          </p>
        </Direction.Boundary>
        <ContextReadout />
      </section>

      <section aria-labelledby="composition-heading" style={specimen}>
        <h2 id="composition-heading">Focus and native composition</h2>
        <div style={actions}>
          <FocusRing contrast={args.strongFocus ? "strong" : "standard"}>
            <button id="foundation-primary-action" type="button" style={action}>
              Review changes
            </button>
          </FocusRing>
          <Slot
            data-slot="composed-action"
            onClick={args.slotHandler ? () => setSlotActivations((count) => count + 1) : undefined}
          >
            <button type="button" style={action}>
              Composed action
            </button>
          </Slot>
        </div>
        {args.slotHandler ? (
          <output aria-live="polite">Slot orchestration events: {slotActivations}</output>
        ) : null}
      </section>

      <section aria-labelledby="client-heading" style={specimen}>
        <h2 id="client-heading">Hydration-safe client and portal content</h2>
        <ul>
          <ClientOnly
            key={args.clientReadyNotification ? "client-ready-enabled" : "client-ready-disabled"}
            fallback={<li>Server-safe control placeholder</li>}
            {...(args.clientReadyNotification
              ? { onClientReady: () => setClientReadyCount((count) => count + 1) }
              : {})}
          >
            <li>Browser controls ready</li>
          </ClientOnly>
        </ul>
        {args.clientReadyNotification ? (
          <output>Client-ready events: {clientReadyCount}</output>
        ) : null}
        <div ref={registerTarget} aria-label="Portal target" />
        <Portal
          key={args.portalFallback ? "portal-fallback-enabled" : "portal-fallback-disabled"}
          container={target}
          fallback={args.portalFallback ? <p role="status">Preparing contextual tools…</p> : null}
        >
          <p>Context retained at the portal target.</p>
        </Portal>
      </section>

      <section aria-labelledby="presence-heading" style={specimen}>
        <h2 id="presence-heading">Interruptible presence</h2>
        <button type="button" style={action} onClick={() => setPresent((value) => !value)}>
          {present ? "Hide details" : "Show details"}
        </button>
        <Presence
          key={args.presenceInitialEnter ? "initial-enter-enabled" : "initial-enter-disabled"}
          present={present}
          initialEnter={args.presenceInitialEnter}
        >
          {({ state }) => <p>Lifecycle: {state}. The content starts visible.</p>}
        </Presence>
      </section>

      <section aria-labelledby="announcement-heading" style={specimen}>
        <h2 id="announcement-heading">Paced announcements</h2>
        <ScreenReaderAnnouncer.Provider politeIntervalMs={50} assertiveIntervalMs={50}>
          <AnnouncerControls allowRepeats={args.announcementRepeats} />
        </ScreenReaderAnnouncer.Provider>
      </section>

      <section aria-labelledby="layer-heading" style={specimen}>
        <h2 id="layer-heading">Shared layer ownership</h2>
        <LayerManager.Provider scrollLock={false}>
          <LayerManager.Application>
            <p>
              Application workspace {args.layerEnvironment ? "is" : "is not"} environment-managed.
            </p>
          </LayerManager.Application>
          {layerOpen ? (
            <LayerManager.Layer
              id="workbench-layer"
              modal={args.layerEnvironment}
              manageEnvironment={args.layerEnvironment}
              onDismiss={() => setLayerOpen(false)}
            >
              <section aria-label="Workbench layer">
                <p>Layer order remains deterministic.</p>
                <button type="button" style={action} onClick={() => setLayerOpen(false)}>
                  Close layer
                </button>
              </section>
            </LayerManager.Layer>
          ) : (
            <button type="button" style={action} onClick={() => setLayerOpen(true)}>
              Restore layer
            </button>
          )}
        </LayerManager.Provider>
      </section>
    </main>
  );

  return (
    <MergoraProvider
      asChild={args.providerAsChild}
      density={args.density}
      direction="ltr"
      locale="en-GB"
      messages={{ save: "Save workspace" }}
      reducedMotion={args.reducedMotion}
      timeZone="UTC"
    >
      {content}
    </MergoraProvider>
  );
}

function NestedProviderSpecimen(): ReactElement {
  return (
    <MergoraProvider locale="de-DE" messages={{ save: "Speichern" }} timeZone="Europe/Berlin">
      <main id="workbench" style={frame}>
        <h2>Inherited context</h2>
        <ContextReadout />
        <MergoraProvider asChild direction="rtl" density="compact" messages={{ save: "حفظ" }}>
          <section aria-labelledby="nested-context-title">
            <h3 id="nested-context-title">Nested Arabic direction</h3>
            <ContextReadout />
          </section>
        </MergoraProvider>
      </main>
    </MergoraProvider>
  );
}

function FocusSpecimen(): ReactElement {
  return (
    <main id="workbench" style={frame}>
      <VisuallyHidden as="a" href="#primary-action" revealOnFocus>
        Skip to primary action
      </VisuallyHidden>
      <h2>Shared focus treatment</h2>
      <p>Tab to compare standard and strong contrast indicators.</p>
      <FocusRing>
        <button id="primary-action" type="button" style={action}>
          Standard indicator
        </button>
      </FocusRing>
      <FocusRing contrast="strong">
        <a href="#workbench">Strong indicator</a>
      </FocusRing>
      <p>
        <VisuallyHidden>Screen-reader-only context: two focus treatments are shown.</VisuallyHidden>
      </p>
    </main>
  );
}

function PortalSpecimen(): ReactElement {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const registerTarget = useCallback((node: HTMLDivElement | null) => setTarget(node), []);
  return (
    <MergoraProvider locale="he-IL" direction="rtl" density="touch">
      <main style={frame}>
        <h2>Hydration and portal boundary</h2>
        <ul>
          <ClientOnly fallback={<li>Stable server fallback</li>}>
            <li>Client content is ready</li>
          </ClientOnly>
        </ul>
        <div ref={registerTarget} aria-label="Portal target" />
        <Portal container={target} fallback={<p role="status">Preparing portal…</p>}>
          <p>Context retained in the portal.</p>
        </Portal>
      </main>
    </MergoraProvider>
  );
}

function PresenceSpecimen(): ReactElement {
  const [present, setPresent] = useState(true);
  return (
    <main style={frame}>
      <h2>Interruptible presence</h2>
      <FocusRing>
        <button type="button" style={action} onClick={() => setPresent((value) => !value)}>
          {present ? "Hide details" : "Show details"}
        </button>
      </FocusRing>
      <Presence present={present}>
        {({ state }) => <p>Lifecycle: {state}. The content starts visible.</p>}
      </Presence>
    </main>
  );
}

function AnnouncementSpecimen(): ReactElement {
  return (
    <ScreenReaderAnnouncer.Provider politeIntervalMs={50} assertiveIntervalMs={50}>
      <main style={frame}>
        <h2>Announcement queue</h2>
        <AnnouncerControls allowRepeats />
        <p>
          Visible controls remain the persistent source of actions; live regions announce summaries
          only.
        </p>
      </main>
    </ScreenReaderAnnouncer.Provider>
  );
}

function LayerSpecimen(): ReactElement {
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(true);
  return (
    <LayerManager.Provider scrollLock={false}>
      <LayerManager.Application style={frame}>
        <h2>Deterministic layer stack</h2>
        <p>The application becomes inert only while a registered external modal is active.</p>
        <button
          type="button"
          style={action}
          onClick={() => {
            setLower(true);
            setUpper(true);
          }}
        >
          Reset layers
        </button>
      </LayerManager.Application>
      {lower ? (
        <LayerManager.Layer modal id="lower-layer" onDismiss={() => setLower(false)}>
          <section aria-label="Lower layer">Lower dismissible layer</section>
        </LayerManager.Layer>
      ) : null}
      {upper ? (
        <LayerManager.Layer id="upper-layer" dismissible={false} onDismiss={() => setUpper(false)}>
          <section aria-label="Upper layer">
            Upper non-dismissible layer blocks Escape behind it.{" "}
            <button type="button" style={action} onClick={() => setUpper(false)}>
              Close upper layer
            </button>
          </section>
        </LayerManager.Layer>
      ) : null}
    </LayerManager.Provider>
  );
}

const meta = {
  args: {
    announcementRepeats: false,
    clientReadyNotification: false,
    density: "comfortable",
    directionIsolation: false,
    layerEnvironment: false,
    portalFallback: false,
    presenceInitialEnter: false,
    providerAsChild: false,
    reducedMotion: "system",
    revealSkipLink: false,
    slotHandler: false,
    strongFocus: false,
  },
  argTypes: {
    announcementRepeats: { control: "boolean" },
    clientReadyNotification: { control: "boolean" },
    density: { control: "inline-radio", options: ["compact", "comfortable", "touch"] },
    directionIsolation: { control: "boolean" },
    layerEnvironment: { control: "boolean" },
    portalFallback: { control: "boolean" },
    presenceInitialEnter: { control: "boolean" },
    providerAsChild: { control: "boolean" },
    reducedMotion: {
      control: "inline-radio",
      options: ["system", "reduce", "no-preference"],
    },
    revealSkipLink: { control: "boolean" },
    slotHandler: { control: "boolean" },
    strongFocus: { control: "boolean" },
  },
  parameters: { layout: "centered" },
  title: "Foundation/Context infrastructure",
} satisfies Meta<InfrastructureStoryArgs>;

export default meta;
type Story = StoryObj<InfrastructureStoryArgs>;

export const BasicDefaults: Story = {
  name: "Basic defaults — enhancements disabled",
  render: (args) => <FoundationWorkbench {...args} />,
};

export const RecommendedMergora: Story = {
  args: {
    announcementRepeats: true,
    clientReadyNotification: true,
    density: "touch",
    directionIsolation: true,
    layerEnvironment: true,
    portalFallback: true,
    presenceInitialEnter: true,
    providerAsChild: true,
    reducedMotion: "system",
    revealSkipLink: true,
    slotHandler: true,
    strongFocus: true,
  },
  name: "Recommended Mergora",
  render: (args) => <FoundationWorkbench {...args} />,
};

export const NestedProviderAndDirection: Story = { render: () => <NestedProviderSpecimen /> };
export const FocusAndHiddenContent: Story = { render: () => <FocusSpecimen /> };
export const PortalAndClientBoundary: Story = { render: () => <PortalSpecimen /> };
export const PresenceLifecycle: Story = { render: () => <PresenceSpecimen /> };
export const AnnouncementQueue: Story = { render: () => <AnnouncementSpecimen /> };
export const NestedLayerStack: Story = { render: () => <LayerSpecimen /> };
