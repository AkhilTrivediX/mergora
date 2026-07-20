import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

import { clearMergoraLocalData, MERGORA_LOCAL_DATA } from "../../apps/web/src/app/site-local-data";
import {
  applySitePreferences,
  DEFAULT_SITE_PREFERENCES,
  parseSitePreferences,
  readSitePreferences,
  SITE_PREFERENCE_STORAGE_KEYS,
  sitePreferenceBootstrap,
} from "../../apps/web/src/app/site-preferences";
import {
  navigationIsCurrent,
  routeAnnouncementMessage,
} from "../../apps/web/src/app/site-shell-model";

describe("site shell model", () => {
  it("matches only the active navigation branch", () => {
    expect(navigationIsCurrent("/components", "/components")).toBe(true);
    expect(navigationIsCurrent("/components/button", "/components")).toBe(true);
    expect(navigationIsCurrent("/component-notes", "/components")).toBe(false);
    expect(navigationIsCurrent("/docs", "/")).toBe(false);
  });

  it("parses bounded preferences and applies semantic root attributes", () => {
    const values = new Map<string, string>([
      [SITE_PREFERENCE_STORAGE_KEYS.theme, "dark"],
      [SITE_PREFERENCE_STORAGE_KEYS.density, "compact"],
      [SITE_PREFERENCE_STORAGE_KEYS.direction, "rtl"],
      [SITE_PREFERENCE_STORAGE_KEYS.motion, "reduced"],
    ]);
    const preferences = readSitePreferences({ getItem: (key) => values.get(key) ?? null });
    const root = { dataset: {} as DOMStringMap, dir: "", style: { colorScheme: "" } };

    expect(applySitePreferences(root, preferences, false)).toBe("dark");
    expect(root).toMatchObject({
      dataset: {
        density: "compact",
        densityPreference: "compact",
        direction: "rtl",
        directionPreference: "rtl",
        motion: "reduced",
        motionPreference: "reduced",
        theme: "dark",
        themePreference: "dark",
      },
      dir: "rtl",
      style: { colorScheme: "dark" },
    });

    values.set(SITE_PREFERENCE_STORAGE_KEYS.theme, "unsupported");
    expect(readSitePreferences({ getItem: (key) => values.get(key) ?? null }).theme).toBe("system");
    expect(
      readSitePreferences({
        getItem: () => {
          throw new Error("storage unavailable");
        },
      }),
    ).toEqual(DEFAULT_SITE_PREFERENCES);
    expect(parseSitePreferences(preferences)).toEqual(preferences);
    expect(parseSitePreferences({ ...preferences, direction: "sideways" })).toBeNull();
  });

  it("runs the fixed preference bootstrap before hydration without evaluating stored text", () => {
    const values = new Map<string, string>([
      [SITE_PREFERENCE_STORAGE_KEYS.theme, "light"],
      [SITE_PREFERENCE_STORAGE_KEYS.density, "touch"],
      [SITE_PREFERENCE_STORAGE_KEYS.direction, "rtl"],
      [SITE_PREFERENCE_STORAGE_KEYS.motion, "reduced"],
    ]);
    const documentElement = { dataset: {}, dir: "", style: { colorScheme: "" } };
    runInNewContext(sitePreferenceBootstrap(), {
      document: { documentElement },
      localStorage: { getItem: (key: string) => values.get(key) ?? null },
    });

    expect(documentElement).toMatchObject({
      dataset: {
        density: "touch",
        densityPreference: "touch",
        direction: "rtl",
        directionPreference: "rtl",
        motion: "reduced",
        motionPreference: "reduced",
        siteScript: "true",
        theme: "light",
        themePreference: "light",
      },
      dir: "rtl",
      style: { colorScheme: "light" },
    });
  });

  it("clears exactly the documented site, basket, and Studio keys", () => {
    const removed: string[] = [];
    const result = clearMergoraLocalData({ removeItem: (key) => removed.push(key) });
    const expected = MERGORA_LOCAL_DATA.map(({ key }) => key);

    expect(result).toEqual({ failed: [], removed: expected });
    expect(removed).toEqual(expected);
    expect(removed).not.toContain("unrelated.product.key");
  });

  it("builds concise, deduplicatable route announcements", () => {
    expect(routeAnnouncementMessage("  Button\n API  ")).toBe("Button API page loaded.");
    expect(routeAnnouncementMessage(null)).toBe("Page loaded.");
  });
});
