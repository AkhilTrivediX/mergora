import type { Meta, StoryObj } from "@storybook/react-vite";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

import "mergora-tokens/tokens.css";
import { ContextMenu } from "../../../registry/source/components/context-menu/context-menu";
import { Drawer } from "../../../registry/source/components/drawer/drawer";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "../../../registry/source/components/dropdown-menu/dropdown-menu";
import { HoverCard } from "../../../registry/source/components/hover-card/hover-card";
import { Lightbox, type LightboxItem } from "../../../registry/source/components/lightbox/lightbox";
import { LayerManager } from "../../../registry/source/components/layer-manager/layer-manager";
import { Menubar, type MenubarMenu } from "../../../registry/source/components/menubar/menubar";
import { MergoraProvider } from "../../../registry/source/components/provider/provider";
import { createToastQueue, ToastRegion } from "../../../registry/source/components/toast/toast";

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

function Canvas({
  children,
  density = "comfortable",
  direction = "ltr",
  locale = "en-US",
}: {
  readonly children: ReactNode;
  readonly density?: "comfortable" | "compact" | "touch";
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
}) {
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  return (
    <MergoraProvider
      density={density}
      direction={direction}
      locale={locale}
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

const menuItems: readonly DropdownMenuItem[] = [
  {
    id: "inspect",
    label: "Inspect details",
    description: "Open the durable record for this item.",
    shortcut: "Enter",
  },
  {
    id: "display",
    kind: "submenu",
    label: "Display",
    items: [
      { id: "comfortable", label: "Comfortable density" },
      { id: "compact", label: "Compact density" },
    ],
  },
  { id: "divider", kind: "separator" },
  {
    id: "remove",
    intent: "destructive",
    label: "Remove saved view",
    confirmationLabel: "Confirm removal",
  },
];

const menubarMenus: readonly MenubarMenu[] = [
  { id: "file", label: "File", items: menuItems },
  {
    id: "edit",
    label: "Edit",
    items: [
      { id: "undo", label: "Undo", shortcut: "Ctrl Z" },
      { id: "redo", label: "Redo", shortcut: "Ctrl Shift Z" },
    ],
  },
  {
    id: "view",
    label: "View",
    items: [
      { id: "details", label: "Details" },
      { id: "activity", label: "Activity" },
    ],
    selectionMode: "single",
    defaultSelectedIds: ["details"],
  },
];

function artwork(background: string, foreground: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640" viewBox="0 0 960 640"><rect width="960" height="640" fill="${background}"/><rect x="96" y="88" width="768" height="464" rx="12" fill="none" stroke="${foreground}" stroke-width="12"/><circle cx="310" cy="320" r="104" fill="${foreground}"/><path d="M470 430L610 190L760 430Z" fill="${foreground}"/><text x="480" y="590" text-anchor="middle" font-family="Arial" font-size="40" fill="${foreground}">${label}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

const lightboxItems: readonly LightboxItem[] = [
  {
    id: "green-study",
    src: artwork("#ffffff", "#176b3a", "Green study"),
    alt: "A green circle and triangle inside a precise rectangular frame.",
    title: "Green geometry study",
    caption: "Circle and triangle forms used to inspect scaling and panning.",
  },
  {
    id: "violet-study",
    src: artwork("#ffffff", "#4a2d78", "Violet study"),
    alt: "A violet circle and triangle inside a precise rectangular frame.",
    title: "Violet geometry study",
    caption: "A second item proving gallery navigation and position context.",
  },
];

interface OverlayWorkbenchProps {
  readonly contextHint?: boolean;
  readonly drawerSwipe?: boolean;
  readonly dropdownConfirm?: boolean;
  readonly dropdownSummary?: boolean;
  readonly hoverPin?: boolean;
  readonly lightboxSummary?: boolean;
  readonly lightboxSwipe?: boolean;
  readonly lightboxZoom?: boolean;
  readonly menubarGuide?: boolean;
  readonly menubarOpenOnFocus?: boolean;
  readonly toastPauseControls?: boolean;
  readonly toastQueueSummary?: boolean;
}

function OverlayWorkbench({
  contextHint = false,
  drawerSwipe = false,
  dropdownConfirm = false,
  dropdownSummary = false,
  hoverPin = false,
  lightboxSummary = false,
  lightboxSwipe = false,
  lightboxZoom = false,
  menubarGuide = false,
  menubarOpenOnFocus = false,
  toastPauseControls = false,
  toastQueueSummary = false,
}: OverlayWorkbenchProps) {
  const queue = useMemo(() => createToastQueue({ maxVisible: 1 }), []);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    queue.add(
      {
        title: "Draft stored locally",
        description: "The persistent page state remains the source of truth.",
        persistent: true,
        tone: "success",
      },
      { dedupeKey: "draft" },
    );
    queue.add(
      {
        title: "One update waiting",
        description: "Review it when the current task is complete.",
        persistent: true,
      },
      { dedupeKey: "waiting" },
    );
  }, [queue]);

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Overlay systems workbench</h1>
      <p>
        Compare concise defaults with independently selectable context, safety, and recovery tools.
      </p>

      <section>
        <h2>Menus and transient previews</h2>
        <div style={railStyle}>
          <DropdownMenu
            confirmDestructiveActions={dropdownConfirm}
            defaultSelectedIds={["inspect"]}
            items={menuItems}
            label="Open item actions"
            menuLabel="Item actions"
            selectionMode="multiple"
            selectionSummary={dropdownSummary}
          />
          <ContextMenu
            confirmDestructiveActions={dropdownConfirm}
            items={menuItems}
            menuLabel="Canvas actions"
            showInvocationHint={contextHint}
          >
            Context target
          </ContextMenu>
          <HoverCard
            description="A supplemental preview with the same focus and hover path."
            pinOnPress={hoverPin}
            title="Semantic surface token"
            trigger="Preview token"
          >
            <dl>
              <dt>Resolved value</dt>
              <dd>Canvas</dd>
            </dl>
          </HoverCard>
        </div>
      </section>

      <section>
        <h2>Application menu</h2>
        <Menubar
          keyboardGuide={menubarGuide}
          label="Document commands"
          menus={menubarMenus}
          openMenuOnFocus={menubarOpenOnFocus}
          selectionSummary={dropdownSummary}
        />
      </section>

      <section>
        <h2>Drawer and gallery</h2>
        <div style={railStyle}>
          <Drawer.Root swipeToClose={drawerSwipe}>
            <Drawer.Trigger>Open detail drawer</Drawer.Trigger>
            <Drawer.Overlay>
              <Drawer.Content>
                <Drawer.Header>
                  <Drawer.Title>Detail drawer</Drawer.Title>
                  <Drawer.Description>
                    Review the selected item without losing the surrounding task.
                  </Drawer.Description>
                </Drawer.Header>
                <p>Buttons and Escape remain available whether swipe support is on or off.</p>
                <Drawer.Footer>
                  <Drawer.Close>Return to workbench</Drawer.Close>
                </Drawer.Footer>
              </Drawer.Content>
            </Drawer.Overlay>
          </Drawer.Root>
        </div>
        <Lightbox
          items={lightboxItems}
          label="Geometry studies"
          showPositionSummary={lightboxSummary}
          swipeNavigation={lightboxSwipe}
          zoomControls={lightboxZoom}
        />
      </section>

      <section>
        <h2>Notification queue</h2>
        <button
          onClick={() =>
            queue.add({
              title: "Review complete",
              description: "The durable result is also visible in the page history.",
              persistent: true,
              tone: "information",
            })
          }
          type="button"
        >
          Add notification
        </button>
        <ToastRegion
          pauseControls={toastPauseControls}
          queue={queue}
          showQueueSummary={toastQueueSummary}
        />
      </section>
    </Canvas>
  );
}

function ControlledDrawerAndLightbox() {
  const [contextOpen, setContextOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hoverOpen, setHoverOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [menubarOpen, setMenubarOpen] = useState<string | null>(null);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Controlled overlay state</h1>
      <output aria-live="polite">
        Menu {dropdownOpen ? "open" : "closed"}; context {contextOpen ? "open" : "closed"}; preview{" "}
        {hoverOpen ? "open" : "closed"}; menubar {menubarOpen ?? "closed"}; drawer{" "}
        {drawerOpen ? "open" : "closed"}; gallery {lightboxIndex ?? "closed"}
      </output>
      <div style={railStyle}>
        <DropdownMenu
          items={menuItems}
          label="Open controlled actions"
          menuLabel="Controlled actions"
          onOpenChange={setDropdownOpen}
          open={dropdownOpen}
          selectionSummary
        />
        <ContextMenu
          items={menuItems}
          menuLabel="Controlled context actions"
          onOpenChange={setContextOpen}
          open={contextOpen}
          showInvocationHint
        >
          Controlled context target
        </ContextMenu>
        <HoverCard
          description="The parent owns whether this supplemental preview is open."
          onOpenChange={setHoverOpen}
          open={hoverOpen}
          pinOnPress
          title="Controlled preview"
          trigger="Open controlled preview"
        />
      </div>
      <Menubar
        keyboardGuide
        label="Controlled document commands"
        menus={menubarMenus}
        onOpenMenuChange={setMenubarOpen}
        openMenuId={menubarOpen}
      />
      <Drawer.Root open={drawerOpen} onOpenChange={setDrawerOpen} swipeToClose>
        <Drawer.Trigger>Open controlled drawer</Drawer.Trigger>
        <Drawer.Overlay>
          <Drawer.Content>
            <Drawer.Title>Controlled drawer</Drawer.Title>
            <Drawer.Description>The parent owns this open state.</Drawer.Description>
            <Drawer.Close>Close controlled drawer</Drawer.Close>
          </Drawer.Content>
        </Drawer.Overlay>
      </Drawer.Root>
      <Lightbox
        items={lightboxItems}
        label="Controlled studies"
        onOpenIndexChange={setLightboxIndex}
        openIndex={lightboxIndex}
        showPositionSummary
        zoomControls
      />
    </Canvas>
  );
}

function NarrowRtlPreferences() {
  const queue = useMemo(() => createToastQueue({ maxVisible: 1 }), []);
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    queue.add({
      description: "يبقى السجل الدائم متاحاً في الصفحة.",
      persistent: true,
      title: "تم حفظ الحالة محلياً",
      tone: "success",
    });
  }, [queue]);

  return (
    <Canvas density="touch" direction="rtl" locale="ar-EG">
      <h1 style={{ margin: 0 }}>RTL and narrow overlay evidence</h1>
      <div style={railStyle}>
        <DropdownMenu
          items={menuItems}
          label="فتح الإجراءات"
          menuLabel="إجراءات العنصر"
          selectionSummary
        />
        <ContextMenu items={menuItems} menuLabel="إجراءات السياق" showInvocationHint>
          هدف قائمة السياق
        </ContextMenu>
        <HoverCard
          description="معاينة إضافية تستخدم مسار التركيز واللمس نفسه."
          pinOnPress
          title="معاينة الرمز"
          trigger="فتح المعاينة"
        />
      </div>
      <Menubar keyboardGuide label="أوامر المستند" menus={menubarMenus} />
      <Drawer.Root side="start" swipeToClose>
        <Drawer.Trigger>فتح لوحة التفاصيل</Drawer.Trigger>
        <Drawer.Overlay>
          <Drawer.Content>
            <Drawer.Title>لوحة التفاصيل</Drawer.Title>
            <Drawer.Description>
              تبقى الإجراءات مرئية وتلتف داخل عرض ضيق مع اتجاه من اليمين إلى اليسار.
            </Drawer.Description>
            <Drawer.Close>إغلاق اللوحة</Drawer.Close>
          </Drawer.Content>
        </Drawer.Overlay>
      </Drawer.Root>
      <Lightbox items={lightboxItems} label="دراسات هندسية" showPositionSummary zoomControls />
      <ToastRegion pauseControls queue={queue} showQueueSummary />
    </Canvas>
  );
}

function DisabledAndEmpty() {
  const emptyQueue = useMemo(() => createToastQueue(), []);
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Disabled and empty overlay states</h1>
      <div style={railStyle}>
        <DropdownMenu disabled items={menuItems} label="Actions unavailable" menuLabel="Actions" />
        <DropdownMenu items={[]} label="Empty actions" menuLabel="Empty actions" />
        <ContextMenu disabled items={menuItems} menuLabel="Context actions">
          Context actions unavailable
        </ContextMenu>
        <ContextMenu items={[]} menuLabel="Empty context actions">
          Empty context target
        </ContextMenu>
        <HoverCard
          description="This preview is unavailable."
          disabled
          title="Unavailable preview"
          trigger="Preview unavailable"
        />
        <Menubar
          label="Unavailable document commands"
          menus={[{ disabled: true, id: "unavailable", items: menuItems, label: "Commands" }]}
        />
      </div>
      <ToastRegion queue={emptyQueue} />
    </Canvas>
  );
}

function ToastPriorityAndRecovery() {
  const queue = useMemo(() => createToastQueue({ maxVisible: 2 }), []);
  const initialized = useRef(false);
  const [recoveryState, setRecoveryState] = useState("Recovery action available");
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    queue.add({
      title: "Connection is taking longer",
      description: "Your work remains local while the next attempt waits.",
      persistent: true,
      tone: "warning",
    });
    queue.add({
      action: {
        closeOnAction: true,
        label: "Try again",
        onAction: () => setRecoveryState("Recovery requested"),
      },
      description: "The durable page state is unchanged. You can safely try again.",
      persistent: true,
      priority: "urgent",
      title: "Update could not be sent",
      tone: "danger",
    });
  }, [queue]);

  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>Notification priority and recovery</h1>
      <output aria-live="polite">{recoveryState}</output>
      <ToastRegion pauseControls queue={queue} showQueueSummary />
    </Canvas>
  );
}

const meta = {
  argTypes: {
    contextHint: { control: "boolean" },
    drawerSwipe: { control: "boolean" },
    dropdownConfirm: { control: "boolean" },
    dropdownSummary: { control: "boolean" },
    hoverPin: { control: "boolean" },
    lightboxSummary: { control: "boolean" },
    lightboxSwipe: { control: "boolean" },
    lightboxZoom: { control: "boolean" },
    menubarGuide: { control: "boolean" },
    menubarOpenOnFocus: { control: "boolean" },
    toastPauseControls: { control: "boolean" },
    toastQueueSummary: { control: "boolean" },
  },
  component: OverlayWorkbench,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P5/Overlay Systems",
} satisfies Meta<typeof OverlayWorkbench>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {
  args: {
    contextHint: false,
    drawerSwipe: false,
    dropdownConfirm: false,
    dropdownSummary: false,
    hoverPin: false,
    lightboxSummary: false,
    lightboxSwipe: false,
    lightboxZoom: false,
    menubarGuide: false,
    menubarOpenOnFocus: false,
    toastPauseControls: false,
    toastQueueSummary: false,
  },
  name: "Basic · enhancements disabled",
};

export const RecommendedMergora: Story = {
  args: {
    contextHint: true,
    drawerSwipe: true,
    dropdownConfirm: true,
    dropdownSummary: true,
    hoverPin: true,
    lightboxSummary: true,
    lightboxSwipe: true,
    lightboxZoom: true,
    menubarGuide: true,
    menubarOpenOnFocus: true,
    toastPauseControls: true,
    toastQueueSummary: true,
  },
  name: "Recommended Mergora",
};

export const ControlledStates: Story = { render: () => <ControlledDrawerAndLightbox /> };
export const NarrowRtl: Story = { render: () => <NarrowRtlPreferences /> };
export const DisabledEmpty: Story = { render: () => <DisabledAndEmpty /> };
export const ToastPriorityRecovery: Story = { render: () => <ToastPriorityAndRecovery /> };
