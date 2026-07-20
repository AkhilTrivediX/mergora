export interface PayloadCanonicalSource {
  readonly id: string;
  readonly entryPath: string;
  readonly outputRole: "component" | "hook" | "lib" | "system" | "kit";
  readonly itemDependencies: readonly string[];
  readonly runtimeDependencies: readonly string[];
  readonly metadataPath: string;
  readonly contractPath: string;
  readonly storyPath: string | null;
  readonly apiPath: string | null;
  readonly documentationPath: string;
  readonly publicExports: readonly string[];
  readonly visibleStatus: "unreleased" | "experimental";
  readonly displayName: string;
  readonly description: string;
  readonly riskClass: 1 | 2 | 3;
  readonly normalizedFiles: readonly {
    readonly sourcePath: string;
    readonly packagePath: string;
    readonly content: string;
    readonly consumerContent: string;
    readonly mediaType: "text/css" | "text/typescript" | "text/typescript-jsx";
    readonly targetRole: "component" | "system" | "style";
  }[];
}

interface GeneratedMarker {
  readonly by: "@mergora-internal/registry-builder";
  readonly editPolicy: "do-not-edit";
}

const GENERATED_MARKER: GeneratedMarker = {
  by: "@mergora-internal/registry-builder",
  editPolicy: "do-not-edit",
};

export interface UnreleasedNativeSourceItem {
  readonly schemaVersion: 1;
  readonly artifactKind: "unreleased-native-source-item";
  readonly generated: GeneratedMarker;
  readonly futureReleaseSchema: string;
  readonly itemId: string;
  readonly title: string;
  readonly description: string;
  readonly kind: "component" | "system";
  readonly implementationStatus: "source-present-unreleased";
  readonly publicationStatus: "unreleased";
  readonly visibleStatus: "unreleased" | "experimental";
  readonly publishedMaturity: null;
  readonly release: null;
  readonly riskClass: 1 | 2 | 3;
  readonly packageImport: string;
  readonly packageStyleImport: string;
  readonly runtimeDependencies: readonly string[];
  readonly registryDependencies: readonly string[];
  readonly files: readonly {
    readonly logicalPath: string;
    readonly targetPath: string;
    readonly targetRole: "component" | "system" | "style";
    readonly mediaType: "text/css" | "text/typescript" | "text/typescript-jsx";
    readonly executable: false;
    readonly content: string;
    readonly transformPipeline: readonly [
      "alias-rewrite",
      "import-rewrite",
      "target-map",
      "format",
    ];
  }[];
  readonly associations: {
    readonly metadata: string;
    readonly contract: string;
    readonly passportSkeleton: string;
    readonly story: string | null;
    readonly api: string | null;
    readonly documentation: string;
  };
  readonly blockers: readonly [
    "release-identity-missing",
    "immutable-payload-not-built",
    "quality-evidence-incomplete",
    "item-consumer-evidence-incomplete",
  ];
}

export interface ShadcnRegistryFile {
  readonly path: string;
  readonly type: "registry:file" | "registry:style" | "registry:ui";
  readonly target: string;
  readonly content: string;
}

export interface ShadcnSourceItem {
  readonly $schema: "https://ui.shadcn.com/schema/registry-item.json";
  readonly name: string;
  readonly type: "registry:block" | "registry:ui";
  readonly title: string;
  readonly description: string;
  readonly dependencies: readonly string[];
  readonly devDependencies: readonly string[];
  readonly registryDependencies: readonly string[];
  readonly files: readonly ShadcnRegistryFile[];
  readonly docs: string;
}

function targetFile(source: PayloadCanonicalSource, sourcePath: string): string {
  const name = sourcePath.split("/").at(-1)!;
  return `components/ui/mergora/${source.id}/${name}`;
}

function shadcnTarget(source: PayloadCanonicalSource, sourcePath: string): string {
  const name = sourcePath.split("/").at(-1)!;
  return `@ui/mergora/${source.id}/${name}`;
}

function shadcnFileType(path: string): ShadcnRegistryFile["type"] {
  if (path.endsWith(".css")) return "registry:style";
  if (path.endsWith(".d.ts")) return "registry:file";
  return "registry:ui";
}

export function buildUnreleasedNativeSourceItem(
  source: PayloadCanonicalSource,
  futureReleaseSchema: string,
  uiPackage: string,
): UnreleasedNativeSourceItem {
  return {
    schemaVersion: 1,
    artifactKind: "unreleased-native-source-item",
    generated: GENERATED_MARKER,
    futureReleaseSchema,
    itemId: source.id,
    title: source.displayName,
    description: source.description,
    kind: source.outputRole === "system" ? "system" : "component",
    implementationStatus: "source-present-unreleased",
    publicationStatus: "unreleased",
    visibleStatus: source.visibleStatus,
    publishedMaturity: null,
    release: null,
    riskClass: source.riskClass,
    packageImport: `${uiPackage}/${source.id}`,
    packageStyleImport: `${uiPackage}/${source.id}.css`,
    runtimeDependencies: [...source.runtimeDependencies].sort(),
    registryDependencies: [...source.itemDependencies].sort(),
    files: source.normalizedFiles.map((file) => ({
      logicalPath: file.sourcePath,
      targetPath: targetFile(source, file.sourcePath),
      targetRole: file.targetRole,
      mediaType: file.mediaType,
      executable: false as const,
      content: file.consumerContent,
      transformPipeline: ["alias-rewrite", "import-rewrite", "target-map", "format"] as const,
    })),
    associations: {
      metadata: source.metadataPath,
      contract: source.contractPath,
      passportSkeleton: `${source.id}-passport-skeleton`,
      story: source.storyPath,
      api: source.apiPath,
      documentation: source.documentationPath,
    },
    blockers: [
      "release-identity-missing",
      "immutable-payload-not-built",
      "quality-evidence-incomplete",
      "item-consumer-evidence-incomplete",
    ],
  };
}

export function buildShadcnSourceItem(source: PayloadCanonicalSource): ShadcnSourceItem {
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name: source.id,
    type: source.outputRole === "system" ? "registry:block" : "registry:ui",
    title: source.displayName,
    description: source.description,
    dependencies: source.runtimeDependencies
      .filter((dependency) => dependency !== "react" && dependency !== "react-dom")
      .sort(),
    devDependencies: [],
    registryDependencies: [...source.itemDependencies].sort(),
    files: source.normalizedFiles.map((file) => ({
      path: targetFile(source, file.sourcePath),
      type: shadcnFileType(file.sourcePath),
      target: shadcnTarget(source, file.sourcePath),
      content: file.consumerContent,
    })),
    docs:
      source.visibleStatus === "experimental"
        ? "Experimental unreleased canonical source artifact. Its complete Risk Class 3 contract has not passed. It does not carry a Stable, published, Quality Passport, or Semantic Sync protection claim."
        : "Unreleased canonical source artifact. It does not carry a Stable, published, Quality Passport, or Semantic Sync protection claim.",
  };
}

export function buildShadcnRegistry(sources: readonly PayloadCanonicalSource[]) {
  return {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "mergora-unreleased",
    homepage: "https://github.com/AkhilTrivediX/mergora",
    items: [...sources]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map(buildShadcnSourceItem),
  } as const;
}

export function buildSourceViews(sources: readonly PayloadCanonicalSource[]) {
  return {
    schemaVersion: 1,
    artifactKind: "canonical-source-views",
    generated: GENERATED_MARKER,
    publicationStatus: "unreleased",
    items: [...sources]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((source) => ({
        itemId: source.id,
        implementationStatus: "source-present-unreleased" as const,
        visibleStatus: source.visibleStatus,
        entryPath: source.entryPath,
        documentationPath: source.documentationPath,
        files: source.normalizedFiles.map((file) => ({
          path: file.sourcePath,
          language: file.mediaType === "text/css" ? "css" : "tsx",
          content: file.content,
        })),
      })),
  } as const;
}

export function buildVerticalSliceApi(
  sources: readonly PayloadCanonicalSource[],
  uiPackage: string,
) {
  return {
    schemaVersion: 1,
    artifactKind: "vertical-slice-api",
    generated: GENERATED_MARKER,
    publicationStatus: "unreleased",
    items: [...sources]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((source) => ({
        itemId: source.id,
        packageImport: `${uiPackage}/${source.id}`,
        implementationStatus: "source-present-unreleased" as const,
        visibleStatus: source.visibleStatus,
        exports: [...source.publicExports].sort(),
        apiSource: source.apiPath,
      })),
  } as const;
}

export function buildChangelogInputs(sources: readonly PayloadCanonicalSource[]) {
  return {
    schemaVersion: 1,
    artifactKind: "unreleased-changelog-inputs",
    generated: GENERATED_MARKER,
    release: null,
    entries: [...sources]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((source) => ({
        itemId: source.id,
        changeKind: "canonical-source-added" as const,
        releaseStatus: "unreleased" as const,
        visibleStatus: source.visibleStatus,
        publicExports: [...source.publicExports].sort(),
      })),
  } as const;
}

export function assertShadcnSourceItem(value: unknown): asserts value is ShadcnSourceItem {
  if (value === null || typeof value !== "object") {
    throw new Error("shadcn source item must be an object.");
  }
  const item = value as Partial<ShadcnSourceItem>;
  if (
    item.$schema !== "https://ui.shadcn.com/schema/registry-item.json" ||
    typeof item.name !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item.name) ||
    (item.type !== "registry:ui" && item.type !== "registry:block") ||
    !Array.isArray(item.files) ||
    item.files.length === 0
  ) {
    throw new Error("shadcn source item does not satisfy the pinned P1 compatibility shape.");
  }
  const identities = new Set<string>();
  for (const file of item.files) {
    if (
      typeof file.path !== "string" ||
      typeof file.target !== "string" ||
      typeof file.content !== "string" ||
      !file.target.startsWith("@ui/") ||
      !["registry:file", "registry:style", "registry:ui"].includes(file.type)
    ) {
      throw new Error(`shadcn source item ${JSON.stringify(item.name)} has an invalid file.`);
    }
    const identity = file.target.normalize("NFKC").toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw new Error(`shadcn source item ${JSON.stringify(item.name)} has a target collision.`);
    }
    identities.add(identity);
  }
}
