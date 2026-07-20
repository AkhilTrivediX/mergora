import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import "mergora-tokens/tokens.css";
import {
  BottomNavigation,
  type BottomNavigationItem,
} from "../../../registry/source/components/bottom-navigation/bottom-navigation";
import { Navbar, type NavbarItem } from "../../../registry/source/components/navbar/navbar";
import {
  NavigationMenu,
  type NavigationMenuItem,
} from "../../../registry/source/components/navigation-menu/navigation-menu";
import { Sidebar, type SidebarGroup } from "../../../registry/source/components/sidebar/sidebar";
import { Stepper, type StepperStep } from "../../../registry/source/components/stepper/stepper";
import {
  TableOfContents,
  type TableOfContentsItem,
} from "../../../registry/source/components/table-of-contents/table-of-contents";
import { Tour, type TourStep } from "../../../registry/source/components/tour/tour";
import {
  TreeView,
  type TreeViewItem,
} from "../../../registry/source/components/tree-view/tree-view";

interface NavigationStoryArgs {
  readonly bottomOverflow: boolean;
  readonly direction: "ltr" | "rtl";
  readonly navbarRouteStatus: boolean;
  readonly navigationPreview: boolean;
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
  readonly treeItemActions: boolean;
  readonly treeLazyLoading: boolean;
  readonly treeMoveActions: boolean;
  readonly treeRename: boolean;
  readonly treeVirtualization: boolean;
}

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
  marginInline: "auto",
  maxInlineSize: "68rem",
  minInlineSize: 0,
} satisfies CSSProperties;

const specimenStyle = {
  borderBlockStart:
    "var(--mrg-semantic-border-width-default) solid var(--mrg-semantic-color-border-subtle)",
  display: "grid",
  gap: "var(--mrg-semantic-space-stack-md)",
  minInlineSize: 0,
  paddingBlockStart: "var(--mrg-semantic-space-inset-lg)",
} satisfies CSSProperties;

const outputStyle = {
  background: "var(--mrg-semantic-color-background-surface)",
  borderRadius: "var(--mrg-semantic-radius-compact)",
  display: "block",
  fontFamily: "var(--mrg-semantic-font-family-code)",
  fontSize: "var(--mrg-semantic-font-size-label)",
  overflowWrap: "anywhere",
  padding: "var(--mrg-semantic-space-inset-sm)",
} satisfies CSSProperties;

const bottomItems: readonly BottomNavigationItem[] = [
  { href: "#overview", icon: "⌂", id: "overview", label: "Overview" },
  { href: "#patterns", icon: "◇", id: "patterns", label: "Patterns" },
  { href: "#evidence", icon: "✓", id: "evidence", label: "Evidence" },
  { href: "#updates", icon: "↻", id: "updates", label: "Updates" },
  { href: "#settings", icon: "⚙", id: "settings", label: "Settings" },
  { disabled: true, href: "#archive", icon: "□", id: "archive", label: "Archive" },
];

const navbarItems: readonly NavbarItem[] = [
  { href: "#overview", id: "overview", label: "Overview" },
  { href: "#patterns", id: "patterns", label: "Patterns" },
  { href: "#evidence", id: "evidence", label: "Evidence" },
  { disabled: true, href: "#archive", id: "archive", label: "Archive" },
];

const navigationItems: readonly NavigationMenuItem[] = [
  { href: "#overview", id: "home", label: "Overview" },
  {
    id: "library",
    label: "Library",
    links: [
      {
        description: "Foundations and production controls",
        href: "#patterns",
        id: "components",
        label: "Components",
      },
      {
        description: "Keyboard, browser, and parity records",
        href: "#evidence",
        id: "quality",
        label: "Quality evidence",
      },
    ],
    type: "group",
  },
  { href: "#updates", id: "updates", label: "Update workflow" },
];

const sidebarGroups: readonly SidebarGroup[] = [
  {
    id: "learn",
    items: [
      { href: "#overview", icon: "O", id: "introduction", label: "Introduction" },
      { href: "#patterns", icon: "P", id: "patterns", label: "Patterns" },
    ],
    label: "Learn",
  },
  {
    id: "verify",
    items: [
      { href: "#evidence", icon: "E", id: "evidence", label: "Evidence" },
      { disabled: true, href: "#archive", icon: "A", id: "archive", label: "Archive" },
    ],
    label: "Verify",
  },
];

const steps: readonly StepperStep[] = [
  { description: "Choose a foundation", id: "foundation", label: "Foundation" },
  { description: "Adapt semantic tokens", id: "theme", label: "Theme" },
  { description: "Review keyboard paths", id: "verify", label: "Verify" },
  { description: "Prepare consumer proof", id: "ship", label: "Ship" },
];

const tocItems: readonly TableOfContentsItem[] = [
  { id: "overview", label: "Overview", level: 2 },
  { id: "patterns", label: "Interaction patterns", level: 2 },
  { id: "keyboard", label: "Keyboard behavior", level: 3 },
  { id: "evidence", label: "Evidence", level: 2 },
  { disabled: true, id: "archive", label: "Archived notes", level: 3 },
];

const tourSteps: readonly TourStep[] = [
  {
    description:
      "The workbench keeps the active navigation specimen available while guidance is open.",
    id: "workbench",
    targetId: "tour-anchor",
    title: "Inspect a live specimen",
  },
  {
    description:
      "Routing stays in this story adapter and can recover if the next target is not mounted yet.",
    id: "route",
    route: "/quality/evidence",
    targetId: "route-owned-target",
    title: "Follow route-owned evidence",
  },
];

const initialTreeItems: readonly TreeViewItem[] = [
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
      {
        hasChildren: true,
        id: "evidence-folder",
        label: "Evidence",
        textValue: "Evidence",
      },
    ],
    id: "workspace",
    label: "Workspace",
    textValue: "Workspace",
  },
];

function Section({ children, title }: { readonly children: ReactNode; readonly title: string }) {
  const id = `section-${title.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-")}`;
  return (
    <section aria-labelledby={id} style={specimenStyle}>
      <h2 id={id} style={{ margin: 0 }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function NavigationWorkbench(args: NavigationStoryArgs & { readonly evidenceMode?: boolean }) {
  const [bottomCurrent, setBottomCurrent] = useState("overview");
  const [step, setStep] = useState("theme");
  const [tocCurrent, setTocCurrent] = useState("patterns");
  const [persistenceWrites, setPersistenceWrites] = useState(0);
  const [tourRoute, setTourRoute] = useState("No route request");
  const [treeActivity, setTreeActivity] = useState("No tree action yet");
  const [treeItems, setTreeItems] = useState(initialTreeItems);
  const [virtualStart, setVirtualStart] = useState(0);
  const persistedCollapsed = useRef(false);
  const renderedSteps = args.evidenceMode
    ? steps.map((item) => (item.id === "verify" ? { ...item, state: "error" as const } : item))
    : steps;
  const persistenceAdapter = useMemo(
    () => ({
      read: () => persistedCollapsed.current,
      write: (collapsed: boolean) => {
        persistedCollapsed.current = collapsed;
        setPersistenceWrites((count) => count + 1);
      },
    }),
    [],
  );
  const loadChildren = async (item: TreeViewItem) => {
    if (item.id !== "evidence-folder") return;
    // Keep this state observable across engines before completing the intentionally lazy fixture.
    await new Promise((resolve) => globalThis.setTimeout(resolve, 240));
    setTreeItems((current) => {
      const root = current[0];
      if (root?.children === undefined) return current;
      return [
        {
          ...root,
          children: root.children.map((child) =>
            child.id === item.id
              ? {
                  ...child,
                  children: [
                    { id: "keyboard-record", label: "Keyboard.json", textValue: "Keyboard" },
                    { id: "browser-record", label: "Browsers.json", textValue: "Browsers" },
                  ],
                }
              : child,
          ),
        },
        ...current.slice(1),
      ];
    });
    setTreeActivity("Loaded evidence children");
  };
  const renameItem = (item: TreeViewItem, nextLabel: string) => {
    setTreeItems((current) => {
      const root = current[0];
      if (root?.children === undefined) return current;
      return [
        {
          ...root,
          children: root.children.map((child) =>
            child.id === item.id ? { ...child, label: nextLabel, textValue: nextLabel } : child,
          ),
        },
        ...current.slice(1),
      ];
    });
    setTreeActivity(`Renamed ${item.id} to ${nextLabel}`);
  };

  return (
    <main dir={args.direction} id="main-content" style={canvasStyle}>
      <div style={workbenchStyle}>
        <header>
          <h1 style={{ marginBlock: 0 }}>Navigation systems workbench</h1>
          <p style={{ maxInlineSize: "68ch" }}>
            Real destinations, current state, focus return, responsive disclosure, and explicit
            non-drag alternatives share one quiet interaction language.
          </p>
        </header>

        <Section title="Header and site navigation">
          <Navbar
            brand={<span>Mergora workbench</span>}
            currentId="patterns"
            items={navbarItems}
            {...(args.navbarRouteStatus
              ? { routeStatus: { state: "loading" as const, text: "Preparing pattern evidence…" } }
              : {})}
          />
          {args.navbarRouteStatus && args.evidenceMode ? (
            <Navbar
              brand="Recovery example"
              items={navbarItems}
              label="Recovery navigation"
              routeStatus={{ state: "error", text: "Pattern evidence needs attention." }}
              skipLink={false}
            />
          ) : null}
          <NavigationMenu
            currentId="quality"
            defaultOpenGroupId="library"
            items={navigationItems}
            {...(args.navigationPreview
              ? {
                  renderLinkPreview: (item) => (
                    <div>
                      <strong>{item.label}</strong>
                      <p>{item.description}</p>
                    </div>
                  ),
                }
              : {})}
          />
        </Section>

        <Section title="Sidebar and bottom destinations">
          <Sidebar
            currentId="patterns"
            groups={sidebarGroups}
            {...(args.sidebarPersistence ? { persistenceAdapter } : {})}
          />
          {args.sidebarPersistence ? (
            <output data-testid="persistence-writes" style={outputStyle}>
              Persistence writes: {persistenceWrites}
            </output>
          ) : null}
          <BottomNavigation
            currentId={bottomCurrent}
            items={bottomItems}
            onCurrentIdChange={setBottomCurrent}
            {...(args.bottomOverflow
              ? { overflow: { label: "More destinations", maximumVisible: 4 } }
              : { overflow: false })}
          />
        </Section>

        <Section title="Process and document navigation">
          <Stepper
            announceStepChanges={args.stepperAnnouncements}
            mode="linear"
            navigable
            onValueChange={setStep}
            {...(args.stepperSummary
              ? {
                  renderProgressSummary: ({ currentIndex, total }) =>
                    `${String(total - currentIndex - 1)} steps remain before consumer proof.`,
                }
              : {})}
            showProgressBar={args.stepperProgress}
            steps={renderedSteps}
            value={step}
          />
          <div id="overview" />
          <div id="patterns" />
          <div id="keyboard" />
          <div id="evidence" />
          <TableOfContents
            {...(args.tocObserver ? { defaultCurrentId: "patterns" } : { currentId: tocCurrent })}
            items={tocItems}
            observeCurrent={args.tocObserver ? { rootMargin: "0px 0px -55%" } : false}
            onCurrentIdChange={setTocCurrent}
            {...(args.tocSummary
              ? {
                  renderCurrentSummary: ({ currentIndex, total }) =>
                    `Section ${String(currentIndex + 1)} of ${String(total)}`,
                }
              : {})}
          />
        </Section>

        <Section title="Non-blocking guidance">
          <div
            id="tour-anchor"
            style={{
              borderBlockEnd:
                "var(--mrg-semantic-border-width-strong) solid var(--mrg-semantic-color-brand-action)",
              padding: "var(--mrg-semantic-space-inset-md)",
            }}
          >
            The guided target remains an ordinary reachable part of the page.
          </div>
          <Tour
            announceStepChanges={args.tourAnnouncements}
            {...(args.tourRouteAdapter
              ? {
                  routeAdapter: {
                    navigate: (route: string) => setTourRoute(`Route requested: ${route}`),
                  },
                }
              : {})}
            showProgress={args.tourProgress}
            steps={tourSteps}
            targetRecovery={
              args.tourTargetRecovery
                ? {
                    message: "This route-owned target is not mounted yet.",
                    onRetry: () => setTourRoute("Target retry requested"),
                    retryLabel: "Check target again",
                  }
                : false
            }
            triggerLabel="Start navigation tour"
          />
          <output data-testid="tour-route-output" style={outputStyle}>
            {tourRoute}
          </output>
        </Section>

        <Section title="Hierarchical navigation">
          <TreeView
            defaultExpandedIds={["workspace", "components-folder"]}
            defaultSelectedIds={["button-file"]}
            items={treeItems}
            label="Component source tree"
            direction={args.direction}
            moveActions={
              args.treeMoveActions
                ? {
                    getAllowedDirections: () => ["up", "down"],
                    onMove: (item, direction) =>
                      setTreeActivity(`Move ${item.id} ${direction} requested`),
                  }
                : false
            }
            {...(args.treeLazyLoading ? { onLoadChildren: loadChildren } : {})}
            {...(args.treeRename ? { onRename: renameItem } : {})}
            {...(args.treeVirtualization
              ? { onVirtualWindowChange: (start: number) => setVirtualStart(start) }
              : {})}
            {...(args.treeItemActions
              ? {
                  renderActions: (item: TreeViewItem) => (
                    <button
                      onClick={() => setTreeActivity(`Inspect ${item.id} requested`)}
                      type="button"
                    >
                      Inspect
                    </button>
                  ),
                }
              : {})}
            selectionMode="multiple"
            virtualWindow={
              args.treeVirtualization
                ? { estimatedItemSize: 56, overscan: 1, startIndex: virtualStart, windowSize: 3 }
                : false
            }
          />
          <output aria-live="polite" data-testid="tree-activity" style={outputStyle}>
            {treeActivity}
          </output>
        </Section>
      </div>
    </main>
  );
}

const defaultArgs: NavigationStoryArgs = {
  bottomOverflow: false,
  direction: "ltr",
  navbarRouteStatus: false,
  navigationPreview: false,
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
  treeItemActions: false,
  treeLazyLoading: false,
  treeMoveActions: false,
  treeRename: false,
  treeVirtualization: false,
};

const meta = {
  args: defaultArgs,
  argTypes: {
    bottomOverflow: { control: "boolean" },
    direction: { control: "select", options: ["ltr", "rtl"] },
    navbarRouteStatus: { control: "boolean" },
    navigationPreview: { control: "boolean" },
    sidebarPersistence: { control: "boolean" },
    stepperAnnouncements: { control: "boolean" },
    stepperProgress: { control: "boolean" },
    stepperSummary: { control: "boolean" },
    tocObserver: { control: "boolean" },
    tocSummary: { control: "boolean" },
    tourAnnouncements: { control: "boolean" },
    tourProgress: { control: "boolean" },
    tourRouteAdapter: { control: "boolean" },
    tourTargetRecovery: { control: "boolean" },
    treeItemActions: { control: "boolean" },
    treeLazyLoading: { control: "boolean" },
    treeMoveActions: { control: "boolean" },
    treeRename: { control: "boolean" },
    treeVirtualization: { control: "boolean" },
  },
  parameters: { layout: "fullscreen" },
  render: (args) => <NavigationWorkbench {...args} />,
  title: "Components/Navigation Systems",
} satisfies Meta<NavigationStoryArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BasicDefaults: Story = {};

export const RecommendedMergora: Story = {
  args: {
    ...Object.fromEntries(
      Object.keys(defaultArgs)
        .filter((name) => name !== "direction")
        .map((name) => [name, true]),
    ),
    direction: "ltr",
  },
};

export const StateMatrix: Story = {
  args: {
    ...defaultArgs,
    navbarRouteStatus: true,
    stepperProgress: true,
    stepperSummary: true,
    tourProgress: true,
    tourTargetRecovery: true,
    treeLazyLoading: true,
  },
  render: (args) => <NavigationWorkbench {...args} evidenceMode />,
};

function ControlledExamples() {
  const [step, setStep] = useState("foundation");
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <main style={canvasStyle}>
      <div style={{ ...workbenchStyle, gap: "var(--mrg-semantic-space-stack-xl)" }}>
        <h1>Controlled and uncontrolled navigation</h1>
        <Stepper navigable onValueChange={setStep} steps={steps} value={step} />
        <output style={outputStyle}>Controlled step: {step}</output>
        <Sidebar
          groups={sidebarGroups}
          mobileOpen={mobileOpen}
          onMobileOpenChange={setMobileOpen}
        />
        <BottomNavigation defaultCurrentId="patterns" items={bottomItems.slice(0, 4)} />
      </div>
    </main>
  );
}

export const ControlledAndUncontrolled: Story = {
  render: () => <ControlledExamples />,
};

export const KeyboardAndResponsive: Story = {
  args: {
    ...defaultArgs,
    bottomOverflow: true,
    direction: "rtl",
    navigationPreview: true,
    stepperAnnouncements: true,
    tocSummary: true,
    tourAnnouncements: true,
    tourTargetRecovery: true,
    treeMoveActions: true,
    treeRename: true,
  },
  decorators: [
    (Story) => (
      <div dir="rtl" lang="ar" style={{ inlineSize: "min(100%, 22rem)", marginInline: "auto" }}>
        <Story />
      </div>
    ),
  ],
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
