import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCatalogVisualCoveragePlan,
  parseCatalogVisualShard,
  selectCatalogVisualShard,
  type CatalogVisualCoverageManifest,
  type MatrixItem,
  type StorybookEntry,
} from "./catalog-coverage-lib.mts";

const root = resolve(import.meta.dirname, "../..");

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(root, path), "utf8"));
}

const manifest = readJson("tests/visual/catalog-coverage.v1.json") as CatalogVisualCoverageManifest;
const matrix = readJson(manifest.catalog.implementationMatrix) as {
  readonly items?: readonly MatrixItem[];
};

function buildExpectedStorybookIndex(): {
  readonly entries: Readonly<Record<string, StorybookEntry>>;
} {
  const entries: Record<string, StorybookEntry> = {};
  for (const item of matrix.items ?? []) {
    if (item.implementationStatus !== "source-present-unreleased") continue;
    for (const mode of ["basic", "enhanced"] as const) {
      const story = item.storybook?.[mode];
      if (story === undefined) continue;
      entries[`${item.id}-${mode}`] = {
        exportName: story.exportName,
        id: `${item.id}-${mode}`,
        importPath: `./${story.modulePath.slice("apps/storybook/".length)}`,
        type: "story",
      };
    }
  }
  return { entries };
}

describe("catalog-wide Storybook visual coverage plan", () => {
  it("resolves both truthful presentation modes for every source-present catalog item", () => {
    const plan = buildCatalogVisualCoveragePlan({
      manifest,
      matrix,
      storybookIndex: buildExpectedStorybookIndex(),
    });

    expect(plan.itemCount).toBeGreaterThan(0);
    expect(plan.entries).toHaveLength(plan.itemCount * 2);
    expect(new Set(plan.entries.map((entry) => entry.itemId))).toHaveLength(plan.itemCount);
    expect(new Set(plan.entries.map((entry) => entry.storyId))).toHaveLength(plan.entries.length);
    expect(plan.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(manifest.baseline).toEqual({
      crossCommitBaseline: "tests/visual/baseline.v1.json",
      updates: "forbidden",
    });
  });

  it("partitions every real Storybook capture deterministically without hand-maintained batches", () => {
    const plan = buildCatalogVisualCoveragePlan({
      manifest,
      matrix,
      storybookIndex: buildExpectedStorybookIndex(),
    });
    const shards = Array.from({ length: 11 }, (_, index) =>
      selectCatalogVisualShard(plan.entries, { index, total: 11 }),
    );
    expect(shards.flat()).toHaveLength(plan.entries.length);
    expect(new Set(shards.flat().map((entry) => entry.storyId))).toHaveLength(plan.entries.length);
  });

  it("accepts a bounded shard selector and rejects ambiguous coverage selection", () => {
    expect(parseCatalogVisualShard(undefined)).toEqual({ index: 0, total: 1 });
    expect(parseCatalogVisualShard("3/8")).toEqual({ index: 3, total: 8 });
    expect(() => parseCatalogVisualShard("8/8")).toThrow(/out of range/u);
    expect(() => parseCatalogVisualShard("all")).toThrow(/index\/total/u);
  });
});
