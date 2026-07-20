import { createHash } from "node:crypto";

export type CatalogVisualMode = "basic" | "enhanced";

export interface CatalogVisualCoverageManifest {
  readonly schemaVersion: 1;
  readonly kind: "mergora-catalog-visual-coverage";
  readonly catalog: {
    readonly implementationMatrix: string;
    readonly storybookIndex: string;
  };
  readonly capture: {
    readonly globals: string;
    readonly modes: readonly CatalogVisualMode[];
    readonly projects: readonly string[];
    readonly viewport: { readonly height: number; readonly width: number };
  };
  readonly sharding: {
    readonly environmentVariable: string;
    readonly format: "index/total";
    readonly selection: "sha256(itemId:mode) modulo total";
  };
  readonly baseline: {
    readonly crossCommitBaseline: "tests/visual/baseline.v1.json";
    readonly updates: "forbidden";
  };
  readonly evidence: {
    readonly artifactKind: "mergora-catalog-visual-capture";
    readonly baselinePolicy: string;
  };
}

export interface MatrixStory {
  readonly exportName: string;
  readonly modulePath: string;
  readonly status: string;
}

export interface MatrixItem {
  readonly id: string;
  readonly implementationStatus: string;
  readonly storybook?: Partial<Record<CatalogVisualMode, MatrixStory>>;
}

export interface StorybookEntry {
  readonly exportName?: string;
  readonly id?: string;
  readonly importPath?: string;
  readonly type?: string;
}

export interface CatalogVisualPlanEntry {
  readonly itemId: string;
  readonly mode: CatalogVisualMode;
  readonly modulePath: string;
  readonly storyId: string;
  readonly storyExport: string;
}

export interface CatalogVisualCoveragePlan {
  readonly entries: readonly CatalogVisualPlanEntry[];
  readonly fingerprint: string;
  readonly itemCount: number;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function indexImportPath(modulePath: string): string {
  invariant(
    modulePath.startsWith("apps/storybook/") && modulePath.endsWith(".stories.tsx"),
    `Catalog visual story module is not a Storybook story: ${modulePath}`,
  );
  return `./${modulePath.slice("apps/storybook/".length)}`;
}

function fingerprint(entries: readonly CatalogVisualPlanEntry[]): string {
  return `sha256:${createHash("sha256").update(JSON.stringify(entries)).digest("hex")}`;
}

export function buildCatalogVisualCoveragePlan(input: {
  readonly manifest: CatalogVisualCoverageManifest;
  readonly matrix: { readonly items?: readonly MatrixItem[] };
  readonly storybookIndex: { readonly entries?: Readonly<Record<string, StorybookEntry>> };
}): CatalogVisualCoveragePlan {
  const { manifest, matrix, storybookIndex } = input;
  invariant(manifest.schemaVersion === 1, "Catalog visual coverage manifest schema is unsupported");
  invariant(
    manifest.kind === "mergora-catalog-visual-coverage",
    "Catalog visual coverage manifest kind is invalid",
  );
  invariant(
    manifest.capture.modes.length === 2 &&
      manifest.capture.modes.includes("basic") &&
      manifest.capture.modes.includes("enhanced"),
    "Catalog visual coverage must render both the basic and enhanced Storybook modes",
  );
  invariant(
    manifest.capture.projects.length === 1 && manifest.capture.projects[0] === "chromium",
    "Catalog visual coverage is deliberately bounded to the pinned Chromium evidence project",
  );
  invariant(
    manifest.baseline?.crossCommitBaseline === "tests/visual/baseline.v1.json" &&
      manifest.baseline?.updates === "forbidden",
    "Catalog visual capture must not create or update a baseline outside the immutable cross-commit review policy",
  );
  invariant(
    Array.isArray(matrix.items) && matrix.items.length > 0,
    "Implementation matrix has no items",
  );
  invariant(storybookIndex.entries !== undefined, "Storybook index has no entries");

  const sourceItems = matrix.items
    .filter((item) => item.implementationStatus === "source-present-unreleased")
    .sort((left, right) => left.id.localeCompare(right.id));
  invariant(sourceItems.length > 0, "Implementation matrix has no source-present items");
  invariant(
    new Set(sourceItems.map((item) => item.id)).size === sourceItems.length,
    "Implementation matrix has duplicate source-present item ids",
  );

  const indexEntries = Object.values(storybookIndex.entries);
  const entries: CatalogVisualPlanEntry[] = [];
  for (const item of sourceItems) {
    for (const mode of manifest.capture.modes) {
      const story = item.storybook?.[mode];
      invariant(
        story?.status === "tested" &&
          typeof story.modulePath === "string" &&
          typeof story.exportName === "string",
        `${item.id} ${mode} must have a tested Storybook specimen in the implementation matrix`,
      );
      const importPath = indexImportPath(story.modulePath);
      const resolved = indexEntries.filter(
        (entry) =>
          entry.type === "story" &&
          entry.importPath === importPath &&
          entry.exportName === story.exportName &&
          typeof entry.id === "string",
      );
      invariant(
        resolved.length === 1,
        `${item.id} ${mode} must resolve to exactly one built Storybook story (${story.modulePath}#${story.exportName})`,
      );
      entries.push({
        itemId: item.id,
        mode,
        modulePath: story.modulePath,
        storyExport: story.exportName,
        storyId: resolved[0]!.id!,
      });
    }
  }
  entries.sort(
    (left, right) => left.itemId.localeCompare(right.itemId) || left.mode.localeCompare(right.mode),
  );
  invariant(
    new Set(entries.map((entry) => entry.storyId)).size === entries.length,
    "Catalog visual coverage stories must remain one-to-one with item/mode coverage entries",
  );
  return { entries, fingerprint: fingerprint(entries), itemCount: sourceItems.length };
}

export function parseCatalogVisualShard(value: string | undefined): {
  readonly index: number;
  readonly total: number;
} {
  if (value === undefined || value.trim() === "") return { index: 0, total: 1 };
  const match = /^(\d+)\/(\d+)$/u.exec(value.trim());
  invariant(match !== null, "MERGORA_CATALOG_VISUAL_SHARD must use index/total (for example 0/8)");
  const index = Number(match[1]);
  const total = Number(match[2]);
  invariant(
    Number.isSafeInteger(index) && Number.isSafeInteger(total) && total > 0 && index < total,
    "MERGORA_CATALOG_VISUAL_SHARD is out of range",
  );
  return { index, total };
}

export function selectCatalogVisualShard(
  entries: readonly CatalogVisualPlanEntry[],
  shard: { readonly index: number; readonly total: number },
): readonly CatalogVisualPlanEntry[] {
  return entries.filter((entry) => {
    const digest = createHash("sha256").update(`${entry.itemId}:${entry.mode}`).digest();
    return digest.readUInt32BE(0) % shard.total === shard.index;
  });
}
