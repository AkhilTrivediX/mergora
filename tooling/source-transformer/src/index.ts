import { existsSync, readFileSync, readdirSync } from "node:fs";
import { posix, resolve } from "node:path";

export type GeneratedImplementationStatus = "unimplemented" | "source-present-unreleased";

export interface SourceCatalogDefinition {
  readonly id: string;
  readonly displayName?: string;
  readonly layer: "foundation" | "component" | "system" | "kit";
  readonly riskClass?: 1 | 2 | 3;
  readonly targetMaturity?: "experimental" | "beta" | "stable" | "deprecated";
  readonly normativeBehavior?: string;
  readonly implementationStatus: "unimplemented";
}

export interface CanonicalSourceDescriptor {
  readonly id: string;
  readonly entryPath: string;
  readonly declaredImports: readonly string[];
  readonly itemDependencies: readonly string[];
  readonly outputRole: "component" | "hook" | "lib" | "system" | "kit";
  readonly runtimeFiles: readonly string[];
  readonly stylePath: string;
  readonly runtimeDependencies: readonly string[];
  readonly metadataPath: string;
  readonly contractPath: string;
  readonly storyPath: string | null;
  readonly apiPath: string | null;
  readonly documentationPath: string;
  readonly publicExports: readonly string[];
  readonly visibleStatus: "unreleased" | "experimental";
}

export interface RepresentativeExtensionPoint {
  readonly id: "button" | "dialog" | "combobox" | "data-grid";
  readonly expectedEntryPath: string;
  readonly architectureRole:
    "native-control" | "overlay-focus" | "localized-collection" | "complex-system";
  readonly status: "source-present-unreleased";
}

export interface SourceTransformPlan {
  readonly schemaVersion: 1;
  readonly artifactKind: "source-transform-plan";
  readonly generated: {
    readonly by: "@mergora-internal/source-transformer";
    readonly editPolicy: "do-not-edit";
  };
  readonly policy: {
    readonly direction: "canonical-source-to-generated-output-only";
    readonly executableCodemods: false;
    readonly arbitraryHooks: false;
    readonly emitGeneratorInternals: false;
    readonly normalizeText: "unicode-nfkc-utf8-lf-final-newline";
    readonly packageSourceIsHandEdited: false;
  };
  readonly representativeExtensionPoints: readonly RepresentativeExtensionPoint[];
  readonly items: readonly {
    readonly id: string;
    readonly implementationStatus: GeneratedImplementationStatus;
    readonly transformStatus: "awaiting-canonical-source" | "generated-unreleased";
    readonly source: CanonicalSourceDescriptor | null;
    readonly plannedTransforms: readonly (
      "alias-rewrite" | "import-rewrite" | "target-map" | "format"
    )[];
    readonly emittedFiles: readonly string[];
  }[];
}

export interface SourceGeneratedFile {
  readonly path: string;
  readonly content: string;
}

export interface ValidatedCanonicalSource extends CanonicalSourceDescriptor {
  readonly displayName: string;
  readonly riskClass: 1 | 2 | 3;
  readonly targetMaturity: "experimental" | "beta" | "stable" | "deprecated";
  readonly description: string;
  readonly normalizedFiles: readonly {
    readonly sourcePath: string;
    readonly packagePath: string;
    readonly content: string;
    readonly consumerContent: string;
    readonly mediaType: "text/css" | "text/typescript" | "text/typescript-jsx";
    readonly targetRole: "component" | "system" | "style";
  }[];
  readonly packageEntryPath: string;
}

export interface SourceTransformationSnapshot {
  readonly plan: SourceTransformPlan;
  readonly sources: readonly ValidatedCanonicalSource[];
  readonly files: readonly SourceGeneratedFile[];
}

interface SourceBlueprint extends CanonicalSourceDescriptor {
  readonly architectureRole: RepresentativeExtensionPoint["architectureRole"];
}

const SOURCE_BLUEPRINTS: readonly SourceBlueprint[] = [
  {
    id: "button",
    entryPath: "registry/source/components/button/button.tsx",
    declaredImports: ["./button-state.js", "./button.css", "react"],
    itemDependencies: [],
    outputRole: "component",
    runtimeFiles: [
      "registry/source/components/button/button-css.d.ts",
      "registry/source/components/button/button-state.ts",
      "registry/source/components/button/button.css",
      "registry/source/components/button/button.tsx",
    ],
    stylePath: "registry/source/components/button/button.css",
    runtimeDependencies: ["react"],
    metadataPath: "registry/source/components/button/button.metadata.json",
    contractPath: "registry/source/components/button/button.contract.json",
    storyPath: "registry/source/components/button/button.stories.json",
    apiPath: "registry/source/components/button/button.api.json",
    documentationPath: "registry/source/components/button/README.md",
    publicExports: ["Button", "ButtonOwnProps", "ButtonProps", "ButtonSize", "ButtonVariant"],
    visibleStatus: "unreleased",
    architectureRole: "native-control",
  },
  {
    id: "combobox",
    entryPath: "registry/source/components/combobox/index.ts",
    declaredImports: [
      "./combobox.css",
      "./combobox.js",
      "react",
      "react-aria-components/ComboBox",
      "react-aria-components/Header",
    ],
    itemDependencies: [],
    outputRole: "component",
    runtimeFiles: [
      "registry/source/components/combobox/combobox-css.d.ts",
      "registry/source/components/combobox/combobox.css",
      "registry/source/components/combobox/combobox.tsx",
      "registry/source/components/combobox/index.ts",
    ],
    stylePath: "registry/source/components/combobox/combobox.css",
    runtimeDependencies: ["react", "react-aria-components"],
    metadataPath: "registry/source/components/combobox/component.json",
    contractPath: "registry/source/components/combobox/contract.draft.json",
    storyPath: null,
    apiPath: null,
    documentationPath: "registry/source/components/combobox/README.md",
    publicExports: [
      "Combobox",
      "ComboboxClear",
      "ComboboxClearProps",
      "ComboboxDescription",
      "ComboboxDescriptionProps",
      "ComboboxErrorMessage",
      "ComboboxErrorMessageProps",
      "ComboboxInput",
      "ComboboxInputChangeDetail",
      "ComboboxInputProps",
      "ComboboxItem",
      "ComboboxItemProps",
      "ComboboxItemState",
      "ComboboxKey",
      "ComboboxLabel",
      "ComboboxLabelProps",
      "ComboboxListBox",
      "ComboboxListBoxProps",
      "ComboboxMenuTrigger",
      "ComboboxOpenChangeDetail",
      "ComboboxPopover",
      "ComboboxPopoverProps",
      "ComboboxRoot",
      "ComboboxRootProps",
      "ComboboxSection",
      "ComboboxSectionProps",
      "ComboboxTrigger",
      "ComboboxTriggerProps",
      "ComboboxValueChangeDetail",
    ],
    visibleStatus: "unreleased",
    architectureRole: "localized-collection",
  },
  {
    id: "data-grid",
    entryPath: "registry/source/systems/data-grid/index.ts",
    declaredImports: [
      "./data-grid-csv.js",
      "./data-grid.css",
      "./data-grid.js",
      "@tanstack/react-table",
      "react",
    ],
    itemDependencies: [],
    outputRole: "system",
    runtimeFiles: [
      "registry/source/systems/data-grid/data-grid-css.d.ts",
      "registry/source/systems/data-grid/data-grid-csv.ts",
      "registry/source/systems/data-grid/data-grid.css",
      "registry/source/systems/data-grid/data-grid.tsx",
      "registry/source/systems/data-grid/index.ts",
    ],
    stylePath: "registry/source/systems/data-grid/data-grid.css",
    runtimeDependencies: ["@tanstack/react-table", "react"],
    metadataPath: "registry/source/systems/data-grid/data-grid.metadata.json",
    contractPath: "registry/source/systems/data-grid/data-grid.contract.json",
    storyPath: "registry/source/systems/data-grid/data-grid.stories.json",
    apiPath: "registry/source/systems/data-grid/data-grid.api.json",
    documentationPath: "registry/source/systems/data-grid/README.md",
    publicExports: [
      "DataGrid",
      "DataGridColumn",
      "DataGridColumnAlignment",
      "DataGridColumnSizeOptions",
      "DataGridColumnSizingChangeDetail",
      "DataGridColumnSizingOptions",
      "DataGridColumnWidths",
      "DataGridColumnVisibility",
      "DataGridColumnVisibilityAdapter",
      "DataGridColumnVisibilityChangeDetail",
      "DataGridColumnVisibilityOptions",
      "DataGridCsvColumn",
      "DataGridCsvDelimiter",
      "DataGridCsvFormulaProtection",
      "DataGridCsvNewline",
      "DataGridCsvOptions",
      "DataGridCsvValue",
      "DataGridCursorPaginationOptions",
      "DataGridCursorPaginationState",
      "DataGridFilteringOptions",
      "DataGridMessages",
      "DataGridOperationMode",
      "DataGridOperationReason",
      "DataGridOperationStatus",
      "DataGridPagePaginationOptions",
      "DataGridPagePaginationState",
      "DataGridPaginationOptions",
      "DataGridPaginationState",
      "DataGridProps",
      "DataGridQuery",
      "DataGridQueryAdapter",
      "DataGridQueryChangeDetail",
      "DataGridQuerySummaryContext",
      "DataGridSelectionChangeDetail",
      "DataGridSelectionMode",
      "DataGridSelectionProps",
      "DataGridSortDirection",
      "DataGridSorting",
      "DataGridSortingChangeDetail",
      "DataGridSortingProps",
      "createDataGridCsv",
      "normalizeDataGridQuery",
      "parseDataGridColumnVisibility",
      "parseDataGridQuery",
      "serializeDataGridColumnVisibility",
      "serializeDataGridQuery",
    ],
    visibleStatus: "experimental",
    architectureRole: "complex-system",
  },
] as const;

const REPRESENTATIVE_EXTENSION_POINTS: readonly RepresentativeExtensionPoint[] = [
  {
    id: "button",
    expectedEntryPath: "registry/source/components/button/button.tsx",
    architectureRole: "native-control",
    status: "source-present-unreleased",
  },
  {
    id: "dialog",
    expectedEntryPath: "registry/source/components/dialog/index.ts",
    architectureRole: "overlay-focus",
    status: "source-present-unreleased",
  },
  {
    id: "combobox",
    expectedEntryPath: "registry/source/components/combobox/index.ts",
    architectureRole: "localized-collection",
    status: "source-present-unreleased",
  },
  {
    id: "data-grid",
    expectedEntryPath: "registry/source/systems/data-grid/index.ts",
    architectureRole: "complex-system",
    status: "source-present-unreleased",
  },
] as const;

const PORTABLE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const IMPORT_SPECIFIER = /(?:\bfrom\s*|\bimport\s*)["']([^"']+)["']/gu;

export function assertPortableSourcePath(path: string): void {
  if (path !== path.normalize("NFKC")) {
    throw new Error(`Source path ${JSON.stringify(path)} is not normalized with Unicode NFKC.`);
  }
  if (
    path === "" ||
    path.startsWith("/") ||
    /^[a-z]:/i.test(path) ||
    path.includes("\\") ||
    path.includes(":") ||
    path.includes("%")
  ) {
    throw new Error(`Source path ${JSON.stringify(path)} is not a portable project-relative path.`);
  }
  for (const segment of path.split("/")) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      !PORTABLE_SEGMENT.test(segment) ||
      /[. ]$/u.test(segment) ||
      WINDOWS_RESERVED.test(segment)
    ) {
      throw new Error(
        `Source path ${JSON.stringify(path)} contains unsafe segment ${JSON.stringify(segment)}.`,
      );
    }
  }
}

function normalizedIdentity(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

function packageRoot(specifier: string): string {
  if (specifier.startsWith("@")) return specifier.split("/").slice(0, 2).join("/");
  return specifier.split("/")[0]!;
}

function normalizeText(content: string, path: string): string {
  const normalized = content.replace(/\r\n?/gu, "\n").normalize("NFKC");
  if (normalized.includes("\0")) {
    throw new Error(`Canonical source ${JSON.stringify(path)} contains a NUL character.`);
  }
  return `${normalized.replace(/\n*$/u, "")}\n`;
}

export function transformPackageSource(content: string, path: string): string {
  const marker = path.endsWith(".css")
    ? `/* Generated from ${path} by @mergora-internal/source-transformer. Do not edit. */\n`
    : `// Generated from ${path} by @mergora-internal/source-transformer. Do not edit.\n`;
  const transformed = /\.(?:ts|tsx)$/u.test(path)
    ? content.replace(
        /(\b(?:from|import)\s*)(["'])(\.{1,2}\/[^"']+)\.(?:ts|tsx)\2/gu,
        "$1$2$3.js$2",
      )
    : content;
  return `${marker}${transformed}`;
}

export function transformConsumerSource(content: string, path: string): string {
  if (!/\.(?:ts|tsx)$/u.test(path)) return content;
  return content.replace(
    /(\b(?:from|import)\s*)(["'])(\.{1,2}\/[^"']+)\.(?:js|ts|tsx)\2/gu,
    "$1$2$3$2",
  );
}

function importSpecifiers(content: string): readonly string[] {
  if (/\b(?:import|require)\s*\(/u.test(content)) {
    throw new Error("Dynamic import/require is not allowed in deterministic canonical source.");
  }
  return [...content.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]!).sort();
}

function exportedNames(content: string): readonly string[] {
  if (/\bexport\s+default\b/u.test(content)) {
    throw new Error("Canonical source must use named exports; default exports are unsupported.");
  }
  const names = new Set<string>();
  for (const match of content.matchAll(
    /^export\s+(?:declare\s+)?(?:abstract\s+)?(?:async\s+)?(?:class|const|enum|function|interface|let|namespace|type|var)\s+([A-Za-z_$][\w$]*)/gmu,
  )) {
    names.add(match[1]!);
  }
  for (const match of content.matchAll(
    /\bexport\s+(?:type\s+)?\{([^}]+)\}(?:\s+from\s+["'][^"']+["'])?/gsu,
  )) {
    for (const entry of match[1]!.split(",")) {
      const cleaned = entry.trim().replace(/^type\s+/u, "");
      if (cleaned === "") continue;
      const parts = cleaned.split(/\s+as\s+/u);
      names.add(parts.at(-1)!.trim());
    }
  }
  return [...names].sort((left, right) => left.localeCompare(right, "en-US"));
}

function typeOnlyExportNames(content: string): ReadonlySet<string> {
  const names = new Set<string>();
  for (const match of content.matchAll(
    /^export\s+(?:declare\s+)?(?:interface|type)\s+([A-Za-z_$][\w$]*)/gmu,
  )) {
    names.add(match[1]!);
  }
  for (const match of content.matchAll(
    /\bexport\s+(type\s+)?\{([^}]+)\}(?:\s+from\s+["'][^"']+["'])?/gsu,
  )) {
    const allTypeOnly = match[1] !== undefined;
    for (const entry of match[2]!.split(",")) {
      const trimmed = entry.trim();
      if (!allTypeOnly && !trimmed.startsWith("type ")) continue;
      const cleaned = trimmed.replace(/^type\s+/u, "");
      if (cleaned === "") continue;
      names.add(
        cleaned
          .split(/\s+as\s+/u)
          .at(-1)!
          .trim(),
      );
    }
  }
  return names;
}

function validateApiCompanion(
  workspaceRoot: string,
  apiPath: string,
  itemId: string,
  publicExports: readonly string[],
  entryContent: string,
): void {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(workspacePath(workspaceRoot, apiPath), "utf8"));
  } catch (error) {
    throw new Error(`Canonical API companion ${JSON.stringify(apiPath)} is not valid JSON.`, {
      cause: error,
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Canonical API companion ${JSON.stringify(apiPath)} must be an object.`);
  }
  const record = parsed as Record<string, unknown>;
  const declared = record.exports;
  if (
    record.itemId !== itemId ||
    typeof record.entryExport !== "string" ||
    !Array.isArray(declared)
  ) {
    throw new Error(
      `Canonical API companion ${JSON.stringify(apiPath)} has an invalid item identity or export table.`,
    );
  }
  const names: string[] = [];
  const typeOnlyNames = typeOnlyExportNames(entryContent);
  for (const entry of declared) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      Array.isArray(entry) ||
      typeof (entry as Record<string, unknown>).name !== "string" ||
      typeof (entry as Record<string, unknown>).kind !== "string"
    ) {
      throw new Error(
        `Canonical API companion ${JSON.stringify(apiPath)} contains an invalid export record.`,
      );
    }
    const apiExport = entry as { readonly kind: string; readonly name: string };
    if (typeOnlyNames.has(apiExport.name) && apiExport.kind !== "type") {
      throw new Error(
        `Canonical API companion ${JSON.stringify(apiPath)} must classify type-only export ${JSON.stringify(apiExport.name)} as a type.`,
      );
    }
    names.push(apiExport.name);
  }
  const sortedNames = [...names].sort((left, right) => left.localeCompare(right, "en-US"));
  const sortedExports = [...publicExports].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (
    new Set(names).size !== names.length ||
    !names.includes(record.entryExport) ||
    JSON.stringify(sortedNames) !== JSON.stringify(sortedExports)
  ) {
    throw new Error(
      `Canonical API companion ${JSON.stringify(apiPath)} export drift: expected ${JSON.stringify(sortedExports)}, received ${JSON.stringify(sortedNames)}.`,
    );
  }
}

function sourceCandidates(importer: string, specifier: string): readonly string[] {
  const joined = posix.normalize(posix.join(posix.dirname(importer), specifier));
  if (joined.endsWith(".js")) {
    const base = joined.slice(0, -3);
    return [`${base}.ts`, `${base}.tsx`, `${base}.js`];
  }
  return [joined, `${joined}.ts`, `${joined}.tsx`, `${joined}/index.ts`, `${joined}/index.tsx`];
}

interface CanonicalSourceManifest {
  readonly id: string;
  readonly entryPath: string;
  readonly declaredImports: readonly string[];
  readonly itemDependencies: readonly string[];
  readonly outputRole: "component" | "hook" | "lib" | "system" | "kit";
}

export interface DiscoveredCanonicalSource {
  readonly descriptor: CanonicalSourceDescriptor;
  readonly descriptorPath: string;
}

const SOURCE_DISCOVERY_ROOTS = [
  "registry/source/components",
  "registry/source/systems",
  "registry/source/kits",
] as const;

function workspacePath(workspaceRoot: string, path: string): string {
  return resolve(workspaceRoot, ...path.split("/"));
}

function filesBelow(workspaceRoot: string, root: string): readonly string[] {
  const absolute = workspacePath(workspaceRoot, root);
  if (!existsSync(absolute)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(absolute, { withFileTypes: true }).sort((left, right) =>
    left.name.localeCompare(right.name, "en-US"),
  )) {
    if (entry.name.startsWith(".")) continue;
    const path = `${root}/${entry.name}`;
    assertPortableSourcePath(path);
    if (entry.isSymbolicLink()) {
      throw new Error(`Canonical source discovery refuses symbolic link ${JSON.stringify(path)}.`);
    }
    if (entry.isDirectory()) files.push(...filesBelow(workspaceRoot, path));
    else if (entry.isFile()) files.push(path);
  }
  return files.sort((left, right) => left.localeCompare(right, "en-US"));
}

function stringArray(value: unknown, label: string): readonly string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    throw new Error(`${label} must be an array of strings.`);
  }
  const normalized = value.map((entry) => entry.normalize("NFKC"));
  if (
    normalized.some((entry, index) => entry !== value[index]) ||
    new Set(normalized).size !== normalized.length
  ) {
    throw new Error(`${label} must contain unique Unicode-NFKC strings.`);
  }
  return normalized;
}

function readCanonicalSourceManifest(
  workspaceRoot: string,
  descriptorPath: string,
): CanonicalSourceManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(workspacePath(workspaceRoot, descriptorPath), "utf8"));
  } catch (error) {
    throw new Error(`Canonical descriptor ${JSON.stringify(descriptorPath)} is not valid JSON.`, {
      cause: error,
    });
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`Canonical descriptor ${JSON.stringify(descriptorPath)} must be an object.`);
  }
  const record = parsed as Record<string, unknown>;
  const expectedKeys = ["declaredImports", "entryPath", "id", "itemDependencies", "outputRole"];
  if (JSON.stringify(Object.keys(record).sort()) !== JSON.stringify(expectedKeys)) {
    throw new Error(
      `Canonical descriptor ${JSON.stringify(descriptorPath)} has unknown or missing fields.`,
    );
  }
  if (
    typeof record.id !== "string" ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(record.id) ||
    typeof record.entryPath !== "string" ||
    !["component", "hook", "lib", "system", "kit"].includes(String(record.outputRole))
  ) {
    throw new Error(`Canonical descriptor ${JSON.stringify(descriptorPath)} has invalid identity.`);
  }
  assertPortableSourcePath(record.entryPath);
  const directory = posix.dirname(descriptorPath);
  if (posix.dirname(record.entryPath) !== directory || posix.basename(directory) !== record.id) {
    throw new Error(
      `Canonical descriptor ${JSON.stringify(descriptorPath)} must identify its colocated item and entry.`,
    );
  }
  return {
    id: record.id,
    entryPath: record.entryPath,
    declaredImports: stringArray(record.declaredImports, `${descriptorPath} declaredImports`),
    itemDependencies: stringArray(record.itemDependencies, `${descriptorPath} itemDependencies`),
    outputRole: record.outputRole as CanonicalSourceManifest["outputRole"],
  };
}

function exactlyOneCompanion(
  workspaceRoot: string,
  itemId: string,
  label: string,
  candidates: readonly string[],
): string {
  const existing = candidates.filter((path) => existsSync(workspacePath(workspaceRoot, path)));
  if (existing.length !== 1) {
    throw new Error(
      `Canonical source ${JSON.stringify(itemId)} requires exactly one ${label}; found ${JSON.stringify(existing)}.`,
    );
  }
  return existing[0]!;
}

export function discoverCanonicalSourceDescriptors(
  workspaceRoot: string,
): readonly DiscoveredCanonicalSource[] {
  const legacyIds = new Set(SOURCE_BLUEPRINTS.map((source) => source.id));
  const descriptorPaths = SOURCE_DISCOVERY_ROOTS.flatMap((root) =>
    filesBelow(workspaceRoot, root).filter((path) => path.endsWith(".source.json")),
  ).sort((left, right) => left.localeCompare(right, "en-US"));
  const discovered: DiscoveredCanonicalSource[] = [];

  for (const descriptorPath of descriptorPaths) {
    const manifest = readCanonicalSourceManifest(workspaceRoot, descriptorPath);
    if (legacyIds.has(manifest.id)) continue;
    const directory = posix.dirname(descriptorPath);
    const directoryFiles = filesBelow(workspaceRoot, directory).filter(
      (path) => posix.dirname(path) === directory,
    );
    const runtimeFiles = directoryFiles.filter(
      (path) =>
        /\.(?:css|ts|tsx)$/u.test(path) && !/\.(?:spec|stories|test)\.(?:ts|tsx)$/u.test(path),
    );
    if (!runtimeFiles.includes(manifest.entryPath)) {
      throw new Error(
        `Canonical descriptor ${JSON.stringify(descriptorPath)} entry is not a runtime file.`,
      );
    }
    const styleFiles = runtimeFiles.filter((path) => path.endsWith(".css"));
    if (styleFiles.length !== 1) {
      throw new Error(
        `Canonical source ${JSON.stringify(manifest.id)} requires exactly one runtime stylesheet.`,
      );
    }
    const contents = new Map(
      runtimeFiles.map((path) => [
        path,
        normalizeText(readFileSync(workspacePath(workspaceRoot, path), "utf8"), path),
      ]),
    );
    const entryImports = importSpecifiers(contents.get(manifest.entryPath)!);
    if (
      JSON.stringify(entryImports) !==
      JSON.stringify(
        [...manifest.declaredImports].sort((left, right) => left.localeCompare(right, "en-US")),
      )
    ) {
      throw new Error(
        `Canonical descriptor ${JSON.stringify(descriptorPath)} entry import declaration drift: expected ${JSON.stringify(manifest.declaredImports)}, received ${JSON.stringify(entryImports)}.`,
      );
    }
    const declaredImports = [
      ...new Set(
        [...contents.entries()]
          .filter(([path]) => /\.(?:ts|tsx)$/u.test(path))
          .flatMap(([, content]) => importSpecifiers(content)),
      ),
    ].sort((left, right) => left.localeCompare(right, "en-US"));
    const runtimeDependencies = [
      ...new Set(
        declaredImports.filter((specifier) => !specifier.startsWith(".")).map(packageRoot),
      ),
    ].sort((left, right) => left.localeCompare(right, "en-US"));
    const metadataPath = exactlyOneCompanion(workspaceRoot, manifest.id, "metadata file", [
      `${directory}/${manifest.id}.metadata.json`,
      `${directory}/metadata.json`,
      `${directory}/component.json`,
    ]);
    const contractPath = exactlyOneCompanion(workspaceRoot, manifest.id, "contract file", [
      `${directory}/${manifest.id}.contract.json`,
      `${directory}/${manifest.id}.contract.draft.json`,
      `${directory}/contract.json`,
      `${directory}/contract.draft.json`,
    ]);
    const storyPath = exactlyOneCompanion(workspaceRoot, manifest.id, "story contract", [
      `${directory}/${manifest.id}.stories.json`,
      `${directory}/stories.json`,
    ]);
    const apiPath = exactlyOneCompanion(workspaceRoot, manifest.id, "API contract", [
      `${directory}/${manifest.id}.api.json`,
      `${directory}/api.json`,
    ]);
    const documentationPath = `${directory}/README.md`;
    if (!existsSync(workspacePath(workspaceRoot, documentationPath))) {
      throw new Error(`Canonical source ${JSON.stringify(manifest.id)} is missing README.md.`);
    }
    const publicExports = exportedNames(contents.get(manifest.entryPath)!);
    if (publicExports.length === 0) {
      throw new Error(`Canonical source ${JSON.stringify(manifest.id)} exports no public API.`);
    }
    validateApiCompanion(
      workspaceRoot,
      apiPath,
      manifest.id,
      publicExports,
      contents.get(manifest.entryPath)!,
    );
    discovered.push({
      descriptorPath,
      descriptor: {
        ...manifest,
        declaredImports,
        runtimeFiles: [...runtimeFiles].sort((left, right) => left.localeCompare(right, "en-US")),
        stylePath: styleFiles[0]!,
        runtimeDependencies,
        metadataPath,
        contractPath,
        storyPath,
        apiPath,
        documentationPath,
        publicExports,
        visibleStatus: manifest.id === "data-grid" ? "experimental" : "unreleased",
      },
    });
  }

  return discovered.sort((left, right) =>
    left.descriptor.id.localeCompare(right.descriptor.id, "en-US"),
  );
}

export function assertCanonicalSourceImports(
  descriptor: Pick<
    CanonicalSourceDescriptor,
    "declaredImports" | "id" | "runtimeDependencies" | "runtimeFiles"
  > & { readonly itemDependencies?: readonly string[] },
  contents: ReadonlyMap<string, string>,
  allRuntimeOwners?: ReadonlyMap<string, string>,
): void {
  const actualImports = new Set<string>();
  const graph = new Map<string, string[]>();
  const runtimePaths = new Set(descriptor.runtimeFiles);
  const runtimeOwners =
    allRuntimeOwners ?? new Map(descriptor.runtimeFiles.map((path) => [path, descriptor.id]));

  for (const [path, content] of contents) {
    if (!/\.(?:ts|tsx)$/u.test(path)) continue;
    const dependencies: string[] = [];
    for (const specifier of importSpecifiers(content)) {
      actualImports.add(specifier);
      if (specifier.startsWith(".")) {
        const resolved = sourceCandidates(path, specifier).find((candidate) =>
          runtimeOwners.has(candidate),
        );
        if (resolved === undefined) {
          throw new Error(
            `Canonical source ${JSON.stringify(path)} has unresolved local import ${JSON.stringify(specifier)}.`,
          );
        }
        const owner = runtimeOwners.get(resolved)!;
        if (owner !== descriptor.id) {
          if (!descriptor.itemDependencies?.includes(owner)) {
            throw new Error(
              `Canonical source ${JSON.stringify(descriptor.id)} imports item ${JSON.stringify(owner)} through ${JSON.stringify(specifier)} without declaring it as an item dependency.`,
            );
          }
        } else if (runtimePaths.has(resolved) && /\.(?:ts|tsx)$/u.test(resolved)) {
          dependencies.push(resolved);
        }
      } else {
        if (specifier.startsWith("@mergora-internal/")) {
          throw new Error(
            `Canonical source ${JSON.stringify(path)} uses unresolved internal alias ${JSON.stringify(specifier)}.`,
          );
        }
        const root = packageRoot(specifier);
        if (!descriptor.runtimeDependencies.includes(root)) {
          throw new Error(
            `Canonical source ${JSON.stringify(path)} imports undeclared package ${JSON.stringify(root)}.`,
          );
        }
      }
    }
    graph.set(path, dependencies.sort());
  }

  const actual = [...actualImports].sort();
  const declared = [...descriptor.declaredImports].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    throw new Error(
      `Canonical source ${JSON.stringify(descriptor.id)} import declaration drift: expected ${JSON.stringify(declared)}, received ${JSON.stringify(actual)}.`,
    );
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (path: string, trail: readonly string[]): void => {
    if (visiting.has(path)) {
      throw new Error(`Canonical file import cycle: ${[...trail, path].join(" -> ")}.`);
    }
    if (visited.has(path)) return;
    visiting.add(path);
    graph.get(path)?.forEach((dependency) => visit(dependency, [...trail, path]));
    visiting.delete(path);
    visited.add(path);
  };
  [...graph.keys()].sort().forEach((path) => visit(path, []));
}

function assertAcyclicSources(sources: ReadonlyMap<string, CanonicalSourceDescriptor>): void {
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string, trail: readonly string[]): void => {
    if (visiting.has(id)) {
      throw new Error(`Canonical source dependency cycle: ${[...trail, id].join(" -> ")}.`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    sources.get(id)?.itemDependencies.forEach((dependency) => visit(dependency, [...trail, id]));
    visiting.delete(id);
    visited.add(id);
  };
  [...sources.keys()].sort().forEach((id) => visit(id, []));
}

function mediaType(path: string): "text/css" | "text/typescript" | "text/typescript-jsx" {
  if (path.endsWith(".css")) return "text/css";
  return path.endsWith(".tsx") ? "text/typescript-jsx" : "text/typescript";
}

function targetRole(
  descriptor: CanonicalSourceDescriptor,
  path: string,
): "component" | "system" | "style" {
  if (path.endsWith(".css")) return "style";
  return descriptor.outputRole === "system" ? "system" : "component";
}

function relativeRuntimeName(descriptor: CanonicalSourceDescriptor, path: string): string {
  const root = posix.dirname(descriptor.entryPath);
  const relative = posix.relative(root, path);
  assertPortableSourcePath(relative);
  return relative;
}

function packagePath(descriptor: CanonicalSourceDescriptor, sourcePath: string): string {
  return `packages/ui/src/generated/${descriptor.id}/${relativeRuntimeName(descriptor, sourcePath)}`;
}

function validateBlueprint(
  workspaceRoot: string,
  definition: SourceCatalogDefinition,
  blueprint: CanonicalSourceDescriptor,
  allRuntimeOwners?: ReadonlyMap<string, string>,
): ValidatedCanonicalSource {
  const sourceDescriptorPath =
    blueprint.id === "button" ? "registry/source/components/button/button.source.json" : null;
  const paths = [
    blueprint.entryPath,
    blueprint.stylePath,
    blueprint.metadataPath,
    blueprint.contractPath,
    blueprint.documentationPath,
    ...blueprint.runtimeFiles,
    ...(blueprint.storyPath === null ? [] : [blueprint.storyPath]),
    ...(blueprint.apiPath === null ? [] : [blueprint.apiPath]),
    ...(sourceDescriptorPath === null ? [] : [sourceDescriptorPath]),
  ];
  paths.forEach(assertPortableSourcePath);

  const normalizedPaths = new Map<string, string>();
  for (const path of paths) {
    const identity = normalizedIdentity(path);
    const prior = normalizedPaths.get(identity);
    if (prior !== undefined && prior !== path) {
      throw new Error(
        `Canonical source path ${JSON.stringify(path)} collides with ${JSON.stringify(prior)} after Unicode/case normalization.`,
      );
    }
    normalizedPaths.set(identity, path);
    if (!existsSync(resolve(workspaceRoot, ...path.split("/")))) {
      throw new Error(`Canonical source input ${JSON.stringify(path)} does not exist.`);
    }
  }
  if (!blueprint.runtimeFiles.includes(blueprint.entryPath)) {
    throw new Error(
      `Canonical entry ${JSON.stringify(blueprint.entryPath)} is not a runtime file.`,
    );
  }
  if (!blueprint.runtimeFiles.includes(blueprint.stylePath)) {
    throw new Error(
      `Canonical style ${JSON.stringify(blueprint.stylePath)} is not a runtime file.`,
    );
  }
  if (sourceDescriptorPath !== null) {
    const declared = JSON.parse(
      readFileSync(resolve(workspaceRoot, ...sourceDescriptorPath.split("/")), "utf8"),
    ) as Record<string, unknown>;
    const expected = {
      id: blueprint.id,
      entryPath: blueprint.entryPath,
      declaredImports: [...blueprint.declaredImports],
      itemDependencies: [...blueprint.itemDependencies],
      outputRole: blueprint.outputRole,
    };
    const actual = {
      id: declared.id,
      entryPath: declared.entryPath,
      declaredImports: declared.declaredImports,
      itemDependencies: declared.itemDependencies,
      outputRole: declared.outputRole,
    };
    const keys = Object.keys(declared).sort();
    if (
      JSON.stringify(keys) !== JSON.stringify(Object.keys(expected).sort()) ||
      JSON.stringify(actual) !== JSON.stringify(expected)
    ) {
      throw new Error(
        `Canonical descriptor ${JSON.stringify(sourceDescriptorPath)} does not match the validated source blueprint.`,
      );
    }
  }

  const contents = new Map(
    blueprint.runtimeFiles.map((path) => [
      path,
      normalizeText(readFileSync(resolve(workspaceRoot, ...path.split("/")), "utf8"), path),
    ]),
  );
  assertCanonicalSourceImports(blueprint, contents, allRuntimeOwners);
  const styleSpecifier = `./${posix.basename(blueprint.stylePath)}`;
  const styleImported = [...contents.entries()].some(
    ([path, content]) =>
      /\.(?:ts|tsx)$/u.test(path) && importSpecifiers(content).includes(styleSpecifier),
  );
  if (!styleImported) {
    throw new Error(
      `Canonical runtime for ${JSON.stringify(blueprint.id)} must import colocated style ${JSON.stringify(styleSpecifier)}.`,
    );
  }
  const actualExports = exportedNames(contents.get(blueprint.entryPath)!);
  const declaredExports = [...blueprint.publicExports].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (JSON.stringify(actualExports) !== JSON.stringify(declaredExports)) {
    throw new Error(
      `Canonical source ${JSON.stringify(blueprint.id)} public export declaration drift: expected ${JSON.stringify(declaredExports)}, received ${JSON.stringify(actualExports)}.`,
    );
  }
  if (blueprint.apiPath !== null) {
    validateApiCompanion(
      workspaceRoot,
      blueprint.apiPath,
      blueprint.id,
      actualExports,
      contents.get(blueprint.entryPath)!,
    );
  }

  return {
    ...blueprint,
    displayName: definition.displayName ?? blueprint.id,
    riskClass: definition.riskClass ?? (blueprint.id === "button" ? 1 : 3),
    targetMaturity: definition.targetMaturity ?? "stable",
    description: definition.normativeBehavior ?? `Canonical ${blueprint.id} source.`,
    normalizedFiles: blueprint.runtimeFiles
      .map((sourcePath) => ({
        sourcePath,
        packagePath: packagePath(blueprint, sourcePath),
        content: contents.get(sourcePath)!,
        consumerContent: transformConsumerSource(contents.get(sourcePath)!, sourcePath),
        mediaType: mediaType(sourcePath),
        targetRole: targetRole(blueprint, sourcePath),
      }))
      .sort((left, right) => left.sourcePath.localeCompare(right.sourcePath, "en-US")),
    packageEntryPath: packagePath(blueprint, blueprint.entryPath),
  };
}

function validateSourceDescriptors(
  definitions: readonly SourceCatalogDefinition[],
  sources: readonly CanonicalSourceDescriptor[],
): void {
  const knownDefinitions = new Map(definitions.map((definition) => [definition.id, definition]));
  const sourceById = new Map<string, CanonicalSourceDescriptor>();
  const normalizedPaths = new Map<string, string>();

  for (const source of sources) {
    if (!knownDefinitions.has(source.id)) {
      throw new Error(`Canonical source ${JSON.stringify(source.id)} has no catalog definition.`);
    }
    if (sourceById.has(source.id)) {
      throw new Error(`Canonical source ${JSON.stringify(source.id)} is declared more than once.`);
    }
    assertPortableSourcePath(source.entryPath);
    for (const dependency of source.itemDependencies) {
      if (!knownDefinitions.has(dependency)) {
        throw new Error(
          `Canonical source ${JSON.stringify(source.id)} depends on unknown item ${JSON.stringify(dependency)}.`,
        );
      }
    }
    for (const importSpecifier of source.declaredImports) {
      if (
        importSpecifier !== importSpecifier.normalize("NFKC") ||
        importSpecifier.includes("\\") ||
        importSpecifier.startsWith("/") ||
        /^[a-z]:/i.test(importSpecifier) ||
        /^[a-z][a-z0-9+.-]*:\/\//i.test(importSpecifier)
      ) {
        throw new Error(
          `Canonical source ${JSON.stringify(source.id)} declares unsafe import ${JSON.stringify(importSpecifier)}.`,
        );
      }
    }
    const normalizedPath = normalizedIdentity(source.entryPath);
    const previousPath = normalizedPaths.get(normalizedPath);
    if (previousPath !== undefined) {
      throw new Error(
        `Canonical source path ${JSON.stringify(source.entryPath)} collides with ${JSON.stringify(previousPath)} after Unicode/case normalization.`,
      );
    }
    normalizedPaths.set(normalizedPath, source.entryPath);
    sourceById.set(source.id, source);
  }
  assertAcyclicSources(sourceById);
}

export function buildSourceTransformPlan(
  definitions: readonly SourceCatalogDefinition[],
  sources: readonly CanonicalSourceDescriptor[] = [],
): SourceTransformPlan {
  validateSourceDescriptors(definitions, sources);
  const sourceById = new Map(sources.map((source) => [source.id, source]));

  return {
    schemaVersion: 1,
    artifactKind: "source-transform-plan",
    generated: {
      by: "@mergora-internal/source-transformer",
      editPolicy: "do-not-edit",
    },
    policy: {
      direction: "canonical-source-to-generated-output-only",
      executableCodemods: false,
      arbitraryHooks: false,
      emitGeneratorInternals: false,
      normalizeText: "unicode-nfkc-utf8-lf-final-newline",
      packageSourceIsHandEdited: false,
    },
    representativeExtensionPoints: REPRESENTATIVE_EXTENSION_POINTS,
    items: [...definitions]
      .sort((left, right) => left.id.localeCompare(right.id, "en-US"))
      .map((definition) => {
        const source = sourceById.get(definition.id) ?? null;
        return {
          id: definition.id,
          implementationStatus:
            source === null ? ("unimplemented" as const) : ("source-present-unreleased" as const),
          transformStatus:
            source === null
              ? ("awaiting-canonical-source" as const)
              : ("generated-unreleased" as const),
          source,
          plannedTransforms:
            source === null
              ? []
              : (["alias-rewrite", "import-rewrite", "target-map", "format"] as const),
          emittedFiles:
            source === null
              ? []
              : source.runtimeFiles
                  .map((path) => packagePath(source, path))
                  .sort((left, right) => left.localeCompare(right, "en-US")),
        };
      }),
  };
}

export function createSourceTransformationSnapshot(
  workspaceRoot: string,
  definitions: readonly SourceCatalogDefinition[],
): SourceTransformationSnapshot {
  const definitionById = new Map(definitions.map((definition) => [definition.id, definition]));
  const discovered = discoverCanonicalSourceDescriptors(workspaceRoot);
  const descriptors: readonly CanonicalSourceDescriptor[] = [
    ...SOURCE_BLUEPRINTS,
    ...discovered.map((source) => source.descriptor),
  ];
  validateSourceDescriptors(definitions, descriptors);
  const allRuntimeOwners = new Map<string, string>();
  for (const descriptor of descriptors) {
    for (const path of descriptor.runtimeFiles) {
      const prior = allRuntimeOwners.get(path);
      if (prior !== undefined) {
        throw new Error(
          `Canonical runtime path ${JSON.stringify(path)} is owned by both ${JSON.stringify(prior)} and ${JSON.stringify(descriptor.id)}.`,
        );
      }
      allRuntimeOwners.set(path, descriptor.id);
    }
  }
  const sources = descriptors
    .map((descriptor) => {
      const definition = definitionById.get(descriptor.id);
      if (definition === undefined) {
        throw new Error(
          `Canonical source ${JSON.stringify(descriptor.id)} is absent from catalog.`,
        );
      }
      return validateBlueprint(workspaceRoot, definition, descriptor, allRuntimeOwners);
    })
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));

  const generatedPaths = new Map<string, string>();
  const files = sources.flatMap((source) =>
    source.normalizedFiles.map((file) => {
      const identity = normalizedIdentity(file.packagePath);
      const prior = generatedPaths.get(identity);
      if (prior !== undefined) {
        throw new Error(
          `Generated package path ${JSON.stringify(file.packagePath)} collides with ${JSON.stringify(prior)}.`,
        );
      }
      generatedPaths.set(identity, file.packagePath);
      return {
        path: file.packagePath,
        content: transformPackageSource(file.content, file.sourcePath),
      };
    }),
  );

  return {
    plan: buildSourceTransformPlan(definitions, sources),
    sources,
    files: files.sort((left, right) => left.path.localeCompare(right.path, "en-US")),
  };
}
