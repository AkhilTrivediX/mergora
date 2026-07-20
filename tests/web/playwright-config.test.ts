import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("website browser build prerequisites", () => {
  it("rebuilds tokens before Storybook and the static website", () => {
    const config = readFileSync(resolve(import.meta.dirname, "playwright.config.ts"), "utf8");
    const tokenBuild = config.indexOf("--filter mergora-tokens build");
    const storybookBuild = config.indexOf("--filter @mergora/storybook build");
    const websiteBuild = config.indexOf("--filter @mergora/web build");
    const assembly = config.indexOf("scripts/assemble-quality-lab.mjs");

    expect(tokenBuild).toBeGreaterThan(-1);
    expect(storybookBuild).toBeGreaterThan(tokenBuild);
    expect(websiteBuild).toBeGreaterThan(storybookBuild);
    expect(assembly).toBeGreaterThan(websiteBuild);
  });
});
