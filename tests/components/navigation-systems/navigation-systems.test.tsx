import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import {
  validateStoryStateMatrix,
  type StoryStateMatrix,
} from "../../../packages/test-utils/src/index.ts";
import { validateSchemaDocument } from "../../../registry/schemas/index.ts";
import {
  BottomNavigation,
  getBottomNavigationLayout,
  isSafeBottomNavigationHref,
  type BottomNavigationItem,
} from "../../../registry/source/components/bottom-navigation/bottom-navigation.tsx";
import { isSafeNavbarHref, Navbar } from "../../../registry/source/components/navbar/navbar.tsx";
import {
  isSafeNavigationMenuHref,
  NavigationMenu,
} from "../../../registry/source/components/navigation-menu/navigation-menu.tsx";
import {
  isSafeSidebarHref,
  Sidebar,
} from "../../../registry/source/components/sidebar/sidebar.tsx";
import { Stepper } from "../../../registry/source/components/stepper/stepper.tsx";
import {
  isSafeTableOfContentsHref,
  TableOfContents,
} from "../../../registry/source/components/table-of-contents/table-of-contents.tsx";
import { Tour } from "../../../registry/source/components/tour/tour.tsx";
import {
  flattenTreeItems,
  TreeView,
  type TreeViewItem,
} from "../../../registry/source/components/tree-view/tree-view.tsx";

const root = resolve(import.meta.dirname, "../../..");
const componentsRoot = resolve(root, "registry/source/components");
const itemIds = [
  "bottom-navigation",
  "navbar",
  "navigation-menu",
  "sidebar",
  "stepper",
  "table-of-contents",
  "tour",
  "tree-view",
] as const;
const recordSuffixes = [
  "anatomy.json",
  "api.json",
  "contract.json",
  "metadata.json",
  "source.json",
  "status.json",
  "stories.json",
] as const;

function readItem(itemId: string, filename: string): string {
  return readFileSync(resolve(componentsRoot, itemId, filename), "utf8");
}

function readJson<T>(itemId: string, filename: string): T {
  return JSON.parse(readItem(itemId, filename)) as T;
}

const destinations: readonly BottomNavigationItem[] = [
  { href: "#one", id: "one", label: "One" },
  { href: "#two", id: "two", label: "Two" },
  { href: "#three", id: "three", label: "Three" },
  { href: "#four", id: "four", label: "Four" },
  { href: "#five", id: "five", label: "Five" },
];

const treeItems: readonly TreeViewItem[] = [
  {
    children: [
      { id: "alpha", label: "Alpha", textValue: "Alpha" },
      {
        children: [{ id: "nested", label: "Nested", textValue: "Nested" }],
        id: "branch",
        label: "Branch",
        textValue: "Branch",
      },
    ],
    id: "root",
    label: "Root",
    textValue: "Root",
  },
];

describe("P5 navigation canonical records", () => {
  it("ships twelve canonical files for every planned item", () => {
    for (const itemId of itemIds) {
      const files = new Set(readdirSync(resolve(componentsRoot, itemId)));
      expect(files.size, itemId).toBe(12);
      for (const suffix of recordSuffixes) expect(files).toContain(`${itemId}.${suffix}`);
      expect(files).toContain(`${itemId}.tsx`);
      expect(files).toContain(`${itemId}.css`);
      expect(files).toContain(`${itemId}-css.d.ts`);
      expect(files).toContain("index.ts");
      expect(files).toContain("README.md");
    }
  });

  it("validates metadata and every sixteen-state story matrix", () => {
    for (const itemId of itemIds) {
      const metadata = readJson<Record<string, unknown>>(itemId, `${itemId}.metadata.json`);
      const stories = readJson<StoryStateMatrix>(itemId, `${itemId}.stories.json`);
      expect(validateSchemaDocument("component-metadata", metadata), itemId).toMatchObject({
        errors: [],
        ok: true,
      });
      expect(validateStoryStateMatrix(stories), itemId).toMatchObject({ issues: [], ok: true });
      expect(stories.states).toHaveLength(16);
    }
  });

  it("keeps source manifests bounded and release claims honest", () => {
    for (const itemId of itemIds) {
      expect(readJson<Record<string, unknown>>(itemId, `${itemId}.source.json`)).toMatchObject({
        declaredImports: [`./${itemId}.css`, "react"],
        entryPath: `registry/source/components/${itemId}/${itemId}.tsx`,
        id: itemId,
        itemDependencies: [],
        outputRole: "component",
      });
      expect(readJson<Record<string, unknown>>(itemId, `${itemId}.status.json`)).toMatchObject({
        distributionStatus: "not-generated",
        evidenceStatus: "incomplete",
        implementationStatus: "source-present-unreleased",
        recordedEvidence: [],
        releaseStatus: "unreleased",
      });
      const records = recordSuffixes
        .map((suffix) => readItem(itemId, `${itemId}.${suffix}`))
        .join("\n");
      expect(records).not.toMatch(/"(?:maturity|publishedMaturity)"\s*:\s*"stable"/iu);
    }
  });

  it("uses only declared tokens, logical geometry, restrained corners, and no gradients", () => {
    const tokenCss = readFileSync(
      resolve(root, "packages/tokens/src/generated/tokens.css"),
      "utf8",
    );
    const declarations = new Set(
      [...tokenCss.matchAll(/(--mrg-[a-z0-9-]+)\s*:/gu)].map((match) => match[1]),
    );
    for (const itemId of itemIds) {
      const css = readItem(itemId, `${itemId}.css`);
      for (const token of [...css.matchAll(/var\((--mrg-[a-z0-9-]+)/gu)].map((match) => match[1])) {
        expect(declarations.has(token), `${itemId}: ${token}`).toBe(true);
      }
      expect(css).not.toMatch(/#[0-9a-f]{3,8}|(?:oklch|rgb|hsl)\(|gradient\(/iu);
      expect(css).not.toMatch(/^\s*(?:margin|padding|inset|border)-(?:left|right)\s*:/mu);
      expect(css).not.toMatch(/border-radius\s*:\s*(?:1[7-9]|[2-9]\d)px/iu);
      expect(css).toContain("var(--mrg-component-focus-indicator-color)");
    }
  });
});

describe("P5 destination navigation semantics", () => {
  it("keeps the current destination primary and removes overflow output when disabled", () => {
    expect(
      getBottomNavigationLayout(destinations, "five", { label: "More", maximumVisible: 3 }),
    ).toEqual({
      overflow: [destinations[2], destinations[3]],
      primary: [destinations[0], destinations[1], destinations[4]],
    });
    const plain = renderToStaticMarkup(
      <BottomNavigation
        className="consumer-navigation"
        currentId="one"
        items={destinations}
        overflow={false}
      />,
    );
    const enhanced = renderToStaticMarkup(
      <BottomNavigation
        currentId="five"
        items={destinations}
        overflow={{ label: "More destinations", maximumVisible: 3 }}
      />,
    );
    expect(plain).not.toContain("<details");
    expect(plain).not.toContain("bottom-navigation-overflow");
    expect(plain).toContain('class="mrg-bottom-navigation consumer-navigation"');
    expect(enhanced).toContain("<details");
    expect(enhanced).toContain("More destinations");
    expect(enhanced.match(/aria-current="page"/gu)).toHaveLength(1);
    expect(isSafeBottomNavigationHref("/patterns")).toBe(true);
    expect(isSafeBottomNavigationHref("javascript:alert(1)")).toBe(false);
  });

  it("rejects obfuscated executable protocols across destination-bearing systems", () => {
    const predicates = [
      isSafeBottomNavigationHref,
      isSafeNavbarHref,
      isSafeNavigationMenuHref,
      isSafeSidebarHref,
      isSafeTableOfContentsHref,
    ];
    for (const predicate of predicates) {
      expect(predicate("/patterns")).toBe(true);
      expect(predicate("https://example.test/patterns")).toBe(true);
      expect(predicate("java\nscript:alert(1)")).toBe(false);
      expect(predicate("\u0000data:text/html,unsafe")).toBe(false);
      expect(predicate("vb\tscript:unsafe")).toBe(false);
    }
  });

  it("keeps navbar route context and busy semantics independently removable", () => {
    const items = [{ href: "#overview", id: "overview", label: "Overview" }] as const;
    const plain = renderToStaticMarkup(<Navbar brand="Workbench" items={items} />);
    const enhanced = renderToStaticMarkup(
      <Navbar
        brand="Workbench"
        items={items}
        routeStatus={{ state: "loading", text: "Preparing overview" }}
      />,
    );
    expect(plain).toContain("Skip to main content");
    expect(plain).not.toContain("navbar-route-status");
    expect(plain).not.toContain("aria-busy");
    expect(plain).not.toContain("data-route-state");
    expect(enhanced).toContain("navbar-route-status");
    expect(enhanced).toContain('aria-busy="true"');
  });

  it("uses site-navigation semantics and invokes no preview renderer while disabled", () => {
    const renderer = vi.fn(() => "Preview");
    const items = [
      {
        id: "library",
        label: "Library",
        links: [{ href: "#components", id: "components", label: "Components" }],
        type: "group" as const,
      },
    ];
    const plain = renderToStaticMarkup(<NavigationMenu items={items} />);
    renderToStaticMarkup(<NavigationMenu items={items} renderLinkPreview={renderer} />);
    expect(plain).toContain("<nav");
    expect(plain).toContain('aria-expanded="false"');
    expect(plain).not.toMatch(/role="(?:menu|menubar|menuitem)"/u);
    expect(plain).not.toContain("navigation-menu-preview");
    expect(renderer).not.toHaveBeenCalled();
  });

  it("does not touch persistence when the sidebar adapter is omitted or during server render", () => {
    const read = vi.fn(() => true);
    const write = vi.fn();
    const groups = [
      { id: "docs", items: [{ href: "#start", id: "start", label: "Start" }], label: "Docs" },
    ] as const;
    const plain = renderToStaticMarkup(<Sidebar groups={groups} />);
    const enhanced = renderToStaticMarkup(
      <Sidebar groups={groups} persistenceAdapter={{ read, write }} />,
    );
    expect(plain).not.toContain("data-enhanced-persistence");
    expect(enhanced).toContain("data-enhanced-persistence");
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("P5 process, content, guidance, and tree semantics", () => {
  it("keeps progress, summary, and announcements independently removable", () => {
    const steps = [
      { id: "one", label: "One" },
      { id: "two", label: "Two", state: "error" as const },
    ];
    const plain = renderToStaticMarkup(<Stepper steps={steps} value="one" />);
    const enhanced = renderToStaticMarkup(
      <Stepper
        announceStepChanges
        renderProgressSummary={() => "One step remains"}
        showProgressBar
        steps={steps}
        value="one"
      />,
    );
    expect(plain).not.toContain("<progress");
    expect(plain).not.toContain("stepper-summary");
    expect(plain).not.toContain("stepper-announcement");
    expect(plain).not.toContain("<output");
    expect(enhanced).toContain("<progress");
    expect(enhanced).toContain("One step remains");
    expect(enhanced).toContain('role="status"');
    expect(enhanced).toContain('aria-invalid="true"');
    expect(enhanced).toContain("Error: ");
  });

  it("keeps TOC observation and summary absent from the plain path", () => {
    const items = [
      { id: "overview", label: "Overview", level: 2 },
      { id: "details", label: "Details", level: 3 },
    ] as const;
    const summary = vi.fn(() => "Section one of two");
    const plain = renderToStaticMarkup(
      <TableOfContents currentId="overview" items={items} observeCurrent={false} />,
    );
    const enhanced = renderToStaticMarkup(
      <TableOfContents
        currentId="overview"
        items={items}
        observeCurrent={{}}
        renderCurrentSummary={summary}
      />,
    );
    expect(plain).not.toContain("data-enhanced-observer");
    expect(plain).not.toContain("table-of-contents-summary");
    expect(enhanced).toContain("data-enhanced-observer");
    expect(enhanced).toContain("Section one of two");
    expect(summary).toHaveBeenCalledOnce();
  });

  it("renders tour guidance as non-modal and strips optional output", () => {
    const steps = [{ description: "Inspect the specimen.", id: "inspect", title: "Inspect" }];
    const plain = renderToStaticMarkup(<Tour defaultOpen steps={steps} />);
    const enhanced = renderToStaticMarkup(
      <Tour announceStepChanges defaultOpen showProgress steps={steps} />,
    );
    expect(plain).toContain('role="region"');
    expect(plain).not.toContain('role="dialog"');
    expect(plain).not.toContain("aria-modal");
    expect(plain).not.toContain("tour-progress");
    expect(plain).not.toContain("tour-announcement");
    expect(plain).not.toContain("tour-target-recovery");
    expect(enhanced).toContain("tour-progress");
    expect(enhanced).toContain("tour-announcement");
  });

  it("flattens expanded hierarchy with accurate positions and removes move actions", () => {
    expect(flattenTreeItems(treeItems, new Set(["root", "branch"]))).toMatchObject([
      { indexInParent: 0, item: { id: "root" }, level: 1, parentId: null, setSize: 1 },
      { indexInParent: 0, item: { id: "alpha" }, level: 2, parentId: "root", setSize: 2 },
      { indexInParent: 1, item: { id: "branch" }, level: 2, parentId: "root", setSize: 2 },
      { indexInParent: 0, item: { id: "nested" }, level: 3, parentId: "branch", setSize: 1 },
    ]);
    const plain = renderToStaticMarkup(
      <TreeView
        defaultExpandedIds={["root"]}
        items={treeItems}
        label="Plain source tree"
        moveActions={false}
        selectionMode="none"
      />,
    );
    const enhanced = renderToStaticMarkup(
      <TreeView
        defaultExpandedIds={["root"]}
        items={treeItems}
        label="Movable source tree"
        moveActions={{ onMove: vi.fn() }}
        selectionMode="multiple"
      />,
    );
    expect(plain).toContain('role="tree"');
    expect(plain).toContain('role="treeitem"');
    expect(plain).not.toContain("aria-selected");
    expect(plain).not.toContain("tree-view-move-actions");
    expect(plain).not.toContain("data-enhanced-move-actions");
    expect(enhanced).toContain('aria-multiselectable="true"');
    expect(enhanced).toContain("tree-view-move-actions");
    expect(enhanced).toContain("Move up");
  });
});
