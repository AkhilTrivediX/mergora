import { createRef } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  Resizable,
  type ResizableHandleProps,
  type ResizableRootProps,
} from "../../../registry/source/components/resizable/resizable.tsx";
import {
  ScrollArea,
  type ScrollAreaProps,
} from "../../../registry/source/components/scroll-area/scroll-area.tsx";
import {
  SplitPane,
  type SplitPaneHandleProps,
  type SplitPaneRootProps,
} from "../../../registry/source/components/split-pane/split-pane.tsx";
import {
  StickyRegion,
  type StickyRegionRootProps,
} from "../../../registry/source/components/sticky-region/sticky-region.tsx";

const divRef = createRef<HTMLDivElement>();
const elementRef = createRef<HTMLElement>();

const fixtures = [
  <ScrollArea aria-label="History" focusable key="scroll" ref={divRef} />,
  <Resizable.Root defaultValue={40} key="resizable" ref={divRef}>
    <Resizable.Primary />
    <Resizable.Handle aria-label="Resize panels" ref={divRef} />
    <Resizable.Secondary />
  </Resizable.Root>,
  <SplitPane.Root defaultValue={[30, 70]} key="split" ref={divRef}>
    <SplitPane.Panel index={0} />
    <SplitPane.Handle aria-labelledby="split-label" index={0} ref={divRef} />
    <SplitPane.Panel index={1} />
  </SplitPane.Root>,
  <StickyRegion.Root key="sticky" ref={divRef}>
    <StickyRegion.Content element="header" ref={elementRef} />
    <StickyRegion.Body />
  </StickyRegion.Root>,
];

// @ts-expect-error A focusable scroll area requires an accessible name.
const unnamedScrollArea = <ScrollArea focusable />;
// @ts-expect-error Orientation is a closed logical contract.
const physicalScrollArea = <ScrollArea orientation="left-to-right" />;
// @ts-expect-error A resizable handle requires an accessible name.
const unnamedResizableHandle = <Resizable.Handle />;
// @ts-expect-error Split pane sizes are numeric percentages.
const stringSplitSizes = <SplitPane.Root value={["30", "70"]} />;
// @ts-expect-error Every split handle requires an explicit boundary index.
const unindexedSplitHandle = <SplitPane.Handle aria-label="Resize" />;
// @ts-expect-error Sticky content is restricted to deliberate native structural elements.
const arbitraryStickyElement = <StickyRegion.Content element="aside" />;

describe("P2 advanced layout type surface", () => {
  it("keeps compound APIs, refs, names, and closed choices typed", () => {
    expectTypeOf<ScrollAreaProps>().toBeObject();
    expectTypeOf<ResizableRootProps>().toBeObject();
    expectTypeOf<ResizableHandleProps>().toBeObject();
    expectTypeOf<SplitPaneRootProps>().toBeObject();
    expectTypeOf<SplitPaneHandleProps>().toBeObject();
    expectTypeOf<StickyRegionRootProps>().toBeObject();
    expect(fixtures).toHaveLength(4);
    expect([
      unnamedScrollArea,
      physicalScrollArea,
      unnamedResizableHandle,
      stringSplitSizes,
      unindexedSplitHandle,
      arbitraryStickyElement,
    ]).toHaveLength(6);
  });
});
