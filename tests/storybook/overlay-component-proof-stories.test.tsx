import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P2OverlayComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P2OverlayComponentProof.stories.tsx";
const evidencePath = "tests/storybook/overlay-component-proof-stories.test.tsx";

const expectedItems = [
  {
    basic: "BasicAlertDialog",
    controls: ["alertAcknowledgement"],
    id: "alert-dialog",
    recommended: "RecommendedAlertDialog",
  },
  {
    basic: "BasicDialog",
    controls: ["dialogDismissHint"],
    id: "dialog",
    recommended: "RecommendedDialog",
  },
  {
    basic: "BasicPopover",
    controls: ["popoverAnchorContext", "popoverManagedFocus"],
    id: "popover",
    recommended: "RecommendedPopover",
  },
  {
    basic: "BasicSheet",
    controls: ["sheetProgress"],
    id: "sheet",
    recommended: "RecommendedSheet",
  },
  {
    basic: "BasicTooltip",
    controls: ["tooltipDisabledAdapter", "tooltipShortcut"],
    id: "tooltip",
    recommended: "RecommendedTooltip",
  },
  {
    basic: "BasicContextMenu",
    controls: ["contextHint", "dropdownSummary", "dropdownConfirm"],
    id: "context-menu",
    recommended: "RecommendedContextMenu",
  },
  {
    basic: "BasicDrawer",
    controls: ["drawerSwipe"],
    id: "drawer",
    recommended: "RecommendedDrawer",
  },
  {
    basic: "BasicDropdownMenu",
    controls: ["dropdownSummary", "dropdownConfirm"],
    id: "dropdown-menu",
    recommended: "RecommendedDropdownMenu",
  },
  {
    basic: "BasicHoverCard",
    controls: ["hoverPin"],
    id: "hover-card",
    recommended: "RecommendedHoverCard",
  },
  {
    basic: "BasicLightbox",
    controls: ["lightboxSummary", "lightboxZoom", "lightboxSwipe"],
    id: "lightbox",
    recommended: "RecommendedLightbox",
  },
  {
    basic: "BasicMenubar",
    controls: ["menubarGuide", "menubarOpenOnFocus", "dropdownSummary", "dropdownConfirm"],
    id: "menubar",
    recommended: "RecommendedMenubar",
  },
  {
    basic: "BasicToast",
    controls: ["toastQueueSummary", "toastPauseControls"],
    id: "toast",
    recommended: "RecommendedToast",
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

function renderStory(name: string): string {
  const value = story(name);
  return renderToStaticMarkup(value.render!({ ...defaultArgs, ...value.args } as Args));
}

describe("overlay component-specific Storybook evidence", () => {
  it("maps every item to unique Basic and Recommended exports with exact controls", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/overlays.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        interactionEvidence: { status: string };
        blockers: { code: string }[];
        maturityAssessment: { status: string };
        optionalEnhancements: {
          defaultEnabled: boolean;
          disabledBehavior: Record<"accessibility" | "behavior" | "events" | "ui", string>;
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
      expect(profile.interactionEvidence.status).toBe("verified");
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.blockers.map(({ code }) => code)).toContain(
        "manual-assistive-technology-records-missing",
      );
      expect(profile.maturityAssessment.status).toBe("not-ready");

      for (const enhancement of profile.optionalEnhancements) {
        expect(enhancement.defaultEnabled).toBe(false);
        expect(Object.keys(enhancement.disabledBehavior).sort()).toEqual([
          "accessibility",
          "behavior",
          "events",
          "ui",
        ]);
        for (const statement of Object.values(enhancement.disabledBehavior)) {
          expect(statement.trim().length).toBeGreaterThan(0);
        }
      }

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      expect(basic.parameters?.controls?.include).toEqual(expected.controls);
      expect(recommended.parameters?.controls?.include).toEqual(expected.controls);
      for (const control of expected.controls) {
        expect(basic.args?.[control]).toBe(false);
        expect(recommended.args?.[control]).toBe(true);
      }
      pointers.push(expected.basic, expected.recommended);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports and renders every canonical component directly", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { basic, id, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
      expect(renderStory(basic)).toContain(`data-story-item="${id}"`);
      expect(renderStory(recommended)).toContain(`data-story-item="${id}"`);
    }
    expect(source).not.toContain("P2Overlays");
    expect(source).not.toContain("P5OverlaySystems");
  });

  it("removes optional output from Basic markup and conditionally forwards every capability", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");
    const rendered = Object.fromEntries(
      expectedItems.map(({ basic, id, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );
    const featureSlots: Readonly<Record<string, readonly string[]>> = {
      "alert-dialog": ["alert-dialog-acknowledgement-input"],
      "context-menu": ["context-menu-invocation-hint", "dropdown-menu-selection-summary"],
      dialog: ["dialog-dismiss-hint"],
      drawer: ["drawer-swipe-handle"],
      "dropdown-menu": ["dropdown-menu-selection-summary"],
      "hover-card": ["hover-card-pin-rail"],
      lightbox: ["lightbox-position-summary", "lightbox-zoom-controls"],
      menubar: ["menubar-keyboard-guide", "dropdown-menu-selection-summary"],
      popover: ["popover-anchor-context"],
      sheet: ["sheet-progress"],
      toast: ["toast-queue-summary", "toast-pause-control"],
      tooltip: ["tooltip-disabled-trigger", "tooltip-shortcut"],
    };

    for (const { id } of expectedItems) {
      for (const slot of featureSlots[id] ?? []) {
        expect(rendered[id]!.basic, `${id} Basic must omit ${slot}`).not.toContain(slot);
      }
    }

    // Non-portalled enhancement output is present in the server proof. React Aria deliberately
    // defers overlay portals until the Storybook canvas mounts; those paths retain the existing
    // cross-browser evidence linked from the profile.
    for (const slot of [
      "context-menu-invocation-hint",
      "menubar-keyboard-guide",
      "toast-queue-summary",
      "toast-pause-control",
      "tooltip-disabled-trigger",
    ]) {
      expect(
        Object.values(rendered).some(({ recommended }) => recommended.includes(slot)),
        `Recommended stories must render ${slot}`,
      ).toBe(true);
    }

    for (const conditional of [
      /acknowledgement\s*\?\s*\{\s*acknowledgementLabel:/u,
      /dismissHint\s*\?\s*\{\s*dismissHint:/u,
      /anchorContext\s*\?\s*\{\s*anchorContext:/u,
      /managedFocus\s*\?\s*\{\s*initialFocus:/u,
      /progress\s*\?\s*\{\s*progress:/u,
      /disabledAdapter\s*\?\s*\(/u,
      /shortcut\s*\?\s*\{\s*shortcut:/u,
      /confirm\s*\?\s*\{\s*confirmDestructiveActions:/u,
      /hint\s*\?\s*\{\s*showInvocationHint:/u,
      /summary\s*\?\s*\{\s*selectionSummary:/u,
      /swipe\s*\?\s*\{\s*swipeHandleLabel:/u,
      /pin\s*\?\s*\{\s*pinOnPress:/u,
      /positionSummary\s*\?\s*\{\s*showPositionSummary:/u,
      /swipe\s*\?\s*\{\s*swipeNavigation:/u,
      /zoom\s*\?\s*\{\s*defaultZoom:/u,
      /guide\s*\?\s*\{\s*keyboardGuide:/u,
      /openOnFocus\s*\?\s*\{\s*openMenuOnFocus:/u,
      /pauseControls\s*\?\s*\{\s*pauseControls:/u,
      /queueSummary\s*\?\s*\{\s*showQueueSummary:/u,
    ]) {
      expect(source, conditional.source).toMatch(conditional);
    }
  });
});
