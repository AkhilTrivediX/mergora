import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildPublicApiDocs,
  type PublicApiDocs,
} from "../../tooling/registry-builder/src/public-api-docs.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");

const families = [
  {
    groups: ["NavbarItem", "NavbarProps", "NavbarRouteStatus", "NavbarSkipLink"],
    id: "navbar",
    ownerCounts: { NavbarItem: 4, NavbarProps: 12, NavbarRouteStatus: 2, NavbarSkipLink: 2 },
    publicExports: [
      "isSafeNavbarHref",
      "Navbar",
      "NavbarItem",
      "NavbarProps",
      "NavbarRouteStatus",
      "NavbarSkipLink",
    ],
    props: 20,
  },
  {
    groups: [
      "NavigationMenuGroupItem",
      "NavigationMenuItem",
      "NavigationMenuLinkItem",
      "NavigationMenuProps",
    ],
    id: "navigation-menu",
    ownerCounts: {
      NavigationMenuGroupItem: 4,
      NavigationMenuItem: 7,
      NavigationMenuLinkItem: 6,
      NavigationMenuProps: 9,
    },
    publicExports: [
      "isSafeNavigationMenuHref",
      "NavigationMenu",
      "NavigationMenuGroupItem",
      "NavigationMenuItem",
      "NavigationMenuLinkItem",
      "NavigationMenuProps",
    ],
    props: 26,
  },
  {
    groups: ["SidebarGroup", "SidebarItem", "SidebarPersistenceAdapter", "SidebarProps"],
    id: "sidebar",
    ownerCounts: {
      SidebarGroup: 4,
      SidebarItem: 5,
      SidebarPersistenceAdapter: 2,
      SidebarProps: 16,
    },
    publicExports: [
      "isSafeSidebarHref",
      "Sidebar",
      "SidebarGroup",
      "SidebarItem",
      "SidebarPersistenceAdapter",
      "SidebarProps",
    ],
    props: 27,
  },
  {
    groups: ["StepperProgressContext", "StepperProps", "StepperStep"],
    id: "stepper",
    ownerCounts: { StepperProgressContext: 4, StepperProps: 11, StepperStep: 5 },
    publicExports: [
      "Stepper",
      "StepperMode",
      "StepperProgressContext",
      "StepperProps",
      "StepperStep",
      "StepperStepState",
    ],
    props: 20,
  },
  {
    groups: [
      "TableOfContentsItem",
      "TableOfContentsObserverOptions",
      "TableOfContentsProps",
      "TableOfContentsSummaryContext",
    ],
    id: "table-of-contents",
    ownerCounts: {
      TableOfContentsItem: 5,
      TableOfContentsObserverOptions: 3,
      TableOfContentsProps: 8,
      TableOfContentsSummaryContext: 3,
    },
    publicExports: [
      "collectTableOfContentsItems",
      "isSafeTableOfContentsHref",
      "TableOfContents",
      "TableOfContentsItem",
      "TableOfContentsObserverOptions",
      "TableOfContentsProps",
      "TableOfContentsSummaryContext",
    ],
    props: 19,
  },
  {
    groups: [
      "TreeViewFlatItem",
      "TreeViewItem",
      "TreeViewLoadError",
      "TreeViewMoveActions",
      "TreeViewProps",
      "TreeViewVirtualWindow",
    ],
    id: "tree-view",
    ownerCounts: {
      TreeViewFlatItem: 5,
      TreeViewItem: 7,
      TreeViewLoadError: 2,
      TreeViewMoveActions: 3,
      TreeViewProps: 21,
      TreeViewVirtualWindow: 4,
    },
    publicExports: [
      "flattenTreeItems",
      "TreeView",
      "TreeViewDirection",
      "TreeViewFlatItem",
      "TreeViewItem",
      "TreeViewLoadError",
      "TreeViewMoveActions",
      "TreeViewMoveDirection",
      "TreeViewProps",
      "TreeViewSelectionMode",
      "TreeViewVirtualWindow",
    ],
    props: 42,
  },
] as const;

function docsFor(family: (typeof families)[number]): PublicApiDocs {
  const sourcePath = `registry/source/components/${family.id}/${family.id}.tsx`;
  return buildPublicApiDocs(
    {
      id: family.id,
      normalizedFiles: [
        {
          content: readFileSync(resolve(workspaceRoot, sourcePath), "utf8"),
          mediaType: "text/typescript-jsx",
          sourcePath,
        },
      ],
      publicExports: family.publicExports,
    },
    "client-island",
  );
}

describe("expanded navigation public API descriptions", () => {
  it("describes every deterministic prop and supporting-model row without review placeholders", () => {
    let groupCount = 0;
    let propCount = 0;

    for (const family of families) {
      const docs = docsFor(family);
      expect(
        docs.groups.map((group) => group.name),
        `${family.id} groups`,
      ).toEqual(family.groups);
      const propNames = docs.props.map((prop) => `${prop.owner}.${prop.name}`);
      expect(propNames, `${family.id} ordering`).toEqual(
        [...propNames].sort((left, right) => left.localeCompare(right, "en-US")),
      );
      expect(docs.summary.props, family.id).toBe(family.props);
      expect(docs.summary.describedProps, family.id).toBe(family.props);
      for (const prop of docs.props) {
        const key = `${family.id}:${prop.owner}.${prop.name}`;
        expect(prop.description?.length, key).toBeGreaterThanOrEqual(28);
        expect(prop.description, key).not.toMatch(/^(?:The|This) (?:prop|property)\b/iu);
        expect(prop.localizationBehavior, key).not.toBe("review-required");
        expect(prop.semanticContract, key).not.toBe("review-required");
      }
      const actualOwnerCounts = Object.fromEntries(
        docs.groups.map((group) => [
          group.name,
          docs.props.filter((prop) => prop.owner === group.name).length,
        ]),
      );
      expect(actualOwnerCounts, `${family.id} owner counts`).toEqual(family.ownerCounts);
      groupCount += docs.summary.propGroups;
      propCount += docs.summary.props;
    }

    expect({ groupCount, propCount }).toEqual({ groupCount: 25, propCount: 154 });
  });

  it("ties keyboard, responsive, controlled-state, and optional-enhancement claims to APIs", () => {
    const descriptions = new Map(
      families.flatMap((family) =>
        docsFor(family).props.map(
          (prop) => [`${family.id}:${prop.owner}.${prop.name}`, prop.description] as const,
        ),
      ),
    );

    expect(descriptions.get("navbar:NavbarProps.items")).toContain("narrow mobile");
    expect(descriptions.get("navbar:NavbarProps.onNavigate")).toContain("preventDefault");
    expect(descriptions.get("navbar:NavbarProps.routeStatus")).toContain("removes its output");
    expect(descriptions.get("navigation-menu:NavigationMenuProps.onOpenGroupChange")).toContain(
      "keyboard",
    );
    expect(descriptions.get("navigation-menu:NavigationMenuProps.renderLinkPreview")).toContain(
      "removes its focus/pointer handlers and region",
    );
    expect(descriptions.get("sidebar:SidebarProps.mobileOpen")).toContain(
      "trigger-focus restoration",
    );
    expect(descriptions.get("sidebar:SidebarProps.persistenceAdapter")).toContain(
      "removes storage reads, writes, and failures",
    );
    expect(descriptions.get("stepper:StepperProps.navigable")).toContain("native buttons");
    expect(descriptions.get("stepper:StepperProps.renderProgressSummary")).toContain(
      "does not call the formatter",
    );
    expect(descriptions.get("table-of-contents:TableOfContentsProps.observeCurrent")).toContain(
      "create no observer",
    );
    expect(descriptions.get("table-of-contents:TableOfContentsItem.level")).toContain(
      "logical indentation",
    );
    expect(descriptions.get("tree-view:TreeViewProps.direction")).toContain(
      "horizontal expand/parent arrow keys",
    );
    expect(descriptions.get("tree-view:TreeViewProps.moveActions")).toContain(
      "no buttons or move callbacks",
    );
    expect(descriptions.get("tree-view:TreeViewProps.virtualWindow")).toContain(
      "render all rows without virtual spacers",
    );
  });
});
