import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("Storybook environment controls", () => {
  it("offers coherent theme, contrast, density, direction, motion, and viewport controls", () => {
    const preview = readFileSync(resolve(root, "apps/storybook/.storybook/preview.ts"), "utf8");
    for (const global of ["theme", "contrast", "density", "direction", "motion", "viewportMode"]) {
      expect(preview).toContain(`${global}: {`);
    }
    expect(preview).toContain('value: "forced-colors"');
    expect(preview).toContain('value: "reduced"');
    expect(preview).toContain('value: "rtl"');
    expect(preview).toContain('value: "narrow"');
    expect(preview).toContain('a11y: { test: "error" }');
  });

  it("maps preview modes through generated semantic tokens", () => {
    const tokens = readFileSync(resolve(root, "packages/tokens/src/generated/tokens.css"), "utf8");
    const previewCss = readFileSync(resolve(root, "apps/storybook/.storybook/preview.css"), "utf8");
    expect(tokens).toContain(':root[data-contrast="forced-colors"]');
    expect(tokens).toContain(':root[data-motion="reduced"]');
    expect(previewCss).toContain('html[data-viewport="mobile"]');
    expect(previewCss).toContain('html[data-viewport="narrow"]');
  });
});
