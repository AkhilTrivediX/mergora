import { useState, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import { Accordion } from "../../../registry/source/components/accordion/accordion";
import { Breadcrumb } from "../../../registry/source/components/breadcrumb/breadcrumb";
import { Collapsible } from "../../../registry/source/components/collapsible/collapsible";
import { Pagination } from "../../../registry/source/components/pagination/pagination";
import {
  MergoraProvider,
  type MergoraMessages,
} from "../../../registry/source/components/provider/provider";
import { Tabs } from "../../../registry/source/components/tabs/tabs";

const canvasStyle = {
  background: "var(--mrg-semantic-color-background-canvas)",
  boxSizing: "border-box",
  color: "var(--mrg-semantic-color-foreground-primary)",
  fontFamily: "var(--mrg-semantic-font-family-prose)",
  inlineSize: "100%",
  minBlockSize: "100vh",
  padding: "var(--mrg-semantic-space-stack-lg)",
} satisfies CSSProperties;

const workbenchStyle = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xl)",
  marginInline: "auto",
  maxInlineSize: "var(--mrg-semantic-size-content-default)",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
} satisfies CSSProperties;

function Canvas({
  children,
  direction = "ltr",
  locale = direction === "rtl" ? "ar-EG" : "en-US",
  messages,
}: {
  readonly children: ReactNode;
  readonly direction?: "ltr" | "rtl";
  readonly locale?: string;
  readonly messages?: MergoraMessages;
}) {
  return (
    <MergoraProvider
      {...(messages === undefined ? {} : { messages })}
      direction={direction}
      locale={locale}
    >
      <main style={canvasStyle}>
        <div style={workbenchStyle}>{children}</div>
      </main>
    </MergoraProvider>
  );
}

function StandardAccordion({
  expansionSummary = false,
  headingLevel = 3,
  multiple = false,
}: {
  readonly expansionSummary?: boolean;
  readonly headingLevel?: 1 | 2 | 3 | 4 | 5 | 6;
  readonly multiple?: boolean;
}) {
  return (
    <Accordion.Root
      defaultValue={["identity"]}
      multiple={multiple}
      {...(expansionSummary
        ? {
            renderExpansionSummary: (values: readonly string[]) =>
              values.length === 0
                ? "All sections are collapsed."
                : `${new Intl.NumberFormat("en-US").format(values.length)} section${values.length === 1 ? "" : "s"} expanded.`,
          }
        : {})}
    >
      <Accordion.Item value="identity">
        <Accordion.Header level={headingLevel}>
          <Accordion.Trigger>Identity and provenance</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>Every artifact retains its canonical source identity.</Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item value="evidence">
        <Accordion.Header level={headingLevel}>
          <Accordion.Trigger>Independent evidence</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>
          Consumer, browser, and assistive-technology evidence stays separate.
        </Accordion.Panel>
      </Accordion.Item>
      <Accordion.Item disabled value="release">
        <Accordion.Header level={headingLevel}>
          <Accordion.Trigger>Release approval unavailable</Accordion.Trigger>
        </Accordion.Header>
        <Accordion.Panel>Release approval has not been recorded.</Accordion.Panel>
      </Accordion.Item>
    </Accordion.Root>
  );
}

function StandardTabs({
  activationMode = "automatic",
  direction,
  keyboardHint = false,
  orientation = "horizontal",
}: {
  readonly activationMode?: "automatic" | "manual";
  readonly direction?: "ltr" | "rtl";
  readonly keyboardHint?: boolean;
  readonly orientation?: "horizontal" | "vertical";
}) {
  return (
    <Tabs.Root
      {...(direction === undefined ? {} : { direction })}
      activationMode={activationMode}
      defaultValue="overview"
      disabledValues={["release"]}
      orientation={orientation}
    >
      <Tabs.List
        {...(keyboardHint
          ? { keyboardHint: "Use arrow keys to move; press Enter in manual mode." }
          : {})}
        label="Artifact sections"
      >
        <Tabs.Tab value="overview">Overview</Tabs.Tab>
        <Tabs.Tab value="evidence">Evidence</Tabs.Tab>
        <Tabs.Tab value="release">Release unavailable</Tabs.Tab>
        <Tabs.Tab value="history">History</Tabs.Tab>
      </Tabs.List>
      <Tabs.Panels>
        <Tabs.Panel value="overview">Canonical artifact overview.</Tabs.Panel>
        <Tabs.Panel value="evidence">Independent verification evidence.</Tabs.Panel>
        <Tabs.Panel value="release">No release is available.</Tabs.Panel>
        <Tabs.Panel value="history">Immutable change history.</Tabs.Panel>
      </Tabs.Panels>
    </Tabs.Root>
  );
}

const breadcrumbItems = [
  { href: "/docs", id: "docs", label: "Documentation" },
  { href: "/docs/components", id: "components", label: "Components" },
  { href: "/docs/components/navigation", id: "navigation", label: "Navigation" },
  { href: "/docs/components/navigation/disclosure", id: "disclosure", label: "Disclosure" },
  { id: "accordion", label: "Accordion" },
] as const;

interface NavigationStoryArgs {
  readonly collapsibleStateText: boolean;
  readonly cursorPagination: boolean;
  readonly expansionSummary: boolean;
  readonly keyboardHint: boolean;
  readonly responsiveBreadcrumb: boolean;
}

function NavigationModes(args: NavigationStoryArgs) {
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Disclosure and navigation modes</h1>
        <p style={{ marginBlockEnd: 0, maxInlineSize: "70ch" }}>
          Native disclosure, hierarchy, tab, and link semantics remain intact as each optional
          context aid is toggled independently.
        </p>
      </header>
      <section aria-label="Accordion mode" style={specimenStyle}>
        <StandardAccordion expansionSummary={args.expansionSummary} headingLevel={2} multiple />
      </section>
      <section aria-label="Collapsible mode" style={specimenStyle}>
        <Collapsible.Root>
          <Collapsible.Trigger
            {...(args.collapsibleStateText
              ? { stateText: { closed: "Collapsed", open: "Expanded" } }
              : {})}
          >
            Technical details
          </Collapsible.Trigger>
          <Collapsible.Content>
            Keyboard and pointer activation share the same controlled disclosure state.
          </Collapsible.Content>
        </Collapsible.Root>
      </section>
      <section aria-label="Tabs mode" style={specimenStyle}>
        <StandardTabs activationMode="manual" keyboardHint={args.keyboardHint} />
      </section>
      <section aria-label="Navigation mode" style={specimenStyle}>
        <Breadcrumb collapse={args.responsiveBreadcrumb} items={breadcrumbItems} />
        {args.cursorPagination ? (
          <Pagination
            currentLabel="Items 41 through 60"
            mode="cursor"
            nextHref="?after=item-60"
            previousHref="?before=item-41"
          />
        ) : (
          <Pagination getHref={(page) => `?page=${page}`} page={3} pageCount={8} />
        )}
      </section>
    </Canvas>
  );
}

function Workbench() {
  return (
    <Canvas>
      <header>
        <h1 style={{ marginBlock: 0 }}>Disclosure and navigation workbench</h1>
        <p style={{ marginBlockEnd: 0 }}>
          Native headings, disclosures, tabs, links, current locations, and responsive paths remain
          testable without semantic substitutions.
        </p>
      </header>
      <section aria-labelledby="accordion-heading" style={specimenStyle}>
        <h2 id="accordion-heading" style={{ margin: 0 }}>
          Accordion
        </h2>
        <StandardAccordion />
      </section>
      <section aria-labelledby="collapsible-heading" style={specimenStyle}>
        <h2 id="collapsible-heading" style={{ margin: 0 }}>
          Standalone disclosure
        </h2>
        <Collapsible.Root>
          <Collapsible.Trigger>Show provenance details</Collapsible.Trigger>
          <Collapsible.Content>
            Source and evidence digests are independently bound.
          </Collapsible.Content>
        </Collapsible.Root>
      </section>
      <section aria-labelledby="tabs-heading" style={specimenStyle}>
        <h2 id="tabs-heading" style={{ margin: 0 }}>
          Tabs
        </h2>
        <StandardTabs />
      </section>
      <section aria-labelledby="navigation-heading" style={specimenStyle}>
        <h2 id="navigation-heading" style={{ margin: 0 }}>
          Location and pagination
        </h2>
        <Breadcrumb items={breadcrumbItems} />
        <Pagination getHref={(page) => `?page=${page}`} page={5} pageCount={12} />
      </section>
    </Canvas>
  );
}

function UrlStateTabs() {
  const [section, setSection] = useState("overview");
  return (
    <Canvas>
      <h1 style={{ margin: 0 }}>URL-state tab recipe</h1>
      <Tabs.Root activationMode="manual" onValueChange={setSection} value={section}>
        <Tabs.List label="URL-backed sections">
          <Tabs.Tab href="?section=overview" value="overview">
            Overview
          </Tabs.Tab>
          <Tabs.Tab href="?section=evidence" value="evidence">
            Evidence
          </Tabs.Tab>
          <Tabs.Tab href="?section=history" value="history">
            History
          </Tabs.Tab>
        </Tabs.List>
        <Tabs.Panels>
          <Tabs.Panel value="overview">Overview route content.</Tabs.Panel>
          <Tabs.Panel value="evidence">Evidence route content.</Tabs.Panel>
          <Tabs.Panel value="history">History route content.</Tabs.Panel>
        </Tabs.Panels>
      </Tabs.Root>
      <output aria-live="polite">Selected URL section: {section}</output>
    </Canvas>
  );
}

const meta = {
  argTypes: {
    collapsibleStateText: { control: "boolean" },
    cursorPagination: { control: "boolean" },
    expansionSummary: { control: "boolean" },
    keyboardHint: { control: "boolean" },
    responsiveBreadcrumb: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
  title: "P2/Disclosure and Navigation",
} satisfies Meta<NavigationStoryArgs>;

export default meta;
type Story = StoryObj<NavigationStoryArgs>;

export const BasicDefaults: Story = {
  args: {
    collapsibleStateText: false,
    cursorPagination: false,
    expansionSummary: false,
    keyboardHint: false,
    responsiveBreadcrumb: false,
  },
  render: (args) => <NavigationModes {...args} />,
};

export const RecommendedMergora: Story = {
  args: {
    collapsibleStateText: true,
    cursorPagination: true,
    expansionSummary: true,
    keyboardHint: true,
    responsiveBreadcrumb: true,
  },
  render: (args) => <NavigationModes {...args} />,
};

export const DisclosureNavigationWorkbench: Story = { render: () => <Workbench /> };

export const AccordionModes: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Single and multiple accordion modes</h1>
      <StandardAccordion headingLevel={2} />
      <StandardAccordion headingLevel={2} multiple />
    </Canvas>
  ),
};

export const TabActivation: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Automatic and manual tabs</h1>
      <section aria-label="Automatic activation" style={specimenStyle}>
        <StandardTabs />
      </section>
      <section aria-label="Manual activation" style={specimenStyle}>
        <StandardTabs activationMode="manual" orientation="vertical" />
      </section>
    </Canvas>
  ),
};

export const UrlState: Story = { render: () => <UrlStateTabs /> };

export const RightToLeft: Story = {
  render: () => (
    <Canvas direction="rtl" locale="en-US">
      <h1 style={{ margin: 0 }}>{"اختبار الإفصاح والتنقل"}</h1>
      <StandardTabs direction="rtl" />
      <Breadcrumb
        items={[
          { href: "/ar", id: "home", label: "الرئيسية" },
          { href: "/ar/components", id: "components", label: "المكوّنات" },
          { id: "tabs", label: "علامات التبويب" },
        ]}
      />
      <Pagination getHref={(page) => `?page=${page}`} page={3} pageCount={8} />
    </Canvas>
  ),
};

export const LocalizedMessages: Story = {
  render: () => (
    <Canvas
      locale="de-DE"
      messages={{
        "breadcrumb.label": "Navigationspfad",
        "breadcrumb.showHidden": ({ locale, values }) =>
          `${new Intl.NumberFormat(locale).format(Number(values.count))} verborgene Ebenen anzeigen`,
        "pagination.currentPage": "Seite {page}, aktuelle Seite",
        "pagination.ellipsis": "Weitere Seiten",
        "pagination.label": "Seitennavigation",
        "pagination.next": "Weiter",
        "pagination.page": "Zu Seite {page}",
        "pagination.previous": "Zurück",
      }}
    >
      <h1 style={{ margin: 0 }}>Lokalisierte Navigation</h1>
      <Breadcrumb items={breadcrumbItems} />
      <Pagination getHref={(page) => `?seite=${page}`} page={2} pageCount={8} />
    </Canvas>
  ),
};

export const CursorNavigation: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Server cursor navigation</h1>
      <Pagination
        currentLabel="Results 51 through 75"
        mode="cursor"
        nextHref="?after=opaque-next"
        previousHref="?before=opaque-previous"
      />
    </Canvas>
  ),
};

export const NarrowOverflow: Story = {
  render: () => (
    <Canvas>
      <h1 style={{ margin: 0 }}>Narrow width and long content</h1>
      <Tabs.Root defaultValue="overview">
        <Tabs.List label="Long localized artifact sections">
          <Tabs.Tab value="overview">Independent provenance overview</Tabs.Tab>
          <Tabs.Tab value="consumer">Consumer verification evidence</Tabs.Tab>
          <Tabs.Tab value="assistive">Assistive technology evidence</Tabs.Tab>
          <Tabs.Tab value="history">Immutable release history</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panels>
          <Tabs.Panel value="overview">Long tab labels use native inline scrolling.</Tabs.Panel>
          <Tabs.Panel value="consumer">Consumer verification remains independent.</Tabs.Panel>
          <Tabs.Panel value="assistive">Manual evidence remains digest-bound.</Tabs.Panel>
          <Tabs.Panel value="history">Release history is immutable.</Tabs.Panel>
        </Tabs.Panels>
      </Tabs.Root>
      <Breadcrumb
        items={[
          { href: "/documentation", id: "documentation", label: "Documentation workspace" },
          { href: "/documentation/components", id: "components", label: "Component catalog" },
          {
            href: "/documentation/components/navigation",
            id: "navigation",
            label: "Navigation systems",
          },
          {
            href: "/documentation/components/navigation/disclosure",
            id: "disclosure",
            label: "Disclosure patterns",
          },
          { id: "current", label: "Independently verified accordion implementation" },
        ]}
      />
      <StandardAccordion headingLevel={2} multiple />
      <Pagination getHref={(page) => `?page=${page}`} page={50} pageCount={100} />
    </Canvas>
  ),
};
