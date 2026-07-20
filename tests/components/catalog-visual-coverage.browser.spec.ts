import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";

import {
  buildCatalogVisualCoveragePlan,
  parseCatalogVisualShard,
  selectCatalogVisualShard,
  type CatalogVisualCoverageManifest,
  type MatrixItem,
  type StorybookEntry,
} from "../visual/catalog-coverage-lib.mts";

const root = resolve(import.meta.dirname, "../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

const manifest = readJson("tests/visual/catalog-coverage.v1.json") as CatalogVisualCoverageManifest;
const matrix = readJson(manifest.catalog.implementationMatrix) as {
  readonly items?: readonly MatrixItem[];
};

test("@visual-catalog captures each catalog basic and enhanced Storybook specimen", async ({
  browserName,
  page,
}, testInfo) => {
  test.skip(
    process.env.MERGORA_CATALOG_VISUAL_COVERAGE !== "1",
    "Catalog-wide raster capture is an explicitly scheduled visual-evidence job; ordinary component browser runs stay bounded.",
  );
  test.skip(
    browserName !== "chromium",
    "Catalog raster coverage is pinned to Chromium by manifest policy.",
  );
  test.setTimeout(20 * 60_000);

  const indexResponse = await page.request.get("/index.json");
  expect(indexResponse.ok(), "Built Storybook index must be available").toBe(true);
  const storybookIndex = (await indexResponse.json()) as {
    readonly entries?: Readonly<Record<string, StorybookEntry>>;
  };
  const plan = buildCatalogVisualCoveragePlan({ manifest, matrix, storybookIndex });
  const shard = parseCatalogVisualShard(process.env.MERGORA_CATALOG_VISUAL_SHARD);
  const entries = selectCatalogVisualShard(plan.entries, shard);
  expect(entries.length, "A selected catalog visual shard must not be empty").toBeGreaterThan(0);

  await page.setViewportSize(manifest.capture.viewport);
  const captures: {
    readonly bytes: number;
    readonly digest: string;
    readonly itemId: string;
    readonly mode: string;
    readonly storyId: string;
  }[] = [];
  for (const entry of entries) {
    const url = `/iframe.html?viewMode=story&id=${encodeURIComponent(entry.storyId)}&globals=${encodeURIComponent(manifest.capture.globals)}`;
    const response = await page.goto(url, { waitUntil: "networkidle" });
    expect(response?.ok(), `${entry.itemId} ${entry.mode} Storybook iframe must resolve`).toBe(
      true,
    );
    const root = page.locator("#storybook-root");
    await expect(root, `${entry.itemId} ${entry.mode} must render Storybook canvas`).toBeVisible();
    await expect(
      root,
      `${entry.itemId} ${entry.mode} must not render an empty canvas`,
    ).not.toBeEmpty();
    await page.evaluate(async () => document.fonts.ready);
    const image = await page.screenshot({ animations: "disabled", caret: "hide", scale: "css" });
    expect(
      image.subarray(0, 8).toString("hex"),
      `${entry.itemId} ${entry.mode} must rasterize as PNG`,
    ).toBe("89504e470d0a1a0a");
    captures.push({
      bytes: image.byteLength,
      digest: `sha256:${createHash("sha256").update(image).digest("hex")}`,
      itemId: entry.itemId,
      mode: entry.mode,
      storyId: entry.storyId,
    });
  }

  await testInfo.attach("catalog-visual-capture-manifest", {
    body: JSON.stringify(
      {
        artifactKind: manifest.evidence.artifactKind,
        baselinePolicy: manifest.evidence.baselinePolicy,
        captures,
        catalogFingerprint: plan.fingerprint,
        catalogItems: plan.itemCount,
        globals: manifest.capture.globals,
        renderedEntries: entries.length,
        shard,
        viewport: manifest.capture.viewport,
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
});
