import { useState, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Blockquote } from "../../../registry/source/components/blockquote/blockquote";
import { Code } from "../../../registry/source/components/code/code";
import { CodeBlock } from "../../../registry/source/components/code-block/code-block";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "../../../registry/source/components/description-list/description-list";
import {
  DiffViewer,
  type DiffLine,
} from "../../../registry/source/components/diff-viewer/diff-viewer";
import { Heading } from "../../../registry/source/components/heading/heading";
import { JsonViewer } from "../../../registry/source/components/json-viewer/json-viewer";
import { Kbd, KbdChord, type KbdPlatform } from "../../../registry/source/components/kbd/kbd";
import { Prose, type ProseMeasure } from "../../../registry/source/components/prose/prose";
import {
  MergoraProvider,
  type MergoraMessages,
} from "../../../registry/source/components/provider/provider";
import { Text } from "../../../registry/source/components/text/text";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "clamp(1rem, 4vw, 3rem)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-section)",
  inlineSize: "min(100%, var(--mrg-semantic-container-wide))",
  marginInline: "auto",
  minInlineSize: 0,
} satisfies CSSProperties;

const railStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-strong) solid var(--mrg-semantic-color-brand-living)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  minInlineSize: 0,
  paddingBlock: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const splitStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 24rem), 1fr))",
  minInlineSize: 0,
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
      <div style={workbenchStyle}>{children}</div>
    </main>
  );
}

const diffLines: readonly DiffLine[] = [
  {
    content: "export const version = '0.1.0';",
    kind: "context",
    newLineNumber: 1,
    oldLineNumber: 1,
  },
  { content: "export const mode = 'legacy';", kind: "removed", oldLineNumber: 2 },
  { content: "export const mode = 'provenance-aware';", kind: "added", newLineNumber: 2 },
  {
    content: "export const evidence = true;",
    kind: "changed",
    newContent: "export const evidence = true;",
    newLineNumber: 3,
    oldContent: "export const evidence = false;",
    oldLineNumber: 3,
  },
  {
    content: "export const publicApi = 'stable-after-evidence';",
    kind: "context",
    newLineNumber: 4,
    oldLineNumber: 4,
  },
];

const jsonValue = {
  component: "json-viewer",
  evidence: { automated: ["keyboard", "axe", "reflow"], manual: null },
  maturity: "source-present-unreleased",
  release: { published: false, version: "0.0.0" },
} as const;

const sampleCode = `import { Button } from "mergora-ui/button";

export function SaveAction() {
  return <Button>Save safely</Button>;
}`;

const arabicMessages = {
  "diffViewer.column.change": "التغيير",
  "diffViewer.column.content": "المحتوى",
  "diffViewer.column.currentContent": "المحتوى الحالي",
  "diffViewer.column.new": "الجديد",
  "diffViewer.column.newLine": "السطر الجديد",
  "diffViewer.column.old": "القديم",
  "diffViewer.column.oldLine": "السطر القديم",
  "diffViewer.column.previousContent": "المحتوى السابق",
  "diffViewer.copied": "نُسخت الفروق",
  "diffViewer.copy": "نسخ الفروق",
  "diffViewer.copyError": "تعذّر النسخ",
  "diffViewer.empty": "لا توجد فروق.",
  "diffViewer.kind.added": "مضاف",
  "diffViewer.kind.changed": "معدّل",
  "diffViewer.kind.context": "دون تغيير",
  "diffViewer.kind.removed": "محذوف",
  "diffViewer.line": "سطر {kind}. القديم {oldLine}. الجديد {newLine}. {content}",
  "diffViewer.none": "لا يوجد",
  "diffViewer.oldLine": "سطر {kind} القديم",
  "diffViewer.summary": ({ locale, values }) =>
    `${new Intl.NumberFormat(locale).format(Number(values.added))} مضاف، ${new Intl.NumberFormat(locale).format(Number(values.removed))} محذوف`,
  "jsonViewer.collapsed": "مطوي",
  "jsonViewer.copiedPath": "نُسخ المسار",
  "jsonViewer.copiedValue": "نُسخت القيمة",
  "jsonViewer.copyError": "تعذّر النسخ",
  "jsonViewer.copyPath": "نسخ المسار المحدد",
  "jsonViewer.copyValue": "نسخ القيمة المحددة",
  "jsonViewer.expanded": "موسّع",
  "jsonViewer.node": "{key}، {type}، {state}",
  "jsonViewer.path": "المسار {path}.",
  "jsonViewer.rootKey": "الجذر",
  "jsonViewer.tree": "شجرة {label}",
  "jsonViewer.type.array": "مصفوفة",
  "jsonViewer.type.boolean": "قيمة منطقية",
  "jsonViewer.type.null": "فارغ",
  "jsonViewer.type.number": "رقم",
  "jsonViewer.type.object": "كائن",
  "jsonViewer.type.string": "نص",
  "kbd.chordLabel": ({ values }) => (Array.isArray(values.keys) ? values.keys.join(" زائد ") : ""),
} satisfies MergoraMessages;

interface TypographyContentStoryArgs {
  readonly bidiIsolation: boolean;
  readonly citationContext: boolean;
  readonly codeCopy: boolean;
  readonly codeHighlights: boolean;
  readonly descriptionLayout: "columns" | "responsive" | "stacked";
  readonly diffCopy: boolean;
  readonly diffNavigation: boolean;
  readonly diffSummary: boolean;
  readonly headingScale: boolean;
  readonly jsonCopy: boolean;
  readonly jsonPath: boolean;
  readonly keyPlatform: KbdPlatform;
  readonly proseMeasure: ProseMeasure;
  readonly textRecovery: boolean;
}

const meta = {
  args: {
    bidiIsolation: true,
    citationContext: true,
    codeCopy: true,
    codeHighlights: true,
    descriptionLayout: "responsive",
    diffCopy: true,
    diffNavigation: true,
    diffSummary: true,
    headingScale: true,
    jsonCopy: true,
    jsonPath: true,
    keyPlatform: "generic",
    proseMeasure: "prose",
    textRecovery: true,
  },
  argTypes: {
    bidiIsolation: { control: "boolean", name: "Code: isolate bidirectional text" },
    citationContext: { control: "boolean", name: "Blockquote: source context" },
    codeCopy: { control: "boolean", name: "Code block: copy control" },
    codeHighlights: { control: "boolean", name: "Code block: line evidence" },
    descriptionLayout: {
      control: "inline-radio",
      name: "Description list: layout",
      options: ["stacked", "columns", "responsive"],
    },
    diffCopy: { control: "boolean", name: "Diff: copy control" },
    diffNavigation: { control: "boolean", name: "Diff: row navigation" },
    diffSummary: { control: "boolean", name: "Diff: change summary" },
    headingScale: { control: "boolean", name: "Heading: independent visual scale" },
    jsonCopy: { control: "boolean", name: "JSON: copy controls" },
    jsonPath: { control: "boolean", name: "JSON: active path" },
    keyPlatform: {
      control: "inline-radio",
      name: "Keyboard chord: platform",
      options: ["generic", "mac", "windows", "linux"],
    },
    proseMeasure: {
      control: "inline-radio",
      name: "Prose: reading measure",
      options: ["none", "prose", "wide"],
    },
    textRecovery: { control: "boolean", name: "Text: truncation recovery" },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Typography Content",
} satisfies Meta<TypographyContentStoryArgs>;

export default meta;
type Story = StoryObj<TypographyContentStoryArgs>;

function TypographyFamilySpecimen({
  args,
  title,
}: {
  readonly args: TypographyContentStoryArgs;
  readonly title: string;
}) {
  const longReference = "archive.example.org/collections/field-notes/immutable/7f3a24b8c9d0e1f2";
  return (
    <Canvas>
      <header style={railStyle}>
        <Heading level={1} {...(args.headingScale ? { size: "lg" as const } : {})}>
          {title}
        </Heading>
        <Text as="p" size="lg">
          Semantic content stays concise by default; each inspection aid can be added or removed on
          its own.
        </Text>
      </header>

      <section aria-labelledby="family-authored-content" style={railStyle}>
        <Heading id="family-authored-content" level={2}>
          Authored content
        </Heading>
        <Prose measure={args.proseMeasure}>
          <p>
            A dependable guide keeps the main instruction readable and lets embedded controls opt
            out of inherited prose styles.
          </p>
          <p>
            Keep machine values such as <Code isolateBidi={args.bidiIsolation}>dir=auto</Code>{" "}
            selectable when the surrounding sentence changes direction.
          </p>
        </Prose>
        <div style={{ inlineSize: "18rem", maxInlineSize: "100%" }}>
          {args.textRecovery ? (
            <Text fullValue={longReference} truncate>
              {longReference}
            </Text>
          ) : (
            <Text>{longReference}</Text>
          )}
        </div>
      </section>

      <section aria-labelledby="family-reference-content" style={railStyle}>
        <Heading id="family-reference-content" level={2}>
          Reference content
        </Heading>
        <div style={splitStyle}>
          <Blockquote
            {...(args.citationContext
              ? {
                  attribution: "Documentation team",
                  citeUrl: "https://example.com/guides/clear-errors",
                  sourceTitle: "Clear error writing guide",
                }
              : {})}
          >
            <p>A useful error names what happened and the next safe action.</p>
          </Blockquote>
          <DescriptionList layout={args.descriptionLayout}>
            <DescriptionTerm>Reading mode</DescriptionTerm>
            <DescriptionDetails>Comfortable measure with natural wrapping.</DescriptionDetails>
            <DescriptionTerm>Shortcut</DescriptionTerm>
            <DescriptionDetails>
              <KbdChord keys={[{ key: "Control" }, { key: "K" }]} platform={args.keyPlatform} />
            </DescriptionDetails>
          </DescriptionList>
        </div>
      </section>

      <section aria-labelledby="family-machine-content" style={railStyle}>
        <Heading id="family-machine-content" level={2}>
          Inspectable machine content
        </Heading>
        <CodeBlock
          code={sampleCode}
          copyable={args.codeCopy}
          highlightedLines={args.codeHighlights ? [3] : []}
          label="Save action example"
          language="tsx"
          showLineNumbers={args.codeHighlights}
        />
        <DiffViewer
          copyable={args.diffCopy}
          label="Preference changes"
          lineNavigation={args.diffNavigation}
          lines={diffLines}
          showSummary={args.diffSummary}
        />
        <JsonViewer
          copyable={args.jsonCopy}
          defaultExpandedDepth={2}
          label="Reader preferences"
          showActivePath={args.jsonPath}
          value={jsonValue}
        />
      </section>
    </Canvas>
  );
}

const basicArgs: TypographyContentStoryArgs = {
  bidiIsolation: false,
  citationContext: false,
  codeCopy: false,
  codeHighlights: false,
  descriptionLayout: "stacked",
  diffCopy: false,
  diffNavigation: false,
  diffSummary: false,
  headingScale: false,
  jsonCopy: false,
  jsonPath: false,
  keyPlatform: "generic",
  proseMeasure: "none",
  textRecovery: false,
};

const recommendedArgs: TypographyContentStoryArgs = {
  bidiIsolation: true,
  citationContext: true,
  codeCopy: true,
  codeHighlights: true,
  descriptionLayout: "responsive",
  diffCopy: true,
  diffNavigation: true,
  diffSummary: true,
  headingScale: true,
  jsonCopy: true,
  jsonPath: true,
  keyPlatform: "mac",
  proseMeasure: "prose",
  textRecovery: true,
};

export const BasicDefaults: Story = {
  args: basicArgs,
  render: (args) => <TypographyFamilySpecimen args={args} title="Plain semantic defaults" />,
};

export const RecommendedMergora: Story = {
  args: recommendedArgs,
  render: (args) => <TypographyFamilySpecimen args={args} title="Mergora inspection workbench" />,
};

function ControlledInspectionSpecimen() {
  const [activeLine, setActiveLine] = useState(0);
  const [activePath, setActivePath] = useState("$.evidence");
  const [expandedPaths, setExpandedPaths] = useState<readonly string[]>(["$", "$.evidence"]);
  return (
    <Canvas>
      <Heading level={1} size="lg">
        Controlled inspection state
      </Heading>
      <Text aria-live="polite" as="p" data-controlled-state="diff">
        Active change row: {activeLine + 1}
      </Text>
      <DiffViewer
        activeLine={activeLine}
        label="Controlled preference changes"
        lines={diffLines}
        onActiveLineChange={(index) => setActiveLine(index)}
      />
      <Text aria-live="polite" as="p" data-controlled-state="json">
        Active value: {activePath}
      </Text>
      <JsonViewer
        activePath={activePath}
        expandedPaths={expandedPaths}
        label="Controlled reader preferences"
        onActivePathChange={(path) => setActivePath(path)}
        onExpandedPathsChange={setExpandedPaths}
        value={jsonValue}
      />
    </Canvas>
  );
}

export const ControlledInspection: Story = {
  render: () => <ControlledInspectionSpecimen />,
};

export const TypographyWorkbench: Story = {
  render: () => (
    <Canvas>
      <header style={railStyle}>
        <Heading level={1} size="display">
          Typography with inspectable seams
        </Heading>
        <Text as="p" size="lg">
          Ten primitives keep authored content semantic, readable, and honest about unreleased
          evidence.
        </Text>
      </header>

      <section aria-labelledby="type-scale" style={railStyle}>
        <Heading level={2} id="type-scale" size="lg">
          Type roles and full-value access
        </Heading>
        <div style={splitStyle}>
          <div>
            <Heading level={3}>Independent semantic levels</Heading>
            <Text as="p" tone="muted">
              Visual size never fabricates the document outline.
            </Text>
          </div>
          <div style={{ inlineSize: "16rem", minInlineSize: 0 }}>
            <Text
              fullValue="registry.example.dev/releases/immutable/sha256/34bf4b27f39evidence"
              truncate
            >
              registry.example.dev/releases/immutable/sha256/34bf4b27f39evidence
            </Text>
          </div>
        </div>
      </section>

      <section aria-labelledby="authored-content" style={railStyle}>
        <Heading level={2} id="authored-content" size="lg">
          Authored content
        </Heading>
        <Prose>
          <h3>Own the source, then keep it moving</h3>
          <p>
            Mergora records provenance before a local edit. A later update can compare the immutable
            base, the customized source, and the new upstream version without a silent overwrite.
          </p>
          <ul>
            <li>Review a deterministic plan.</li>
            <li>Keep conflicts outside the live tree.</li>
            <li>
              Run <Code>mergora audit</Code> after resolving changes.
            </li>
          </ul>
          <div data-prose-unstyled="true">
            Nested widgets can opt out without changing their native structure.
          </div>
        </Prose>
      </section>

      <section aria-labelledby="reference-anatomy" style={railStyle}>
        <Heading level={2} id="reference-anatomy" size="lg">
          Reference anatomy
        </Heading>
        <div style={splitStyle}>
          <Blockquote
            attribution="Mergora source contract"
            citeUrl="https://example.com/contracts/source"
            sourceTitle="Open seams, safe evolution"
          >
            <p>Evidence is a release input, not a badge added after the behavior ships.</p>
          </Blockquote>
          <DescriptionList>
            <DescriptionTerm>Keyboard</DescriptionTerm>
            <DescriptionDetails>
              Press <Kbd>Tab</Kbd> to enter a viewer, then use documented arrow keys.
            </DescriptionDetails>
            <DescriptionTerm>Command palette</DescriptionTerm>
            <DescriptionDetails>
              <KbdChord
                keys={[
                  { key: "Meta", spokenLabel: "Command" },
                  { key: "K", spokenLabel: "K" },
                ]}
                platform="mac"
              />
            </DescriptionDetails>
            <DescriptionTerm>Status</DescriptionTerm>
            <DescriptionDetails>
              Source present; distribution and evidence incomplete.
            </DescriptionDetails>
          </DescriptionList>
        </div>
      </section>
    </Canvas>
  ),
};

export const InteractiveViewers: Story = {
  render: () => (
    <Canvas>
      <header style={railStyle}>
        <Heading level={1} size="lg">
          Content inspection workbench
        </Heading>
        <Text as="p">
          Copy controls retain focus, diff meaning survives without color, and the JSON tree owns
          one roving tab stop.
        </Text>
      </header>
      <section aria-labelledby="code-specimen" style={railStyle}>
        <Heading level={2} id="code-specimen">
          Labelled code and line emphasis
        </Heading>
        <CodeBlock
          code={sampleCode}
          filename="save-action.tsx"
          highlightedLines={[3]}
          label="Save action example"
          language="tsx"
          renderLine={(line) =>
            line.includes("export") ? (
              <strong>{line}</strong>
            ) : line.includes("Button") ? (
              <u>{line}</u>
            ) : (
              line
            )
          }
        />
      </section>
      <section aria-labelledby="diff-specimen" style={railStyle}>
        <Heading level={2} id="diff-specimen">
          Unified source difference
        </Heading>
        <DiffViewer label="Version contract changes" lines={diffLines} />
      </section>
      <section aria-labelledby="json-specimen" style={railStyle}>
        <Heading level={2} id="json-specimen">
          Registry response tree
        </Heading>
        <JsonViewer defaultExpandedDepth={2} label="Registry response" value={jsonValue} />
      </section>
    </Canvas>
  ),
};

export const EmptyStates: Story = {
  render: () => (
    <Canvas>
      <Heading level={1} size="lg">
        Empty content remains explicit
      </Heading>
      <DiffViewer label="No source changes" lines={[]} />
      <JsonViewer label="Empty object" value={{}} />
    </Canvas>
  ),
};

export const CopyAndFailureStates: Story = {
  render: () => (
    <Canvas>
      <Heading level={1} size="lg">
        Clipboard status contracts
      </Heading>
      <CodeBlock
        code="mergora add button"
        copiedLabel="Command copied"
        copyErrorLabel="Command could not be copied"
        label="Install command"
      />
      <DiffViewer
        copiedLabel="Change set copied"
        copyErrorLabel="Change set could not be copied"
        label="Copyable change set"
        lines={diffLines}
      />
      <JsonViewer
        copiedPathLabel="JSON path copied"
        copiedValueLabel="JSON value copied"
        copyErrorLabel="JSON selection could not be copied"
        label="Copyable registry response"
        value={jsonValue}
      />
    </Canvas>
  ),
};

export const NarrowAndLongContent: Story = {
  render: () => (
    <Canvas>
      <div
        style={{
          boxSizing: "border-box",
          inlineSize: "100%",
          maxInlineSize: "20rem",
          minInlineSize: 0,
        }}
      >
        <div style={workbenchStyle}>
          <Heading level={1} size="lg">
            Arbeitsbereichsüberprüfungszusammenfassung
          </Heading>
          <Text as="p">
            Lange Inhalte dürfen wachsen, umbrechen oder innerhalb des verantwortlichen Viewers
            scrollen.
          </Text>
          <CodeBlock
            code="const immutableReference = 'registry.example.dev/releases/sha256/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz';"
            label="Long immutable reference"
            wrap
          />
          <DiffViewer
            label="Long localized source changes"
            lines={[
              {
                content:
                  "arbeitsbereichsüberprüfungszusammenfassung_without_a_break_but_owned_by_the_diff_scroller",
                kind: "added",
                newLineNumber: 1,
              },
            ]}
            wrap
          />
          <JsonViewer
            defaultExpandedDepth={3}
            label="Long JSON values"
            value={{
              arbeitsbereichsüberprüfungszusammenfassung:
                "registry.example.dev/releases/immutable/abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz",
            }}
          />
        </div>
      </div>
    </Canvas>
  ),
};

export const RightToLeft: Story = {
  render: () => (
    <MergoraProvider direction="rtl" locale="ar-EG" messages={arabicMessages}>
      <Canvas direction="rtl">
        <Heading level={1} size="lg">
          منضدة فحص المحتوى
        </Heading>
        <Text as="p">يبقى ترتيب القراءة ومنطق لوحة المفاتيح واضحين من اليمين إلى اليسار.</Text>
        <DescriptionList>
          <DescriptionTerm>الحالة</DescriptionTerm>
          <DescriptionDetails>المصدر موجود، والدليل لم يُسجّل بعد.</DescriptionDetails>
          <DescriptionTerm>الاختصار</DescriptionTerm>
          <DescriptionDetails>
            <KbdChord keys={[{ key: "Control" }, { key: "Enter" }]} />
          </DescriptionDetails>
        </DescriptionList>
        <DiffViewer label="تغييرات المصدر" lines={diffLines} mode="split" wrap />
        <JsonViewer defaultExpandedDepth={2} label="استجابة السجل" value={jsonValue} />
      </Canvas>
    </MergoraProvider>
  ),
};

export const SplitDiff: Story = {
  render: () => (
    <Canvas>
      <Heading level={1} size="lg">
        Split comparison
      </Heading>
      <DiffViewer label="Before and after" lines={diffLines} mode="split" />
    </Canvas>
  ),
};

export const DescriptionLayouts: Story = {
  render: () => (
    <Canvas>
      <Heading level={1} size="lg">
        Intrinsic name and value layout
      </Heading>
      <DescriptionList data-layout-probe="true">
        <DescriptionTerm>Immutable source reference</DescriptionTerm>
        <DescriptionDetails>sha256:34bf4b27f39e</DescriptionDetails>
        <DescriptionTerm>Evidence status</DescriptionTerm>
        <DescriptionDetails>Incomplete until current manual review is recorded.</DescriptionDetails>
      </DescriptionList>
    </Canvas>
  ),
};
