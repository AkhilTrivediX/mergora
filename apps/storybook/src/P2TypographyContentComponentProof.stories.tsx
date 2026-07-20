import type { Meta, StoryObj } from "@storybook/react-vite";
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { Blockquote } from "../../../registry/source/components/blockquote/index.ts";
import { Code } from "../../../registry/source/components/code/index.ts";
import { CodeBlock } from "../../../registry/source/components/code-block/index.ts";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "../../../registry/source/components/description-list/index.ts";
import {
  DiffViewer,
  type DiffLine,
} from "../../../registry/source/components/diff-viewer/index.ts";
import { Heading } from "../../../registry/source/components/heading/index.ts";
import { JsonViewer } from "../../../registry/source/components/json-viewer/index.ts";
import { KbdChord } from "../../../registry/source/components/kbd/index.ts";
import { Prose } from "../../../registry/source/components/prose/index.ts";
import { Text } from "../../../registry/source/components/text/index.ts";
import "mergora-tokens/tokens.css";

interface TypographyContentArgs {
  readonly bidiIsolation: boolean;
  readonly citationContext: boolean;
  readonly codeCopy: boolean;
  readonly descriptionLayout: boolean;
  readonly diffSummary: boolean;
  readonly headingScale: boolean;
  readonly jsonPath: boolean;
  readonly keyPlatform: boolean;
  readonly proseMeasure: boolean;
  readonly textRecovery: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  gap: "var(--mrg-semantic-space-stack-md)",
  inlineSize: "min(44rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const railStyle: CSSProperties = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-strong) solid var(--mrg-semantic-color-brand-living)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-sm)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-md)",
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
        <Heading id={`${itemId}-proof-title`} level={2}>
          {title}
        </Heading>
        <Text as="p" tone="muted">
          {description}
        </Text>
      </header>
      <div style={railStyle}>{children}</div>
    </section>
  );
}

function BlockquoteSpecimen({ citation }: { readonly citation: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The quote remains semantic content; source provenance is a selectable caption rather than decorative punctuation."
      itemId="blockquote"
      title="Structured quotation"
    >
      <Blockquote
        {...(citation
          ? {
              attribution: "Interface standards group",
              citeUrl: "https://example.com/standards/recovery",
              sourceTitle: "Recoverable interface guidance",
            }
          : {})}
      >
        <p>A useful error names what changed and the next safe action.</p>
      </Blockquote>
    </SpecimenFrame>
  );
}

function CodeSpecimen({ isolate }: { readonly isolate: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Machine text can opt into bidirectional isolation while ordinary inline code continues to follow its sentence."
      itemId="code"
      title="Inline machine value"
    >
      <p dir="rtl">
        مرجع السجل <Code isolateBidi={isolate}>registry/v2/button</Code> جاهز للمراجعة.
      </p>
    </SpecimenFrame>
  );
}

const sourceSample = `export const reviewState = {
  status: "ready",
  retryable: true,
};`;

function CodeBlockSpecimen({ copy }: { readonly copy: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Labelled source stays keyboard-scrollable; the clipboard action and its status channel are installed only when selected."
      itemId="code-block"
      title="Labelled source block"
    >
      <CodeBlock
        code={sourceSample}
        copyable={copy}
        label="Review state example"
        language="ts"
        showLineNumbers={false}
      />
    </SpecimenFrame>
  );
}

function DescriptionListSpecimen({ adaptive }: { readonly adaptive: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Native term and detail semantics can gain an intrinsic multi-column reading layout without changing their order."
      itemId="description-list"
      title="Inspectable definitions"
    >
      <DescriptionList layout={adaptive ? "responsive" : "stacked"}>
        <DescriptionTerm>Evidence state</DescriptionTerm>
        <DescriptionDetails>Automated checks current; manual review pending.</DescriptionDetails>
        <DescriptionTerm>Recovery path</DescriptionTerm>
        <DescriptionDetails>Retry after restoring the last valid input.</DescriptionDetails>
      </DescriptionList>
    </SpecimenFrame>
  );
}

const diffLines: readonly DiffLine[] = [
  { content: "timeout: 30", kind: "removed", oldLineNumber: 1 },
  { content: "timeout: 45", kind: "added", newLineNumber: 1 },
];

function DiffViewerSpecimen({ summary }: { readonly summary: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Added and removed meaning never relies on color; the compact change total is independently selectable."
      itemId="diff-viewer"
      title="Source difference"
    >
      <DiffViewer
        copyable={false}
        label="Timeout configuration change"
        lineNavigation={false}
        lines={diffLines}
        showSummary={summary}
      />
    </SpecimenFrame>
  );
}

function HeadingSpecimen({
  independentScale,
}: {
  readonly independentScale: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="The document outline remains a level-two heading even when a stronger visual scale is useful."
      itemId="heading"
      title="Semantic heading scale"
    >
      <Heading level={2} {...(independentScale ? { size: "lg" as const } : {})}>
        Verification summary
      </Heading>
      <Text as="p">The semantic level is stable in both modes.</Text>
    </SpecimenFrame>
  );
}

const jsonValue = {
  evidence: { automated: true, manual: false },
  state: "review",
} as const;

function JsonViewerSpecimen({ activePath }: { readonly activePath: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The accessible tree remains available on its own; current-path context is a separately selectable toolbar aid."
      itemId="json-viewer"
      title="Structured value tree"
    >
      <JsonViewer
        copyable={false}
        defaultExpandedDepth={2}
        label="Evidence record"
        showActivePath={activePath}
        value={jsonValue}
      />
    </SpecimenFrame>
  );
}

function KbdSpecimen({ platformAware }: { readonly platformAware: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="One spoken shortcut can render the familiar key names for a selected platform without changing its accessible label."
      itemId="kbd"
      title="Platform-aware shortcut"
    >
      <p>
        Open search with{" "}
        <KbdChord
          keys={[
            { key: "Meta", spokenLabel: "Command" },
            { key: "K", spokenLabel: "K" },
          ]}
          platform={platformAware ? "mac" : "generic"}
        />
        .
      </p>
    </SpecimenFrame>
  );
}

function ProseSpecimen({ measured }: { readonly measured: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Authored content keeps native structure; a readable line measure can be added without turning prose into a card."
      itemId="prose"
      title="Bounded authored content"
    >
      <Prose measure={measured ? "prose" : "none"}>
        <h3>Recovery remains explicit</h3>
        <p>
          Preserve the last valid value, explain the rejected change, and keep the next safe action
          close to the affected control.
        </p>
      </Prose>
    </SpecimenFrame>
  );
}

const fullReference =
  "registry.example.dev/releases/immutable/sha256/34bf4b27f39e2d0a468c7evidence";

function TextSpecimen({ recoverable }: { readonly recoverable: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Long text can stay visually compact while retaining its complete value for focus, touch, copy, and assistive technology."
      itemId="text"
      title="Recoverable long value"
    >
      <div style={{ inlineSize: "18rem", maxInlineSize: "100%" }}>
        <Text {...(recoverable ? { fullValue: fullReference, truncate: true } : {})}>
          {fullReference}
        </Text>
      </div>
    </SpecimenFrame>
  );
}

const onlyControl = (name: keyof TypographyContentArgs) => ({
  controls: { include: [name] },
});

const meta = {
  args: {
    bidiIsolation: false,
    citationContext: false,
    codeCopy: false,
    descriptionLayout: false,
    diffSummary: false,
    headingScale: false,
    jsonPath: false,
    keyPlatform: false,
    proseMeasure: false,
    textRecovery: false,
  },
  argTypes: {
    bidiIsolation: {
      control: "boolean",
      description: "Isolate the inline machine value from surrounding bidirectional ordering.",
    },
    citationContext: {
      control: "boolean",
      description: "Add structured attribution, citation, and source-link context.",
    },
    codeCopy: {
      control: "boolean",
      description: "Install the clipboard action and its recoverable status channel.",
    },
    descriptionLayout: {
      control: "boolean",
      description: "Use the intrinsic responsive term-and-detail layout.",
    },
    diffSummary: {
      control: "boolean",
      description: "Add a localized change total to the diff toolbar.",
    },
    headingScale: {
      control: "boolean",
      description: "Choose visual emphasis independently from the semantic heading level.",
    },
    jsonPath: {
      control: "boolean",
      description: "Show the currently active JSON path in the toolbar.",
    },
    keyPlatform: {
      control: "boolean",
      description: "Render the shortcut with Mac-specific key forms.",
    },
    proseMeasure: {
      control: "boolean",
      description: "Apply the component-owned readable prose measure.",
    },
    textRecovery: {
      control: "boolean",
      description: "Enable truncation with full-value recovery metadata.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "Typography & Content/Component proof",
} satisfies Meta<TypographyContentArgs>;

export default meta;
type Story = StoryObj<TypographyContentArgs>;

export const BasicBlockquote: Story = {
  args: { citationContext: false },
  name: "Blockquote · Basic",
  parameters: onlyControl("citationContext"),
  render: (args) => <BlockquoteSpecimen citation={args.citationContext} />,
};

export const RecommendedBlockquote: Story = {
  args: { citationContext: true },
  name: "Blockquote · Recommended Mergora",
  parameters: onlyControl("citationContext"),
  render: (args) => <BlockquoteSpecimen citation={args.citationContext} />,
};

export const BasicCode: Story = {
  args: { bidiIsolation: false },
  name: "Code · Basic",
  parameters: onlyControl("bidiIsolation"),
  render: (args) => <CodeSpecimen isolate={args.bidiIsolation} />,
};

export const RecommendedCode: Story = {
  args: { bidiIsolation: true },
  name: "Code · Recommended Mergora",
  parameters: onlyControl("bidiIsolation"),
  render: (args) => <CodeSpecimen isolate={args.bidiIsolation} />,
};

export const BasicCodeBlock: Story = {
  args: { codeCopy: false },
  name: "Code Block · Basic",
  parameters: onlyControl("codeCopy"),
  render: (args) => <CodeBlockSpecimen copy={args.codeCopy} />,
};

export const RecommendedCodeBlock: Story = {
  args: { codeCopy: true },
  name: "Code Block · Recommended Mergora",
  parameters: onlyControl("codeCopy"),
  render: (args) => <CodeBlockSpecimen copy={args.codeCopy} />,
};

export const BasicDescriptionList: Story = {
  args: { descriptionLayout: false },
  name: "Description List · Basic",
  parameters: onlyControl("descriptionLayout"),
  render: (args) => <DescriptionListSpecimen adaptive={args.descriptionLayout} />,
};

export const RecommendedDescriptionList: Story = {
  args: { descriptionLayout: true },
  name: "Description List · Recommended Mergora",
  parameters: onlyControl("descriptionLayout"),
  render: (args) => <DescriptionListSpecimen adaptive={args.descriptionLayout} />,
};

export const BasicDiffViewer: Story = {
  args: { diffSummary: false },
  name: "Diff Viewer · Basic",
  parameters: onlyControl("diffSummary"),
  render: (args) => <DiffViewerSpecimen summary={args.diffSummary} />,
};

export const RecommendedDiffViewer: Story = {
  args: { diffSummary: true },
  name: "Diff Viewer · Recommended Mergora",
  parameters: onlyControl("diffSummary"),
  render: (args) => <DiffViewerSpecimen summary={args.diffSummary} />,
};

export const BasicHeading: Story = {
  args: { headingScale: false },
  name: "Heading · Basic",
  parameters: onlyControl("headingScale"),
  render: (args) => <HeadingSpecimen independentScale={args.headingScale} />,
};

export const RecommendedHeading: Story = {
  args: { headingScale: true },
  name: "Heading · Recommended Mergora",
  parameters: onlyControl("headingScale"),
  render: (args) => <HeadingSpecimen independentScale={args.headingScale} />,
};

export const BasicJsonViewer: Story = {
  args: { jsonPath: false },
  name: "JSON Viewer · Basic",
  parameters: onlyControl("jsonPath"),
  render: (args) => <JsonViewerSpecimen activePath={args.jsonPath} />,
};

export const RecommendedJsonViewer: Story = {
  args: { jsonPath: true },
  name: "JSON Viewer · Recommended Mergora",
  parameters: onlyControl("jsonPath"),
  render: (args) => <JsonViewerSpecimen activePath={args.jsonPath} />,
};

export const BasicKbd: Story = {
  args: { keyPlatform: false },
  name: "Kbd · Basic",
  parameters: onlyControl("keyPlatform"),
  render: (args) => <KbdSpecimen platformAware={args.keyPlatform} />,
};

export const RecommendedKbd: Story = {
  args: { keyPlatform: true },
  name: "Kbd · Recommended Mergora",
  parameters: onlyControl("keyPlatform"),
  render: (args) => <KbdSpecimen platformAware={args.keyPlatform} />,
};

export const BasicProse: Story = {
  args: { proseMeasure: false },
  name: "Prose · Basic",
  parameters: onlyControl("proseMeasure"),
  render: (args) => <ProseSpecimen measured={args.proseMeasure} />,
};

export const RecommendedProse: Story = {
  args: { proseMeasure: true },
  name: "Prose · Recommended Mergora",
  parameters: onlyControl("proseMeasure"),
  render: (args) => <ProseSpecimen measured={args.proseMeasure} />,
};

export const BasicText: Story = {
  args: { textRecovery: false },
  name: "Text · Basic",
  parameters: onlyControl("textRecovery"),
  render: (args) => <TextSpecimen recoverable={args.textRecovery} />,
};

export const RecommendedText: Story = {
  args: { textRecovery: true },
  name: "Text · Recommended Mergora",
  parameters: onlyControl("textRecovery"),
  render: (args) => <TextSpecimen recoverable={args.textRecovery} />,
};
