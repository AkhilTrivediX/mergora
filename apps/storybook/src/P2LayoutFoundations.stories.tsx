import type { CSSProperties, ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { AspectRatio } from "../../../registry/source/components/aspect-ratio/aspect-ratio";
import { Center } from "../../../registry/source/components/center/center";
import { Cluster } from "../../../registry/source/components/cluster/cluster";
import { Container } from "../../../registry/source/components/container/container";
import { Grid } from "../../../registry/source/components/grid/grid";
import { Inline } from "../../../registry/source/components/inline/inline";
import { Separator } from "../../../registry/source/components/separator/separator";
import { Stack } from "../../../registry/source/components/stack/stack";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  paddingBlock: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const specimenStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  boxSizing: "border-box",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
} satisfies CSSProperties;

const compactSpecimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-strong) solid var(--mrg-semantic-color-brand-living)",
  boxSizing: "border-box",
  minInlineSize: 0,
  paddingBlock: "var(--mrg-semantic-space-inline-md)",
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

const secondaryActionStyle = {
  ...actionStyle,
  background: "var(--mrg-semantic-color-background-canvas)",
  borderColor: "var(--mrg-semantic-color-border-interactive)",
  color: "var(--mrg-semantic-color-foreground-primary)",
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

function EvidenceDatum({
  children,
  title,
}: {
  readonly children: ReactNode;
  readonly title: string;
}) {
  return (
    <div style={compactSpecimenStyle}>
      <Stack gap="xs">
        <strong>{title}</strong>
        <span>{children}</span>
      </Stack>
    </div>
  );
}

const meta = {
  component: Container,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Intrinsic Layout Foundations",
} satisfies Meta<typeof Container>;

export default meta;
type Story = StoryObj<typeof meta>;

export const LayoutWorkbench: Story = {
  render: () => (
    <Canvas>
      <Container width="wide">
        <Stack gap="lg">
          <Inline align="baseline" justify="between">
            <Stack gap="xs">
              <h1 style={{ margin: 0 }}>Intrinsic layout workbench</h1>
              <p style={{ margin: 0, maxInlineSize: "65ch" }}>
                Native structure, logical properties, and tokenized rhythm stay inspectable at every
                width.
              </p>
            </Stack>
            <span>8 source-present primitives</span>
          </Inline>
          <Separator decorative={false} />
          <Grid minimum="compact">
            <EvidenceDatum title="Container">
              Fluid bounds and safe-area-aware gutters
            </EvidenceDatum>
            <EvidenceDatum title="Stack">Vertical rhythm without collapsed margins</EvidenceDatum>
            <EvidenceDatum title="Grid">Breakpoint-free auto-fit columns</EvidenceDatum>
            <EvidenceDatum title="Cluster">Action wrapping with a deliberate orphan</EvidenceDatum>
          </Grid>
          <AspectRatio ratio="wide">
            <Center
              maximum="prose"
              style={{
                background: "var(--mrg-semantic-color-accent-background-subtle)",
                borderRadius: "var(--mrg-semantic-radius-panel)",
                padding: "var(--mrg-semantic-density-panel-padding)",
              }}
              text="center"
            >
              <Stack align="center" gap="sm">
                <strong>Preferred geometry, preserved semantics</strong>
                <span>Content can expand rather than disappearing behind a crop.</span>
              </Stack>
            </Center>
          </AspectRatio>
          <Cluster>
            <button style={actionStyle} type="button">
              Run layout checks
            </button>
            <button style={secondaryActionStyle} type="button">
              Inspect token contract
            </button>
            <a href="#evidence">Open evidence record</a>
          </Cluster>
        </Stack>
      </Container>
    </Canvas>
  ),
};

export const NarrowReflow: Story = {
  render: () => (
    <Canvas>
      <Container style={{ inlineSize: "20rem" }} width="full">
        <Stack gap="lg">
          <h2 style={{ margin: 0 }}>320 CSS pixel reflow specimen</h2>
          <Inline align="baseline">
            <strong>Lokalisierung:</strong>
            <span>Arbeitsbereichsüberprüfungszusammenfassung</span>
          </Inline>
          <Grid minimum="wide">
            <EvidenceDatum title="Long value">
              provenance.example/independent-consumer/layout-foundations/verification
            </EvidenceDatum>
            <EvidenceDatum title="Japanese">レイアウト検証の証拠</EvidenceDatum>
          </Grid>
          <Center maximum="prose">
            <p style={{ margin: 0 }}>
              Text grows in the block axis, direct children stay within the available inline size,
              and no primitive introduces horizontal clipping.
            </p>
          </Center>
          <Cluster>
            <button style={actionStyle} type="button">
              Lange Prüfungen jetzt ausführen
            </button>
            <button style={secondaryActionStyle} type="button">
              Details
            </button>
          </Cluster>
        </Stack>
      </Container>
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl">
      <Container safeArea width="content">
        <Stack gap="lg">
          <Inline align="baseline" justify="between">
            <h2 style={{ margin: 0 }}>أدلة التخطيط المنطقي</h2>
            <span>من اليمين إلى اليسار</span>
          </Inline>
          <Separator decorative={false} />
          <Grid element="ul" listStyle="none" minimum="compact">
            <li style={compactSpecimenStyle}>تدفق ضيق بدون قص</li>
            <li style={compactSpecimenStyle}>مسافات منطقية قابلة للتدقيق</li>
            <li style={compactSpecimenStyle}>ترتيب القراءة يطابق ترتيب العناصر</li>
          </Grid>
          <Cluster justify="start">
            <button style={actionStyle} type="button">
              تشغيل الفحوصات
            </button>
            <button style={secondaryActionStyle} type="button">
              عرض الأدلة
            </button>
          </Cluster>
        </Stack>
      </Container>
    </Canvas>
  ),
};

export const SemanticLists: Story = {
  render: () => (
    <Canvas>
      <Container width="prose">
        <Grid element="ul" minimum="compact">
          <li>Native list markers stay available by default.</li>
          <li>Grid presentation does not fabricate ARIA grid behavior.</li>
          <li>Reading order remains the DOM order.</li>
        </Grid>
        <Separator />
        <Stack element="ol" gap="sm">
          <li>Generate the package surface.</li>
          <li>Build clean consumers.</li>
          <li>Record current manual evidence.</li>
        </Stack>
      </Container>
    </Canvas>
  ),
};

export const AutoFitGrid: Story = {
  render: () => (
    <Canvas>
      <Container width="wide">
        <Grid minimum="default">
          {[
            "API contract",
            "Narrow geometry",
            "Logical direction",
            "Consumer parity",
            "Update fixture",
          ].map((label) => (
            <EvidenceDatum key={label} title={label}>
              Source exists; release evidence remains intentionally incomplete.
            </EvidenceDatum>
          ))}
        </Grid>
      </Container>
    </Canvas>
  ),
};

export const AspectRatios: Story = {
  render: () => (
    <Canvas>
      <Container width="wide">
        <Grid minimum="compact">
          {[
            ["square", "Square"],
            ["video", "Video"],
            ["portrait", "Portrait"],
            [[5, 3] as const, "Custom 5:3"],
          ].map(([ratio, label]) => (
            <AspectRatio
              key={label as string}
              ratio={ratio as "square" | "video" | "portrait" | readonly [5, 3]}
            >
              <Center style={specimenStyle} text="center">
                <strong>{label}</strong>
              </Center>
            </AspectRatio>
          ))}
        </Grid>
      </Container>
    </Canvas>
  ),
};

export const SeparatorModes: Story = {
  render: () => (
    <Canvas>
      <Container width="prose">
        <Stack gap="lg">
          <Stack gap="sm">
            <span>Semantic horizontal separator follows this statement.</span>
            <Separator decorative={false} />
            <span>The native hr remains in document semantics.</span>
          </Stack>
          <Inline align="stretch">
            <span style={compactSpecimenStyle}>Source</span>
            <Separator decorative={false} orientation="vertical" />
            <span style={compactSpecimenStyle}>Package</span>
            <Separator orientation="vertical" />
            <span style={compactSpecimenStyle}>Registry</span>
          </Inline>
        </Stack>
      </Container>
    </Canvas>
  ),
};

export const FocusPreservation: Story = {
  render: () => (
    <Canvas>
      <Container width="prose">
        <Center maximum="prose" style={{ minBlockSize: "18rem" }}>
          <Stack align="center" gap="lg">
            <p style={{ margin: 0 }}>
              Tab through every child: no layout root clips the browser focus indicator.
            </p>
            <Cluster>
              <button style={actionStyle} type="button">
                First action
              </button>
              <a href="#second">Second focus target</a>
              <button style={secondaryActionStyle} type="button">
                Third action with a longer label
              </button>
            </Cluster>
          </Stack>
        </Center>
      </Container>
    </Canvas>
  ),
};

export const EmptyRoots: Story = {
  render: () => (
    <Canvas>
      <Container width="prose">
        <Stack gap="md">
          <span>Empty roots preserve valid, inert native markup:</span>
          <Container aria-label="Empty container" />
          <Stack aria-label="Empty stack" />
          <Inline aria-label="Empty inline" />
          <Grid aria-label="Empty grid" />
          <Center aria-label="Empty center" />
          <Cluster aria-label="Empty cluster" />
          <AspectRatio aria-label="Empty aspect ratio" />
          <Separator />
        </Stack>
      </Container>
    </Canvas>
  ),
};

export const ContainerQueries: Story = {
  render: () => (
    <Canvas>
      <style>{`
        .p2-query-probe { color: var(--mrg-semantic-color-foreground-muted); }
        @container (min-width: 24rem) {
          .p2-query-probe { color: var(--mrg-semantic-color-brand-action); font-weight: var(--mrg-semantic-font-weight-strong); }
        }
      `}</style>
      <Container queryContainer style={{ inlineSize: "30rem" }} width="full">
        <p className="p2-query-probe">
          This text responds to its anonymous Container inline size, not to the viewport.
        </p>
      </Container>
    </Canvas>
  ),
};

export const SafeArea: Story = {
  render: () => (
    <Canvas>
      <Container safeArea width="full">
        <div style={specimenStyle}>
          The logical gutters use the larger of the spacing token and the physical device safe-area
          inset on each edge.
        </div>
      </Container>
    </Canvas>
  ),
};

export const OrphanBehavior: Story = {
  render: () => (
    <Canvas>
      <Container style={{ inlineSize: "24rem" }} width="full">
        <Stack gap="lg">
          <Cluster>
            <button style={secondaryActionStyle} type="button">
              Review source
            </button>
            <button style={secondaryActionStyle} type="button">
              Compare package
            </button>
            <button style={actionStyle} type="button">
              Publish evidence
            </button>
          </Cluster>
          <Cluster orphan="fill">
            <button style={secondaryActionStyle} type="button">
              Review
            </button>
            <button style={actionStyle} type="button">
              Final action fills only by explicit opt-in
            </button>
          </Cluster>
        </Stack>
      </Container>
    </Canvas>
  ),
};
