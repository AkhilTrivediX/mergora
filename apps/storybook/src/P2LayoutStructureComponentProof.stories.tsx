import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { AspectRatio } from "../../../registry/source/components/aspect-ratio/index.ts";
import { Center } from "../../../registry/source/components/center/index.ts";
import { Cluster } from "../../../registry/source/components/cluster/index.ts";
import { Container } from "../../../registry/source/components/container/index.ts";
import { Grid } from "../../../registry/source/components/grid/index.ts";
import { Inline } from "../../../registry/source/components/inline/index.ts";
import { Resizable } from "../../../registry/source/components/resizable/index.ts";
import { ScrollArea } from "../../../registry/source/components/scroll-area/index.ts";
import { Separator } from "../../../registry/source/components/separator/index.ts";
import { SplitPane } from "../../../registry/source/components/split-pane/index.ts";
import { Stack } from "../../../registry/source/components/stack/index.ts";
import { StickyRegion } from "../../../registry/source/components/sticky-region/index.ts";
import "mergora-tokens/tokens.css";

interface LayoutStructureArgs {
  readonly adaptiveWrap: boolean;
  readonly containOverscroll: boolean;
  readonly equalRows: boolean;
  readonly fillOrphan: boolean;
  readonly fitMedia: boolean;
  readonly focusableScroll: boolean;
  readonly manageFocusOffset: boolean;
  readonly queryContainer: boolean;
  readonly responsiveStack: boolean;
  readonly safeArea: boolean;
  readonly semanticMaximum: boolean;
  readonly separatedStack: boolean;
  readonly separatorSpacing: boolean;
  readonly showStepControls: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(48rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const railStyle: CSSProperties = {
  borderBlockEnd:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  minInlineSize: 0,
  paddingBlock: "var(--mrg-semantic-space-stack-sm)",
};

const panelStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-surface)",
  boxSizing: "border-box",
  minBlockSize: "9rem",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const alternatePanelStyle: CSSProperties = {
  ...panelStyle,
  background: "var(--mrg-semantic-color-accent-background-subtle)",
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
    <section aria-labelledby={`${itemId}-proof-title`} data-story-item={itemId} style={frameStyle}>
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
  );
}

function geometryArtwork(): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540"><rect width="960" height="540" fill="white"/><rect x="64" y="56" width="832" height="428" rx="12" fill="none" stroke="#17271f" stroke-width="8"/><circle cx="330" cy="270" r="112" fill="#176b3a"/><path d="M520 386L650 154L780 386Z" fill="#4a2d78"/></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function AspectRatioSpecimen({ fit }: { readonly fit: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Validated named geometry preserves the native image; direct-media fitting is selected only when the surface needs it."
      itemId="aspect-ratio"
      title="Preview geometry"
    >
      <AspectRatio {...(fit ? { fit: "contain" as const } : {})} ratio="wide">
        <img
          alt="A green circle and violet triangle inside a precise ink frame."
          height="540"
          src={geometryArtwork()}
          style={{ maxInlineSize: "100%" }}
          width="960"
        />
      </AspectRatio>
    </SpecimenFrame>
  );
}

function CenterSpecimen({ semanticMaximum }: { readonly semanticMaximum: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Logical centering remains independent from a semantic reading bound, which stays fluid at narrow widths."
      itemId="center"
      title="Readable measure"
    >
      <Center {...(semanticMaximum ? { maximum: "prose" as const } : {})} axis="inline">
        <p style={{ margin: 0 }}>
          Component evidence is easier to inspect when long prose keeps a readable line length while
          still using every available pixel on a narrow canvas.
        </p>
      </Center>
    </SpecimenFrame>
  );
}

function ClusterSpecimen({ fillOrphan }: { readonly fillOrphan: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Logical wrapping preserves action order; an intentional final-orphan fill is available without changing button semantics."
      itemId="cluster"
      title="Review actions"
    >
      <Cluster
        {...(fillOrphan ? { orphan: "fill" as const } : {})}
        style={{ maxInlineSize: "28rem" }}
      >
        <button style={actionStyle} type="button">
          Inspect source
        </button>
        <button style={actionStyle} type="button">
          Compare package
        </button>
        <button style={actionStyle} type="button">
          Record evidence
        </button>
      </Cluster>
    </SpecimenFrame>
  );
}

function ContainerSpecimen({
  queryContainer,
  safeArea,
}: {
  readonly queryContainer: boolean;
  readonly safeArea: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="Semantic width and gutters stay stable while safe-area mapping and local inline-size containment remain independent."
      itemId="container"
      title="Local layout boundary"
    >
      <style>{`
        .layout-container-proof { color: var(--mrg-semantic-color-foreground-muted); }
        @container (min-width: 24rem) {
          .layout-container-proof {
            color: var(--mrg-semantic-color-brand-action);
            font-weight: var(--mrg-semantic-font-weight-strong);
          }
        }
      `}</style>
      <Container queryContainer={queryContainer} safeArea={safeArea} width="full">
        <p className="layout-container-proof" style={{ margin: 0 }}>
          This evidence rail responds to its container rather than the viewport.
        </p>
      </Container>
    </SpecimenFrame>
  );
}

function GridSpecimen({ equalRows }: { readonly equalRows: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Breakpoint-free semantic minimums keep DOM order intact; equal intrinsic rows are an explicit presentation choice."
      itemId="grid"
      title="Evidence matrix"
    >
      <Grid {...(equalRows ? { equalRows: true } : {})} minimum="compact">
        <div style={railStyle}>
          <strong>Keyboard</strong>
          <p style={{ marginBlockEnd: 0 }}>DOM order remains the reading and focus order.</p>
        </div>
        <div style={railStyle}>
          <strong>Narrow screens</strong>
          <p style={{ marginBlockEnd: 0 }}>
            Intrinsic tracks reflow without a fabricated grid interaction model.
          </p>
        </div>
        <div style={railStyle}>
          <strong>RTL</strong>
          <p style={{ marginBlockEnd: 0 }}>Logical geometry follows document direction.</p>
        </div>
      </Grid>
    </SpecimenFrame>
  );
}

function InlineSpecimen({ adaptiveWrap }: { readonly adaptiveWrap: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Logical alignment keeps controls in order; adaptive wrapping can be disabled without adding a synthetic scrollport."
      itemId="inline"
      title="Compact command row"
    >
      <Inline align="baseline" style={{ maxInlineSize: "20rem" }} wrap={adaptiveWrap}>
        <button style={actionStyle} type="button">
          Review source
        </button>
        <button style={actionStyle} type="button">
          Compare output
        </button>
        <button style={actionStyle} type="button">
          Save result
        </button>
      </Inline>
    </SpecimenFrame>
  );
}

function ResizableSpecimen({
  showStepControls,
}: {
  readonly showStepControls: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="The named separator retains pointer and keyboard resizing; explicit touch-sized step controls are independently removable."
      itemId="resizable"
      title="Source and preview"
    >
      <Resizable.Root collapsible defaultValue={42} min={20} showStepControls={showStepControls}>
        <Resizable.Primary style={panelStyle}>
          <strong>Editable source</strong>
          <p>Resize from the separator with arrows, Home, End, Page Up, or Page Down.</p>
        </Resizable.Primary>
        <Resizable.Handle aria-label="Resize source and preview" />
        <Resizable.Secondary style={alternatePanelStyle}>
          <strong>Rendered preview</strong>
          <p>The localized separator value remains the authoritative size.</p>
        </Resizable.Secondary>
      </Resizable.Root>
    </SpecimenFrame>
  );
}

const revisionRows = Array.from({ length: 10 }, (_, index) => `Revision ${index + 1}`);

function ScrollAreaContent(): ReactElement {
  return (
    <ol>
      {revisionRows.map((revision) => (
        <li key={revision}>{revision}: source and generated output remain synchronized.</li>
      ))}
    </ol>
  );
}

function ScrollAreaSpecimen({
  containOverscroll,
  focusable,
}: {
  readonly containOverscroll: boolean;
  readonly focusable: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="One browser-native scrollport remains the base; named keyboard-region semantics and scroll-chain containment are separate choices."
      itemId="scroll-area"
      title="Revision history"
    >
      {focusable ? (
        <ScrollArea
          aria-label="Revision history"
          containOverscroll={containOverscroll}
          focusable
          size="sm"
        >
          <ScrollAreaContent />
        </ScrollArea>
      ) : (
        <ScrollArea containOverscroll={containOverscroll} focusable={false} size="sm">
          <ScrollAreaContent />
        </ScrollArea>
      )}
    </SpecimenFrame>
  );
}

function SeparatorSpecimen({ spacing }: { readonly spacing: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The native horizontal separator remains semantic; optional logical spacing adds rhythm without wrappers."
      itemId="separator"
      title="Source boundary"
    >
      <p style={{ margin: 0 }}>Canonical source</p>
      <Separator decorative={false} {...(spacing ? { spacing: "md" as const } : {})} />
      <p style={{ margin: 0 }}>Generated package output</p>
    </SpecimenFrame>
  );
}

function SplitPaneSpecimen({
  responsiveStack,
  showStepControls,
}: {
  readonly responsiveStack: boolean;
  readonly showStepControls: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="Bounded multi-panel sizing retains a named separator; explicit step controls and container-driven sequential mode remain independent."
      itemId="split-pane"
      title="Outline and document"
    >
      <SplitPane.Root
        collapsiblePanels={[0]}
        defaultValue={[35, 65]}
        showStepControls={showStepControls}
        stackAt={responsiveStack ? "narrow" : "never"}
      >
        <SplitPane.Panel index={0} regionLabel="Document outline" style={panelStyle}>
          <strong>Outline</strong>
          <p>Headings preserve their DOM and reading order.</p>
        </SplitPane.Panel>
        <SplitPane.Handle
          aria-label="Resize outline and document"
          collapseTarget="before"
          index={0}
        />
        <SplitPane.Panel index={1} regionLabel="Document" style={alternatePanelStyle}>
          <strong>Document</strong>
          <p>The content becomes sequential at the selected container threshold.</p>
        </SplitPane.Panel>
      </SplitPane.Root>
    </SpecimenFrame>
  );
}

function StackSpecimen({ separated }: { readonly separated: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Native list structure and token rhythm remain intact; structural rules can appear without adding separator nodes."
      itemId="stack"
      title="Verification sequence"
    >
      <Stack {...(separated ? { separated: true } : {})} element="ol" gap="sm">
        <li>Generate the package surface.</li>
        <li>Build clean package and source consumers.</li>
        <li>Record current interaction evidence.</li>
      </Stack>
    </SpecimenFrame>
  );
}

function StickyRegionSpecimen({
  manageFocusOffset,
}: {
  readonly manageFocusOffset: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="Sticky content stays ordinary structure; measured focus clearance is removable together with its observer and offsets."
      itemId="sticky-region"
      title="Section controls"
    >
      <StickyRegion.Root
        contained
        {...(manageFocusOffset ? { estimatedSize: 52 } : {})}
        manageFocusOffset={manageFocusOffset}
        size="sm"
      >
        <StickyRegion.Content
          element="header"
          style={{ padding: "var(--mrg-semantic-space-stack-sm)" }}
        >
          <strong>Current section controls</strong>
        </StickyRegion.Content>
        <StickyRegion.Body
          style={{
            display: "grid",
            gap: "var(--mrg-semantic-space-stack-sm)",
            padding: "var(--mrg-semantic-density-panel-padding)",
          }}
        >
          {Array.from({ length: 6 }, (_, index) => (
            <button key={index} style={actionStyle} type="button">
              Review section {index + 1}
            </button>
          ))}
        </StickyRegion.Body>
      </StickyRegion.Root>
    </SpecimenFrame>
  );
}

const onlyControls = (...names: readonly (keyof LayoutStructureArgs)[]) => ({
  controls: { include: names },
});

const meta = {
  args: {
    adaptiveWrap: false,
    containOverscroll: false,
    equalRows: false,
    fillOrphan: false,
    fitMedia: false,
    focusableScroll: false,
    manageFocusOffset: false,
    queryContainer: false,
    responsiveStack: false,
    safeArea: false,
    semanticMaximum: false,
    separatedStack: false,
    separatorSpacing: false,
    showStepControls: false,
  },
  argTypes: {
    adaptiveWrap: { control: "boolean" },
    containOverscroll: { control: "boolean" },
    equalRows: { control: "boolean" },
    fillOrphan: { control: "boolean" },
    fitMedia: { control: "boolean" },
    focusableScroll: { control: "boolean" },
    manageFocusOffset: { control: "boolean" },
    queryContainer: { control: "boolean" },
    responsiveStack: { control: "boolean" },
    safeArea: { control: "boolean" },
    semanticMaximum: { control: "boolean" },
    separatedStack: { control: "boolean" },
    separatorSpacing: { control: "boolean" },
    showStepControls: { control: "boolean" },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "P2/Layout and structure — component proof",
} satisfies Meta<LayoutStructureArgs>;

export default meta;
type Story = StoryObj<LayoutStructureArgs>;

export const BasicAspectRatio: Story = {
  args: { fitMedia: false },
  name: "Aspect Ratio · Basic",
  parameters: onlyControls("fitMedia"),
  render: (args) => <AspectRatioSpecimen fit={args.fitMedia} />,
};

export const RecommendedAspectRatio: Story = {
  args: { fitMedia: true },
  name: "Aspect Ratio · Recommended Mergora",
  parameters: onlyControls("fitMedia"),
  render: (args) => <AspectRatioSpecimen fit={args.fitMedia} />,
};

export const BasicCenter: Story = {
  args: { semanticMaximum: false },
  name: "Center · Basic",
  parameters: onlyControls("semanticMaximum"),
  render: (args) => <CenterSpecimen semanticMaximum={args.semanticMaximum} />,
};

export const RecommendedCenter: Story = {
  args: { semanticMaximum: true },
  name: "Center · Recommended Mergora",
  parameters: onlyControls("semanticMaximum"),
  render: (args) => <CenterSpecimen semanticMaximum={args.semanticMaximum} />,
};

export const BasicCluster: Story = {
  args: { fillOrphan: false },
  name: "Cluster · Basic",
  parameters: onlyControls("fillOrphan"),
  render: (args) => <ClusterSpecimen fillOrphan={args.fillOrphan} />,
};

export const RecommendedCluster: Story = {
  args: { fillOrphan: true },
  name: "Cluster · Recommended Mergora",
  parameters: onlyControls("fillOrphan"),
  render: (args) => <ClusterSpecimen fillOrphan={args.fillOrphan} />,
};

export const BasicContainer: Story = {
  args: { queryContainer: false, safeArea: false },
  name: "Container · Basic",
  parameters: onlyControls("safeArea", "queryContainer"),
  render: (args) => (
    <ContainerSpecimen queryContainer={args.queryContainer} safeArea={args.safeArea} />
  ),
};

export const RecommendedContainer: Story = {
  args: { queryContainer: true, safeArea: true },
  name: "Container · Recommended Mergora",
  parameters: onlyControls("safeArea", "queryContainer"),
  render: (args) => (
    <ContainerSpecimen queryContainer={args.queryContainer} safeArea={args.safeArea} />
  ),
};

export const BasicGrid: Story = {
  args: { equalRows: false },
  name: "Grid · Basic",
  parameters: onlyControls("equalRows"),
  render: (args) => <GridSpecimen equalRows={args.equalRows} />,
};

export const RecommendedGrid: Story = {
  args: { equalRows: true },
  name: "Grid · Recommended Mergora",
  parameters: onlyControls("equalRows"),
  render: (args) => <GridSpecimen equalRows={args.equalRows} />,
};

export const BasicInline: Story = {
  args: { adaptiveWrap: false },
  name: "Inline · Basic",
  parameters: onlyControls("adaptiveWrap"),
  render: (args) => <InlineSpecimen adaptiveWrap={args.adaptiveWrap} />,
};

export const RecommendedInline: Story = {
  args: { adaptiveWrap: true },
  name: "Inline · Recommended Mergora",
  parameters: onlyControls("adaptiveWrap"),
  render: (args) => <InlineSpecimen adaptiveWrap={args.adaptiveWrap} />,
};

export const BasicResizable: Story = {
  args: { showStepControls: false },
  name: "Resizable · Basic",
  parameters: onlyControls("showStepControls"),
  render: (args) => <ResizableSpecimen showStepControls={args.showStepControls} />,
};

export const RecommendedResizable: Story = {
  args: { showStepControls: true },
  name: "Resizable · Recommended Mergora",
  parameters: onlyControls("showStepControls"),
  render: (args) => <ResizableSpecimen showStepControls={args.showStepControls} />,
};

export const BasicScrollArea: Story = {
  args: { containOverscroll: false, focusableScroll: false },
  name: "Scroll Area · Basic",
  parameters: onlyControls("focusableScroll", "containOverscroll"),
  render: (args) => (
    <ScrollAreaSpecimen
      containOverscroll={args.containOverscroll}
      focusable={args.focusableScroll}
    />
  ),
};

export const RecommendedScrollArea: Story = {
  args: { containOverscroll: true, focusableScroll: true },
  name: "Scroll Area · Recommended Mergora",
  parameters: onlyControls("focusableScroll", "containOverscroll"),
  render: (args) => (
    <ScrollAreaSpecimen
      containOverscroll={args.containOverscroll}
      focusable={args.focusableScroll}
    />
  ),
};

export const BasicSeparator: Story = {
  args: { separatorSpacing: false },
  name: "Separator · Basic",
  parameters: onlyControls("separatorSpacing"),
  render: (args) => <SeparatorSpecimen spacing={args.separatorSpacing} />,
};

export const RecommendedSeparator: Story = {
  args: { separatorSpacing: true },
  name: "Separator · Recommended Mergora",
  parameters: onlyControls("separatorSpacing"),
  render: (args) => <SeparatorSpecimen spacing={args.separatorSpacing} />,
};

export const BasicSplitPane: Story = {
  args: { responsiveStack: false, showStepControls: false },
  name: "Split Pane · Basic",
  parameters: onlyControls("showStepControls", "responsiveStack"),
  render: (args) => (
    <SplitPaneSpecimen
      responsiveStack={args.responsiveStack}
      showStepControls={args.showStepControls}
    />
  ),
};

export const RecommendedSplitPane: Story = {
  args: { responsiveStack: true, showStepControls: true },
  name: "Split Pane · Recommended Mergora",
  parameters: onlyControls("showStepControls", "responsiveStack"),
  render: (args) => (
    <SplitPaneSpecimen
      responsiveStack={args.responsiveStack}
      showStepControls={args.showStepControls}
    />
  ),
};

export const BasicStack: Story = {
  args: { separatedStack: false },
  name: "Stack · Basic",
  parameters: onlyControls("separatedStack"),
  render: (args) => <StackSpecimen separated={args.separatedStack} />,
};

export const RecommendedStack: Story = {
  args: { separatedStack: true },
  name: "Stack · Recommended Mergora",
  parameters: onlyControls("separatedStack"),
  render: (args) => <StackSpecimen separated={args.separatedStack} />,
};

export const BasicStickyRegion: Story = {
  args: { manageFocusOffset: false },
  name: "Sticky Region · Basic",
  parameters: onlyControls("manageFocusOffset"),
  render: (args) => <StickyRegionSpecimen manageFocusOffset={args.manageFocusOffset} />,
};

export const RecommendedStickyRegion: Story = {
  args: { manageFocusOffset: true },
  name: "Sticky Region · Recommended Mergora",
  parameters: onlyControls("manageFocusOffset"),
  render: (args) => <StickyRegionSpecimen manageFocusOffset={args.manageFocusOffset} />,
};
