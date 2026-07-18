import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";

import "mergora-tokens/tokens.css";
import { AlertDialog } from "../../../registry/source/components/alert-dialog/alert-dialog";
import { Dialog } from "../../../registry/source/components/dialog/dialog";
import { LayerManager } from "../../../registry/source/components/layer-manager/layer-manager";
import { Popover } from "../../../registry/source/components/popover/popover";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import { Sheet, type SheetSide } from "../../../registry/source/components/sheet/sheet";
import { Tooltip } from "../../../registry/source/components/tooltip/tooltip";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  overflowWrap: "anywhere",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--mrg-semantic-space-stack-lg)",
  marginInline: "auto",
  maxInlineSize: "var(--mrg-semantic-size-content-default)",
  minInlineSize: 0,
} satisfies CSSProperties;

const railStyle = {
  alignItems: "center",
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--mrg-semantic-space-stack-sm)",
  minInlineSize: 0,
} satisfies CSSProperties;

const buttonStyle = {
  boxSizing: "border-box",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  minInlineSize: "var(--mrg-semantic-size-target-preferred)",
  paddingBlock: "var(--mrg-semantic-space-inline-sm)",
  paddingInline: "var(--mrg-semantic-space-inline-md)",
} satisfies CSSProperties;

function Canvas({
  children,
  density = "comfortable",
  direction = "ltr",
  locale = "en-US",
  messages,
}: {
  readonly children: ReactNode;
  readonly density?: "comfortable" | "compact" | "touch";
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
  readonly messages?: Readonly<Record<string, string>>;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  return (
    <MergoraProvider
      density={density}
      direction={direction}
      locale={locale}
      {...(messages === undefined ? {} : { messages })}
      portalContainer={portalContainer}
    >
      <LayerManager.Provider>
        <LayerManager.Application asChild>
          <main data-testid="application-root" style={canvasStyle}>
            <div style={workbenchStyle}>{children}</div>
          </main>
        </LayerManager.Application>
        <aside aria-label="Overlay surfaces" data-testid="portal-host" ref={setPortalContainer} />
      </LayerManager.Provider>
    </MergoraProvider>
  );
}

function DialogModalSpecimen() {
  const firstRef = useRef<HTMLInputElement>(null);
  const [reason, setReason] = useState("none");
  return (
    <Canvas messages={{ "dialog.close": "Close review dialog" }}>
      <h1 style={{ margin: 0 }}>Modal dialog policy</h1>
      <p data-testid="dialog-reason">Last reason: {reason}</p>
      <Dialog.Root onOpenChange={(_open, detail) => setReason(detail.reason)}>
        <Dialog.Trigger>Open release review</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content initialFocusRef={firstRef}>
            <Dialog.Header>
              <Dialog.Title>Release review</Dialog.Title>
            </Dialog.Header>
            <Dialog.Description id="release-review-consequence">
              Inspect the candidate digest before continuing.
            </Dialog.Description>
            <label>
              Candidate note
              <input ref={firstRef} defaultValue="Verified locally" />
            </label>
            <Dialog.Footer>
              <Dialog.Close />
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <Dialog.Root>
        <Dialog.Trigger disabled>Release review unavailable</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Unavailable release review</Dialog.Title>
            <Dialog.Close>Close unavailable review</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <button style={buttonStyle} type="button">
        Background action
      </button>
    </Canvas>
  );
}

function DialogNonModalSpecimen() {
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Non-modal dialog policy</h1>
      <div style={railStyle}>
        <button data-testid="nonmodal-background" style={buttonStyle} type="button">
          Before dialog
        </button>
        <Dialog.Root modality="non-modal">
          <Dialog.Trigger>Open non-modal inspector</Dialog.Trigger>
          <Dialog.Overlay placement="end">
            <Dialog.Content initialFocus="none">
              <Dialog.Title>Candidate inspector</Dialog.Title>
              <Dialog.Description>
                The surrounding workflow remains operable while this inspector is open.
              </Dialog.Description>
              <input aria-label="Inspector filter" />
              <Dialog.Close>Close inspector</Dialog.Close>
            </Dialog.Content>
          </Dialog.Overlay>
        </Dialog.Root>
        <button style={buttonStyle} type="button">
          After dialog
        </button>
      </div>
    </Canvas>
  );
}

function AlertDialogSpecimen() {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [result, setResult] = useState("No decision");
  return (
    <Canvas messages={{ "alertDialog.cancel": "Keep snapshot" }}>
      <h1 style={{ margin: 0 }}>Destructive confirmation</h1>
      <output aria-live="polite">{result}</output>
      <AlertDialog.Root>
        <AlertDialog.Trigger>Delete release snapshot</AlertDialog.Trigger>
        <AlertDialog.Overlay>
          <AlertDialog.Content leastDestructiveRef={cancelRef}>
            <AlertDialog.Title>Delete release snapshot?</AlertDialog.Title>
            <AlertDialog.Description>
              This permanently removes the current verification snapshot and cannot be undone.
            </AlertDialog.Description>
            <AlertDialog.Footer>
              <AlertDialog.Cancel ref={cancelRef} onClick={() => setResult("Snapshot kept")} />
              <AlertDialog.Action onClick={() => setResult("Snapshot deleted")}>
                Delete snapshot permanently
              </AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Root>
      <AlertDialog.Root>
        <AlertDialog.Trigger disabled>Snapshot deletion unavailable</AlertDialog.Trigger>
        <AlertDialog.Overlay>
          <AlertDialog.Content leastDestructiveRef={cancelRef}>
            <AlertDialog.Title>Unavailable deletion</AlertDialog.Title>
            <AlertDialog.Description>
              No destructive decision is currently available.
            </AlertDialog.Description>
            <AlertDialog.Cancel ref={cancelRef}>Return</AlertDialog.Cancel>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Root>
    </Canvas>
  );
}

function SheetSpecimen() {
  const [side, setSide] = useState<SheetSide>("end");
  return (
    <Canvas messages={{ "sheet.close": "Close release panel" }}>
      <h1 style={{ margin: 0 }}>Sheet edges and scrolling</h1>
      <div style={railStyle}>
        {(["start", "end", "top", "bottom"] as const).map((value) => (
          <button key={value} onClick={() => setSide(value)} style={buttonStyle} type="button">
            Use {value} edge
          </button>
        ))}
      </div>
      <Sheet.Root side={side} size="md">
        <Sheet.Trigger>Open release panel</Sheet.Trigger>
        <Sheet.Overlay>
          <Sheet.Content>
            <Sheet.Header>
              <Sheet.Title>Release details</Sheet.Title>
            </Sheet.Header>
            <Sheet.Description>
              The panel follows the selected edge and keeps a visible close path.
            </Sheet.Description>
            {Array.from({ length: 12 }, (_, index) => (
              <p key={index}>Verification record {index + 1} remains readable at narrow heights.</p>
            ))}
            <Sheet.Footer>
              <Sheet.Close />
            </Sheet.Footer>
          </Sheet.Content>
        </Sheet.Overlay>
      </Sheet.Root>
      <Sheet.Root side="end">
        <Sheet.Trigger disabled>Release panel unavailable</Sheet.Trigger>
        <Sheet.Overlay>
          <Sheet.Content>
            <Sheet.Title>Unavailable release panel</Sheet.Title>
            <Sheet.Close>Close unavailable panel</Sheet.Close>
          </Sheet.Content>
        </Sheet.Overlay>
      </Sheet.Root>
    </Canvas>
  );
}

function PopoverCollisionSpecimen() {
  return (
    <Canvas messages={{ "popover.close": "Dismiss edge inspector" }}>
      <h1 style={{ margin: 0 }}>Popover collision and flip</h1>
      <div
        style={{
          alignItems: "flex-end",
          display: "flex",
          justifyContent: "flex-end",
          minBlockSize: "calc(100vh - 10rem)",
        }}
      >
        <Popover.Root>
          <Popover.Trigger>Open edge inspector</Popover.Trigger>
          <Popover.Content align="end" initialFocus="first-interactive" placement="bottom">
            <Popover.Arrow />
            <Popover.Title>Edge inspector</Popover.Title>
            <Popover.Description id="edge-inspector-description">
              Collision handling keeps every action inside the visual viewport.
            </Popover.Description>
            <Popover.Close />
          </Popover.Content>
        </Popover.Root>
      </div>
      <Popover.Root>
        <Popover.Trigger disabled>Edge inspector unavailable</Popover.Trigger>
        <Popover.Content>
          <Popover.Title>Unavailable edge inspector</Popover.Title>
          <Popover.Close>Close unavailable inspector</Popover.Close>
        </Popover.Content>
      </Popover.Root>
    </Canvas>
  );
}

function TooltipPoliciesSpecimen() {
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Tooltip policies</h1>
      <div style={railStyle}>
        <Tooltip.Root closeDelay={150} delay={120}>
          <Tooltip.Trigger aria-label="Copy digest">Copy</Tooltip.Trigger>
          <Tooltip.Content placement="top">
            <Tooltip.Arrow />
            Copy the immutable release digest
          </Tooltip.Content>
        </Tooltip.Root>
        <Tooltip.Root closeDelay={150} delay={120}>
          <Tooltip.DisabledTrigger aria-label="Publish unavailable">
            Publish unavailable
          </Tooltip.DisabledTrigger>
          <Tooltip.Content placement="end">Publishing requires verified provenance</Tooltip.Content>
        </Tooltip.Root>
      </div>
      <p>Every tooltip is supplemental; the visible controls remain understandable on touch.</p>
    </Canvas>
  );
}

function NestedOverlaysSpecimen() {
  return (
    <Canvas density="touch" direction="rtl" locale="he-IL">
      <h1 style={{ margin: 0 }}>{"בדיקת שכבות מקוננות"}</h1>
      <Dialog.Root>
        <Dialog.Trigger>{"פתיחת סקירת שכבות"}</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>{"סקירת שכבות"}</Dialog.Title>
            <Dialog.Description>
              {"כל שכבה נסגרת לפי הסדר ושומרת על כיוון, שפה וצפיפות."}
            </Dialog.Description>
            <Popover.Root>
              <Popover.Trigger>{"פתיחת פרטי ראיה"}</Popover.Trigger>
              <Popover.Content align="start" placement="start">
                <Popover.Arrow />
                <Popover.Title>{"פרטי ראיה"}</Popover.Title>
                <Popover.Description>{"התוכן נשאר לא מודאלי בתוך הדיאלוג."}</Popover.Description>
                <Tooltip.Root closeDelay={100} delay={100}>
                  <Tooltip.Trigger aria-label={"מידע על העיכול"}>{"מידע"}</Tooltip.Trigger>
                  <Tooltip.Content placement="top">{"עיכול בלתי ניתן לשינוי"}</Tooltip.Content>
                </Tooltip.Root>
                <Popover.Close>{"סגירת הפרטים"}</Popover.Close>
              </Popover.Content>
            </Popover.Root>
            <Dialog.Root>
              <Dialog.Trigger>Open nested modal</Dialog.Trigger>
              <Dialog.Overlay>
                <Dialog.Content>
                  <Dialog.Title>Nested modal review</Dialog.Title>
                  <Dialog.Description>
                    This second modal remains in the same deterministic layer stack.
                  </Dialog.Description>
                  <Dialog.Close>Close nested modal</Dialog.Close>
                </Dialog.Content>
              </Dialog.Overlay>
            </Dialog.Root>
            <Dialog.Close>{"סגירת הסקירה"}</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </Canvas>
  );
}

function RemovedOpenerSpecimen() {
  const successorRef = useRef<HTMLButtonElement>(null);
  const [showTrigger, setShowTrigger] = useState(true);
  const [open, setOpen] = useState(false);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Removed opener restoration</h1>
      <Dialog.Root
        finalFocusRef={successorRef}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (nextOpen) setShowTrigger(false);
        }}
        open={open}
      >
        {showTrigger ? <Dialog.Trigger>Open transient review</Dialog.Trigger> : null}
        <Dialog.Overlay>
          <Dialog.Content dismissPolicy="explicit">
            <Dialog.Title>Transient review</Dialog.Title>
            <Dialog.Description>
              The opener is removed while this dialog is open.
            </Dialog.Description>
            <Dialog.Close>Finish review</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
      <button ref={successorRef} data-testid="workflow-successor" style={buttonStyle} type="button">
        Continue workflow
      </button>
    </Canvas>
  );
}

function RtlDirectionOverrideSpecimen() {
  return (
    <Canvas direction="rtl" locale="en-US">
      <h1 style={{ margin: 0 }}>Explicit RTL with English locale</h1>
      <div style={{ ...railStyle, justifyContent: "center" }}>
        <Popover.Root>
          <Popover.Trigger>Open logical start popover</Popover.Trigger>
          <Popover.Content align="start" placement="start" shouldFlip={false}>
            <Popover.Title>Logical placement</Popover.Title>
            <Popover.Description>Start maps to the physical right in RTL.</Popover.Description>
            <Popover.Close>Close logical popover</Popover.Close>
          </Popover.Content>
        </Popover.Root>
        <Sheet.Root side="start" size="sm">
          <Sheet.Trigger>Open logical start sheet</Sheet.Trigger>
          <Sheet.Overlay>
            <Sheet.Content>
              <Sheet.Title>Logical start sheet</Sheet.Title>
              <Sheet.Description>
                English collation with an independent RTL layout.
              </Sheet.Description>
              <Sheet.Close>Close logical sheet</Sheet.Close>
            </Sheet.Content>
          </Sheet.Overlay>
        </Sheet.Root>
      </div>
    </Canvas>
  );
}

function NarrowReflowSpecimen() {
  return (
    <Canvas locale="de-DE">
      <h1 style={{ margin: 0 }}>320 CSS pixel overlay reflow</h1>
      <Dialog.Root>
        <Dialog.Trigger>Unabhängig verifizierte Veröffentlichung öffnen</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content initialFocus="content">
            <Dialog.Title>Unabhängig verifizierte Veröffentlichungsdetails</Dialog.Title>
            <Dialog.Description>
              Sehr lange übersetzte Inhalte bleiben ohne zweidimensionales Scrollen vollständig
              verfügbar.
            </Dialog.Description>
            <p>UnunterbrocheneProvenienzverifikationskennungMitSehrLangemInhalt</p>
            <Dialog.Close>Zur Veröffentlichungsprüfung zurückkehren</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </Canvas>
  );
}

function ImeEscapeSpecimen() {
  return (
    <Canvas locale="ja-JP">
      <h1 style={{ margin: 0 }}>IME Escape ordering</h1>
      <Dialog.Root>
        <Dialog.Trigger>編集ダイアログを開く</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>候補を編集</Dialog.Title>
            <Dialog.Description>変換中の Escape はダイアログを閉じません。</Dialog.Description>
            <input aria-label="候補名" />
            <Dialog.Close>編集を閉じる</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </Canvas>
  );
}

function MixedEnvironmentOwnershipSpecimen() {
  const [nativeOpen, setNativeOpen] = useState(true);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  return (
    <MergoraProvider portalContainer={portalContainer}>
      <LayerManager.Provider>
        <LayerManager.Application asChild>
          <main data-testid="application-root" style={canvasStyle}>
            <div style={workbenchStyle}>
              <h1 style={{ margin: 0 }}>Mixed modal environment ownership</h1>
              <p>The native layer and React Aria dialog share one ordered stack.</p>
            </div>
          </main>
        </LayerManager.Application>
        <aside aria-label="Overlay surfaces" data-testid="portal-host" ref={setPortalContainer}>
          {nativeOpen ? (
            <LayerManager.Layer
              id="native-managed-modal"
              modal
              onDismiss={() => setNativeOpen(false)}
              style={{
                insetBlockStart: "var(--mrg-semantic-space-stack-lg)",
                insetInlineStart: "var(--mrg-semantic-space-stack-lg)",
                maxBlockSize:
                  "calc(100dvb - var(--mrg-semantic-space-stack-lg) - var(--mrg-semantic-space-stack-lg))",
                maxInlineSize:
                  "calc(100dvi - var(--mrg-semantic-space-stack-lg) - var(--mrg-semantic-space-stack-lg))",
                overflow: "auto",
                position: "fixed",
              }}
            >
              <section aria-label="Native managed layer" style={workbenchStyle}>
                <h2 style={{ margin: 0 }}>Native environment owner</h2>
                <Dialog.Root>
                  <Dialog.Trigger>Open externally managed dialog</Dialog.Trigger>
                  <Dialog.Overlay>
                    <Dialog.Content>
                      <Dialog.Title>External behavior owner</Dialog.Title>
                      <Dialog.Description>
                        React Aria owns this dialog's focus, inerting, and scroll prevention.
                      </Dialog.Description>
                      <Dialog.Close>Close externally managed dialog</Dialog.Close>
                    </Dialog.Content>
                  </Dialog.Overlay>
                </Dialog.Root>
                <button onClick={() => setNativeOpen(false)} style={buttonStyle} type="button">
                  Close native managed layer
                </button>
              </section>
            </LayerManager.Layer>
          ) : null}
        </aside>
      </LayerManager.Provider>
    </MergoraProvider>
  );
}

function HydratedOverlayFixture({ onHydrated }: { readonly onHydrated: () => void }) {
  useEffect(onHydrated, [onHydrated]);
  return (
    <Canvas messages={{ "dialog.close": "Close hydrated dialog" }}>
      <h2 style={{ margin: 0 }}>Server-rendered overlay boundary</h2>
      <Dialog.Root>
        <Dialog.Trigger>Open hydrated dialog</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content>
            <Dialog.Title>Hydrated release review</Dialog.Title>
            <Dialog.Description>
              The trigger hydrates without a server portal, then the modal portal mounts on demand.
            </Dialog.Description>
            <Dialog.Close />
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </Canvas>
  );
}

function SsrHydrationSpecimen() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;
    host.dataset.hydrated = "pending";
    const tree = (
      <HydratedOverlayFixture
        onHydrated={() => {
          host.dataset.hydrated = "true";
        }}
      />
    );
    host.innerHTML = renderToString(tree);
    const root = hydrateRoot(host, tree, {
      onRecoverableError(error) {
        host.dataset.hydrationError = error instanceof Error ? error.message : String(error);
      },
    });
    return () => {
      queueMicrotask(() => root.unmount());
    };
  }, []);

  return (
    <section style={canvasStyle}>
      <h1 style={{ margin: 0 }}>SSR hydration and deferred portal</h1>
      <div data-testid="hydration-host" ref={hostRef} />
    </section>
  );
}

const meta = {
  component: Dialog.Root,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Overlays",
} satisfies Meta<typeof Dialog.Root>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DialogModalPolicy: Story = { render: () => <DialogModalSpecimen /> };
export const DialogNonModal: Story = { render: () => <DialogNonModalSpecimen /> };
export const AlertDialogDestructive: Story = { render: () => <AlertDialogSpecimen /> };
export const SheetEdges: Story = { render: () => <SheetSpecimen /> };
export const PopoverCollision: Story = { render: () => <PopoverCollisionSpecimen /> };
export const TooltipPolicies: Story = { render: () => <TooltipPoliciesSpecimen /> };
export const NestedOverlays: Story = { render: () => <NestedOverlaysSpecimen /> };
export const RemovedOpener: Story = { render: () => <RemovedOpenerSpecimen /> };
export const RtlDirectionOverride: Story = { render: () => <RtlDirectionOverrideSpecimen /> };
export const NarrowReflow: Story = { render: () => <NarrowReflowSpecimen /> };
export const ImeEscape: Story = { render: () => <ImeEscapeSpecimen /> };
export const MixedEnvironmentOwnership: Story = {
  render: () => <MixedEnvironmentOwnershipSpecimen />,
};
export const SsrHydration: Story = { render: () => <SsrHydrationSpecimen /> };
