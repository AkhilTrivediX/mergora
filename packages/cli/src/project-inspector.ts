import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import {
  assertNoSymlinkAncestors,
  assertPortableRelativePath,
  CliError,
  validatedProjectRoot,
} from "./contracts.js";

export type Framework = "next-app" | "next-pages" | "vite-react" | "react";
export type PackageManager = "npm" | "pnpm" | "yarn" | "bun";

export interface ProjectInspectionOptions {
  readonly framework?: Framework | undefined;
  readonly sourceRoot?: string | undefined;
  readonly globalCss?: string | undefined;
  readonly aliasPrefix?: string | undefined;
  readonly packageManager?: PackageManager | undefined;
}

export interface ProjectInspection {
  readonly root: string;
  readonly framework: Framework;
  readonly frameworkEvidence: readonly string[];
  readonly sourceRoot: string;
  readonly tsconfig: string;
  readonly aliasPrefix: string;
  readonly aliasEvidence: readonly string[];
  readonly globalCss: string;
  readonly stylingEngine: "tailwind-v4";
  readonly packageManager: PackageManager;
  readonly packageManagerEvidence: readonly string[];
  readonly packageName: string;
  readonly hasMergoraConfig: boolean;
  readonly hasManifest: boolean;
  readonly warnings: readonly string[];
}

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && !Array.isArray(value) && typeof value === "object";
}

function strictJson(path: string, label: string): JsonObject {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!isObject(value)) throw new Error("object required");
    return value;
  } catch {
    throw new CliError(`${label} must contain one valid JSON object.`, {
      code: "PROJECT_JSON_INVALID",
      exitCode: 3,
      target: relative(dirname(path), path).replaceAll("\\", "/"),
    });
  }
}

/** A bounded JSONC reader used only for inspection; source bytes are never rewritten. */
function parseJsonc(text: string, label: string): JsonObject {
  let output = "";
  let inString = false;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    const next = text[index + 1];
    if (lineComment) {
      if (character === "\n" || character === "\r") {
        lineComment = false;
        output += character;
      } else output += " ";
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        output += "  ";
        index += 1;
      } else output += character === "\n" || character === "\r" ? character : " ";
      continue;
    }
    if (inString) {
      output += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      output += character;
    } else if (character === "/" && next === "/") {
      lineComment = true;
      output += "  ";
      index += 1;
    } else if (character === "/" && next === "*") {
      blockComment = true;
      output += "  ";
      index += 1;
    } else output += character;
  }
  if (inString || blockComment) {
    throw new CliError(`${label} contains an unterminated string or comment.`, {
      code: "TSCONFIG_INVALID",
      exitCode: 3,
      target: label,
    });
  }
  let withoutTrailingCommas = "";
  inString = false;
  escaped = false;
  for (let index = 0; index < output.length; index += 1) {
    const character = output[index]!;
    if (inString) {
      withoutTrailingCommas += character;
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') {
      inString = true;
      withoutTrailingCommas += character;
      continue;
    }
    if (character === ",") {
      let next = index + 1;
      while (/\s/u.test(output[next] ?? "")) next += 1;
      if (output[next] === "}" || output[next] === "]") continue;
    }
    withoutTrailingCommas += character;
  }
  try {
    const value = JSON.parse(withoutTrailingCommas) as unknown;
    if (!isObject(value)) throw new Error("object required");
    return value;
  } catch {
    throw new CliError(`${label} is not valid JSONC.`, {
      code: "TSCONFIG_INVALID",
      exitCode: 3,
      target: label,
    });
  }
}

function dependencyMap(document: JsonObject): Readonly<Record<string, unknown>> {
  const result: Record<string, unknown> = {};
  for (const field of ["dependencies", "devDependencies", "peerDependencies"] as const) {
    const section = document[field];
    if (section !== undefined && !isObject(section)) {
      throw new CliError(`package.json ${field} must be an object.`, {
        code: "PACKAGE_DEPENDENCIES_INVALID",
        exitCode: 3,
        target: "package.json",
      });
    }
    Object.assign(result, section);
  }
  return result;
}

function hasDirectory(root: string, path: string): boolean {
  if (path === ".") return true;
  assertNoSymlinkAncestors(root, path);
  const candidate = resolve(root, path);
  return existsSync(candidate) && statSync(candidate).isDirectory();
}

function hasRegularFile(root: string, path: string): boolean {
  assertNoSymlinkAncestors(root, path);
  const candidate = resolve(root, path);
  return existsSync(candidate) && statSync(candidate).isFile();
}

function detectFramework(
  root: string,
  dependencies: Readonly<Record<string, unknown>>,
  override: Framework | undefined,
): { readonly framework: Framework; readonly evidence: readonly string[] } {
  if (override !== undefined) {
    const hasReact = typeof dependencies.react === "string";
    const compatible =
      hasReact &&
      (override === "react" ||
        (override === "vite-react" && typeof dependencies.vite === "string") ||
        ((override === "next-app" || override === "next-pages") &&
          typeof dependencies.next === "string"));
    if (!compatible) {
      throw new CliError(`--framework ${override} contradicts installed framework dependencies.`, {
        code: "FRAMEWORK_OVERRIDE_CONFLICT",
        exitCode: 7,
        target: "package.json",
      });
    }
    return { framework: override, evidence: [`--framework=${override}`] };
  }
  if (typeof dependencies.next === "string") {
    const appRoots = ["src/app", "app"].filter((path) => hasDirectory(root, path));
    const pageRoots = ["src/pages", "pages"].filter((path) => hasDirectory(root, path));
    if (appRoots.length > 0 && pageRoots.length > 0) {
      throw new CliError(
        "Both Next App and Pages Router roots exist; pass --framework next-app or --framework next-pages.",
        { code: "FRAMEWORK_AMBIGUOUS", exitCode: 7 },
      );
    }
    if (appRoots.length > 0)
      return { framework: "next-app", evidence: ["dependency:next", `directory:${appRoots[0]!}`] };
    if (pageRoots.length > 0)
      return {
        framework: "next-pages",
        evidence: ["dependency:next", `directory:${pageRoots[0]!}`],
      };
    throw new CliError(
      "Next.js is installed but no router root was found; pass --framework next-app or next-pages.",
      { code: "FRAMEWORK_AMBIGUOUS", exitCode: 7 },
    );
  }
  if (typeof dependencies.vite === "string" && typeof dependencies.react === "string") {
    return { framework: "vite-react", evidence: ["dependency:vite", "dependency:react"] };
  }
  if (typeof dependencies.react === "string") {
    return { framework: "react", evidence: ["dependency:react"] };
  }
  throw new CliError("A supported React framework was not detected.", {
    code: "FRAMEWORK_UNSUPPORTED",
    exitCode: 7,
  });
}

function detectSourceRoot(root: string, override: string | undefined): string {
  const sourceRoot = override ?? (hasDirectory(root, "src") ? "src" : ".");
  assertPortableRelativePath(sourceRoot, "Source root", { allowProjectRoot: true });
  if (!hasDirectory(root, sourceRoot)) {
    throw new CliError(`Source root ${JSON.stringify(sourceRoot)} is not an existing directory.`, {
      code: "SOURCE_ROOT_INVALID",
      exitCode: 3,
      target: sourceRoot,
    });
  }
  return sourceRoot;
}

function sourcePath(sourceRoot: string, suffix: string): string {
  const path = sourceRoot === "." ? suffix : `${sourceRoot}/${suffix}`;
  assertPortableRelativePath(path, "Detected source path");
  return path;
}

function detectAliasPrefix(
  root: string,
  tsconfig: string,
  sourceRoot: string,
  override: string | undefined,
): { readonly prefix: string; readonly evidence: readonly string[] } {
  assertNoSymlinkAncestors(root, tsconfig);
  const document = parseJsonc(readFileSync(resolve(root, tsconfig), "utf8"), tsconfig);
  const compilerOptions = document.compilerOptions;
  const paths = isObject(compilerOptions) ? compilerOptions.paths : undefined;
  const candidates: string[] = [];
  if (isObject(paths)) {
    for (const [key, value] of Object.entries(paths)) {
      if (
        key.endsWith("/*") &&
        /^[@~][a-zA-Z0-9._/-]*\/\*$/u.test(key) &&
        Array.isArray(value) &&
        value.some(
          (target) =>
            target === `${sourceRoot}/*` ||
            target === `./${sourceRoot}/*` ||
            target === "./*" ||
            target === "*",
        )
      ) {
        candidates.push(key.slice(0, -2));
      }
    }
  }
  const unique = [...new Set(candidates)].sort((left, right) => left.localeCompare(right, "en-US"));
  if (override !== undefined) {
    if (!/^[@~][a-zA-Z0-9._-]*$/u.test(override)) {
      throw new CliError("Alias prefix must start with @ or ~ and contain portable characters.", {
        code: "ALIAS_PREFIX_INVALID",
        exitCode: 2,
      });
    }
    if (unique.length === 0) {
      throw new CliError(
        `${tsconfig} does not declare a source path alias; configure one before initialization.`,
        { code: "ALIAS_NOT_CONFIGURED", exitCode: 3, target: tsconfig },
      );
    }
    if (!unique.includes(override)) {
      throw new CliError(
        `--alias-prefix ${override} is not backed by the source aliases declared in ${tsconfig}.`,
        { code: "ALIAS_OVERRIDE_CONFLICT", exitCode: 3, target: tsconfig },
      );
    }
    return {
      prefix: override,
      evidence: [`--alias-prefix=${override}`, `${tsconfig}:paths`],
    };
  }
  if (unique.length > 1) {
    throw new CliError(
      `Multiple source aliases were detected (${unique.join(", ")}); pass --alias-prefix explicitly.`,
      { code: "ALIAS_AMBIGUOUS", exitCode: 3 },
    );
  }
  if (unique.length === 1) return { prefix: unique[0]!, evidence: [`${tsconfig}:paths`] };
  throw new CliError(
    `${tsconfig} does not declare a source path alias; configure one before initialization.`,
    { code: "ALIAS_NOT_CONFIGURED", exitCode: 3, target: tsconfig },
  );
}

function detectGlobalCss(
  root: string,
  framework: Framework,
  sourceRoot: string,
  override: string | undefined,
): string {
  if (override !== undefined) {
    assertPortableRelativePath(override, "Global CSS path");
    if (!hasRegularFile(root, override)) {
      throw new CliError(`Global CSS path ${JSON.stringify(override)} does not exist.`, {
        code: "GLOBAL_CSS_MISSING",
        exitCode: 3,
        target: override,
      });
    }
    return override;
  }
  const candidates = [
    sourcePath(sourceRoot, "app/globals.css"),
    sourcePath(sourceRoot, "styles/globals.css"),
    sourcePath(sourceRoot, "styles/global.css"),
    sourcePath(sourceRoot, "index.css"),
  ].filter((path) => hasRegularFile(root, path));
  if (candidates.length > 1) {
    throw new CliError(
      `Multiple global CSS candidates were detected (${candidates.join(", ")}); pass --global-css.`,
      { code: "GLOBAL_CSS_AMBIGUOUS", exitCode: 3 },
    );
  }
  if (candidates.length === 1) return candidates[0]!;
  const expected =
    framework === "next-app" || framework === "next-pages"
      ? sourcePath(sourceRoot, "app/globals.css")
      : sourcePath(sourceRoot, "index.css");
  throw new CliError(
    `No global CSS entry was found; create it or pass --global-css (${expected}).`,
    {
      code: "GLOBAL_CSS_MISSING",
      exitCode: 3,
    },
  );
}

function managerFromPackageField(value: unknown): PackageManager | undefined {
  if (typeof value !== "string") return undefined;
  const match = /^(npm|pnpm|yarn|bun)@[^\s]+$/u.exec(value);
  if (match === null) {
    throw new CliError(
      "package.json packageManager must be an exact npm, pnpm, yarn, or bun reference.",
      {
        code: "PACKAGE_MANAGER_FIELD_INVALID",
        exitCode: 3,
        target: "package.json",
      },
    );
  }
  return match[1] as PackageManager;
}

const LOCKFILES: Readonly<Record<string, PackageManager>> = {
  "bun.lock": "bun",
  "bun.lockb": "bun",
  "package-lock.json": "npm",
  "pnpm-lock.yaml": "pnpm",
  "yarn.lock": "yarn",
};

function packageDeclaresWorkspace(path: string): boolean {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink() || !metadata.isFile()) return false;
    const document = JSON.parse(readFileSync(path, "utf8")) as unknown;
    return (
      document !== null &&
      !Array.isArray(document) &&
      typeof document === "object" &&
      (document as Record<string, unknown>).workspaces !== undefined
    );
  } catch {
    return false;
  }
}

function isLocalBoundaryMarker(path: string, allowDirectory: boolean): boolean {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) return false;
    return metadata.isFile() || (allowDirectory && metadata.isDirectory());
  } catch {
    return false;
  }
}

function workspaceBoundary(root: string): string {
  let directory = root;
  while (true) {
    if (
      isLocalBoundaryMarker(resolve(directory, ".git"), true) ||
      isLocalBoundaryMarker(resolve(directory, "pnpm-workspace.yaml"), false) ||
      packageDeclaresWorkspace(resolve(directory, "package.json"))
    ) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) return root;
    directory = parent;
  }
}

function nearestLocks(root: string): {
  readonly manager: PackageManager | undefined;
  readonly evidence: readonly string[];
} {
  const boundary = workspaceBoundary(root);
  let directory = root;
  while (true) {
    const matches = readdirSync(directory, { withFileTypes: true })
      .filter((entry) => LOCKFILES[entry.name] !== undefined)
      .map((entry) => {
        if (!entry.isFile()) {
          throw new CliError(
            `Refusing to use non-regular package-manager lockfile ${JSON.stringify(entry.name)}.`,
            {
              code: "PACKAGE_MANAGER_LOCK_UNSAFE",
              exitCode: 5,
              target: entry.name,
            },
          );
        }
        return { file: entry.name, manager: LOCKFILES[entry.name]! };
      });
    const managers = [...new Set(matches.map(({ manager }) => manager))];
    if (managers.length > 1) {
      throw new CliError("Conflicting authoritative package-manager lockfiles were detected.", {
        code: "PACKAGE_MANAGER_AMBIGUOUS",
        exitCode: 3,
      });
    }
    if (managers.length === 1) {
      return {
        manager: managers[0],
        evidence: matches.map(({ file }) =>
          directory === root ? `lockfile:${file}` : `workspace-lockfile:${file}`,
        ),
      };
    }
    if (directory === boundary) return { manager: undefined, evidence: [] };
    const parent = dirname(directory);
    if (parent === directory) return { manager: undefined, evidence: [] };
    directory = parent;
  }
}

function detectPackageManager(
  root: string,
  packageDocument: JsonObject,
  override: PackageManager | undefined,
): { readonly manager: PackageManager; readonly evidence: readonly string[] } {
  const field = managerFromPackageField(packageDocument.packageManager);
  const locks = nearestLocks(root);
  if (field !== undefined && locks.manager !== undefined && field !== locks.manager) {
    throw new CliError("packageManager contradicts the nearest authoritative lockfile.", {
      code: "PACKAGE_MANAGER_CONFLICT",
      exitCode: 3,
    });
  }
  if (override !== undefined) {
    const authoritative = locks.manager ?? field;
    if (authoritative !== undefined && authoritative !== override) {
      throw new CliError(
        `--package-manager ${override} contradicts the committed ${authoritative} selection.`,
        { code: "PACKAGE_MANAGER_OVERRIDE_CONFLICT", exitCode: 7 },
      );
    }
    return {
      manager: override,
      evidence: [
        ...locks.evidence,
        ...(field === undefined ? [] : ["package.json:packageManager"]),
        `--package-manager=${override}`,
      ],
    };
  }
  const manager = locks.manager ?? field;
  if (manager === undefined) {
    throw new CliError(
      "No authoritative package manager was detected; commit a lockfile or packageManager field.",
      { code: "PACKAGE_MANAGER_UNDETECTED", exitCode: 3 },
    );
  }
  return {
    manager,
    evidence: [...locks.evidence, ...(field === undefined ? [] : ["package.json:packageManager"])],
  };
}

function assertTailwindV4(
  root: string,
  dependencies: Readonly<Record<string, unknown>>,
  globalCss: string,
): void {
  const version = dependencies.tailwindcss;
  assertNoSymlinkAncestors(root, globalCss);
  const css = readFileSync(resolve(root, globalCss), "utf8");
  const packageV4 = typeof version === "string" && /(?:^|[^0-9])4(?:\.|$)/u.test(version);
  const cssV4 = /@import\s+["']tailwindcss["']/u.test(css);
  if (!packageV4 && !cssV4) {
    throw new CliError("Mergora config v1 requires Tailwind CSS v4.", {
      code: "STYLING_ENGINE_UNSUPPORTED",
      exitCode: 7,
      target: globalCss,
    });
  }
}

export function inspectProject(
  candidate: string,
  options: ProjectInspectionOptions = {},
): ProjectInspection {
  const root = validatedProjectRoot(candidate);
  const packageDocument = strictJson(resolve(root, "package.json"), "package.json");
  const dependencies = dependencyMap(packageDocument);
  const framework = detectFramework(root, dependencies, options.framework);
  const sourceRoot = detectSourceRoot(root, options.sourceRoot);
  const tsconfig = "tsconfig.json";
  assertNoSymlinkAncestors(root, tsconfig);
  if (!existsSync(resolve(root, tsconfig))) {
    throw new CliError("Mergora config v1 requires an existing tsconfig.json.", {
      code: "TSCONFIG_MISSING",
      exitCode: 3,
      target: tsconfig,
    });
  }
  const alias = detectAliasPrefix(root, tsconfig, sourceRoot, options.aliasPrefix);
  const globalCss = detectGlobalCss(root, framework.framework, sourceRoot, options.globalCss);
  assertTailwindV4(root, dependencies, globalCss);
  const packageManager = detectPackageManager(root, packageDocument, options.packageManager);
  assertNoSymlinkAncestors(root, "mergora.json");
  assertNoSymlinkAncestors(root, ".mergora/manifest.json");
  return {
    root,
    framework: framework.framework,
    frameworkEvidence: framework.evidence,
    sourceRoot,
    tsconfig,
    aliasPrefix: alias.prefix,
    aliasEvidence: alias.evidence,
    globalCss,
    stylingEngine: "tailwind-v4",
    packageManager: packageManager.manager,
    packageManagerEvidence: packageManager.evidence,
    packageName:
      typeof packageDocument.name === "string" ? packageDocument.name : "unnamed-project",
    hasMergoraConfig: existsSync(resolve(root, "mergora.json")),
    hasManifest: existsSync(resolve(root, ".mergora/manifest.json")),
    warnings: alias.evidence[0]?.startsWith("default:") === true ? [alias.evidence[0]] : [],
  };
}
