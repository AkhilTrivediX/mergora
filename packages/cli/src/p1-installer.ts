import { randomBytes } from "node:crypto";
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  CliError,
  sha256,
} from "./contracts.js";
import {
  resolveItemAlias,
  resolveSourceDependencyClosure,
  type RegistryDataOptions,
  type SourceItemRecord,
} from "./registry-data.js";
import { PUBLIC_UI_PACKAGE } from "./generated-public-package-map.js";

/** Compatibility surface retained for the immutable P1 clean-consumer command. */
export const P1_SOURCE_ITEM_IDS = ["button", "dialog", "combobox"] as const;
export type P1SourceItemId = (typeof P1_SOURCE_ITEM_IDS)[number];

const P1_FIXTURE_FILES: Readonly<Record<P1SourceItemId, readonly string[]>> = {
  button: ["button.tsx", "button-state.ts", "button.css", "button-css.d.ts"],
  dialog: ["dialog.tsx", "model.ts", "dialog.css", "dialog-css.d.ts", "index.ts"],
  combobox: ["combobox.tsx", "combobox.css", "combobox-css.d.ts", "index.ts"],
};

const P1_FIXTURE_DEPENDENCIES: Readonly<Record<P1SourceItemId, Readonly<Record<string, string>>>> =
  {
    button: {},
    dialog: { "react-aria-components": "1.19.0" },
    combobox: { "react-aria-components": "1.19.0" },
  };

export interface P1SourceInstallOptions extends RegistryDataOptions {
  readonly projectRoot: string;
  readonly itemIds: readonly string[];
  readonly targetDirectory?: string;
  /** Used only by repository compatibility fixtures. Packed CLI uses bundled generated payloads. */
  readonly templateDirectory?: string;
}

export interface SourceInstallFilePlan {
  readonly target: string;
  readonly itemId: string;
  readonly status: "write" | "unchanged";
  readonly digest: `sha256:${string}`;
  readonly byteLength: number;
}

export interface P1SourceInstallPlan {
  readonly schemaVersion: 1;
  readonly command: "add";
  readonly mode: "p1-temporary-source-installer";
  readonly projectRoot: ".";
  readonly requestedItems: readonly string[];
  readonly items: readonly string[];
  readonly transitiveItems: readonly string[];
  readonly files: readonly SourceInstallFilePlan[];
  readonly dependenciesAdded: Readonly<Record<string, string>>;
  readonly dependencyChanges: readonly {
    readonly name: string;
    readonly action: "add" | "preserve";
    readonly current: string | null;
    readonly required: string;
  }[];
  readonly manifest: ".mergora/p1-manifest.json";
  readonly writesRequired: boolean;
  readonly planDigest: `sha256:${string}`;
  readonly limitations: readonly string[];
}

export interface P1SourceInstallResult {
  readonly mode: "p1-temporary-source-installer";
  readonly items: readonly string[];
  readonly requestedItems: readonly string[];
  readonly transitiveItems: readonly string[];
  readonly writtenFiles: readonly string[];
  readonly unchangedFiles: readonly string[];
  readonly dependenciesAdded: Readonly<Record<string, string>>;
  readonly manifest: ".mergora/p1-manifest.json";
  readonly planDigest: `sha256:${string}`;
}

interface PlannedFile extends SourceInstallFilePlan {
  readonly content: string;
}

interface PackagePatch {
  readonly before: string;
  readonly content: string;
  readonly added: Readonly<Record<string, string>>;
  readonly changes: P1SourceInstallPlan["dependencyChanges"];
}

interface InternalPlan {
  readonly root: string;
  readonly publicPlan: P1SourceInstallPlan;
  readonly files: readonly PlannedFile[];
  readonly packagePatch: PackagePatch;
  readonly manifestText: string;
  readonly manifestBefore: string | null;
}

function canonicalJson(value: unknown): string {
  const normalize = (entry: unknown): unknown => {
    if (Array.isArray(entry)) return entry.map(normalize);
    if (entry === null || typeof entry !== "object") return entry;
    return Object.fromEntries(
      Object.entries(entry)
        .sort(([left], [right]) => left.localeCompare(right, "en-US"))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  };
  return `${JSON.stringify(normalize(value), null, 2)}\n`;
}

function fixtureItems(options: P1SourceInstallOptions): readonly SourceItemRecord[] {
  const supported = new Set<string>(P1_SOURCE_ITEM_IDS);
  const requested = [...new Set(options.itemIds)].sort((left, right) =>
    left.localeCompare(right, "en-US"),
  );
  if (requested.length === 0) {
    throw new CliError("add requires at least one source item.", {
      code: "ADD_ITEM_REQUIRED",
      exitCode: 2,
    });
  }
  return requested.map((itemId) => {
    if (!supported.has(itemId)) {
      throw new CliError(
        `Explicit template fixtures support only ${P1_SOURCE_ITEM_IDS.join(", ")}.`,
        {
          code: "FIXTURE_ITEM_UNSUPPORTED",
          exitCode: 7,
        },
      );
    }
    const id = itemId as P1SourceItemId;
    const directory = resolve(options.templateDirectory!, id);
    const files = P1_FIXTURE_FILES[id].map((filename) => {
      const path = resolve(directory, filename);
      if (
        !path.startsWith(`${directory}${sep}`) ||
        !existsSync(path) ||
        lstatSync(path).isSymbolicLink()
      ) {
        throw new CliError(`Canonical fixture ${id}/${filename} is missing or unsafe.`, {
          code: "FIXTURE_SOURCE_MISSING",
          exitCode: 5,
        });
      }
      const extension = filename.split(".").at(-1);
      return {
        content: readFileSync(path, "utf8"),
        executable: false as const,
        logicalPath: `registry/source/components/${id}/${filename}`,
        mediaType: extension === "css" ? "text/css" : "text/typescript",
        targetPath: `components/ui/mergora/${id}/${filename}`,
        targetRole: extension === "css" ? "style" : "component",
      };
    });
    return {
      itemId: id,
      title: id,
      description: "P1 compatibility fixture",
      kind: "component",
      visibleStatus: "unreleased",
      implementationStatus: "source-present-unreleased",
      files,
      registryDependencies: [],
      runtimeDependencies: P1_FIXTURE_DEPENDENCIES[id],
      installDependencies: P1_FIXTURE_DEPENDENCIES[id],
      blockers: [],
      packageImport: `${PUBLIC_UI_PACKAGE}/${id}`,
      packageStyleImport: `${PUBLIC_UI_PACKAGE}/${id}.css`,
      associations: {},
      payloadDigest: sha256(canonicalJson({ id, files })),
    };
  });
}

function sourceItems(options: P1SourceInstallOptions): readonly SourceItemRecord[] {
  if (options.templateDirectory !== undefined) return fixtureItems(options);
  return resolveSourceDependencyClosure(options.itemIds, options);
}

function semanticVersion(value: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/u.exec(value);
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
}

function sameOrCompatibleRange(existing: string, required: string): boolean {
  if (existing === required) return true;
  const wanted = semanticVersion(required);
  if (wanted === null) return false;
  const normalized = existing.trim();
  const operator = normalized.startsWith("^") ? "^" : normalized.startsWith("~") ? "~" : "";
  const base = semanticVersion(operator === "" ? normalized : normalized.slice(1));
  if (base === null) return false;
  const compare = (left: readonly number[], right: readonly number[]) => {
    for (let index = 0; index < 3; index += 1) {
      if (left[index]! !== right[index]!) return left[index]! - right[index]!;
    }
    return 0;
  };
  if (compare(wanted, base) < 0) return false;
  if (operator === "^") {
    if (base[0] > 0) return wanted[0] === base[0];
    if (base[1] > 0) return wanted[0] === 0 && wanted[1] === base[1];
    return wanted[0] === 0 && wanted[1] === 0 && wanted[2] === base[2];
  }
  if (operator === "~") return wanted[0] === base[0] && wanted[1] === base[1];
  return false;
}

function findObjectEnd(text: string, start: number): number {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth += 1;
    else if (character === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new CliError("package.json contains an unterminated object.", {
    code: "PACKAGE_JSON_INVALID",
    exitCode: 3,
    target: "package.json",
  });
}

interface RootProperty {
  readonly key: string;
  readonly keyStart: number;
  readonly valueStart: number;
}

function stringEnd(text: string, start: number): number {
  let escaped = false;
  for (let index = start + 1; index < text.length; index += 1) {
    const character = text[index]!;
    if (escaped) escaped = false;
    else if (character === "\\") escaped = true;
    else if (character === '"') return index;
  }
  throw new CliError("package.json contains an unterminated string.", {
    code: "PACKAGE_JSON_INVALID",
    exitCode: 3,
    target: "package.json",
  });
}

function rootProperties(text: string): readonly RootProperty[] {
  const rootOpen = text.indexOf("{");
  if (rootOpen < 0) return [];
  let depth = 0;
  const properties: RootProperty[] = [];
  for (let index = rootOpen; index < text.length; index += 1) {
    const character = text[index]!;
    if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
    else if (character === '"') {
      const end = stringEnd(text, index);
      if (depth === 1) {
        let colon = end + 1;
        while (/\s/u.test(text[colon] ?? "")) colon += 1;
        if (text[colon] === ":") {
          let valueStart = colon + 1;
          while (/\s/u.test(text[valueStart] ?? "")) valueStart += 1;
          properties.push({
            key: JSON.parse(text.slice(index, end + 1)) as string,
            keyStart: index,
            valueStart,
          });
        }
      }
      index = end;
    }
  }
  return properties;
}

function assertUniqueRootProperties(text: string): void {
  const seen = new Set<string>();
  for (const property of rootProperties(text)) {
    if (seen.has(property.key)) {
      throw new CliError(`package.json repeats top-level field ${JSON.stringify(property.key)}.`, {
        code: "PACKAGE_JSON_DUPLICATE_KEY",
        exitCode: 3,
        target: "package.json",
      });
    }
    seen.add(property.key);
  }
}

function insertDependencies(text: string, additions: Readonly<Record<string, string>>): string {
  const entries = Object.entries(additions).sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  );
  if (entries.length === 0) return text;
  const newline = text.includes("\r\n") ? "\r\n" : "\n";
  const multiline = text.includes("\n");
  const dependencyProperty = rootProperties(text).find(({ key }) => key === "dependencies");
  if (dependencyProperty !== undefined) {
    const open = dependencyProperty.valueStart;
    if (text[open] !== "{") {
      throw new CliError("package.json dependencies must be an object.", {
        code: "PACKAGE_DEPENDENCIES_INVALID",
        exitCode: 3,
        target: "package.json",
      });
    }
    const close = findObjectEnd(text, open);
    const body = text.slice(open + 1, close);
    const fieldLineStart = text.lastIndexOf("\n", dependencyProperty.keyStart) + 1;
    const fieldIndent =
      /^\s*/u.exec(text.slice(fieldLineStart, dependencyProperty.keyStart))?.[0] ?? "  ";
    const indentUnit = fieldIndent === "" ? "  " : fieldIndent;
    const childIndent = `${fieldIndent}${indentUnit}`;
    const serialized = entries
      .map(([name, version]) => `${JSON.stringify(name)}: ${JSON.stringify(version)}`)
      .join(multiline ? `,${newline}${childIndent}` : ",");
    if (body.trim() === "") {
      const inserted = multiline
        ? `${newline}${childIndent}${serialized}${newline}${fieldIndent}`
        : serialized;
      return `${text.slice(0, open + 1)}${inserted}${text.slice(close)}`;
    }
    const bodyEndWhitespace = /\s*$/u.exec(body)?.[0] ?? "";
    const bodyContent = body.slice(0, body.length - bodyEndWhitespace.length);
    const inserted = multiline
      ? `${bodyContent},${newline}${childIndent}${serialized}${bodyEndWhitespace}`
      : `${bodyContent},${serialized}${bodyEndWhitespace}`;
    return `${text.slice(0, open + 1)}${inserted}${text.slice(close)}`;
  }
  const rootOpen = text.indexOf("{");
  if (rootOpen < 0)
    throw new CliError("package.json must contain an object.", {
      code: "PACKAGE_JSON_INVALID",
      exitCode: 3,
    });
  const rootClose = findObjectEnd(text, rootOpen);
  const body = text.slice(rootOpen + 1, rootClose);
  const rootIndent = "  ";
  const childIndent = "    ";
  const serialized = entries
    .map(([name, version]) => `${JSON.stringify(name)}: ${JSON.stringify(version)}`)
    .join(multiline ? `,${newline}${childIndent}` : ",");
  const dependencyField = multiline
    ? `${JSON.stringify("dependencies")}: {${newline}${childIndent}${serialized}${newline}${rootIndent}}`
    : `${JSON.stringify("dependencies")}:{${serialized}}`;
  if (body.trim() === "") {
    const inserted = multiline
      ? `${newline}${rootIndent}${dependencyField}${newline}`
      : dependencyField;
    return `${text.slice(0, rootOpen + 1)}${inserted}${text.slice(rootClose)}`;
  }
  const trailing = /\s*$/u.exec(body)?.[0] ?? "";
  const content = body.slice(0, body.length - trailing.length);
  const inserted = multiline
    ? `${content},${newline}${rootIndent}${dependencyField}${trailing}`
    : `${content},${dependencyField}${trailing}`;
  return `${text.slice(0, rootOpen + 1)}${inserted}${text.slice(rootClose)}`;
}

function packagePatch(packagePath: string, items: readonly SourceItemRecord[]): PackagePatch {
  if (!existsSync(packagePath)) {
    throw new CliError("Source installation requires package.json at the project root.", {
      code: "PROJECT_PACKAGE_MISSING",
      exitCode: 3,
    });
  }
  const before = readFileSync(packagePath, "utf8");
  let document: Record<string, unknown>;
  try {
    const parsed = JSON.parse(before) as unknown;
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") throw new Error();
    document = parsed as Record<string, unknown>;
  } catch {
    throw new CliError("package.json must contain one valid JSON object.", {
      code: "PACKAGE_JSON_INVALID",
      exitCode: 3,
      target: "package.json",
    });
  }
  assertUniqueRootProperties(before);
  const current = document.dependencies;
  if (
    current !== undefined &&
    (current === null || Array.isArray(current) || typeof current !== "object")
  ) {
    throw new CliError("package.json dependencies must be an object when present.", {
      code: "PACKAGE_DEPENDENCIES_INVALID",
      exitCode: 3,
      target: "package.json",
    });
  }
  const dependencies = (current ?? {}) as Record<string, unknown>;
  const requirements = new Map<string, string>();
  for (const item of items) {
    for (const [name, version] of Object.entries(item.installDependencies)) {
      const previous = requirements.get(name);
      if (previous !== undefined && previous !== version) {
        throw new CliError(`Source dependency requirements for ${name} are incompatible.`, {
          code: "DEPENDENCY_REQUIREMENT_CONFLICT",
          exitCode: 7,
        });
      }
      requirements.set(name, version);
    }
  }
  const additions: Record<string, string> = {};
  const changes: {
    name: string;
    action: "add" | "preserve";
    current: string | null;
    required: string;
  }[] = [];
  for (const [name, required] of [...requirements.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en-US"),
  )) {
    const existing = dependencies[name];
    if (
      existing !== undefined &&
      (typeof existing !== "string" || !sameOrCompatibleRange(existing, required))
    ) {
      throw new CliError(
        `Dependency ${JSON.stringify(name)} is already ${JSON.stringify(existing)}; Mergora will not replace it with incompatible ${JSON.stringify(required)}.`,
        { code: "DEPENDENCY_RANGE_CONFLICT", exitCode: 7, target: "package.json" },
      );
    }
    if (existing === undefined) additions[name] = required;
    changes.push({
      name,
      action: existing === undefined ? "add" : "preserve",
      current: typeof existing === "string" ? existing : null,
      required,
    });
  }
  return { before, content: insertDependencies(before, additions), added: additions, changes };
}

function targetFilename(item: SourceItemRecord, targetPath: string): string {
  const prefix = `components/ui/mergora/${item.itemId}/`;
  if (!targetPath.startsWith(prefix)) {
    throw new CliError(`Source item ${item.itemId} has an unsupported target mapping.`, {
      code: "SOURCE_TARGET_UNSUPPORTED",
      exitCode: 5,
    });
  }
  const remainder = targetPath.slice(prefix.length);
  assertPortableRelativePath(remainder, "Source filename");
  if (remainder.includes("/")) {
    throw new CliError(`Source item ${item.itemId} contains unsupported nested target files.`, {
      code: "SOURCE_TARGET_NESTED_UNSUPPORTED",
      exitCode: 7,
    });
  }
  return remainder;
}

function internalPlan(options: P1SourceInstallOptions): InternalPlan {
  const root = realpathSync(options.projectRoot);
  const targetDirectory = options.targetDirectory ?? "src/components";
  assertPortableRelativePath(targetDirectory, "Target directory");
  const items = sourceItems(options);
  if (items.length === 0) {
    throw new CliError("add requires at least one source item.", {
      code: "ADD_ITEM_REQUIRED",
      exitCode: 2,
    });
  }
  const requestedItems = [...new Set(options.itemIds)]
    .map((id) => id)
    .sort((left, right) => left.localeCompare(right, "en-US"));
  const requestedCanonical = new Set(requestedItems.map((id) => resolveItemAlias(id, options)));
  const files: PlannedFile[] = [];
  const portableTargets = new Set<string>();
  for (const item of items) {
    for (const file of item.files) {
      const filename = targetFilename(item, file.targetPath);
      const target = `${targetDirectory}/${item.itemId}/${filename}`;
      const portableKey = target.normalize("NFC").toLocaleLowerCase("en-US");
      if (portableTargets.has(portableKey)) {
        throw new CliError(`Source install target collision at ${target}.`, {
          code: "SOURCE_TARGET_COLLISION",
          exitCode: 5,
          target,
        });
      }
      portableTargets.add(portableKey);
      assertNoSymlinkAncestors(root, target);
      const targetPath = resolve(root, ...target.split("/"));
      if (!targetPath.startsWith(`${root}${sep}`)) {
        throw new CliError("Source target escapes the project root.", {
          code: "PATH_ESCAPES_PROJECT",
          exitCode: 5,
          target,
        });
      }
      const before = existsSync(targetPath) ? readFileSync(targetPath, "utf8") : null;
      if (before !== null && before !== file.content) {
        throw new CliError(
          `Refusing to overwrite locally modified source ${JSON.stringify(target)}.`,
          {
            code: "SOURCE_LOCAL_COLLISION",
            exitCode: 6,
            target,
          },
        );
      }
      files.push({
        target,
        itemId: item.itemId,
        status: before === null ? "write" : "unchanged",
        digest: sha256(file.content),
        byteLength: Buffer.byteLength(file.content),
        content: file.content,
      });
    }
  }
  files.sort((left, right) => left.target.localeCompare(right.target, "en-US"));
  const patch = packagePatch(resolve(root, "package.json"), items);
  const manifestRelativePath = ".mergora/p1-manifest.json" as const;
  assertNoSymlinkAncestors(root, manifestRelativePath);
  const manifestPath = resolve(root, manifestRelativePath);
  const manifestBefore = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : null;
  let existingItems: string[] = [];
  let existingFiles: string[] = [];
  if (manifestBefore !== null) {
    try {
      const existing = JSON.parse(manifestBefore) as Record<string, unknown>;
      if (existing.mode !== "p1-temporary-source-installer" || existing.schemaVersion !== 1)
        throw new Error();
      existingItems = Array.isArray(existing.items)
        ? existing.items.filter((entry): entry is string => typeof entry === "string")
        : [];
      existingFiles = Array.isArray(existing.files)
        ? existing.files.filter((entry): entry is string => typeof entry === "string")
        : [];
    } catch {
      throw new CliError("The P1 installer will not replace an unknown existing manifest.", {
        code: "P1_MANIFEST_COLLISION",
        exitCode: 6,
        target: manifestRelativePath,
      });
    }
  }
  const allItems = [...new Set([...existingItems, ...items.map(({ itemId }) => itemId)])].sort(
    (left, right) => left.localeCompare(right, "en-US"),
  );
  const allFiles = [...new Set([...existingFiles, ...files.map(({ target }) => target)])].sort(
    (left, right) => left.localeCompare(right, "en-US"),
  );
  const limitations = [
    "This compatibility installer proves deterministic bundled source installation and dependency closure.",
    "P3.3 transactions, immutable base provenance, Semantic Sync updates, rollback, and recovery are not implemented by this path.",
  ] as const;
  const manifestText = canonicalJson({
    schemaVersion: 1,
    mode: "p1-temporary-source-installer",
    items: allItems,
    files: allFiles,
    limitations,
  });
  const semantic = {
    schemaVersion: 1,
    command: "add",
    mode: "p1-temporary-source-installer",
    projectRoot: ".",
    requestedItems,
    items: items.map(({ itemId }) => itemId),
    transitiveItems: items
      .map(({ itemId }) => itemId)
      .filter((itemId) => !requestedCanonical.has(itemId)),
    files: files.map(({ content: _content, ...file }) => file),
    dependenciesAdded: patch.added,
    dependencyChanges: patch.changes,
    manifest: manifestRelativePath,
    limitations,
  } as const;
  const publicPlan: P1SourceInstallPlan = {
    ...semantic,
    writesRequired:
      files.some(({ status }) => status === "write") ||
      patch.before !== patch.content ||
      manifestBefore !== manifestText,
    planDigest: sha256(JSON.stringify(semantic)),
  };
  return { root, publicPlan, files, packagePatch: patch, manifestText, manifestBefore };
}

export function planP1SourceInstall(options: P1SourceInstallOptions): P1SourceInstallPlan {
  return internalPlan(options).publicPlan;
}

function writeAtomically(path: string, content: string, _operation: string): void {
  mkdirSync(dirname(path), { recursive: true });
  let temporary = "";
  let descriptor: number | null = null;
  try {
    for (let attempt = 0; attempt < 4; attempt += 1) {
      temporary = `${path}.mergora-${randomBytes(16).toString("hex")}.tmp`;
      try {
        descriptor = openSync(temporary, "wx", 0o600);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST" || attempt === 3) throw error;
      }
    }
    if (descriptor === null) throw new Error("Unable to create an exclusive temporary file.");
    writeFileSync(descriptor, content, { encoding: "utf8" });
    fsyncSync(descriptor);
    const completedDescriptor = descriptor;
    descriptor = null;
    closeSync(completedDescriptor);
    renameSync(temporary, path);
    temporary = "";
  } finally {
    if (descriptor !== null) closeSync(descriptor);
    if (temporary !== "" && existsSync(temporary)) unlinkSync(temporary);
  }
}

export function installP1Source(options: P1SourceInstallOptions): P1SourceInstallResult {
  const plan = internalPlan(options);
  const packagePath = resolve(plan.root, "package.json");
  if (readFileSync(packagePath, "utf8") !== plan.packagePatch.before) {
    throw new CliError("package.json changed after source installation planning.", {
      code: "PLAN_TARGET_STALE",
      exitCode: 8,
      target: "package.json",
    });
  }
  for (const file of plan.files) {
    const path = resolve(plan.root, ...file.target.split("/"));
    const current = existsSync(path) ? readFileSync(path, "utf8") : null;
    if (
      (file.status === "write" && current !== null) ||
      (file.status === "unchanged" && sha256(current!) !== file.digest)
    ) {
      throw new CliError(`Source target ${file.target} changed after planning.`, {
        code: "PLAN_TARGET_STALE",
        exitCode: 8,
        target: file.target,
      });
    }
  }
  const manifestPath = resolve(plan.root, ".mergora/p1-manifest.json");
  const currentManifest = existsSync(manifestPath) ? readFileSync(manifestPath, "utf8") : null;
  if (currentManifest !== plan.manifestBefore) {
    throw new CliError("P1 manifest changed after source installation planning.", {
      code: "PLAN_TARGET_STALE",
      exitCode: 8,
      target: ".mergora/p1-manifest.json",
    });
  }
  const suffix = `mergora-add-${plan.publicPlan.planDigest.slice(-12)}`;
  for (const file of plan.files.filter(({ status }) => status === "write")) {
    writeAtomically(resolve(plan.root, ...file.target.split("/")), file.content, suffix);
  }
  if (plan.packagePatch.before !== plan.packagePatch.content) {
    writeAtomically(packagePath, plan.packagePatch.content, suffix);
  }
  if (plan.manifestBefore !== plan.manifestText) {
    writeAtomically(manifestPath, plan.manifestText, suffix);
  }
  return {
    mode: "p1-temporary-source-installer",
    items: plan.publicPlan.items,
    requestedItems: plan.publicPlan.requestedItems,
    transitiveItems: plan.publicPlan.transitiveItems,
    writtenFiles: plan.files.filter(({ status }) => status === "write").map(({ target }) => target),
    unchangedFiles: plan.files
      .filter(({ status }) => status === "unchanged")
      .map(({ target }) => target),
    dependenciesAdded: plan.packagePatch.added,
    manifest: ".mergora/p1-manifest.json",
    planDigest: plan.publicPlan.planDigest,
  };
}
