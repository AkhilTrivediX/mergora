import { createRef } from "react";
import { describe, expect, expectTypeOf, it } from "vitest";

import {
  Accordion,
  type AccordionRootProps,
} from "../../../registry/source/components/accordion/accordion.tsx";
import {
  Breadcrumb,
  type BreadcrumbProps,
} from "../../../registry/source/components/breadcrumb/breadcrumb.tsx";
import {
  Collapsible,
  type CollapsibleRootProps,
} from "../../../registry/source/components/collapsible/collapsible.tsx";
import {
  Pagination,
  type PaginationProps,
} from "../../../registry/source/components/pagination/pagination.tsx";
import { Tabs, type TabsRootProps } from "../../../registry/source/components/tabs/tabs.tsx";

const divRef = createRef<HTMLDivElement>();
const headingRef = createRef<HTMLHeadingElement>();
const buttonRef = createRef<HTMLButtonElement>();
const navRef = createRef<HTMLElement>();

const validFixtures = [
  <Accordion.Root defaultValue={["one"]} key="accordion" ref={divRef}>
    <Accordion.Item value="one">
      <Accordion.Header level={3} ref={headingRef}>
        <Accordion.Trigger ref={buttonRef}>One</Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Panel>Panel</Accordion.Panel>
    </Accordion.Item>
  </Accordion.Root>,
  <Collapsible.Root key="collapsible" onOpenChange={() => undefined} open ref={divRef}>
    <Collapsible.Trigger ref={buttonRef}>Details</Collapsible.Trigger>
    <Collapsible.Content>Content</Collapsible.Content>
  </Collapsible.Root>,
  <Tabs.Root
    activationMode="manual"
    direction="rtl"
    key="tabs"
    onValueChange={() => undefined}
    orientation="vertical"
    ref={divRef}
    value="one"
  >
    <Tabs.List label="Sections">
      <Tabs.Tab value="one">One</Tabs.Tab>
    </Tabs.List>
    <Tabs.Panels>
      <Tabs.Panel value="one">Panel</Tabs.Panel>
    </Tabs.Panels>
  </Tabs.Root>,
  <Breadcrumb
    items={[
      { href: "/docs", id: "docs", label: "Docs" },
      { id: "current", label: "Current" },
    ]}
    key="breadcrumb"
    ref={navRef}
  />,
  <Pagination
    getHref={(page) => `?page=${page}`}
    key="pages"
    page={1}
    pageCount={3}
    ref={navRef}
  />,
  <Pagination currentLabel="Current results" key="cursor" mode="cursor" ref={navRef} />,
];

// @ts-expect-error Accordion values are stable strings.
const invalidAccordionValue = <Accordion.Root value={[1]}>Invalid</Accordion.Root>;
const invalidHeading = (
  // @ts-expect-error Heading level is restricted to native h1-h6.
  <Accordion.Header level={7}>Invalid</Accordion.Header>
);
// @ts-expect-error Collapsible open state is boolean.
const invalidCollapsible = <Collapsible.Root open="yes">Invalid</Collapsible.Root>;
// @ts-expect-error Tabs orientation is horizontal or vertical.
const invalidTabsOrientation = <Tabs.Root orientation="diagonal">Invalid</Tabs.Root>;
const invalidTabValue = (
  // @ts-expect-error Tab values are stable strings.
  <Tabs.Tab value={1}>Invalid</Tabs.Tab>
);
// @ts-expect-error Page mode requires getHref.
const invalidPagePagination = <Pagination page={1} pageCount={2} />;
// @ts-expect-error Cursor mode requires a current label.
const invalidCursorPagination = <Pagination mode="cursor" />;

describe("P2 disclosure and navigation type surface", () => {
  it("keeps public props, discriminated pagination modes, and refs strict", () => {
    expectTypeOf<AccordionRootProps>().toBeObject();
    expectTypeOf<CollapsibleRootProps>().toBeObject();
    expectTypeOf<TabsRootProps>().toBeObject();
    expectTypeOf<BreadcrumbProps>().toBeObject();
    expectTypeOf<PaginationProps>().toBeObject();
    expect(validFixtures).toHaveLength(6);
    expect([
      invalidAccordionValue,
      invalidHeading,
      invalidCollapsible,
      invalidTabsOrientation,
      invalidTabValue,
      invalidPagePagination,
      invalidCursorPagination,
    ]).toHaveLength(7);
  });
});
