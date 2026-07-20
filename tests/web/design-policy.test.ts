import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const styles = readFileSync(
  resolve(import.meta.dirname, "../../apps/web/src/app/styles.css"),
  "utf8",
);

describe("site typography policy", () => {
  it("keeps narrative section labels inside the sans typography boundary", () => {
    const sharedLabelRule = styles.match(
      /\.home-hero__product,\s*\.site-eyebrow\s*\{(?<body>[\s\S]*?)\}/u,
    )?.groups?.body;
    expect(sharedLabelRule).toBeDefined();
    expect(sharedLabelRule).toContain("var(--mrg-semantic-font-family-prose)");
    expect(sharedLabelRule).not.toContain("font-family-code");
    expect(sharedLabelRule).not.toContain("text-transform: uppercase");

    const catalogLabelRule = styles.match(
      /\.catalog-browser__identity > p:first-child\s*\{(?<body>[\s\S]*?)\}/u,
    )?.groups?.body;
    expect(catalogLabelRule).toContain("var(--mrg-semantic-font-family-prose)");
    expect(catalogLabelRule).not.toContain("font-family-code");
    expect(catalogLabelRule).not.toContain("text-transform: uppercase");
  });

  it("does not exceed the documented display tracking floor", () => {
    const negativeTracking = [...styles.matchAll(/letter-spacing:\s*(-\d+(?:\.\d+)?)em/gu)].map(
      (match) => Number(match[1]),
    );
    expect(negativeTracking.length).toBeGreaterThan(0);
    expect(Math.min(...negativeTracking)).toBeGreaterThanOrEqual(-0.04);
  });
});
