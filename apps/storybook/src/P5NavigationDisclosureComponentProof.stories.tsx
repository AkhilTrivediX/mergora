import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactElement,
  type ReactNode,
} from "react";

import { Accordion } from "../../../registry/source/components/accordion/index.ts";
import {
  BottomNavigation,
  type BottomNavigationItem,
} from "../../../registry/source/components/bottom-navigation/index.ts";
import {
  Breadcrumb,
  type BreadcrumbItem,
} from "../../../registry/source/components/breadcrumb/index.ts";
import { Collapsible } from "../../../registry/source/components/collapsible/index.ts";
import { Navbar, type NavbarItem } from "../../../registry/source/components/navbar/index.ts";
import {
  NavigationMenu,
  type NavigationMenuItem,
} from "../../../registry/source/components/navigation-menu/index.ts";
import { Pagination } from "../../../registry/source/components/pagination/index.ts";
import {
  Sidebar,
  type SidebarGroup,
  type SidebarPersistenceAdapter,
} from "../../../registry/source/components/sidebar/index.ts";
import { Stepper, type StepperStep } from "../../../registry/source/components/stepper/index.ts";
import {
  TableOfContents,
  type TableOfContentsItem,
} from "../../../registry/source/components/table-of-contents/index.ts";
import { Tabs } from "../../../registry/source/components/tabs/index.ts";
import { Tour, type TourStep } from "../../../registry/source/components/tour/index.ts";
import {
  TreeView,
  type TreeViewItem,
} from "../../../registry/source/components/tree-view/index.ts";
import "mergora-tokens/tokens.css";

interface NavigationDisclosureProofArgs {
  readonly bottomOverflow: boolean;
  readonly collapsibleStateText: boolean;
  readonly cursorPagination: boolean;
  readonly expansionSummary: boolean;
  readonly keyboardHint: boolean;
  readonly navbarRouteStatus: boolean;
  readonly navigationPreview: boolean;
  readonly responsiveBreadcrumb: boolean;
  readonly sidebarPersistence: boolean;
  readonly stepperAnnouncements: boolean;
  readonly stepperProgress: boolean;
  readonly stepperSummary: boolean;
  readonly tocObserver: boolean;
  readonly tocSummary: boolean;
  readonly tourAnnouncements: boolean;
  readonly tourProgress: boolean;
  readonly tourRouteAdapter: boolean;
  readonly tourTargetRecovery: boolean;
  readonly treeMoveActions: boolean;
}

const frameStyle: CSSProperties = {
  background: "var(--mrg-semantic-color-background-canvas)",
  border: "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-strong)",
  borderRadius: "var(--mrg-semantic-radius-panel)",
  color: "var(--mrg-semantic-color-foreground-primary)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-lg)",
  inlineSize: "min(48rem, calc(100vw - 2rem))",
  maxInlineSize: "100%",
  minInlineSize: 0,
  padding: "var(--mrg-semantic-density-panel-padding)",
};

const headingStyle: CSSProperties = {
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-xs)",
};

const descriptionStyle: CSSProperties = {
  color: "var(--mrg-semantic-color-foreground-muted)",
  margin: 0,
  maxInlineSize: "65ch",
};

const outputStyle: CSSProperties = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-default)",
  display: "block",
  margin: 0,
  paddingBlockStart: "var(--mrg-semantic-space-stack-sm)",
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
      <header style={headingStyle}>
        <h2 id={`${itemId}-proof-title`} style={{ margin: 0 }}>
          {title}
        </h2>
        <p style={descriptionStyle}>{description}</p>
      </header>
      {children}
    </section>
  );
}

const breadcrumbItems: readonly BreadcrumbItem[] = [
  { href: "#documentation", id: "documentation", label: "Documentation" },
  { href: "#components", id: "components", label: "Components" },
  { href: "#navigation", id: "navigation", label: "Navigation" },
  { href: "#disclosure", id: "disclosure", label: "Disclosure patterns" },
  { id: "accordion", label: "Accordion" },
];

const bottomNavigationItems: readonly BottomNavigationItem[] = [
  { href: "#overview", id: "overview", label: "Overview" },
  { href: "#patterns", id: "patterns", label: "Patterns" },
  { href: "#keyboard", id: "keyboard", label: "Keyboard" },
  { href: "#evidence", id: "evidence", label: "Evidence" },
  { href: "#history", id: "history", label: "History" },
  { href: "#settings", id: "settings", label: "Settings" },
];

const navbarItems: readonly NavbarItem[] = [
  { href: "#overview", id: "overview", label: "Overview" },
  { href: "#patterns", id: "patterns", label: "Patterns" },
  { href: "#evidence", id: "evidence", label: "Evidence" },
];

const navigationMenuItems: readonly NavigationMenuItem[] = [
  { href: "#overview", id: "overview", label: "Overview" },
  {
    id: "library",
    label: "Library",
    links: [
      {
        description: "Foundations and production controls",
        href: "#components",
        id: "components",
        label: "Components",
      },
      {
        description: "Keyboard, browser, and parity records",
        href: "#quality",
        id: "quality",
        label: "Quality evidence",
      },
    ],
    type: "group",
  },
];

const sidebarGroups: readonly SidebarGroup[] = [
  {
    id: "learn",
    items: [
      { href: "#overview", id: "overview", label: "Overview" },
      { href: "#patterns", id: "patterns", label: "Patterns" },
    ],
    label: "Learn",
  },
  {
    id: "verify",
    items: [
      { href: "#keyboard", id: "keyboard", label: "Keyboard" },
      { href: "#evidence", id: "evidence", label: "Evidence" },
    ],
    label: "Verify",
  },
];

const stepperSteps: readonly StepperStep[] = [
  { description: "Choose a foundation", id: "foundation", label: "Foundation" },
  { description: "Adapt semantic tokens", id: "theme", label: "Theme" },
  { description: "Review interaction evidence", id: "verify", label: "Verify" },
  { description: "Prepare consumer proof", id: "ship", label: "Ship" },
];

const tableOfContentsItems: readonly TableOfContentsItem[] = [
  { id: "toc-overview", label: "Overview", level: 3 },
  { id: "toc-patterns", label: "Interaction patterns", level: 3 },
  { id: "toc-keyboard", label: "Keyboard behavior", level: 4 },
  { id: "toc-evidence", label: "Evidence", level: 3 },
];

const tourSteps: readonly TourStep[] = [
  {
    description: "Routing remains application-owned while the current guidance stays visible.",
    id: "route-evidence",
    route: "/quality/evidence",
    targetId: "route-owned-target-not-mounted",
    title: "Open route-owned evidence",
  },
  {
    description: "Return to the ordinary document after inspecting the evidence.",
    id: "return",
    title: "Continue the review",
  },
];

const treeItems: readonly TreeViewItem[] = [
  {
    children: [
      { id: "overview-file", label: "Overview.mdx", textValue: "Overview" },
      {
        children: [
          { id: "button-file", label: "Button.tsx", textValue: "Button" },
          { id: "dialog-file", label: "Dialog.tsx", textValue: "Dialog" },
        ],
        id: "components-folder",
        label: "Components",
        textValue: "Components",
      },
      { id: "evidence-file", label: "Evidence.json", textValue: "Evidence" },
    ],
    id: "workspace",
    label: "Workspace",
    textValue: "Workspace",
  },
];

function AccordionSpecimen({ summary }: { readonly summary: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Native disclosure state remains authoritative; an optional polite rail summarizes multi-open context without replacing headings or triggers."
      itemId="accordion"
      title="Accordion"
    >
      <Accordion.Root
        defaultValue={["identity"]}
        multiple
        {...(summary
          ? {
              renderExpansionSummary: (values: readonly string[]) =>
                `${String(values.length)} section${values.length === 1 ? "" : "s"} expanded.`,
            }
          : {})}
      >
        <Accordion.Item value="identity">
          <Accordion.Header level={3}>
            <Accordion.Trigger>Identity and provenance</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Every artifact retains its canonical source identity.</Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value="evidence">
          <Accordion.Header level={3}>
            <Accordion.Trigger>Independent evidence</Accordion.Trigger>
          </Accordion.Header>
          <Accordion.Panel>Browser and assistive-technology records stay separate.</Accordion.Panel>
        </Accordion.Item>
      </Accordion.Root>
    </SpecimenFrame>
  );
}

function BreadcrumbSpecimen({ responsive }: { readonly responsive: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The full hierarchy remains the baseline; optional native-details compaction preserves hidden ancestors and the current page on narrow surfaces."
      itemId="breadcrumb"
      title="Breadcrumb"
    >
      <Breadcrumb
        collapse={responsive}
        items={breadcrumbItems}
        {...(responsive ? { maxVisible: 3 } : {})}
      />
    </SpecimenFrame>
  );
}

function CollapsibleSpecimen({ stateText }: { readonly stateText: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="The disclosure keeps native expanded semantics; optional visible wording makes the state easier to scan without duplicating it for assistive technology."
      itemId="collapsible"
      title="Collapsible"
    >
      <Collapsible.Root defaultOpen>
        <Collapsible.Trigger
          {...(stateText ? { stateText: { closed: "Collapsed", open: "Expanded" } } : {})}
        >
          Provenance details
        </Collapsible.Trigger>
        <Collapsible.Content>
          Source and evidence digests are independently bound.
        </Collapsible.Content>
      </Collapsible.Root>
    </SpecimenFrame>
  );
}

function PaginationSpecimen({ cursor }: { readonly cursor: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Finite pages remain predictable; cursor mode can represent server-owned ranges without inventing a total or weakening safe-link checks."
      itemId="pagination"
      title="Pagination"
    >
      {cursor ? (
        <Pagination
          currentLabel="Items 41 through 60"
          mode="cursor"
          nextHref="?after=item-60"
          previousHref="?before=item-41"
        />
      ) : (
        <Pagination getHref={(page) => `?page=${String(page)}`} page={3} pageCount={8} />
      )}
    </SpecimenFrame>
  );
}

function TabsSpecimen({ hint }: { readonly hint: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Manual activation keeps the ordinary tab contract; optional localized keyboard discovery is connected to the tablist only when supplied."
      itemId="tabs"
      title="Tabs"
    >
      <Tabs.Root activationMode="manual" defaultValue="overview">
        <Tabs.List
          label="Artifact sections"
          {...(hint
            ? { keyboardHint: "Use arrow keys to move, then Enter or Space to select." }
            : {})}
        >
          <Tabs.Tab value="overview">Overview</Tabs.Tab>
          <Tabs.Tab value="evidence">Evidence</Tabs.Tab>
          <Tabs.Tab value="history">History</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panels>
          <Tabs.Panel value="overview">Canonical artifact overview.</Tabs.Panel>
          <Tabs.Panel value="evidence">Independent verification evidence.</Tabs.Panel>
          <Tabs.Panel value="history">Immutable change history.</Tabs.Panel>
        </Tabs.Panels>
      </Tabs.Root>
    </SpecimenFrame>
  );
}

function BottomNavigationSpecimen({ overflow }: { readonly overflow: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Every destination stays a safe link; optional bounded overflow preserves the current destination and moves the remainder into native details."
      itemId="bottom-navigation"
      title="Bottom navigation"
    >
      <BottomNavigation
        currentId="evidence"
        items={bottomNavigationItems}
        {...(overflow ? { overflow: { label: "More destinations", maximumVisible: 4 } } : {})}
      />
    </SpecimenFrame>
  );
}

function NavbarSpecimen({ routeStatus }: { readonly routeStatus: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Skip-link, desktop, and mobile navigation remain stable; optional router state occupies a non-jumping live status rail."
      itemId="navbar"
      title="Navbar"
    >
      <Navbar
        brand={<strong>Mergora workbench</strong>}
        currentId="patterns"
        items={navbarItems}
        {...(routeStatus
          ? { routeStatus: { state: "loading" as const, text: "Preparing pattern evidence…" } }
          : {})}
      />
      <div id="main-content">Primary specimen content</div>
    </SpecimenFrame>
  );
}

function NavigationMenuSpecimen({ preview }: { readonly preview: boolean }): ReactElement {
  return (
    <SpecimenFrame
      description="Real links and disclosure behavior remain primary; optional focus and pointer previews expose richer destination context without duplicating navigation."
      itemId="navigation-menu"
      title="Navigation menu"
    >
      <NavigationMenu
        currentId="quality"
        defaultOpenGroupId="library"
        items={navigationMenuItems}
        {...(preview
          ? {
              previewLabel: "Destination context",
              renderLinkPreview: (item) => (
                <div>
                  <strong>{item.label}</strong>
                  <p>{item.description}</p>
                </div>
              ),
            }
          : {})}
      />
    </SpecimenFrame>
  );
}

function SidebarSpecimen({ persistence }: { readonly persistence: boolean }): ReactElement {
  const persistedCollapsed = useRef(false);
  const [writes, setWrites] = useState(0);
  const persistenceAdapter = useMemo<SidebarPersistenceAdapter>(
    () => ({
      read: () => persistedCollapsed.current,
      write: (collapsed) => {
        persistedCollapsed.current = collapsed;
        setWrites((count) => count + 1);
      },
    }),
    [],
  );

  return (
    <SpecimenFrame
      description="Local collapse state remains the default; optional consumer-owned persistence reads only uncontrolled state and writes only explicit transitions."
      itemId="sidebar"
      title="Sidebar"
    >
      <Sidebar
        currentId="patterns"
        groups={sidebarGroups}
        {...(persistence ? { persistenceAdapter } : {})}
      />
      {persistence ? (
        <output data-slot="sidebar-persistence-proof" style={outputStyle}>
          Consumer persistence writes: {writes}
        </output>
      ) : null}
    </SpecimenFrame>
  );
}

function StepperSpecimen({
  announcements,
  progress,
  summary,
}: {
  readonly announcements: boolean;
  readonly progress: boolean;
  readonly summary: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="Ordered step state remains concise; native progress, visible recovery context, and polite change announcements are independently selectable."
      itemId="stepper"
      title="Stepper"
    >
      <Stepper
        defaultValue="theme"
        mode="linear"
        navigable
        steps={stepperSteps}
        {...(progress ? { showProgressBar: true } : {})}
        {...(summary
          ? {
              renderProgressSummary: ({ currentIndex, total }) =>
                `${String(total - currentIndex - 1)} steps remain before consumer proof.`,
            }
          : {})}
        {...(announcements ? { announceStepChanges: true } : {})}
      />
    </SpecimenFrame>
  );
}

function TableOfContentsSpecimen({
  observer,
  summary,
}: {
  readonly observer: boolean;
  readonly summary: boolean;
}): ReactElement {
  return (
    <SpecimenFrame
      description="Hash links and consumer headings remain authoritative; current-section observation and visible reading context can be selected separately."
      itemId="table-of-contents"
      title="Table of contents"
    >
      <TableOfContents
        defaultCurrentId="toc-patterns"
        items={tableOfContentsItems}
        {...(observer ? { observeCurrent: { rootMargin: "0px 0px -55%" } } : {})}
        {...(summary
          ? {
              renderCurrentSummary: ({ currentIndex, total }) =>
                `Section ${String(currentIndex + 1)} of ${String(total)}`,
            }
          : {})}
      />
      <article>
        <h3 id="toc-overview">Overview</h3>
        <p>Navigation begins with real document headings.</p>
        <h3 id="toc-patterns">Interaction patterns</h3>
        <h4 id="toc-keyboard">Keyboard behavior</h4>
        <h3 id="toc-evidence">Evidence</h3>
      </article>
    </SpecimenFrame>
  );
}

function TourSpecimen({
  announcements,
  progress,
  routeAdapter: routeAdapterEnabled,
  targetRecovery: targetRecoveryEnabled,
}: {
  readonly announcements: boolean;
  readonly progress: boolean;
  readonly routeAdapter: boolean;
  readonly targetRecovery: boolean;
}): ReactElement {
  const [routeActivity, setRouteActivity] = useState("Waiting for a route request.");

  return (
    <SpecimenFrame
      description="The non-modal local tour stays skippable; routing, missing-target recovery, progress, and announcements remain four separate choices."
      itemId="tour"
      title="Tour"
    >
      <div
        data-route-adapter-enabled={routeAdapterEnabled || undefined}
        data-target-recovery-enabled={targetRecoveryEnabled || undefined}
      >
        <Tour
          defaultOpen
          steps={tourSteps}
          triggerLabel="Toggle navigation tour"
          {...(routeAdapterEnabled
            ? {
                routeAdapter: {
                  navigate: (route: string) => setRouteActivity(`Route requested: ${route}`),
                },
              }
            : {})}
          {...(targetRecoveryEnabled
            ? {
                targetRecovery: {
                  message: "The route-owned target is not mounted yet.",
                  onRetry: () => setRouteActivity("Target retry requested."),
                  retryLabel: "Check target again",
                },
              }
            : {})}
          {...(progress ? { showProgress: true } : {})}
          {...(announcements ? { announceStepChanges: true } : {})}
        />
      </div>
      {routeAdapterEnabled || targetRecoveryEnabled ? (
        <output data-slot="tour-integration-proof" style={outputStyle}>
          {routeActivity}
        </output>
      ) : null}
    </SpecimenFrame>
  );
}

function TreeViewSpecimen({ moveActions }: { readonly moveActions: boolean }): ReactElement {
  const [activity, setActivity] = useState("No movement requested.");
  return (
    <SpecimenFrame
      description="APG tree navigation remains intact; optional consumer-authorized buttons provide a discoverable non-drag movement path for each eligible item."
      itemId="tree-view"
      title="Tree view"
    >
      <TreeView
        defaultExpandedIds={["workspace", "components-folder"]}
        defaultSelectedIds={["button-file"]}
        items={treeItems}
        label="Component source tree"
        selectionMode="single"
        {...(moveActions
          ? {
              moveActions: {
                getAllowedDirections: () => ["up" as const, "down" as const],
                onMove: (item: TreeViewItem, direction: "up" | "down" | "in" | "out") =>
                  setActivity(`Move ${item.id} ${direction} requested.`),
              },
            }
          : {})}
      />
      {moveActions ? (
        <output aria-live="polite" data-slot="tree-move-proof" style={outputStyle}>
          {activity}
        </output>
      ) : null}
    </SpecimenFrame>
  );
}

const onlyControls = (...names: readonly (keyof NavigationDisclosureProofArgs)[]) => ({
  controls: { include: names },
});

const meta = {
  args: {
    bottomOverflow: false,
    collapsibleStateText: false,
    cursorPagination: false,
    expansionSummary: false,
    keyboardHint: false,
    navbarRouteStatus: false,
    navigationPreview: false,
    responsiveBreadcrumb: false,
    sidebarPersistence: false,
    stepperAnnouncements: false,
    stepperProgress: false,
    stepperSummary: false,
    tocObserver: false,
    tocSummary: false,
    tourAnnouncements: false,
    tourProgress: false,
    tourRouteAdapter: false,
    tourTargetRecovery: false,
    treeMoveActions: false,
  },
  argTypes: {
    bottomOverflow: {
      control: "boolean",
      description: "Bound visible destinations and expose the remainder through native details.",
    },
    collapsibleStateText: {
      control: "boolean",
      description: "Show localized sighted wording for the current disclosure state.",
    },
    cursorPagination: {
      control: "boolean",
      description: "Use server-owned cursor navigation instead of finite page numbers.",
    },
    expansionSummary: {
      control: "boolean",
      description: "Show the consumer-formatted polite expanded-section summary.",
    },
    keyboardHint: {
      control: "boolean",
      description: "Connect localized keyboard discovery text to the tablist.",
    },
    navbarRouteStatus: {
      control: "boolean",
      description: "Show router-owned loading or recovery status.",
    },
    navigationPreview: {
      control: "boolean",
      description: "Render destination context on intentional focus or pointer entry.",
    },
    responsiveBreadcrumb: {
      control: "boolean",
      description: "Compact long hierarchy through a native details disclosure.",
    },
    sidebarPersistence: {
      control: "boolean",
      description: "Use the consumer-owned collapse persistence adapter.",
    },
    stepperAnnouncements: {
      control: "boolean",
      description: "Announce current-step changes politely.",
    },
    stepperProgress: {
      control: "boolean",
      description: "Expose native progress semantics.",
    },
    stepperSummary: {
      control: "boolean",
      description: "Show consumer-formatted remaining-step context.",
    },
    tocObserver: {
      control: "boolean",
      description: "Observe document headings to update the current section.",
    },
    tocSummary: {
      control: "boolean",
      description: "Show consumer-formatted current-section context.",
    },
    tourAnnouncements: {
      control: "boolean",
      description: "Announce tour step changes politely.",
    },
    tourProgress: {
      control: "boolean",
      description: "Expose tour position as progressbar semantics.",
    },
    tourRouteAdapter: {
      control: "boolean",
      description: "Delegate route changes to the consumer adapter.",
    },
    tourTargetRecovery: {
      control: "boolean",
      description: "Show consumer-owned missing-target recovery and retry.",
    },
    treeMoveActions: {
      control: "boolean",
      description: "Show authorized non-drag movement buttons.",
    },
  },
  parameters: { a11y: { test: "error" }, layout: "centered" },
  title: "Components/Navigation and disclosure — component proof",
} satisfies Meta<NavigationDisclosureProofArgs>;

export default meta;
type Story = StoryObj<NavigationDisclosureProofArgs>;

export const BasicAccordion: Story = {
  args: { expansionSummary: false },
  name: "Accordion · Basic",
  parameters: onlyControls("expansionSummary"),
  render: (args) => <AccordionSpecimen summary={args.expansionSummary} />,
};

export const RecommendedAccordion: Story = {
  args: { expansionSummary: true },
  name: "Accordion · Recommended Mergora",
  parameters: onlyControls("expansionSummary"),
  render: (args) => <AccordionSpecimen summary={args.expansionSummary} />,
};

export const BasicBreadcrumb: Story = {
  args: { responsiveBreadcrumb: false },
  name: "Breadcrumb · Basic",
  parameters: onlyControls("responsiveBreadcrumb"),
  render: (args) => <BreadcrumbSpecimen responsive={args.responsiveBreadcrumb} />,
};

export const RecommendedBreadcrumb: Story = {
  args: { responsiveBreadcrumb: true },
  name: "Breadcrumb · Recommended Mergora",
  parameters: onlyControls("responsiveBreadcrumb"),
  render: (args) => <BreadcrumbSpecimen responsive={args.responsiveBreadcrumb} />,
};

export const BasicCollapsible: Story = {
  args: { collapsibleStateText: false },
  name: "Collapsible · Basic",
  parameters: onlyControls("collapsibleStateText"),
  render: (args) => <CollapsibleSpecimen stateText={args.collapsibleStateText} />,
};

export const RecommendedCollapsible: Story = {
  args: { collapsibleStateText: true },
  name: "Collapsible · Recommended Mergora",
  parameters: onlyControls("collapsibleStateText"),
  render: (args) => <CollapsibleSpecimen stateText={args.collapsibleStateText} />,
};

export const BasicPagination: Story = {
  args: { cursorPagination: false },
  name: "Pagination · Basic",
  parameters: onlyControls("cursorPagination"),
  render: (args) => <PaginationSpecimen cursor={args.cursorPagination} />,
};

export const RecommendedPagination: Story = {
  args: { cursorPagination: true },
  name: "Pagination · Recommended Mergora",
  parameters: onlyControls("cursorPagination"),
  render: (args) => <PaginationSpecimen cursor={args.cursorPagination} />,
};

export const BasicTabs: Story = {
  args: { keyboardHint: false },
  name: "Tabs · Basic",
  parameters: onlyControls("keyboardHint"),
  render: (args) => <TabsSpecimen hint={args.keyboardHint} />,
};

export const RecommendedTabs: Story = {
  args: { keyboardHint: true },
  name: "Tabs · Recommended Mergora",
  parameters: onlyControls("keyboardHint"),
  render: (args) => <TabsSpecimen hint={args.keyboardHint} />,
};

export const BasicBottomNavigation: Story = {
  args: { bottomOverflow: false },
  name: "Bottom Navigation · Basic",
  parameters: onlyControls("bottomOverflow"),
  render: (args) => <BottomNavigationSpecimen overflow={args.bottomOverflow} />,
};

export const RecommendedBottomNavigation: Story = {
  args: { bottomOverflow: true },
  name: "Bottom Navigation · Recommended Mergora",
  parameters: onlyControls("bottomOverflow"),
  render: (args) => <BottomNavigationSpecimen overflow={args.bottomOverflow} />,
};

export const BasicNavbar: Story = {
  args: { navbarRouteStatus: false },
  name: "Navbar · Basic",
  parameters: onlyControls("navbarRouteStatus"),
  render: (args) => <NavbarSpecimen routeStatus={args.navbarRouteStatus} />,
};

export const RecommendedNavbar: Story = {
  args: { navbarRouteStatus: true },
  name: "Navbar · Recommended Mergora",
  parameters: onlyControls("navbarRouteStatus"),
  render: (args) => <NavbarSpecimen routeStatus={args.navbarRouteStatus} />,
};

export const BasicNavigationMenu: Story = {
  args: { navigationPreview: false },
  name: "Navigation Menu · Basic",
  parameters: onlyControls("navigationPreview"),
  render: (args) => <NavigationMenuSpecimen preview={args.navigationPreview} />,
};

export const RecommendedNavigationMenu: Story = {
  args: { navigationPreview: true },
  name: "Navigation Menu · Recommended Mergora",
  parameters: onlyControls("navigationPreview"),
  render: (args) => <NavigationMenuSpecimen preview={args.navigationPreview} />,
};

export const BasicSidebar: Story = {
  args: { sidebarPersistence: false },
  name: "Sidebar · Basic",
  parameters: onlyControls("sidebarPersistence"),
  render: (args) => <SidebarSpecimen persistence={args.sidebarPersistence} />,
};

export const RecommendedSidebar: Story = {
  args: { sidebarPersistence: true },
  name: "Sidebar · Recommended Mergora",
  parameters: onlyControls("sidebarPersistence"),
  render: (args) => <SidebarSpecimen persistence={args.sidebarPersistence} />,
};

export const BasicStepper: Story = {
  args: { stepperAnnouncements: false, stepperProgress: false, stepperSummary: false },
  name: "Stepper · Basic",
  parameters: onlyControls("stepperProgress", "stepperSummary", "stepperAnnouncements"),
  render: (args) => (
    <StepperSpecimen
      announcements={args.stepperAnnouncements}
      progress={args.stepperProgress}
      summary={args.stepperSummary}
    />
  ),
};

export const RecommendedStepper: Story = {
  args: { stepperAnnouncements: true, stepperProgress: true, stepperSummary: true },
  name: "Stepper · Recommended Mergora",
  parameters: onlyControls("stepperProgress", "stepperSummary", "stepperAnnouncements"),
  render: (args) => (
    <StepperSpecimen
      announcements={args.stepperAnnouncements}
      progress={args.stepperProgress}
      summary={args.stepperSummary}
    />
  ),
};

export const BasicTableOfContents: Story = {
  args: { tocObserver: false, tocSummary: false },
  name: "Table of Contents · Basic",
  parameters: onlyControls("tocObserver", "tocSummary"),
  render: (args) => (
    <TableOfContentsSpecimen observer={args.tocObserver} summary={args.tocSummary} />
  ),
};

export const RecommendedTableOfContents: Story = {
  args: { tocObserver: true, tocSummary: true },
  name: "Table of Contents · Recommended Mergora",
  parameters: onlyControls("tocObserver", "tocSummary"),
  render: (args) => (
    <TableOfContentsSpecimen observer={args.tocObserver} summary={args.tocSummary} />
  ),
};

export const BasicTour: Story = {
  args: {
    tourAnnouncements: false,
    tourProgress: false,
    tourRouteAdapter: false,
    tourTargetRecovery: false,
  },
  name: "Tour · Basic",
  parameters: onlyControls(
    "tourRouteAdapter",
    "tourTargetRecovery",
    "tourProgress",
    "tourAnnouncements",
  ),
  render: (args) => (
    <TourSpecimen
      announcements={args.tourAnnouncements}
      progress={args.tourProgress}
      routeAdapter={args.tourRouteAdapter}
      targetRecovery={args.tourTargetRecovery}
    />
  ),
};

export const RecommendedTour: Story = {
  args: {
    tourAnnouncements: true,
    tourProgress: true,
    tourRouteAdapter: true,
    tourTargetRecovery: true,
  },
  name: "Tour · Recommended Mergora",
  parameters: onlyControls(
    "tourRouteAdapter",
    "tourTargetRecovery",
    "tourProgress",
    "tourAnnouncements",
  ),
  render: (args) => (
    <TourSpecimen
      announcements={args.tourAnnouncements}
      progress={args.tourProgress}
      routeAdapter={args.tourRouteAdapter}
      targetRecovery={args.tourTargetRecovery}
    />
  ),
};

export const BasicTreeView: Story = {
  args: { treeMoveActions: false },
  name: "Tree View · Basic",
  parameters: onlyControls("treeMoveActions"),
  render: (args) => <TreeViewSpecimen moveActions={args.treeMoveActions} />,
};

export const RecommendedTreeView: Story = {
  args: { treeMoveActions: true },
  name: "Tree View · Recommended Mergora",
  parameters: onlyControls("treeMoveActions"),
  render: (args) => <TreeViewSpecimen moveActions={args.treeMoveActions} />,
};
