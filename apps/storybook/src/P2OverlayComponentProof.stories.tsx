import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import { AlertDialog } from "../../../registry/source/components/alert-dialog/index.ts";
import { ContextMenu } from "../../../registry/source/components/context-menu/index.ts";
import { Dialog } from "../../../registry/source/components/dialog/index.ts";
import { Drawer } from "../../../registry/source/components/drawer/index.ts";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "../../../registry/source/components/dropdown-menu/index.ts";
import { HoverCard } from "../../../registry/source/components/hover-card/index.ts";
import { LayerManager } from "../../../registry/source/components/layer-manager/index.ts";
import { Lightbox, type LightboxItem } from "../../../registry/source/components/lightbox/index.ts";
import { Menubar, type MenubarMenu } from "../../../registry/source/components/menubar/index.ts";
import { Popover } from "../../../registry/source/components/popover/index.ts";
import { MergoraProvider } from "../../../registry/source/components/provider/index.ts";
import { Sheet } from "../../../registry/source/components/sheet/index.ts";
import { createToastQueue, ToastRegion } from "../../../registry/source/components/toast/index.ts";
import { Tooltip } from "../../../registry/source/components/tooltip/index.ts";
import "mergora-tokens/tokens.css";

interface OverlayProofArgs {
  readonly alertAcknowledgement: boolean;
  readonly contextHint: boolean;
  readonly dialogDismissHint: boolean;
  readonly drawerSwipe: boolean;
  readonly dropdownConfirm: boolean;
  readonly dropdownSummary: boolean;
  readonly hoverPin: boolean;
  readonly lightboxSummary: boolean;
  readonly lightboxSwipe: boolean;
  readonly lightboxZoom: boolean;
  readonly menubarGuide: boolean;
  readonly menubarOpenOnFocus: boolean;
  readonly popoverAnchorContext: boolean;
  readonly popoverManagedFocus: boolean;
  readonly sheetProgress: boolean;
  readonly toastPauseControls: boolean;
  readonly toastQueueSummary: boolean;
  readonly tooltipDisabledAdapter: boolean;
  readonly tooltipShortcut: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
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

function StoryFrame({
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
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  return (
    <MergoraProvider portalContainer={portalContainer}>
      <LayerManager.Provider>
        <LayerManager.Application asChild>
          <section
            aria-labelledby={`${itemId}-proof-title`}
            data-story-item={itemId}
            style={frameStyle}
          >
            <header>
              <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
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
        </LayerManager.Application>
        <aside aria-label={`${title} overlay host`} ref={setPortalContainer} />
      </LayerManager.Provider>
    </MergoraProvider>
  );
}

function AlertDialogSpecimen({ acknowledgement }: { readonly acknowledgement: boolean }) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  return (
    <StoryFrame
      description="The least-destructive action receives initial focus; acknowledgement can independently hold the irreversible action."
      itemId="alert-dialog"
      title="Delete local snapshot"
    >
      <AlertDialog.Root defaultOpen>
        <AlertDialog.Trigger>Review deletion</AlertDialog.Trigger>
        <AlertDialog.Overlay>
          <AlertDialog.Content
            {...(acknowledgement
              ? { acknowledgementLabel: "I understand this snapshot cannot be restored." }
              : {})}
            leastDestructiveRef={cancelRef}
          >
            <AlertDialog.Title>Delete local snapshot?</AlertDialog.Title>
            <AlertDialog.Description>
              The source records remain available, but this review snapshot will be removed.
            </AlertDialog.Description>
            <AlertDialog.Footer>
              <AlertDialog.Cancel ref={cancelRef}>Keep snapshot</AlertDialog.Cancel>
              <AlertDialog.Action>Delete snapshot</AlertDialog.Action>
            </AlertDialog.Footer>
          </AlertDialog.Content>
        </AlertDialog.Overlay>
      </AlertDialog.Root>
    </StoryFrame>
  );
}

function DialogSpecimen({ dismissHint }: { readonly dismissHint: boolean }) {
  return (
    <StoryFrame
      description="Explicit dismissal policy stays predictable; optional discovery joins the dialog description without changing close behavior."
      itemId="dialog"
      title="Review source changes"
    >
      <Dialog.Root defaultOpen>
        <Dialog.Trigger>Open review</Dialog.Trigger>
        <Dialog.Overlay>
          <Dialog.Content
            {...(dismissHint
              ? { dismissHint: "Press Escape or use Return to changes to close this review." }
              : {})}
          >
            <Dialog.Title>Review source changes</Dialog.Title>
            <Dialog.Description>
              Compare the current source with the incoming component update.
            </Dialog.Description>
            <Dialog.Close>Return to changes</Dialog.Close>
          </Dialog.Content>
        </Dialog.Overlay>
      </Dialog.Root>
    </StoryFrame>
  );
}

function PopoverSpecimen({
  anchorContext,
  managedFocus,
}: {
  readonly anchorContext: boolean;
  readonly managedFocus: boolean;
}) {
  return (
    <StoryFrame
      description="Logical placement and non-modal ownership stay stable while context and task-oriented entry focus remain separate choices."
      itemId="popover"
      title="Token inspector"
    >
      <Popover.Root defaultOpen>
        <Popover.Trigger>Inspect border token</Popover.Trigger>
        <Popover.Content
          {...(anchorContext ? { anchorContext: "Selected token · border.interactive" } : {})}
          {...(managedFocus ? { initialFocus: "first-interactive" as const } : {})}
          align="start"
        >
          <Popover.Title>Border token</Popover.Title>
          <Popover.Description>
            Review the resolved semantic value without leaving the workbench.
          </Popover.Description>
          <button style={actionStyle} type="button">
            Copy resolved value
          </button>
          <Popover.Close>Close inspector</Popover.Close>
        </Popover.Content>
      </Popover.Root>
    </StoryFrame>
  );
}

function SheetSpecimen({ progress }: { readonly progress: boolean }) {
  return (
    <StoryFrame
      description="The logical edge and safe-area surface remain lightweight; workflow progress is a native, consumer-controlled rail."
      itemId="sheet"
      title="Workspace setup"
    >
      <Sheet.Root defaultOpen side="end" size="md">
        <Sheet.Trigger>Open setup</Sheet.Trigger>
        <Sheet.Overlay>
          <Sheet.Content
            {...(progress ? { progress: { label: "Workspace setup", max: 4, value: 2 } } : {})}
          >
            <Sheet.Header>
              <Sheet.Title>Workspace setup</Sheet.Title>
              <Sheet.Description>
                Configure reusable defaults while the surrounding task remains recognizable.
              </Sheet.Description>
            </Sheet.Header>
            <Sheet.Footer>
              <Sheet.Close>Close setup</Sheet.Close>
            </Sheet.Footer>
          </Sheet.Content>
        </Sheet.Overlay>
      </Sheet.Root>
    </StoryFrame>
  );
}

function TooltipSpecimen({
  disabledAdapter,
  shortcut,
}: {
  readonly disabledAdapter: boolean;
  readonly shortcut: boolean;
}) {
  return (
    <StoryFrame
      description="Supplemental guidance remains noninteractive; disabled discovery and shortcut context are independently selectable."
      itemId="tooltip"
      title="Command guidance"
    >
      <Tooltip.Root defaultOpen delay={120}>
        {disabledAdapter ? (
          <Tooltip.DisabledTrigger>Publish unavailable</Tooltip.DisabledTrigger>
        ) : (
          <Tooltip.Trigger>Command details</Tooltip.Trigger>
        )}
        <Tooltip.Content {...(shortcut ? { shortcut: "Ctrl K" } : {})}>
          {disabledAdapter ? "Complete the current validation first" : "Open the command palette"}
        </Tooltip.Content>
      </Tooltip.Root>
    </StoryFrame>
  );
}

const menuItems: readonly DropdownMenuItem[] = [
  {
    id: "inspect",
    label: "Inspect details",
    description: "Open the durable record for this item.",
  },
  {
    id: "pin",
    label: "Pin to workbench",
  },
  {
    id: "remove",
    intent: "destructive",
    label: "Remove saved view",
    confirmationLabel: "Confirm removal",
  },
];

function ContextMenuSpecimen({
  confirm,
  hint,
  summary,
}: {
  readonly confirm: boolean;
  readonly hint: boolean;
  readonly summary: boolean;
}) {
  return (
    <StoryFrame
      description="Pointer, touch, and keyboard invocation share one target; discovery, selection context, and destructive safety remain removable."
      itemId="context-menu"
      title="Canvas actions"
    >
      <ContextMenu
        {...(confirm ? { confirmDestructiveActions: true } : {})}
        {...(hint ? { showInvocationHint: true } : {})}
        {...(summary ? { selectionSummary: true } : {})}
        defaultOpen
        defaultSelectedIds={["inspect"]}
        items={menuItems}
        menuLabel="Canvas actions"
        selectionMode="multiple"
      >
        Selected canvas object
      </ContextMenu>
    </StoryFrame>
  );
}

function DrawerSpecimen({ swipe }: { readonly swipe: boolean }) {
  return (
    <StoryFrame
      description="Direction-aware swipe dismissal adds a visible keyboard-equivalent handle without replacing Escape or the close action."
      itemId="drawer"
      title="Detail drawer"
    >
      <Drawer.Root
        {...(swipe
          ? { swipeHandleLabel: "Close detail drawer", swipeThreshold: 72, swipeToClose: true }
          : {})}
        defaultOpen
        side="end"
      >
        <Drawer.Trigger>Open details</Drawer.Trigger>
        <Drawer.Overlay>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>Detail drawer</Drawer.Title>
              <Drawer.Description>
                Review the selected item without losing the surrounding task.
              </Drawer.Description>
            </Drawer.Header>
            <Drawer.Footer>
              <Drawer.Close>Return to workbench</Drawer.Close>
            </Drawer.Footer>
          </Drawer.Content>
        </Drawer.Overlay>
      </Drawer.Root>
    </StoryFrame>
  );
}

function DropdownMenuSpecimen({
  confirm,
  summary,
}: {
  readonly confirm: boolean;
  readonly summary: boolean;
}) {
  return (
    <StoryFrame
      description="Data-driven menu actions retain a concise baseline while selected-set context and destructive confirmation remain independent."
      itemId="dropdown-menu"
      title="Item actions"
    >
      <DropdownMenu
        {...(confirm ? { confirmDestructiveActions: true } : {})}
        {...(summary ? { selectionSummary: true } : {})}
        defaultOpen
        defaultSelectedIds={["inspect"]}
        items={menuItems}
        label="Open item actions"
        menuLabel="Item actions"
        selectionMode="multiple"
      />
    </StoryFrame>
  );
}

function HoverCardSpecimen({ pin }: { readonly pin: boolean }) {
  return (
    <StoryFrame
      description="Hover and focus share the same preview; press-to-pin adds persistent context and a deterministic close path only when selected."
      itemId="hover-card"
      title="Token preview"
    >
      <HoverCard
        {...(pin ? { pinOnPress: true } : {})}
        defaultOpen
        description="A literal white surface token for documentation and component evaluation."
        title="Canvas surface"
        trigger="Preview canvas token"
      >
        <dl style={{ margin: 0 }}>
          <dt>Resolved role</dt>
          <dd>background.canvas</dd>
        </dl>
      </HoverCard>
    </StoryFrame>
  );
}

function artwork(ink: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480" viewBox="0 0 720 480"><rect width="720" height="480" fill="white"/><rect x="72" y="64" width="576" height="320" rx="12" fill="none" stroke="${ink}" stroke-width="10"/><circle cx="262" cy="224" r="78" fill="${ink}"/><path d="M386 302L474 146L562 302Z" fill="${ink}"/><text x="360" y="438" text-anchor="middle" font-family="Arial" font-size="30" fill="${ink}">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const lightboxItems: readonly LightboxItem[] = [
  {
    alt: "A green circle and triangle inside a precise rectangular frame.",
    caption: "A geometry study for checking scale and position.",
    id: "green-study",
    src: artwork("#176b3a", "Green study"),
    title: "Green geometry study",
  },
  {
    alt: "A violet circle and triangle inside a precise rectangular frame.",
    caption: "A second study for direction-aware gallery navigation.",
    id: "violet-study",
    src: artwork("#4a2d78", "Violet study"),
    title: "Violet geometry study",
  },
];

function LightboxSpecimen({
  positionSummary,
  swipe,
  zoom,
}: {
  readonly positionSummary: boolean;
  readonly swipe: boolean;
  readonly zoom: boolean;
}) {
  return (
    <StoryFrame
      description="Direction-aware gallery navigation stays complete with buttons and keys; position, bounded zoom, and swipe are separate additions."
      itemId="lightbox"
      title="Geometry studies"
    >
      <Lightbox
        {...(positionSummary ? { showPositionSummary: true } : {})}
        {...(swipe ? { swipeNavigation: true } : {})}
        {...(zoom ? { defaultZoom: 1, zoomControls: true } : {})}
        defaultOpenIndex={0}
        items={lightboxItems}
        label="Geometry studies"
      />
    </StoryFrame>
  );
}

const menubarMenus: readonly MenubarMenu[] = [
  {
    id: "file",
    items: menuItems,
    label: "File",
  },
  {
    defaultSelectedIds: ["details"],
    id: "view",
    items: [
      { id: "details", label: "Details" },
      { id: "activity", label: "Activity" },
    ],
    label: "View",
    selectionMode: "multiple",
  },
];

function MenubarSpecimen({
  confirm,
  guide,
  openOnFocus,
  summary,
}: {
  readonly confirm: boolean;
  readonly guide: boolean;
  readonly openOnFocus: boolean;
  readonly summary: boolean;
}) {
  return (
    <StoryFrame
      description="APG menubar movement remains intact while discovery, active-menu focus transfer, selection context, and destructive safety stay independent."
      itemId="menubar"
      title="Document commands"
    >
      <Menubar
        {...(confirm ? { confirmDestructiveActions: true } : {})}
        {...(guide ? { keyboardGuide: true } : {})}
        {...(openOnFocus ? { openMenuOnFocus: true } : {})}
        {...(summary ? { selectionSummary: true } : {})}
        defaultOpenMenuId="view"
        label="Document commands"
        menus={menubarMenus}
      />
    </StoryFrame>
  );
}

function ToastSpecimen({
  pauseControls,
  queueSummary,
}: {
  readonly pauseControls: boolean;
  readonly queueSummary: boolean;
}) {
  const queue = useMemo(() => {
    const next = createToastQueue({ maxVisible: 1 });
    next.add({
      description: "The durable result is also recorded in the activity log.",
      persistent: true,
      title: "Review complete",
      tone: "success",
    });
    next.add({
      description: "Open it after the current task is complete.",
      persistent: true,
      title: "One update waiting",
    });
    return next;
  }, []);
  return (
    <StoryFrame
      description="The bounded queue preserves durable recovery guidance; waiting-count context and explicit timer control remain removable."
      itemId="toast"
      title="Notification queue"
    >
      <div style={actionRowStyle}>
        <button
          onClick={() =>
            queue.add({
              description: "The source of truth remains visible on this page.",
              persistent: true,
              title: "Local state saved",
            })
          }
          style={actionStyle}
          type="button"
        >
          Add notification
        </button>
      </div>
      <ToastRegion
        {...(pauseControls ? { pauseControls: true } : {})}
        {...(queueSummary ? { showQueueSummary: true } : {})}
        queue={queue}
      />
    </StoryFrame>
  );
}

const onlyControls = (...names: readonly (keyof OverlayProofArgs)[]) => ({
  controls: { include: names },
});

const meta = {
  args: {
    alertAcknowledgement: false,
    contextHint: false,
    dialogDismissHint: false,
    drawerSwipe: false,
    dropdownConfirm: false,
    dropdownSummary: false,
    hoverPin: false,
    lightboxSummary: false,
    lightboxSwipe: false,
    lightboxZoom: false,
    menubarGuide: false,
    menubarOpenOnFocus: false,
    popoverAnchorContext: false,
    popoverManagedFocus: false,
    sheetProgress: false,
    toastPauseControls: false,
    toastQueueSummary: false,
    tooltipDisabledAdapter: false,
    tooltipShortcut: false,
  },
  argTypes: {
    alertAcknowledgement: { control: "boolean" },
    contextHint: { control: "boolean" },
    dialogDismissHint: { control: "boolean" },
    drawerSwipe: { control: "boolean" },
    dropdownConfirm: { control: "boolean" },
    dropdownSummary: { control: "boolean" },
    hoverPin: { control: "boolean" },
    lightboxSummary: { control: "boolean" },
    lightboxSwipe: { control: "boolean" },
    lightboxZoom: { control: "boolean" },
    menubarGuide: { control: "boolean" },
    menubarOpenOnFocus: { control: "boolean" },
    popoverAnchorContext: { control: "boolean" },
    popoverManagedFocus: { control: "boolean" },
    sheetProgress: { control: "boolean" },
    toastPauseControls: { control: "boolean" },
    toastQueueSummary: { control: "boolean" },
    tooltipDisabledAdapter: { control: "boolean" },
    tooltipShortcut: { control: "boolean" },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "P2/Overlays — component proof",
} satisfies Meta<OverlayProofArgs>;

export default meta;
type Story = StoryObj<OverlayProofArgs>;

export const BasicAlertDialog: Story = {
  args: { alertAcknowledgement: false },
  name: "Alert Dialog · Basic",
  parameters: onlyControls("alertAcknowledgement"),
  render: (args) => <AlertDialogSpecimen acknowledgement={args.alertAcknowledgement} />,
};

export const RecommendedAlertDialog: Story = {
  args: { alertAcknowledgement: true },
  name: "Alert Dialog · Recommended Mergora",
  parameters: onlyControls("alertAcknowledgement"),
  render: (args) => <AlertDialogSpecimen acknowledgement={args.alertAcknowledgement} />,
};

export const BasicDialog: Story = {
  args: { dialogDismissHint: false },
  name: "Dialog · Basic",
  parameters: onlyControls("dialogDismissHint"),
  render: (args) => <DialogSpecimen dismissHint={args.dialogDismissHint} />,
};

export const RecommendedDialog: Story = {
  args: { dialogDismissHint: true },
  name: "Dialog · Recommended Mergora",
  parameters: onlyControls("dialogDismissHint"),
  render: (args) => <DialogSpecimen dismissHint={args.dialogDismissHint} />,
};

export const BasicPopover: Story = {
  args: { popoverAnchorContext: false, popoverManagedFocus: false },
  name: "Popover · Basic",
  parameters: onlyControls("popoverAnchorContext", "popoverManagedFocus"),
  render: (args) => (
    <PopoverSpecimen
      anchorContext={args.popoverAnchorContext}
      managedFocus={args.popoverManagedFocus}
    />
  ),
};

export const RecommendedPopover: Story = {
  args: { popoverAnchorContext: true, popoverManagedFocus: true },
  name: "Popover · Recommended Mergora",
  parameters: onlyControls("popoverAnchorContext", "popoverManagedFocus"),
  render: (args) => (
    <PopoverSpecimen
      anchorContext={args.popoverAnchorContext}
      managedFocus={args.popoverManagedFocus}
    />
  ),
};

export const BasicSheet: Story = {
  args: { sheetProgress: false },
  name: "Sheet · Basic",
  parameters: onlyControls("sheetProgress"),
  render: (args) => <SheetSpecimen progress={args.sheetProgress} />,
};

export const RecommendedSheet: Story = {
  args: { sheetProgress: true },
  name: "Sheet · Recommended Mergora",
  parameters: onlyControls("sheetProgress"),
  render: (args) => <SheetSpecimen progress={args.sheetProgress} />,
};

export const BasicTooltip: Story = {
  args: { tooltipDisabledAdapter: false, tooltipShortcut: false },
  name: "Tooltip · Basic",
  parameters: onlyControls("tooltipDisabledAdapter", "tooltipShortcut"),
  render: (args) => (
    <TooltipSpecimen
      disabledAdapter={args.tooltipDisabledAdapter}
      shortcut={args.tooltipShortcut}
    />
  ),
};

export const RecommendedTooltip: Story = {
  args: { tooltipDisabledAdapter: true, tooltipShortcut: true },
  name: "Tooltip · Recommended Mergora",
  parameters: onlyControls("tooltipDisabledAdapter", "tooltipShortcut"),
  render: (args) => (
    <TooltipSpecimen
      disabledAdapter={args.tooltipDisabledAdapter}
      shortcut={args.tooltipShortcut}
    />
  ),
};

export const BasicContextMenu: Story = {
  args: { contextHint: false, dropdownConfirm: false, dropdownSummary: false },
  name: "Context Menu · Basic",
  parameters: onlyControls("contextHint", "dropdownSummary", "dropdownConfirm"),
  render: (args) => (
    <ContextMenuSpecimen
      confirm={args.dropdownConfirm}
      hint={args.contextHint}
      summary={args.dropdownSummary}
    />
  ),
};

export const RecommendedContextMenu: Story = {
  args: { contextHint: true, dropdownConfirm: true, dropdownSummary: true },
  name: "Context Menu · Recommended Mergora",
  parameters: onlyControls("contextHint", "dropdownSummary", "dropdownConfirm"),
  render: (args) => (
    <ContextMenuSpecimen
      confirm={args.dropdownConfirm}
      hint={args.contextHint}
      summary={args.dropdownSummary}
    />
  ),
};

export const BasicDrawer: Story = {
  args: { drawerSwipe: false },
  name: "Drawer · Basic",
  parameters: onlyControls("drawerSwipe"),
  render: (args) => <DrawerSpecimen swipe={args.drawerSwipe} />,
};

export const RecommendedDrawer: Story = {
  args: { drawerSwipe: true },
  name: "Drawer · Recommended Mergora",
  parameters: onlyControls("drawerSwipe"),
  render: (args) => <DrawerSpecimen swipe={args.drawerSwipe} />,
};

export const BasicDropdownMenu: Story = {
  args: { dropdownConfirm: false, dropdownSummary: false },
  name: "Dropdown Menu · Basic",
  parameters: onlyControls("dropdownSummary", "dropdownConfirm"),
  render: (args) => (
    <DropdownMenuSpecimen confirm={args.dropdownConfirm} summary={args.dropdownSummary} />
  ),
};

export const RecommendedDropdownMenu: Story = {
  args: { dropdownConfirm: true, dropdownSummary: true },
  name: "Dropdown Menu · Recommended Mergora",
  parameters: onlyControls("dropdownSummary", "dropdownConfirm"),
  render: (args) => (
    <DropdownMenuSpecimen confirm={args.dropdownConfirm} summary={args.dropdownSummary} />
  ),
};

export const BasicHoverCard: Story = {
  args: { hoverPin: false },
  name: "Hover Card · Basic",
  parameters: onlyControls("hoverPin"),
  render: (args) => <HoverCardSpecimen pin={args.hoverPin} />,
};

export const RecommendedHoverCard: Story = {
  args: { hoverPin: true },
  name: "Hover Card · Recommended Mergora",
  parameters: onlyControls("hoverPin"),
  render: (args) => <HoverCardSpecimen pin={args.hoverPin} />,
};

export const BasicLightbox: Story = {
  args: { lightboxSummary: false, lightboxSwipe: false, lightboxZoom: false },
  name: "Lightbox · Basic",
  parameters: onlyControls("lightboxSummary", "lightboxZoom", "lightboxSwipe"),
  render: (args) => (
    <LightboxSpecimen
      positionSummary={args.lightboxSummary}
      swipe={args.lightboxSwipe}
      zoom={args.lightboxZoom}
    />
  ),
};

export const RecommendedLightbox: Story = {
  args: { lightboxSummary: true, lightboxSwipe: true, lightboxZoom: true },
  name: "Lightbox · Recommended Mergora",
  parameters: onlyControls("lightboxSummary", "lightboxZoom", "lightboxSwipe"),
  render: (args) => (
    <LightboxSpecimen
      positionSummary={args.lightboxSummary}
      swipe={args.lightboxSwipe}
      zoom={args.lightboxZoom}
    />
  ),
};

export const BasicMenubar: Story = {
  args: {
    dropdownConfirm: false,
    dropdownSummary: false,
    menubarGuide: false,
    menubarOpenOnFocus: false,
  },
  name: "Menubar · Basic",
  parameters: onlyControls(
    "menubarGuide",
    "menubarOpenOnFocus",
    "dropdownSummary",
    "dropdownConfirm",
  ),
  render: (args) => (
    <MenubarSpecimen
      confirm={args.dropdownConfirm}
      guide={args.menubarGuide}
      openOnFocus={args.menubarOpenOnFocus}
      summary={args.dropdownSummary}
    />
  ),
};

export const RecommendedMenubar: Story = {
  args: {
    dropdownConfirm: true,
    dropdownSummary: true,
    menubarGuide: true,
    menubarOpenOnFocus: true,
  },
  name: "Menubar · Recommended Mergora",
  parameters: onlyControls(
    "menubarGuide",
    "menubarOpenOnFocus",
    "dropdownSummary",
    "dropdownConfirm",
  ),
  render: (args) => (
    <MenubarSpecimen
      confirm={args.dropdownConfirm}
      guide={args.menubarGuide}
      openOnFocus={args.menubarOpenOnFocus}
      summary={args.dropdownSummary}
    />
  ),
};

export const BasicToast: Story = {
  args: { toastPauseControls: false, toastQueueSummary: false },
  name: "Toast · Basic",
  parameters: onlyControls("toastQueueSummary", "toastPauseControls"),
  render: (args) => (
    <ToastSpecimen pauseControls={args.toastPauseControls} queueSummary={args.toastQueueSummary} />
  ),
};

export const RecommendedToast: Story = {
  args: { toastPauseControls: true, toastQueueSummary: true },
  name: "Toast · Recommended Mergora",
  parameters: onlyControls("toastQueueSummary", "toastPauseControls"),
  render: (args) => (
    <ToastSpecimen pauseControls={args.toastPauseControls} queueSummary={args.toastQueueSummary} />
  ),
};
