import { captureFixtureVisual } from "./support/evidence.ts";
import { test, expect, loadFixture } from "./support/test.ts";

interface VisualMode {
  readonly id: string;
  readonly path: string;
  readonly colorScheme?: "dark" | "light";
  readonly forcedColors?: "active";
  readonly reducedMotion?: "reduce";
  readonly chromiumOnly?: boolean;
}

const modes: readonly VisualMode[] = [
  { id: "light", path: "/?theme=light", colorScheme: "light" },
  { id: "dark", path: "/?theme=dark", colorScheme: "dark" },
  { id: "enhanced-contrast", path: "/?theme=light&contrast=enhanced", colorScheme: "light" },
  { id: "rtl", path: "/?theme=light&dir=rtl", colorScheme: "light" },
  { id: "reduced-motion", path: "/?theme=light", reducedMotion: "reduce" },
  { id: "forced-colors", path: "/?theme=light", forcedColors: "active", chromiumOnly: true },
];

for (const mode of modes) {
  test(`@visual captures deterministic ${mode.id} evidence`, async ({
    browser,
    browserName,
    page,
  }, testInfo) => {
    test.skip(
      mode.chromiumOnly === true && browserName !== "chromium",
      "This Playwright forced-colors lane is Chromium-only.",
    );
    const width = 1280;
    const height = 800;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({
      ...(mode.colorScheme === undefined ? {} : { colorScheme: mode.colorScheme }),
      ...(mode.forcedColors === undefined ? {} : { forcedColors: mode.forcedColors }),
      ...(mode.reducedMotion === undefined ? {} : { reducedMotion: mode.reducedMotion }),
    });
    await loadFixture(page, mode.path);

    const first = await captureFixtureVisual({
      browser,
      mode: mode.id,
      page,
      projectName: testInfo.project.name,
      sequence: "first",
      width,
      height,
    });
    const second = await captureFixtureVisual({
      browser,
      mode: mode.id,
      page,
      projectName: testInfo.project.name,
      sequence: "second",
      width,
      height,
    });

    expect(second.digest).toBe(first.digest);
    await testInfo.attach(`${mode.id}-visual-evidence`, {
      body: JSON.stringify({ first, second }, null, 2),
      contentType: "application/json",
    });
  });
}
