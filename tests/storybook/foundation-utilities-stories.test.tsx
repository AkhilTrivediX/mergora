import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P2FoundationUtilities.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P2FoundationUtilities.stories.tsx";
const evidencePath = "tests/storybook/foundation-utilities-stories.test.tsx";

const expectedItems = [
  {
    id: "client-only",
    control: "clientReadyNotification",
    basic: "BasicClientOnly",
    recommended: "RecommendedClientOnly",
  },
  {
    id: "direction",
    control: "directionIsolation",
    basic: "BasicDirection",
    recommended: "RecommendedDirection",
  },
  {
    id: "focus-ring",
    control: "strongFocus",
    basic: "BasicFocusRing",
    recommended: "RecommendedFocusRing",
  },
  {
    id: "layer-manager",
    control: "layerEnvironment",
    basic: "BasicLayerManager",
    recommended: "RecommendedLayerManager",
  },
  {
    id: "portal",
    control: "portalFallback",
    basic: "BasicPortal",
    recommended: "RecommendedPortal",
  },
  {
    id: "presence",
    control: "presenceInitialEnter",
    basic: "BasicPresence",
    recommended: "RecommendedPresence",
  },
  {
    id: "provider",
    control: "providerAsChild",
    basic: "BasicProvider",
    recommended: "RecommendedProvider",
  },
  {
    id: "slot",
    control: "slotHandler",
    basic: "BasicSlot",
    recommended: "RecommendedSlot",
  },
  {
    id: "sr-announcer",
    control: "announcementRepeats",
    basic: "BasicSrAnnouncer",
    recommended: "RecommendedSrAnnouncer",
  },
  {
    id: "visually-hidden",
    control: "revealSkipLink",
    basic: "BasicVisuallyHidden",
    recommended: "RecommendedVisuallyHidden",
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

describe("foundation utility component-specific Storybook evidence", () => {
  it("maps every item to unique Basic and Recommended exports with one exact enhancement control", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(
          workspaceRoot,
          "registry/quality/implementation-profiles/foundation-utilities.v1.json",
        ),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        interactionEvidence: { status: string };
        maturityAssessment: { status: string };
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
        status: "tested",
        mode: "basic-enhancements-disabled",
        modulePath: storyPath,
        exportName: expected.basic,
        enhancementControls: [expected.control],
      });
      expect(profile.storybook.enhanced).toMatchObject({
        status: "tested",
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        exportName: expected.recommended,
        enhancementControls: [expected.control],
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.interactionEvidence.status).toBe("partial");
      expect(profile.accessibilityEvidence.status).toBe("partial");
      expect(profile.maturityAssessment.status).toBe("not-ready");

      const basic = story(expected.basic);
      const recommended = story(expected.recommended);
      expect(basic.args?.[expected.control]).toBe(false);
      expect(recommended.args?.[expected.control]).toBe(true);
      expect(basic.parameters?.controls?.include).toEqual([expected.control]);
      expect(recommended.parameters?.controls?.include).toEqual([expected.control]);
      pointers.push(expected.basic, expected.recommended);
    }

    expect(new Set(pointers).size).toBe(expectedItems.length * 2);
  });

  it("imports every canonical item directly instead of routing the stories through an aggregate alias", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("ContextInfrastructure");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("renders the actual basic and enhanced contracts while keeping enhancement-off output clean", () => {
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

    expect(rendered["client-only"]!.basic).not.toContain("Readiness callbacks");
    expect(rendered["client-only"]!.recommended).toContain("Readiness callbacks: 0");
    expect(rendered.direction!.basic).not.toContain("data-bidi-isolate");
    expect(rendered.direction!.recommended).toContain('data-bidi-isolate="true"');
    expect(rendered["focus-ring"]!.basic).toContain('data-focus-ring-contrast="standard"');
    expect(rendered["focus-ring"]!.recommended).toContain('data-focus-ring-contrast="strong"');
    expect(rendered["layer-manager"]!.basic).toContain('data-layer-modal="false"');
    expect(rendered["layer-manager"]!.basic).toContain('data-layer-manages-environment="false"');
    expect(rendered["layer-manager"]!.recommended).toContain('data-layer-modal="true"');
    expect(rendered["layer-manager"]!.recommended).toContain(
      'data-layer-manages-environment="true"',
    );
    expect(rendered.portal!.basic).not.toContain('role="status"');
    expect(rendered.portal!.recommended).toContain('role="status"');
    expect(rendered.presence!.basic).toContain('data-presence="entered"');
    expect(rendered.presence!.recommended).toContain('data-presence="entering"');
    expect(rendered.provider!.basic).toMatch(/<div[^>]+data-slot="provider"/u);
    expect(rendered.provider!.recommended).toMatch(/<section[^>]+data-slot="provider"/u);
    expect(rendered.slot!.basic).not.toContain("Slot orchestration events");
    expect(rendered.slot!.recommended).toContain("Slot orchestration events: 0");
    expect(rendered["sr-announcer"]!.basic).not.toContain("Repeat intentionally");
    expect(rendered["sr-announcer"]!.recommended).toContain("Repeat intentionally");
    expect(rendered["visually-hidden"]!.basic).not.toContain("Skip to primary content");
    expect(rendered["visually-hidden"]!.recommended).toContain("Skip to primary content");
  });
});
