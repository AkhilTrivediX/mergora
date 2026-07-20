import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import storyMeta, * as storyModule from "../../apps/storybook/src/P2FeedbackStatusComponentProof.stories.tsx";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const storyPath = "apps/storybook/src/P2FeedbackStatusComponentProof.stories.tsx";
const evidencePath = "tests/storybook/feedback-status-component-proof.test.tsx";

const expectedItems = [
  {
    id: "alert",
    controls: ["announceAlert"],
    basic: "BasicAlert",
    recommended: "RecommendedAlert",
    interaction: "verified",
  },
  {
    id: "badge",
    controls: ["showBadgeSemantics"],
    basic: "BasicBadge",
    recommended: "RecommendedBadge",
    interaction: "verified",
  },
  {
    id: "banner",
    controls: ["persistBannerDismissal"],
    basic: "BasicBanner",
    recommended: "RecommendedBanner",
    interaction: "verified",
  },
  {
    id: "callout",
    controls: ["landmarkCallout"],
    basic: "BasicCallout",
    recommended: "RecommendedCallout",
    interaction: "verified",
  },
  {
    id: "empty-state",
    controls: ["showRecoverySuggestions"],
    basic: "BasicEmptyState",
    recommended: "RecommendedEmptyState",
    interaction: "verified",
  },
  {
    id: "error-state",
    controls: ["showErrorDetails"],
    basic: "BasicErrorState",
    recommended: "RecommendedErrorState",
    interaction: "verified",
  },
  {
    id: "meter",
    controls: ["showMeterThresholds"],
    basic: "BasicMeter",
    recommended: "RecommendedMeter",
    interaction: "verified",
  },
  {
    id: "progress",
    controls: ["showProgressValue"],
    basic: "BasicProgress",
    recommended: "RecommendedProgress",
    interaction: "verified",
  },
  {
    id: "skeleton",
    controls: ["animateSkeleton"],
    basic: "BasicSkeleton",
    recommended: "RecommendedSkeleton",
    interaction: "verified",
  },
  {
    id: "spinner",
    controls: ["announceBusyState"],
    basic: "BasicSpinner",
    recommended: "RecommendedSpinner",
    interaction: "verified",
  },
  {
    id: "status",
    controls: ["liveStatus"],
    basic: "BasicStatus",
    recommended: "RecommendedStatus",
    interaction: "verified",
  },
  {
    id: "notification-center",
    controls: ["liveQueue", "grouped", "bulkActions", "virtualized", "announceReadChanges"],
    basic: "BasicNotificationCenter",
    recommended: "RecommendedNotificationCenter",
    interaction: "partial",
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

describe("feedback and status component-specific Storybook evidence", () => {
  it("maps all twelve inventory items to unique Basic and Recommended exports", () => {
    const shard = JSON.parse(
      readFileSync(
        resolve(workspaceRoot, "registry/quality/implementation-profiles/feedback-status.v1.json"),
        "utf8",
      ),
    ) as {
      profiles: {
        id: string;
        accessibilityEvidence: { status: string };
        blockers: unknown[];
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
        enhancementControls: expected.controls,
      });
      expect(profile.storybook.enhanced).toMatchObject({
        status: "tested",
        mode: "recommended-enhancements-enabled",
        modulePath: storyPath,
        exportName: expected.recommended,
        enhancementControls: expected.controls,
      });
      expect(profile.storybook.basic.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.storybook.enhanced.references.map(({ location }) => location)).toContain(
        evidencePath,
      );
      expect(profile.interactionEvidence.status).toBe(expected.interaction);
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

  it("imports every canonical item directly instead of routing through aggregate stories", () => {
    const source = readFileSync(resolve(workspaceRoot, storyPath), "utf8");

    for (const { id, basic, recommended } of expectedItems) {
      expect(source).toContain(`registry/source/components/${id}/index.ts`);
      expect(source).toContain(`export const ${basic}: Story`);
      expect(source).toContain(`export const ${recommended}: Story`);
    }
    expect(source).not.toContain("P2FeedbackStatus.stories");
    expect(source).not.toContain("P5NotificationCenter.stories");
    expect(source).not.toMatch(/switch\s*\(/u);
  });

  it("renders canonical components and removes disabled enhancement output completely", () => {
    const rendered = Object.fromEntries(
      expectedItems.map(({ id, basic, recommended }) => [
        id,
        { basic: renderStory(basic), recommended: renderStory(recommended) },
      ]),
    );

    for (const { id } of expectedItems) {
      expect(rendered[id]!.basic).toContain(`data-story-item="${id}"`);
      expect(rendered[id]!.recommended).toContain(`data-story-item="${id}"`);
      expect(rendered[id]!.basic).toContain(`data-slot="${id}"`);
      expect(rendered[id]!.recommended).toContain(`data-slot="${id}"`);
    }

    expect(rendered.alert!.basic).toContain('data-live="off"');
    expect(rendered.alert!.basic).not.toContain('data-slot="sr-announcer-polite"');
    expect(rendered.alert!.recommended).toContain('data-live="polite"');
    expect(rendered.alert!.recommended).toContain('data-slot="sr-announcer-polite"');

    expect(rendered.badge!.basic).toContain('data-kind="category"');
    expect(rendered.badge!.basic).not.toContain('data-slot="badge-status-label"');
    expect(rendered.badge!.basic).not.toContain("mrg-badge__sr-only");
    expect(rendered.badge!.recommended).toContain('data-slot="badge-status-label"');
    expect(rendered.badge!.recommended).toContain("mrg-badge__sr-only");
    expect(rendered.badge!.recommended).toContain('data-overflow="true"');

    expect(rendered.banner!.basic).not.toContain('data-slot="banner-dismiss"');
    expect(rendered.banner!.basic).not.toContain("data-persistence-pending");
    expect(rendered.banner!.recommended).toContain('data-slot="banner-dismiss"');
    expect(rendered.banner!.recommended).toContain('data-persistence-pending="true"');

    expect(rendered.callout!.basic).toContain('data-landmark="false"');
    expect(rendered.callout!.basic).not.toMatch(/<aside[^>]+data-slot="callout"/u);
    expect(rendered.callout!.recommended).toMatch(
      /<aside[^>]+aria-label="Source review guidance"[^>]+data-landmark="true"/u,
    );

    expect(rendered["empty-state"]!.basic).not.toContain('data-slot="empty-state-suggestions"');
    expect(rendered["empty-state"]!.recommended).toContain('data-slot="empty-state-suggestions"');

    expect(rendered["error-state"]!.basic).not.toContain('data-slot="error-state-details"');
    expect(rendered["error-state"]!.recommended).toContain('data-slot="error-state-details"');
    expect(rendered["error-state"]!.recommended).toContain("Request ID: public-example-18f2");

    expect(rendered.meter!.basic).not.toContain('data-slot="meter-thresholds"');
    expect(rendered.meter!.basic).not.toContain("aria-describedby");
    expect(rendered.meter!.recommended).toContain('data-slot="meter-thresholds"');
    expect(rendered.meter!.recommended).toContain("aria-describedby");

    expect(rendered.progress!.basic).not.toContain('data-slot="progress-value"');
    expect(rendered.progress!.basic).not.toMatch(/\saria-valuetext=/u);
    expect(rendered.progress!.recommended).toContain('data-slot="progress-value"');
    expect(rendered.progress!.recommended).toContain('aria-valuetext="72%"');

    expect(rendered.skeleton!.basic).not.toContain("data-animated");
    expect(rendered.skeleton!.recommended).toContain('data-animated="true"');
    expect(rendered.skeleton!.basic).toContain('aria-hidden="true"');

    expect(rendered.spinner!.basic).toContain('data-announcement="off"');
    expect(rendered.spinner!.basic).not.toContain('data-slot="sr-announcer-polite"');
    expect(rendered.spinner!.recommended).toContain('data-announcement="polite"');
    expect(rendered.spinner!.recommended).toContain('data-slot="sr-announcer-polite"');

    expect(rendered.status!.basic).toContain('data-live="off"');
    expect(rendered.status!.basic).not.toContain('role="status"');
    expect(rendered.status!.basic).not.toContain("aria-live");
    expect(rendered.status!.recommended).toContain('role="status"');
    expect(rendered.status!.recommended).toContain('aria-live="polite"');
    expect(rendered.status!.recommended).toContain('aria-atomic="true"');

    const basicNotifications = rendered["notification-center"]!.basic;
    const enhancedNotifications = rendered["notification-center"]!.recommended;
    for (const slot of [
      "notification-center-live-queue",
      "notification-center-bulk",
      "notification-center-virtual-after",
      "notification-center-announcer",
    ]) {
      expect(basicNotifications).not.toContain(`data-slot="${slot}"`);
      expect(enhancedNotifications).toContain(`data-slot="${slot}"`);
    }
    expect(basicNotifications).not.toContain("<h3");
    expect(enhancedNotifications).toContain("<h3");
    expect(basicNotifications).not.toContain('type="checkbox"');
    expect(enhancedNotifications).toContain('type="checkbox"');
  });
});
