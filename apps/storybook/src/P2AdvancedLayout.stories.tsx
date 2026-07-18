import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Resizable } from "../../../registry/source/components/resizable/resizable";
import { ScrollArea } from "../../../registry/source/components/scroll-area/scroll-area";
import { SplitPane } from "../../../registry/source/components/split-pane/split-pane";
import { StickyRegion } from "../../../registry/source/components/sticky-region/sticky-region";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  boxSizing: "border-box",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-space-page)",
} satisfies CSSProperties;

const panelStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  boxSizing: "border-box",
  minBlockSize: "10rem",
  padding: "var(--mrg-semantic-density-panel-padding)",
} satisfies CSSProperties;

const alternatePanelStyle = {
  ...panelStyle,
  background: "var(--mrg-semantic-color-accent-background-subtle)",
} satisfies CSSProperties;

const actionStyle = {
  background: "var(--mrg-semantic-color-action-background)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-action-border)",
  borderRadius: "var(--mrg-semantic-radius-control)",
  color: "var(--mrg-semantic-color-action-foreground)",
  font: "inherit",
  minBlockSize: "var(--mrg-semantic-size-target-preferred)",
  paddingBlock: "var(--mrg-semantic-space-inline-sm)",
  paddingInline: "var(--mrg-semantic-space-inline-lg)",
} satisfies CSSProperties;

function Canvas({
  children,
  direction,
}: {
  readonly children: ReactNode;
  readonly direction?: "rtl";
}) {
  return (
    <main dir={direction} style={canvasStyle}>
      {children}
    </main>
  );
}

function ControlledSplitSpecimen() {
  const [sizes, setSizes] = useState<readonly number[]>([28, 44, 28]);
  return (
    <SplitPane.Root
      collapsiblePanels={[0, 2]}
      minSizes={[18, 25, 18]}
      onValueChange={setSizes}
      value={sizes}
    >
      <SplitPane.Panel index={0} regionLabel="Navigation" style={panelStyle}>
        <strong>Navigation</strong>
        <p>Controlled at {Math.round(sizes[0] ?? 0)} percent.</p>
      </SplitPane.Panel>
      <SplitPane.Handle
        aria-label="Resize navigation and work area"
        collapseTarget="before"
        index={0}
      />
      <SplitPane.Panel index={1} regionLabel="Work area" style={alternatePanelStyle}>
        <strong>Nested work area</strong>
        <SplitPane.Root
          defaultValue={[55, 45]}
          orientation="vertical"
          stackAt="never"
          style={{ blockSize: "16rem", marginBlockStart: "var(--mrg-semantic-space-stack-sm)" }}
        >
          <SplitPane.Panel index={0} style={panelStyle}>
            Source preview
          </SplitPane.Panel>
          <SplitPane.Handle aria-label="Resize source and evidence" index={0} />
          <SplitPane.Panel index={1} style={panelStyle}>
            Evidence output
          </SplitPane.Panel>
        </SplitPane.Root>
      </SplitPane.Panel>
      <SplitPane.Handle
        aria-label="Resize work area and inspector"
        collapseTarget="after"
        index={1}
      />
      <SplitPane.Panel index={2} regionLabel="Inspector" style={panelStyle}>
        <strong>Inspector</strong>
        <p>Collapse and restore without losing the other panel sizes.</p>
      </SplitPane.Panel>
    </SplitPane.Root>
  );
}

function PersistentSplitSpecimen() {
  const [writtenSizes, setWrittenSizes] = useState<readonly number[] | null>(null);
  const adapter = useMemo(
    () => ({
      read: (key: string) => (key === "storybook-workspace" ? [25, 75] : null),
      write: (_key: string, sizes: readonly number[]) => setWrittenSizes(sizes),
    }),
    [],
  );
  return (
    <div>
      <output aria-label="Last persisted layout">
        {writtenSizes === null
          ? "No new layout committed"
          : writtenSizes.map((size) => Math.round(size)).join(" / ")}
      </output>
      <SplitPane.Root defaultValue={[50, 50]} persistence={{ adapter, key: "storybook-workspace" }}>
        <SplitPane.Panel index={0} style={panelStyle}>
          Restored source panel
        </SplitPane.Panel>
        <SplitPane.Handle aria-label="Resize persisted panels" index={0} />
        <SplitPane.Panel index={1} style={alternatePanelStyle}>
          Restored preview panel
        </SplitPane.Panel>
      </SplitPane.Root>
    </div>
  );
}

const meta = {
  component: ScrollArea,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Advanced Intrinsic Layout",
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AdvancedLayoutWorkbench: Story = {
  render: () => (
    <Canvas>
      <h1>Advanced intrinsic layout workbench</h1>
      <p style={{ maxInlineSize: "68ch" }}>
        Native scrolling, explicit resize alternatives, responsive panel sequencing, and measured
        sticky focus offsets remain visible and inspectable.
      </p>
      <div style={{ display: "grid", gap: "var(--mrg-semantic-space-stack-lg)" }}>
        <ScrollArea aria-label="Recent verification runs" focusable size="sm">
          <ol>
            {Array.from({ length: 14 }, (_, index) => (
              <li key={index}>Verification run {index + 1}: package and source results agree.</li>
            ))}
          </ol>
        </ScrollArea>
        <Resizable.Root collapsible defaultValue={38} min={20}>
          <Resizable.Primary style={panelStyle}>
            <strong>Editable source</strong>
            <p>Drag the separator, use its keys, or use the adjacent touch controls.</p>
          </Resizable.Primary>
          <Resizable.Handle aria-label="Resize editable source panel" />
          <Resizable.Secondary style={alternatePanelStyle}>
            <strong>Generated evidence</strong>
            <p>The value is exposed as a localized percentage.</p>
          </Resizable.Secondary>
        </Resizable.Root>
        <ControlledSplitSpecimen />
      </div>
    </Canvas>
  ),
};

export const KeyboardAndTouchResize: Story = {
  render: () => (
    <Canvas>
      <h2>Keyboard and single-pointer alternatives</h2>
      <Resizable.Root collapsible defaultValue={45} min={20} step={5}>
        <Resizable.Primary style={panelStyle}>
          Focus the separator for arrows, Home, End, Page Up, Page Down, and Enter.
        </Resizable.Primary>
        <Resizable.Handle aria-label="Resize contract panel" />
        <Resizable.Secondary style={alternatePanelStyle}>
          The minus, collapse, and plus controls provide 44-pixel touch targets without dragging.
        </Resizable.Secondary>
      </Resizable.Root>
    </Canvas>
  ),
};

export const ControlledAndNestedPanes: Story = {
  render: () => (
    <Canvas>
      <h2>Controlled three-panel layout with a nested split</h2>
      <ControlledSplitSpecimen />
    </Canvas>
  ),
};

export const ResponsiveStack: Story = {
  render: () => (
    <Canvas>
      <h2>Container-driven sequential mode</h2>
      <div style={{ inlineSize: "20rem", maxInlineSize: "100%" }}>
        <SplitPane.Root defaultValue={[35, 65]} stackAt="narrow">
          <SplitPane.Panel index={0} style={panelStyle}>
            Navigation remains first in DOM and reading order.
          </SplitPane.Panel>
          <SplitPane.Handle aria-label="Resize navigation and content" index={0} />
          <SplitPane.Panel index={1} style={alternatePanelStyle}>
            Content follows in full-width sequential mode with no horizontal panning.
          </SplitPane.Panel>
        </SplitPane.Root>
      </div>
    </Canvas>
  ),
};

export const PersistenceAdapter: Story = {
  render: () => (
    <Canvas>
      <h2>Consumer-owned persistence adapter</h2>
      <PersistentSplitSpecimen />
    </Canvas>
  ),
};

export const NativeScrollAffordance: Story = {
  render: () => (
    <Canvas>
      <h2>Native horizontal and vertical scrolling</h2>
      <ScrollArea aria-label="Wide release comparison" focusable orientation="both" size="sm">
        <div style={{ inlineSize: "70rem", padding: "var(--mrg-semantic-density-panel-padding)" }}>
          <strong>Source → package → registry → independent consumer → evidence digest</strong>
          {Array.from({ length: 12 }, (_, index) => (
            <p key={index}>
              Row {index + 1}: browser-native scrollbars remain visible in high contrast.
            </p>
          ))}
        </div>
      </ScrollArea>
    </Canvas>
  ),
};

export const StickyFocusPreservation: Story = {
  render: () => (
    <Canvas>
      <h2>Sticky content with measured focus clearance</h2>
      <StickyRegion.Root contained size="sm">
        <StickyRegion.Content
          element="header"
          style={{ padding: "var(--mrg-semantic-space-inline-md)" }}
        >
          <strong>Current verification controls</strong>
        </StickyRegion.Content>
        <StickyRegion.Body
          style={{
            display: "grid",
            gap: "var(--mrg-semantic-space-stack-md)",
            padding: "var(--mrg-semantic-density-panel-padding)",
          }}
        >
          {Array.from({ length: 12 }, (_, index) => (
            <button key={index} style={actionStyle} type="button">
              Focus verification action {index + 1}
            </button>
          ))}
        </StickyRegion.Body>
      </StickyRegion.Root>
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl">
      <h2>تخطيط مرن من اليمين إلى اليسار</h2>
      <Resizable.Root defaultValue={40}>
        <Resizable.Primary style={panelStyle}>لوحة البداية المنطقية</Resizable.Primary>
        <Resizable.Handle aria-label="تغيير حجم اللوحة" />
        <Resizable.Secondary style={alternatePanelStyle}>لوحة النهاية المنطقية</Resizable.Secondary>
      </Resizable.Root>
    </Canvas>
  ),
};

export const DisabledResize: Story = {
  render: () => (
    <Canvas>
      <h2>Disabled resizing remains understandable</h2>
      <Resizable.Root defaultValue={40} disabled>
        <Resizable.Primary style={panelStyle}>Locked source panel</Resizable.Primary>
        <Resizable.Handle aria-label="Resize locked source panel" />
        <Resizable.Secondary style={alternatePanelStyle}>Locked evidence panel</Resizable.Secondary>
      </Resizable.Root>
    </Canvas>
  ),
};
