import type { Meta, StoryObj } from "@storybook/react-vite";
import { useCallback, useState, type ReactElement } from "react";

import { ClientOnly } from "../../../registry/source/components/client-only/index";
import { useDirection } from "../../../registry/source/components/direction/index";
import { FocusRing } from "../../../registry/source/components/focus-ring/index";
import { LayerManager } from "../../../registry/source/components/layer-manager/index";
import { Portal } from "../../../registry/source/components/portal/index";
import {
  MergoraProvider,
  useMergoraContext,
} from "../../../registry/source/components/provider/index";
import { Presence } from "../../../registry/source/components/presence/index";
import {
  ScreenReaderAnnouncer,
  useAnnouncer,
} from "../../../registry/source/components/sr-announcer/index";
import { VisuallyHidden } from "../../../registry/source/components/visually-hidden/index";

const surface = {
  display: "flex",
  flexDirection: "column" as const,
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(42rem, calc(100vw - 2rem))",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

function ContextReadout(): ReactElement {
  const context = useMergoraContext();
  const direction = useDirection();
  return (
    <dl>
      <div>
        <dt>Locale</dt>
        <dd>{context.locale}</dd>
      </div>
      <div>
        <dt>Direction</dt>
        <dd>{direction}</dd>
      </div>
      <div>
        <dt>Time zone</dt>
        <dd>{context.timeZone}</dd>
      </div>
      <div>
        <dt>Density</dt>
        <dd>{context.density}</dd>
      </div>
      <div>
        <dt>Save message</dt>
        <dd>{context.getMessage("save", "Save")}</dd>
      </div>
    </dl>
  );
}

function NestedProviderSpecimen(): ReactElement {
  return (
    <MergoraProvider locale="de-DE" messages={{ save: "Speichern" }} timeZone="Europe/Berlin">
      <main id="workbench" style={surface}>
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
    <main id="workbench" style={surface}>
      <VisuallyHidden as="a" href="#primary-action" revealOnFocus>
        Skip to primary action
      </VisuallyHidden>
      <h2>Shared focus treatment</h2>
      <p>Tab to compare standard and strong contrast indicators.</p>
      <FocusRing>
        <button id="primary-action" type="button">
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
      <main style={surface}>
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
    <main style={surface}>
      <h2>Interruptible presence</h2>
      <FocusRing>
        <button type="button" onClick={() => setPresent((value) => !value)}>
          {present ? "Hide details" : "Show details"}
        </button>
      </FocusRing>
      <Presence present={present}>
        {({ state }) => <p>Lifecycle: {state}. The content starts visible.</p>}
      </Presence>
    </main>
  );
}

function AnnouncementControls(): ReactElement {
  const { announce, clear } = useAnnouncer();
  return (
    <main style={surface}>
      <h2>Announcement queue</h2>
      <button
        type="button"
        onClick={() => announce({ key: "saved", defaultMessage: "Draft saved" })}
      >
        Queue polite update
      </button>
      <button type="button" onClick={() => announce("Connection lost", { priority: "assertive" })}>
        Queue urgent error
      </button>
      <button type="button" onClick={() => announce("Draft saved", { dedupe: false })}>
        Repeat intentionally
      </button>
      <button type="button" onClick={clear}>
        Clear queue
      </button>
      <p>
        The visible controls remain the persistent source of actions; live regions announce
        summaries only.
      </p>
    </main>
  );
}

function AnnouncementSpecimen(): ReactElement {
  return (
    <ScreenReaderAnnouncer.Provider politeIntervalMs={50} assertiveIntervalMs={50}>
      <AnnouncementControls />
    </ScreenReaderAnnouncer.Provider>
  );
}

function LayerSpecimen(): ReactElement {
  const [lower, setLower] = useState(true);
  const [upper, setUpper] = useState(true);
  return (
    <LayerManager.Provider scrollLock={false}>
      <LayerManager.Application style={surface}>
        <h2>Deterministic layer stack</h2>
        <p>The application becomes inert only while a registered external modal is active.</p>
        <button
          type="button"
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
            <button type="button" onClick={() => setUpper(false)}>
              Close upper layer
            </button>
          </section>
        </LayerManager.Layer>
      ) : null}
    </LayerManager.Provider>
  );
}

const meta = {
  parameters: { layout: "centered" },
  title: "Foundation/Context infrastructure",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const NestedProviderAndDirection: Story = { render: () => <NestedProviderSpecimen /> };
export const FocusAndHiddenContent: Story = { render: () => <FocusSpecimen /> };
export const PortalAndClientBoundary: Story = { render: () => <PortalSpecimen /> };
export const PresenceLifecycle: Story = { render: () => <PresenceSpecimen /> };
export const AnnouncementQueue: Story = { render: () => <AnnouncementSpecimen /> };
export const NestedLayerStack: Story = { render: () => <LayerSpecimen /> };
