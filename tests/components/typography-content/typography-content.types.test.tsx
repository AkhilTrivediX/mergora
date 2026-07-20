import { createRef } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  Blockquote,
  type BlockquoteProps,
} from "../../../registry/source/components/blockquote/blockquote.tsx";
import { Code, type CodeProps } from "../../../registry/source/components/code/code.tsx";
import {
  CodeBlock,
  type CodeBlockProps,
} from "../../../registry/source/components/code-block/code-block.tsx";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
  type DescriptionListProps,
} from "../../../registry/source/components/description-list/description-list.tsx";
import {
  DiffViewer,
  type DiffViewerProps,
} from "../../../registry/source/components/diff-viewer/diff-viewer.tsx";
import {
  Heading,
  type HeadingProps,
} from "../../../registry/source/components/heading/heading.tsx";
import {
  JsonViewer,
  type JsonViewerProps,
} from "../../../registry/source/components/json-viewer/json-viewer.tsx";
import { Kbd, KbdChord, type KbdChordProps } from "../../../registry/source/components/kbd/kbd.tsx";
import { Prose, type ProseProps } from "../../../registry/source/components/prose/prose.tsx";
import { Text, type TextProps } from "../../../registry/source/components/text/text.tsx";

const elementRef = createRef<HTMLElement>();
const divRef = createRef<HTMLDivElement>();
const headingRef = createRef<HTMLHeadingElement>();

const validFixtures = [
  <Text as="small" key="text" ref={elementRef} size="xs" />,
  <Heading key="heading" level={2} ref={headingRef} size="lg" />,
  <Heading as="h3" key="heading-as" ref={headingRef} />,
  <Prose as="section" key="prose" measure="wide" ref={elementRef} />,
  <Code isolateBidi key="code" ref={elementRef} wrap={false} />,
  <CodeBlock
    code="const ok = true;"
    copyable={false}
    key="code-block"
    label="Example"
    ref={divRef}
  />,
  <Kbd key="kbd" ref={elementRef}>
    Esc
  </Kbd>,
  <KbdChord key="chord" keys={[{ key: "Control" }, { key: "Enter" }]} />,
  <Blockquote key="quote" ref={elementRef}>
    Quote
  </Blockquote>,
  <DescriptionList key="description" layout="responsive">
    <DescriptionTerm>Name</DescriptionTerm>
    <DescriptionDetails>Value</DescriptionDetails>
  </DescriptionList>,
  <DiffViewer
    copyable={false}
    key="diff"
    label="Diff"
    lineNavigation={false}
    lines={[]}
    ref={divRef}
    showSummary={false}
  />,
  <JsonViewer
    copyable={false}
    key="json"
    label="JSON"
    ref={divRef}
    showActivePath={false}
    value={{ ok: true }}
  />,
];

// @ts-expect-error Text elements are deliberately closed.
const invalidText = <Text as="article" />;
// @ts-expect-error Heading requires level or an explicit heading element.
const invalidHeadingMissing = <Heading />;
// @ts-expect-error Heading level and as are mutually exclusive.
const invalidHeadingBoth = <Heading as="h2" level={2} />;
// @ts-expect-error Prose measure accepts semantic values, not CSS lengths.
const invalidProse = <Prose measure="70ch" />;
// @ts-expect-error CodeBlock requires an accessible region label.
const invalidCodeBlock = <CodeBlock code="test" />;
// @ts-expect-error Chords require a deterministic key list.
const invalidChord = <KbdChord />;
// @ts-expect-error Diff kinds are a closed non-color contract.
const invalidDiff = <DiffViewer label="Diff" lines={[{ content: "x", kind: "warning" }]} />;
// @ts-expect-error JSON values cannot contain undefined.
const invalidJson = <JsonViewer label="JSON" value={{ missing: undefined }} />;

describe("P2 typography and content type surface", () => {
  it("keeps refs, required labels, semantic choices, and structured values typed", () => {
    expectTypeOf<TextProps>().toBeObject();
    expectTypeOf<HeadingProps>().toBeObject();
    expectTypeOf<ProseProps>().toBeObject();
    expectTypeOf<CodeProps>().toBeObject();
    expectTypeOf<CodeBlockProps>().toBeObject();
    expectTypeOf<KbdChordProps>().toBeObject();
    expectTypeOf<BlockquoteProps>().toBeObject();
    expectTypeOf<DescriptionListProps>().toBeObject();
    expectTypeOf<DiffViewerProps>().toBeObject();
    expectTypeOf<JsonViewerProps>().toBeObject();
    expect(validFixtures).toHaveLength(12);
    expect([
      invalidText,
      invalidHeadingMissing,
      invalidHeadingBoth,
      invalidProse,
      invalidCodeBlock,
      invalidChord,
      invalidDiff,
      invalidJson,
    ]).toHaveLength(8);
  });
});
