import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  useCallback,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import { ClientOnly } from "../../../registry/source/components/client-only/index.ts";
import { Direction } from "../../../registry/source/components/direction/index.ts";
import { FocusRing } from "../../../registry/source/components/focus-ring/index.ts";
import { LayerManager } from "../../../registry/source/components/layer-manager/index.ts";
import { Portal } from "../../../registry/source/components/portal/index.ts";
import { Presence } from "../../../registry/source/components/presence/index.ts";
import {
  MergoraProvider,
  useMergoraContext,
} from "../../../registry/source/components/provider/index.ts";
import { Slot } from "../../../registry/source/components/slot/index.ts";
import {
  ScreenReaderAnnouncer,
  useAnnouncer,
} from "../../../registry/source/components/sr-announcer/index.ts";
import { VisuallyHidden } from "../../../registry/source/components/visually-hidden/index.ts";
import "mergora-tokens/tokens.css";

interface FoundationUtilityArgs {
  readonly announcementRepeats: boolean;
  readonly clientReadyNotification: boolean;
  readonly directionIsolation: boolean;
  readonly layerEnvironment: boolean;
  readonly portalFallback: boolean;
  readonly presenceInitialEnter: boolean;
  readonly providerAsChild: boolean;
  readonly revealSkipLink: boolean;
  readonly slotHandler: boolean;
  readonly strongFocus: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(42rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const actionRowStyle: CSSProperties = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-density-control-gap)",
};

const actionStyle: CSSProperties = {
  background: "var(--mrg-component-control-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-component-control-border)",
  borderRadius: "var(--mrg-component-control-radius)",
  color: "var(--mrg-component-control-foreground)",
  minBlockSize: "var(--mrg-semantic-density-control-height)",
  paddingBlock: "var(--mrg-semantic-density-control-padding-block)",
  paddingInline: "var(--mrg-semantic-density-control-padding-inline)",
};

const railStyle: CSSProperties = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xs)",
  margin: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-sm)",
};

function SpecimenFrame({
  children,
  description,
  itemId,
  title,
}: {
  readonly children: ReactNode;
  readonly description: string;
  readonly itemId: string;
  readonly title: string;
}): ReactElement {
  return (
    <section aria-labelledby={`${itemId}-story-title`} data-story-item={itemId} style={frameStyle}>
      <header>
        <h2 id={`${itemId}-story-title`} style={{ margin: 0 }}>
          {title}
        </h2>
        <p
          style={{
            color: "var(--mrg-semantic-color-foreground-muted)",
            marginBlock: "var(--mrg-semantic-space-stack-xs) 0",
            maxInlineSize: "65ch",
          }}
        >
          {description}
        </p>
      </header>
      {children}
    </section>
  );
}

function ClientOnlySpecimen({ notify }: { readonly notify: boolean }): ReactElement {
  const [readyCount, setReadyCount] = useState(0);
  return (
    <SpecimenFrame
      description="A stable fallback is replaced without adding a wrapper. The optional readiness hook is counted only when selected."
      itemId="client-only"
      title="Client-only boundary"
    >
      <ClientOnly
        key={notify ? "ready-hook-on" : "ready-hook-off"}
        fallback={<p>Preparing browser controls…</p>}
        {...(notify ? { onClientReady: () => setReadyCount((count) => count + 1) } : {})}
      >
        <p>Browser controls are ready.</p>
      </ClientOnly>
      {notify ? <output style={railStyle}>Readiness callbacks: {readyCount}</output> : <></>}
    </SpecimenFrame>
  );
}

function DirectionSpecimen({ isolate }: { readonly isolate: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The native direction and React boundary stay synchronized around mixed-direction content."
      itemId="direction"
      title="Direction boundary"
    >
      <Direction.Boundary direction="rtl" isolate={isolate} style={railStyle}>
        <p lang="ar" style={{ margin: 0 }}>
          حالة المراجعة <bdi>MRG-204</bdi>
        </p>
        <p style={{ margin: 0 }}>اتجاه القراءة: من اليمين إلى اليسار</p>
      </Direction.Boundary>
    </SpecimenFrame>
  );
}

function FocusRingSpecimen({ strong }: { readonly strong: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Tab to the action to inspect the two-cue Violet and Canvas focus geometry."
      itemId="focus-ring"
      title="Shared focus treatment"
    >
      <div style={actionRowStyle}>
        <FocusRing contrast={strong ? "strong" : "standard"}>
          <button type="button" style={actionStyle}>
            Review token changes
          </button>
        </FocusRing>
      </div>
    </SpecimenFrame>
  );
}

function LayerManagerSpecimen({ manageEnvironment }: { readonly manageEnvironment: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <SpecimenFrame
      description="The registered stack always owns Escape order; modal inerting and scroll ownership remain separately selectable."
      itemId="layer-manager"
      title="Layer ownership"
    >
      <LayerManager.Provider>
        <LayerManager.Application style={railStyle}>
          <p style={{ margin: 0 }}>Workbench content outside the registered layer.</p>
          <button type="button" style={actionStyle}>
            Background action
          </button>
        </LayerManager.Application>
        {open ? (
          <LayerManager.Layer
            id="foundation-utility-layer"
            manageEnvironment={manageEnvironment}
            modal={manageEnvironment}
            onDismiss={() => setOpen(false)}
          >
            <section aria-label="Review layer" style={railStyle}>
              <p style={{ margin: 0 }}>Top registered layer</p>
              <button type="button" style={actionStyle} onClick={() => setOpen(false)}>
                Close layer
              </button>
            </section>
          </LayerManager.Layer>
        ) : (
          <button type="button" style={actionStyle} onClick={() => setOpen(true)}>
            Restore layer
          </button>
        )}
      </LayerManager.Provider>
    </SpecimenFrame>
  );
}

function PortalSpecimen({ showFallback }: { readonly showFallback: boolean }): ReactElement {
  const [target, setTarget] = useState<HTMLDivElement | null>(null);
  const registerTarget = useCallback((node: HTMLDivElement | null) => setTarget(node), []);
  return (
    <SpecimenFrame
      description="Content moves to an explicit target after mount while preserving the provider context wrapper."
      itemId="portal"
      title="Portal boundary"
    >
      <div ref={registerTarget} aria-label="Portal target" style={railStyle} />
      <Portal
        container={target}
        fallback={showFallback ? <p role="status">Preparing contextual tools…</p> : null}
      >
        <p style={{ margin: 0 }}>Contextual tools are mounted at the explicit target.</p>
      </Portal>
    </SpecimenFrame>
  );
}

function PresenceSpecimen({ initialEnter }: { readonly initialEnter: boolean }): ReactElement {
  const [present, setPresent] = useState(true);
  const [cycle, setCycle] = useState(0);
  return (
    <SpecimenFrame
      description="Exit remains interruptible; the initial entering lifecycle is opt-in and disappears under reduced motion."
      itemId="presence"
      title="Presence lifecycle"
    >
      <div style={actionRowStyle}>
        <button type="button" style={actionStyle} onClick={() => setPresent((value) => !value)}>
          {present ? "Hide details" : "Show details"}
        </button>
        {initialEnter ? (
          <button type="button" style={actionStyle} onClick={() => setCycle((value) => value + 1)}>
            Replay entry
          </button>
        ) : null}
      </div>
      <Presence key={cycle} present={present} initialEnter={initialEnter}>
        {({ state }) => <p style={railStyle}>Lifecycle: {state}</p>}
      </Presence>
    </SpecimenFrame>
  );
}

function ProviderReadout(): ReactElement {
  const context = useMergoraContext();
  return (
    <dl style={railStyle}>
      <dt>Locale</dt>
      <dd>{context.locale}</dd>
      <dt>Direction</dt>
      <dd>{context.direction}</dd>
      <dt>Density</dt>
      <dd>{context.density}</dd>
    </dl>
  );
}

function ProviderSpecimen({ asChild }: { readonly asChild: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Locale, direction, density, and motion policy share one subtree; wrapper-free composition is explicit."
      itemId="provider"
      title="Provider context"
    >
      <MergoraProvider
        asChild={asChild}
        density="touch"
        direction="rtl"
        locale="he-IL"
        reducedMotion="system"
      >
        <section aria-label="Localized provider boundary">
          <ProviderReadout />
        </section>
      </MergoraProvider>
    </SpecimenFrame>
  );
}

function SlotSpecimen({ orchestrate }: { readonly orchestrate: boolean }): ReactElement {
  const [childActivations, setChildActivations] = useState(0);
  const [slotActivations, setSlotActivations] = useState(0);
  return (
    <SpecimenFrame
      description="The child's element, name, and native behavior remain authoritative while optional orchestration composes after it."
      itemId="slot"
      title="Slot composition"
    >
      <Slot
        data-slot="composed-review-action"
        {...(orchestrate ? { onClick: () => setSlotActivations((count) => count + 1) } : {})}
      >
        <button
          type="button"
          style={actionStyle}
          onClick={() => setChildActivations((count) => count + 1)}
        >
          Run composed action
        </button>
      </Slot>
      <output style={railStyle}>Native child activations: {childActivations}</output>
      {orchestrate ? <output>Slot orchestration events: {slotActivations}</output> : <></>}
    </SpecimenFrame>
  );
}

function AnnouncerActions({ allowRepeats }: { readonly allowRepeats: boolean }): ReactElement {
  const { announce, clear } = useAnnouncer();
  return (
    <div style={actionRowStyle}>
      <button
        type="button"
        style={actionStyle}
        onClick={() => announce({ key: "review.saved", defaultMessage: "Review saved" })}
      >
        Announce saved state
      </button>
      {allowRepeats ? (
        <button
          type="button"
          style={actionStyle}
          onClick={() => announce("Review saved", { dedupe: false })}
        >
          Repeat intentionally
        </button>
      ) : null}
      <button type="button" style={actionStyle} onClick={clear}>
        Clear queue
      </button>
    </div>
  );
}

function SrAnnouncerSpecimen({ allowRepeats }: { readonly allowRepeats: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Polite and assertive queues are paced and deduplicated; intentional repeats require an explicit call."
      itemId="sr-announcer"
      title="Screen-reader announcement queue"
    >
      <ScreenReaderAnnouncer.Provider politeIntervalMs={50} assertiveIntervalMs={50}>
        <AnnouncerActions allowRepeats={allowRepeats} />
      </ScreenReaderAnnouncer.Provider>
    </SpecimenFrame>
  );
}

function VisuallyHiddenSpecimen({ reveal }: { readonly reveal: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Hidden text supplies an accessible name without visual chrome; the keyboard skip surface is independently selectable."
      itemId="visually-hidden"
      title="Visually hidden content"
    >
      {reveal ? (
        <VisuallyHidden as="a" href="#foundation-primary-content" revealOnFocus>
          Skip to primary content
        </VisuallyHidden>
      ) : null}
      <button type="button" style={actionStyle}>
        <span aria-hidden="true">↑</span>
        <VisuallyHidden>Move selected item up</VisuallyHidden>
      </button>
      <main id="foundation-primary-content" tabIndex={-1} style={railStyle}>
        Primary specimen content
      </main>
    </SpecimenFrame>
  );
}

const onlyControl = (name: keyof FoundationUtilityArgs) => ({
  controls: { include: [name] },
});

const meta = {
  args: {
    announcementRepeats: false,
    clientReadyNotification: false,
    directionIsolation: false,
    layerEnvironment: false,
    portalFallback: false,
    presenceInitialEnter: false,
    providerAsChild: false,
    revealSkipLink: false,
    slotHandler: false,
    strongFocus: false,
  },
  argTypes: {
    announcementRepeats: {
      control: "boolean",
      description: "Allow an explicit announcement call to bypass semantic deduplication.",
    },
    clientReadyNotification: {
      control: "boolean",
      description: "Supply the one-shot onClientReady integration hook.",
    },
    directionIsolation: {
      control: "boolean",
      description: "Isolate the boundary's bidirectional ordering from surrounding text.",
    },
    layerEnvironment: {
      control: "boolean",
      description: "Let the modal layer own inerting and scroll restoration.",
    },
    portalFallback: {
      control: "boolean",
      description: "Render deterministic fallback content before the portal can mount.",
    },
    presenceInitialEnter: {
      control: "boolean",
      description: "Opt the initially present child into the entering lifecycle.",
    },
    providerAsChild: {
      control: "boolean",
      description: "Merge provider attributes into one concrete child instead of adding a div.",
    },
    revealSkipLink: {
      control: "boolean",
      description: "Add a focus-revealed skip link while leaving ordinary hidden text unchanged.",
    },
    slotHandler: {
      control: "boolean",
      description: "Compose a Slot-owned event after the child's non-cancelled native handler.",
    },
    strongFocus: {
      control: "boolean",
      description: "Increase focus seam and outline geometry for unpredictable surfaces.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "Foundation/Utilities — component proof",
} satisfies Meta<FoundationUtilityArgs>;

export default meta;
type Story = StoryObj<FoundationUtilityArgs>;

export const BasicClientOnly: Story = {
  args: { clientReadyNotification: false },
  name: "Client Only · Basic",
  parameters: onlyControl("clientReadyNotification"),
  render: (args) => <ClientOnlySpecimen notify={args.clientReadyNotification} />,
};

export const RecommendedClientOnly: Story = {
  args: { clientReadyNotification: true },
  name: "Client Only · Recommended Mergora",
  parameters: onlyControl("clientReadyNotification"),
  render: (args) => <ClientOnlySpecimen notify={args.clientReadyNotification} />,
};

export const BasicDirection: Story = {
  args: { directionIsolation: false },
  name: "Direction · Basic",
  parameters: onlyControl("directionIsolation"),
  render: (args) => <DirectionSpecimen isolate={args.directionIsolation} />,
};

export const RecommendedDirection: Story = {
  args: { directionIsolation: true },
  name: "Direction · Recommended Mergora",
  parameters: onlyControl("directionIsolation"),
  render: (args) => <DirectionSpecimen isolate={args.directionIsolation} />,
};

export const BasicFocusRing: Story = {
  args: { strongFocus: false },
  name: "Focus Ring · Basic",
  parameters: onlyControl("strongFocus"),
  render: (args) => <FocusRingSpecimen strong={args.strongFocus} />,
};

export const RecommendedFocusRing: Story = {
  args: { strongFocus: true },
  name: "Focus Ring · Recommended Mergora",
  parameters: onlyControl("strongFocus"),
  render: (args) => <FocusRingSpecimen strong={args.strongFocus} />,
};

export const BasicLayerManager: Story = {
  args: { layerEnvironment: false },
  name: "Layer Manager · Basic",
  parameters: onlyControl("layerEnvironment"),
  render: (args) => <LayerManagerSpecimen manageEnvironment={args.layerEnvironment} />,
};

export const RecommendedLayerManager: Story = {
  args: { layerEnvironment: true },
  name: "Layer Manager · Recommended Mergora",
  parameters: onlyControl("layerEnvironment"),
  render: (args) => <LayerManagerSpecimen manageEnvironment={args.layerEnvironment} />,
};

export const BasicPortal: Story = {
  args: { portalFallback: false },
  name: "Portal · Basic",
  parameters: onlyControl("portalFallback"),
  render: (args) => <PortalSpecimen showFallback={args.portalFallback} />,
};

export const RecommendedPortal: Story = {
  args: { portalFallback: true },
  name: "Portal · Recommended Mergora",
  parameters: onlyControl("portalFallback"),
  render: (args) => <PortalSpecimen showFallback={args.portalFallback} />,
};

export const BasicPresence: Story = {
  args: { presenceInitialEnter: false },
  name: "Presence · Basic",
  parameters: onlyControl("presenceInitialEnter"),
  render: (args) => <PresenceSpecimen initialEnter={args.presenceInitialEnter} />,
};

export const RecommendedPresence: Story = {
  args: { presenceInitialEnter: true },
  name: "Presence · Recommended Mergora",
  parameters: onlyControl("presenceInitialEnter"),
  render: (args) => <PresenceSpecimen initialEnter={args.presenceInitialEnter} />,
};

export const BasicProvider: Story = {
  args: { providerAsChild: false },
  name: "Provider · Basic",
  parameters: onlyControl("providerAsChild"),
  render: (args) => <ProviderSpecimen asChild={args.providerAsChild} />,
};

export const RecommendedProvider: Story = {
  args: { providerAsChild: true },
  name: "Provider · Recommended Mergora",
  parameters: onlyControl("providerAsChild"),
  render: (args) => <ProviderSpecimen asChild={args.providerAsChild} />,
};

export const BasicSlot: Story = {
  args: { slotHandler: false },
  name: "Slot · Basic",
  parameters: onlyControl("slotHandler"),
  render: (args) => <SlotSpecimen orchestrate={args.slotHandler} />,
};

export const RecommendedSlot: Story = {
  args: { slotHandler: true },
  name: "Slot · Recommended Mergora",
  parameters: onlyControl("slotHandler"),
  render: (args) => <SlotSpecimen orchestrate={args.slotHandler} />,
};

export const BasicSrAnnouncer: Story = {
  args: { announcementRepeats: false },
  name: "Screen Reader Announcer · Basic",
  parameters: onlyControl("announcementRepeats"),
  render: (args) => <SrAnnouncerSpecimen allowRepeats={args.announcementRepeats} />,
};

export const RecommendedSrAnnouncer: Story = {
  args: { announcementRepeats: true },
  name: "Screen Reader Announcer · Recommended Mergora",
  parameters: onlyControl("announcementRepeats"),
  render: (args) => <SrAnnouncerSpecimen allowRepeats={args.announcementRepeats} />,
};

export const BasicVisuallyHidden: Story = {
  args: { revealSkipLink: false },
  name: "Visually Hidden · Basic",
  parameters: onlyControl("revealSkipLink"),
  render: (args) => <VisuallyHiddenSpecimen reveal={args.revealSkipLink} />,
};

export const RecommendedVisuallyHidden: Story = {
  args: { revealSkipLink: true },
  name: "Visually Hidden · Recommended Mergora",
  parameters: onlyControl("revealSkipLink"),
  render: (args) => <VisuallyHiddenSpecimen reveal={args.revealSkipLink} />,
};
