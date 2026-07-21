export interface PackageCatalogDefinition {
  readonly id: string;
  readonly kind: "catalog-item" | "kit";
  readonly implementationStatus: "unimplemented";
  readonly availabilityIntent: {
    readonly package: "planned" | "not-planned";
    readonly source: "planned" | "not-planned";
  };
}

export interface PublicPackageMap {
  readonly schemaVersion: 1;
  readonly selectionStatus: "provisional" | "verified";
  readonly repository: string;
  readonly cli: { readonly package: string; readonly bin: string };
  readonly public: {
    readonly ui: string;
    readonly tokens: string;
    readonly schema: string;
    readonly registry: string;
    readonly contracts: string;
    readonly mcp: string;
  };
}

export interface PackageSourceDescriptor {
  readonly id: string;
  readonly packageEntryPath: string;
  readonly stylePath: string;
  readonly runtimeDependencies: readonly string[];
  readonly visibleStatus: "unreleased" | "experimental";
}

export interface PackageExportPlan {
  readonly schemaVersion: 1;
  readonly artifactKind: "package-export-plan";
  readonly generated: {
    readonly by: "@mergora-internal/package-builder";
    readonly editPolicy: "do-not-edit";
  };
  readonly packageMap: {
    readonly selectionStatus: "provisional" | "verified";
    readonly repository: string;
    readonly cliPackage: string;
    readonly cliBin: string;
    readonly uiPackage: string;
  };
  readonly policy: {
    readonly canonicalSourceRequired: true;
    readonly exportOnlySourcePresentItems: true;
    readonly generatedFromCommittedPackageMap: true;
    readonly releaseClaims: false;
  };
  readonly exports: readonly {
    readonly itemId: string;
    readonly packageName: string;
    readonly requestedSubpath: string | null;
    readonly requestedImport: string | null;
    readonly availabilityIntent: "planned" | "not-planned";
    readonly implementationStatus: "unimplemented" | "source-present-unreleased";
    readonly visibleStatus: "unreleased" | "experimental" | null;
    readonly exportStatus: "blocked-unimplemented" | "not-planned" | "generated-unreleased";
    readonly emittedExport: {
      readonly types: string;
      readonly import: string;
      readonly style: string;
    } | null;
  }[];
}

export interface UiPackageManifest {
  readonly name: string;
  readonly version: "1.0.0";
  readonly private: false;
  readonly description: string;
  readonly license: "MIT";
  readonly repository: {
    readonly type: "git";
    readonly url: "git+https://github.com/AkhilTrivediX/mergora.git";
    readonly directory: "packages/ui";
  };
  readonly homepage: "https://akhiltrivedix.github.io/mergora/";
  readonly bugs: "https://github.com/AkhilTrivediX/mergora/issues";
  readonly type: "module";
  readonly sideEffects: readonly ["**/*.css"];
  readonly exports: Readonly<Record<string, unknown>>;
  readonly files: readonly ["dist"];
  readonly scripts: {
    readonly build: string;
    readonly clean: string;
    readonly typecheck: string;
  };
  readonly peerDependencies: {
    readonly react: "^18.3.0 || ^19.0.0";
    readonly "react-dom": "^18.3.0 || ^19.0.0";
  };
  readonly dependencies: Readonly<Record<string, "catalog:">>;
  readonly devDependencies: {
    readonly "@types/react": "catalog:";
    readonly "@types/react-dom": "catalog:";
    readonly react: "catalog:";
    readonly "react-dom": "catalog:";
    readonly typescript: "catalog:";
  };
  readonly mergora: {
    readonly generatedBy: "@mergora-internal/package-builder";
    readonly editPolicy: "do-not-edit";
    readonly canonicalSource: "registry/source";
    readonly distributionStatus: "unreleased";
    readonly publishedMaturity: null;
  };
}

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const PACKAGE_SOURCE_PREFIX = "packages/ui/src/";

function assertPackageName(value: string, label: string): void {
  if (!PACKAGE_NAME.test(value)) {
    throw new Error(`${label} ${JSON.stringify(value)} is not a valid registry package name.`);
  }
}

function assertSourceEntry(source: PackageSourceDescriptor): void {
  if (
    !source.packageEntryPath.startsWith("packages/ui/src/generated/") ||
    !/\.(?:ts|tsx)$/u.test(source.packageEntryPath) ||
    source.packageEntryPath.includes("\\") ||
    source.packageEntryPath.includes("..")
  ) {
    throw new Error(
      `Package entry ${JSON.stringify(source.packageEntryPath)} is outside the generated UI source root.`,
    );
  }
  if (!source.stylePath.endsWith(".css")) {
    throw new Error(`Package source ${JSON.stringify(source.id)} has no CSS style path.`);
  }
}

function distEntry(source: PackageSourceDescriptor): string {
  assertSourceEntry(source);
  return `./dist/${source.packageEntryPath
    .slice(PACKAGE_SOURCE_PREFIX.length)
    .replace(/\.(?:ts|tsx)$/u, ".js")}`;
}

function distTypes(source: PackageSourceDescriptor): string {
  return distEntry(source).replace(/\.js$/u, ".d.ts");
}

function distStyle(source: PackageSourceDescriptor): string {
  const basename = source.stylePath.split("/").at(-1)!;
  return `./dist/generated/${source.id}/${basename}`;
}

function sourceMap(
  sources: readonly PackageSourceDescriptor[],
): Map<string, PackageSourceDescriptor> {
  const byId = new Map<string, PackageSourceDescriptor>();
  for (const source of sources) {
    assertSourceEntry(source);
    if (byId.has(source.id)) {
      throw new Error(`Package source ${JSON.stringify(source.id)} is declared more than once.`);
    }
    byId.set(source.id, source);
  }
  return byId;
}

export function buildPackageExportPlan(
  definitions: readonly PackageCatalogDefinition[],
  packageMap: PublicPackageMap,
  sources: readonly PackageSourceDescriptor[] = [],
): PackageExportPlan {
  if (packageMap.schemaVersion !== 1) {
    throw new Error(`Unsupported public package map version ${String(packageMap.schemaVersion)}.`);
  }
  assertPackageName(packageMap.cli.package, "CLI package");
  for (const [role, packageName] of Object.entries(packageMap.public)) {
    assertPackageName(packageName, `Public ${role} package`);
  }
  const sourceById = sourceMap(sources);
  const definitionIds = new Set(definitions.map((definition) => definition.id));
  for (const source of sources) {
    if (!definitionIds.has(source.id)) {
      throw new Error(`Package source ${JSON.stringify(source.id)} has no catalog definition.`);
    }
  }

  return {
    schemaVersion: 1,
    artifactKind: "package-export-plan",
    generated: {
      by: "@mergora-internal/package-builder",
      editPolicy: "do-not-edit",
    },
    packageMap: {
      selectionStatus: packageMap.selectionStatus,
      repository: packageMap.repository,
      cliPackage: packageMap.cli.package,
      cliBin: packageMap.cli.bin,
      uiPackage: packageMap.public.ui,
    },
    policy: {
      canonicalSourceRequired: true,
      exportOnlySourcePresentItems: true,
      generatedFromCommittedPackageMap: true,
      releaseClaims: false,
    },
    exports: [...definitions]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((definition) => {
        const packagePlanned = definition.availabilityIntent.package === "planned";
        const source = sourceById.get(definition.id);
        const requestedSubpath = packagePlanned ? `./${definition.id}` : null;
        return {
          itemId: definition.id,
          packageName: packageMap.public.ui,
          requestedSubpath,
          requestedImport: packagePlanned ? `${packageMap.public.ui}/${definition.id}` : null,
          availabilityIntent: definition.availabilityIntent.package,
          implementationStatus:
            source === undefined
              ? ("unimplemented" as const)
              : ("source-present-unreleased" as const),
          visibleStatus: source?.visibleStatus ?? null,
          exportStatus: !packagePlanned
            ? ("not-planned" as const)
            : source === undefined
              ? ("blocked-unimplemented" as const)
              : ("generated-unreleased" as const),
          emittedExport:
            !packagePlanned || source === undefined
              ? null
              : {
                  types: distTypes(source),
                  import: distEntry(source),
                  style: distStyle(source),
                },
        };
      }),
  };
}

export function buildUiPackageManifest(
  packageMap: PublicPackageMap,
  definitions: readonly PackageCatalogDefinition[],
  sources: readonly PackageSourceDescriptor[],
): UiPackageManifest {
  const packagePlanned = new Set(
    definitions
      .filter((definition) => definition.availabilityIntent.package === "planned")
      .map((definition) => definition.id),
  );
  const ordered = [...sourceMap(sources).values()]
    .filter((source) => packagePlanned.has(source.id))
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
  const exports: Record<string, unknown> = {
    ".": {
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    },
  };
  for (const source of ordered) {
    exports[`./${source.id}`] = {
      types: distTypes(source),
      import: distEntry(source),
    };
    exports[`./${source.id}.css`] = {
      types: "./dist/style.d.ts",
      style: distStyle(source),
      default: distStyle(source),
    };
  }
  exports["./package.json"] = "./package.json";

  const runtimeDependencies = [...new Set(ordered.flatMap((source) => source.runtimeDependencies))]
    .filter((dependency) => dependency !== "react" && dependency !== "react-dom")
    .sort((left, right) => left.localeCompare(right, "en-US"));

  return {
    name: packageMap.public.ui,
    version: "1.0.0",
    private: false,
    description: "Generated Mergora React components from the canonical source registry",
    license: "MIT",
    repository: {
      type: "git",
      url: "git+https://github.com/AkhilTrivediX/mergora.git",
      directory: "packages/ui",
    },
    homepage: "https://akhiltrivedix.github.io/mergora/",
    bugs: "https://github.com/AkhilTrivediX/mergora/issues",
    type: "module",
    sideEffects: ["**/*.css"],
    exports,
    files: ["dist"],
    scripts: {
      build:
        "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc -p tsconfig.json && node ../../tooling/package-builder/src/copy-assets.ts .",
      clean: "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\"",
      typecheck: "tsc --noEmit -p tsconfig.json",
    },
    peerDependencies: {
      react: "^18.3.0 || ^19.0.0",
      "react-dom": "^18.3.0 || ^19.0.0",
    },
    dependencies: Object.fromEntries(
      runtimeDependencies.map((dependency) => [dependency, "catalog:" as const]),
    ),
    devDependencies: {
      "@types/react": "catalog:",
      "@types/react-dom": "catalog:",
      react: "catalog:",
      "react-dom": "catalog:",
      typescript: "catalog:",
    },
    mergora: {
      generatedBy: "@mergora-internal/package-builder",
      editPolicy: "do-not-edit",
      canonicalSource: "registry/source",
      distributionStatus: "unreleased",
      publishedMaturity: null,
    },
  };
}

export function buildUiPackageIndex(
  definitions: readonly PackageCatalogDefinition[],
  sources: readonly PackageSourceDescriptor[],
): string {
  const packagePlanned = new Set(
    definitions
      .filter((definition) => definition.availabilityIntent.package === "planned")
      .map((definition) => definition.id),
  );
  const lines = [...sourceMap(sources).values()]
    .filter((source) => packagePlanned.has(source.id))
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
    .map((source) => {
      const relativeEntry = source.packageEntryPath
        .slice(PACKAGE_SOURCE_PREFIX.length)
        .replace(/\.(?:ts|tsx)$/u, ".js");
      return `export * from "./${relativeEntry}";`;
    });
  return ["// Generated by @mergora-internal/package-builder. Do not edit.", ...lines, ""].join(
    "\n",
  );
}
