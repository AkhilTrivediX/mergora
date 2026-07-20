import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P5NavigationDisclosureComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P5NavigationDisclosureComponentProof.stories.tsx";
const evidencePath = "tests/storybook/navigation-disclosure-component-proof.test.tsx";
const disclosureAggregatePath = "apps/storybook/src/P2DisclosureNavigation.stories.tsx";
const navigationAggregatePath = "apps/storybook/src/P5NavigationSystems.stories.tsx";
const disclosureIds = new Set(["accordion", "breadcrumb", "collapsible", "pagination", "tabs"]);

const expectedItems = [
  {
    apiNames: ["renderExpansionSummary"],
    basic: "BasicAccordion",
    controls: ["expansionSummary"],
    id: "accordion",
    recommended: "RecommendedAccordion",
  },
  {
    apiNames: ["collapse", "maxVisible"],
    basic: "BasicBreadcrumb",
    controls: ["responsiveBreadcrumb"],
    id: "breadcrumb",
    recommended: "RecommendedBreadcrumb",
  },
  {
    apiNames: ["stateText"],
    basic: "BasicCollapsible",
    controls: ["collapsibleStateText"],
    id: "collapsible",
    recommended: "RecommendedCollapsible",
  },
  {
    apiNames: ["mode", "currentLabel", "previousHref", "nextHref"],
    basic: "BasicPagination",
    controls: ["cursorPagination"],
    id: "pagination",
    recommended: "RecommendedPagination",
  },
  {
    apiNames: ["keyboardHint"],
    basic: "BasicTabs",
    controls: ["keyboardHint"],
    id: "tabs",
    recommended: "RecommendedTabs",
  },
  {
    apiNames: ["overflow"],
    basic: "BasicBottomNavigation",
    controls: ["bottomOverflow"],
    id: "bottom-navigation",
    recommended: "RecommendedBottomNavigation",
  },
  {
    apiNames: ["routeStatus"],
    basic: "BasicNavbar",
    controls: ["navbarRouteStatus"],
    id: "navbar",
    recommended: "RecommendedNavbar",
  },
  {
    apiNames: ["renderLinkPreview", "previewLabel"],
    basic: "BasicNavigationMenu",
    controls: ["navigationPreview"],
    id: "navigation-menu",
    recommended: "RecommendedNavigationMenu",
  },
  {
    apiNames: ["persistenceAdapter", "onPersistenceError"],
    basic: "BasicSidebar",
    controls: ["sidebarPersistence"],
    id: "sidebar",
    recommended: "RecommendedSidebar",
  },
  {
    apiNames: ["showProgressBar", "renderProgressSummary", "announceStepChanges"],
    basic: "BasicStepper",
    controls: ["stepperProgress", "stepperSummary", "stepperAnnouncements"],
    id: "stepper",
    recommended: "RecommendedStepper",
  },
  {
    apiNames: ["observeCurrent", "renderCurrentSummary"],
    basic: "BasicTableOfContents",
    controls: ["tocObserver", "tocSummary"],
    id: "table-of-contents",
    recommended: "RecommendedTableOfContents",
  },
  {
    apiNames: ["routeAdapter", "targetRecovery", "showProgress", "announceStepChanges"],
    basic: "BasicTour",
    controls: ["tourRouteAdapter", "tourTargetRecovery", "tourProgress", "tourAnnouncements"],
    id: "tour",
    recommended: "RecommendedTour",
  },
  {
    apiNames: ["moveActions"],
    basic: "BasicTreeView",
    controls: ["treeMoveActions"],
    id: "tree-view",
    recommended: "RecommendedTreeView",
  },
] as const;

type Args = Record<string, boolean>;
type RenderableStory = {
  readonly args?: Partial<Args>;
  readonly parameters?: { readonly controls?: { readonly include?: readonly string[] } };
  readonly render?: (args: Args) => ReactElement;
};

const stories = storyModule as unknown as Record<string, RenderableStory>;
const defaultArgs = storyMeta.args as Args;

function story(name: string): RenderableStory {
  const value = stories[name];
  expect(value, name).toBeDefined();
  expect(value?.render, name).toBeTypeOf("function");
  return value!;
}

function renderStory(name: string, overrides: Partial<Args> = {}): string {
  const value = story(name);
  return renderToStaticMarkup(
    value.render!({ ...defaultArgs, ...value.args, ...overrides } as Args),
  );
}

describe("navigation and disclosure component-specific Storybook evidence", () => {
  it("maps every item to unique Basic and Recommended exports with all enhancement controls", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(
          workspaceRoot,
          "registry/quality/implementation-profiles/navigation-disclosure.v1.json",
        ),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        blockers: { code: string }[];
        maturityAssessment: { status: string };
        optionalEnhancements: {
          api: { names: string[] };
          storybookControlNames: string[];
        }[];
        storybook: {
          basic: {
            status: string;
            mode: string;
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
          enhanced: {
            status: string;
            mode: string;
            modulePath: string;
            exportName: string;
            enhancementControls: string[];
            references: { location: string }[];
          };
        };
      }[];
    };
    const profileById = new Map(shard.profiles.map((profile) => [profile.id, profile]));
    const pointers: string[] = [];

    expect([...profileById.keys()].sort()).toEqual(expectedItems.map(({ id }) => id).sort());
    for (const expected of expectedItems) {
      const profile = profileById.get(expected.id)!;
      expect(profile.optionalEnhancements).toHaveLength(1);
      expect(profile.optionalEnhancements[0]?.api.names).toEqual(expected.apiNames);
      expect(profile.optionalEnhancements[0]?.storybookControlNames).toEqual(expected.controls);
      expect(profile.storybook.basic).toMatchObject({
        enhancementControls: expected.controls,
        exportName: expected.basic,
        mode: "basic-enhancements-disabled",
        modulePath: storyPath,
        status: "tested",
      });
      expect(profile.storybook.enhanced).toMatchObject({
        enhancementControls: expected.controls,
        exportName: expected.recommended,
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        status: "tested",
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      const aggregatePath = disclosureIds.has(expected.id)
        ? disclosureAggregatePath
        : navigationAggregatePath;
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        aggregatePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        aggregatePath,
      );
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.blockers.length).toBeGreaterThan(0);
      expect(profile.maturityAssessment.status).toBe("not-ready");

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      for (const control of expected.controls) {
        expect(basic.args?.[control]).toBe(false);
        expect(recommended.args?.[control]).toBe(true);
      }
      expect(basic.parameters?.controls?.include).toEqual(expected.controls);
      expect(recommended.parameters?.controls?.include).toEqual(expected.controls);
      pointers.push(expected.basic, expected.recommended);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports every canonical item directly instead of routing through aggregate workbenches", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("NavigationWorkbench");
    expect(source).not.toContain("NavigationModes");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("renders direct Basic and Recommended contracts with enhancement-off output clean", () => {
    const rendered = Object.fromEntries(
      expectedItems.map(({ id, basic, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );

    for (const { id } of expectedItems) {
      expect(rendered[id]!.basic).toContain(`data-story-item="${id}"`);
      expect(rendered[id]!.recommended).toContain(`data-story-item="${id}"`);
    }

    expect(rendered.accordion!.basic).not.toContain('data-slot="accordion-expansion-summary"');
    expect(rendered.accordion!.basic).not.toContain('role="status"');
    expect(rendered.accordion!.recommended).toContain('data-slot="accordion-expansion-summary"');
    expect(rendered.accordion!.recommended).toContain('aria-live="polite"');

    expect(rendered.breadcrumb!.basic).not.toContain('data-view="compact"');
    expect(rendered.breadcrumb!.basic).not.toContain("<details");
    expect(rendered.breadcrumb!.recommended).toContain('data-view="compact"');
    expect(rendered.breadcrumb!.recommended).toContain("<details");

    expect(rendered.collapsible!.basic).not.toContain('data-slot="collapsible-state-text"');
    expect(rendered.collapsible!.recommended).toContain('data-slot="collapsible-state-text"');
    expect(rendered.collapsible!.recommended).toContain("Expanded");

    expect(rendered.pagination!.basic).toContain('data-mode="pages"');
    expect(rendered.pagination!.basic).not.toContain("Items 41 through 60");
    expect(rendered.pagination!.recommended).toContain('data-mode="cursor"');
    expect(rendered.pagination!.recommended).toContain("Items 41 through 60");

    expect(rendered.tabs!.basic).not.toContain('data-slot="tabs-keyboard-hint"');
    expect(rendered.tabs!.recommended).toContain('data-slot="tabs-keyboard-hint"');
    expect(rendered.tabs!.recommended).toContain("Use arrow keys to move");

    expect(rendered["bottom-navigation"]!.basic).not.toContain(
      'data-slot="bottom-navigation-overflow"',
    );
    expect(rendered["bottom-navigation"]!.basic).not.toContain("data-enhanced-overflow=");
    expect(rendered["bottom-navigation"]!.recommended).toContain(
      'data-slot="bottom-navigation-overflow"',
    );
    expect(rendered["bottom-navigation"]!.recommended).toContain("<details");

    expect(rendered.navbar!.basic).not.toContain('data-slot="navbar-route-status"');
    expect(rendered.navbar!.basic).not.toContain("aria-busy=");
    expect(rendered.navbar!.recommended).toContain('data-slot="navbar-route-status"');
    expect(rendered.navbar!.recommended).toContain('aria-busy="true"');
    expect(rendered.navbar!.recommended).toContain('aria-live="polite"');

    expect(rendered["navigation-menu"]!.basic).not.toContain("data-enhanced-preview=");
    expect(rendered["navigation-menu"]!.basic).not.toContain('data-slot="navigation-menu-preview"');
    expect(rendered["navigation-menu"]!.recommended).toContain('data-enhanced-preview=""');

    expect(rendered.sidebar!.basic).not.toContain("data-enhanced-persistence=");
    expect(rendered.sidebar!.basic).not.toContain('data-slot="sidebar-persistence-proof"');
    expect(rendered.sidebar!.recommended).toContain('data-enhanced-persistence=""');
    expect(rendered.sidebar!.recommended).toContain('data-slot="sidebar-persistence-proof"');

    expect(rendered.stepper!.basic).not.toContain('data-slot="stepper-progress"');
    expect(rendered.stepper!.basic).not.toContain('data-slot="stepper-summary"');
    expect(rendered.stepper!.basic).not.toContain('data-slot="stepper-announcement"');
    expect(rendered.stepper!.recommended).toContain('data-slot="stepper-progress"');
    expect(rendered.stepper!.recommended).toContain('data-slot="stepper-summary"');
    expect(rendered.stepper!.recommended).toContain('data-slot="stepper-announcement"');

    expect(rendered["table-of-contents"]!.basic).not.toContain("data-enhanced-observer=");
    expect(rendered["table-of-contents"]!.basic).not.toContain(
      'data-slot="table-of-contents-summary"',
    );
    expect(rendered["table-of-contents"]!.recommended).toContain('data-enhanced-observer=""');
    expect(rendered["table-of-contents"]!.recommended).toContain(
      'data-slot="table-of-contents-summary"',
    );

    expect(rendered.tour!.basic).not.toContain("data-route-adapter-enabled=");
    expect(rendered.tour!.basic).not.toContain("data-target-recovery-enabled=");
    expect(rendered.tour!.basic).not.toContain('data-slot="tour-integration-proof"');
    expect(rendered.tour!.basic).not.toContain('data-slot="tour-progress"');
    expect(rendered.tour!.basic).not.toContain('data-slot="tour-announcement"');
    expect(rendered.tour!.recommended).toContain('data-route-adapter-enabled="true"');
    expect(rendered.tour!.recommended).toContain('data-target-recovery-enabled="true"');
    expect(rendered.tour!.recommended).toContain('data-slot="tour-integration-proof"');
    expect(rendered.tour!.recommended).toContain('data-slot="tour-progress"');
    expect(rendered.tour!.recommended).toContain('data-slot="tour-announcement"');

    expect(rendered["tree-view"]!.basic).not.toContain("data-enhanced-move-actions=");
    expect(rendered["tree-view"]!.basic).not.toContain('data-slot="tree-view-move-actions"');
    expect(rendered["tree-view"]!.basic).not.toContain('data-slot="tree-move-proof"');
    expect(rendered["tree-view"]!.recommended).toContain('data-enhanced-move-actions=""');
    expect(rendered["tree-view"]!.recommended).toContain('data-slot="tree-view-move-actions"');
    expect(rendered["tree-view"]!.recommended).toContain('data-slot="tree-move-proof"');
  });

  it("keeps each multi-part enhancement independently selectable", () => {
    const stepperProgressOnly = renderStory("BasicStepper", { stepperProgress: true });
    expect(stepperProgressOnly).toContain('data-slot="stepper-progress"');
    expect(stepperProgressOnly).not.toContain('data-slot="stepper-summary"');
    expect(stepperProgressOnly).not.toContain('data-slot="stepper-announcement"');
    const stepperSummaryOnly = renderStory("BasicStepper", { stepperSummary: true });
    expect(stepperSummaryOnly).not.toContain('data-slot="stepper-progress"');
    expect(stepperSummaryOnly).toContain('data-slot="stepper-summary"');
    expect(stepperSummaryOnly).not.toContain('data-slot="stepper-announcement"');
    const stepperAnnouncementOnly = renderStory("BasicStepper", {
      stepperAnnouncements: true,
    });
    expect(stepperAnnouncementOnly).not.toContain('data-slot="stepper-progress"');
    expect(stepperAnnouncementOnly).not.toContain('data-slot="stepper-summary"');
    expect(stepperAnnouncementOnly).toContain('data-slot="stepper-announcement"');

    const observerOnly = renderStory("BasicTableOfContents", { tocObserver: true });
    expect(observerOnly).toContain('data-enhanced-observer=""');
    expect(observerOnly).not.toContain('data-slot="table-of-contents-summary"');
    const tocSummaryOnly = renderStory("BasicTableOfContents", { tocSummary: true });
    expect(tocSummaryOnly).not.toContain("data-enhanced-observer=");
    expect(tocSummaryOnly).toContain('data-slot="table-of-contents-summary"');

    const routeOnly = renderStory("BasicTour", { tourRouteAdapter: true });
    expect(routeOnly).toContain('data-route-adapter-enabled="true"');
    expect(routeOnly).not.toContain("data-target-recovery-enabled=");
    expect(routeOnly).not.toContain('data-slot="tour-progress"');
    expect(routeOnly).not.toContain('data-slot="tour-announcement"');
    const recoveryOnly = renderStory("BasicTour", { tourTargetRecovery: true });
    expect(recoveryOnly).not.toContain("data-route-adapter-enabled=");
    expect(recoveryOnly).toContain('data-target-recovery-enabled="true"');
    expect(recoveryOnly).not.toContain('data-slot="tour-progress"');
    expect(recoveryOnly).not.toContain('data-slot="tour-announcement"');
    const tourProgressOnly = renderStory("BasicTour", { tourProgress: true });
    expect(tourProgressOnly).toContain('data-slot="tour-progress"');
    expect(tourProgressOnly).not.toContain('data-slot="tour-announcement"');
    expect(tourProgressOnly).not.toContain('data-slot="tour-integration-proof"');
    const tourAnnouncementOnly = renderStory("BasicTour", { tourAnnouncements: true });
    expect(tourAnnouncementOnly).not.toContain('data-slot="tour-progress"');
    expect(tourAnnouncementOnly).toContain('data-slot="tour-announcement"');
    expect(tourAnnouncementOnly).not.toContain('data-slot="tour-integration-proof"');
  });
});
