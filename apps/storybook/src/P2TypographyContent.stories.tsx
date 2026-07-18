import type { CSSProperties, ReactNode } from "react";
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
import { Kbd, KbdChord } from "../../../registry/source/components/kbd/kbd";
import { Prose } from "../../../registry/source/components/prose/prose";
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

const meta = {
  component: Text,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Typography Content",
} satisfies Meta<typeof Text>;

export default meta;
type Story = StoryObj<typeof meta>;

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
