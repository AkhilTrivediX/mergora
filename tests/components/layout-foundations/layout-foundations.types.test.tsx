import { createRef } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  AspectRatio,
  type AspectRatioProps,
} from "../../../registry/source/components/aspect-ratio/aspect-ratio.tsx";
import { Center, type CenterProps } from "../../../registry/source/components/center/center.tsx";
import {
  Cluster,
  type ClusterProps,
} from "../../../registry/source/components/cluster/cluster.tsx";
import {
  Container,
  type ContainerProps,
} from "../../../registry/source/components/container/container.tsx";
import { Grid, type GridProps } from "../../../registry/source/components/grid/grid.tsx";
import { Inline, type InlineProps } from "../../../registry/source/components/inline/inline.tsx";
import {
  Separator,
  type SeparatorProps,
} from "../../../registry/source/components/separator/separator.tsx";
import { Stack, type StackProps } from "../../../registry/source/components/stack/stack.tsx";

const divRef = createRef<HTMLDivElement>();
const elementRef = createRef<HTMLElement>();

const validFixtures = [
  <Container key="container" ref={divRef} width="prose" />,
  <Stack element="ol" gap="lg" key="stack" ref={elementRef} separated />,
  <Inline align="baseline" justify="between" key="inline" ref={divRef} wrap={false} />,
  <Grid columns={4} element="ul" equalRows key="grid" minimum="compact" ref={elementRef} />,
  <Center axis="both" key="center" maximum="content" ref={divRef} />,
  <Cluster key="cluster" orphan="fill" ref={divRef} />,
  <AspectRatio fit="contain" key="aspect" ratio={[5, 4]} ref={divRef} />,
  <Separator
    decorative={false}
    key="separator"
    orientation="vertical"
    ref={elementRef}
    spacing="md"
  />,
];

// @ts-expect-error Container widths are deliberately closed.
const invalidContainer = <Container width="viewport" />;
// @ts-expect-error Stack does not accept arbitrary polymorphic elements.
const invalidStack = <Stack element="main" />;
// @ts-expect-error Inline align values are deliberately closed.
const invalidInline = <Inline align="safe-center" />;
// @ts-expect-error Grid column counts are bounded.
const invalidGrid = <Grid columns={7} />;
// @ts-expect-error Center maximum values are semantic, not arbitrary CSS lengths.
const invalidCenter = <Center maximum="42rem" />;
// @ts-expect-error Cluster orphan behavior is a closed contract.
const invalidCluster = <Cluster orphan="balance" />;
// @ts-expect-error Aspect ratio strings are limited to documented presets.
const invalidAspectRatio = <AspectRatio ratio="cinema" />;
// @ts-expect-error Media fitting is a closed capability.
const invalidAspectFit = <AspectRatio fit="stretch" />;
// @ts-expect-error Separator accepts no children.
const invalidSeparator = <Separator>Resize</Separator>;

describe("P2 layout foundation type surface", () => {
  it("keeps every public props surface typed and every fixture renderable", () => {
    expectTypeOf<ContainerProps>().toBeObject();
    expectTypeOf<StackProps>().toBeObject();
    expectTypeOf<InlineProps>().toBeObject();
    expectTypeOf<GridProps>().toBeObject();
    expectTypeOf<CenterProps>().toBeObject();
    expectTypeOf<ClusterProps>().toBeObject();
    expectTypeOf<AspectRatioProps>().toBeObject();
    expectTypeOf<SeparatorProps>().toBeObject();
    expect(validFixtures).toHaveLength(8);
    expect([
      invalidContainer,
      invalidStack,
      invalidInline,
      invalidGrid,
      invalidCenter,
      invalidCluster,
      invalidAspectRatio,
      invalidAspectFit,
      invalidSeparator,
    ]).toHaveLength(9);
  });
});
