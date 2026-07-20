import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export interface GeneratedFile {
  readonly path: string;
  readonly content: string;
}

export interface GenerationIssue {
  readonly code: "missing" | "drift" | "unexpected";
  readonly path: string;
  readonly message: string;
}

export interface GenerationResult {
  readonly ok: boolean;
  readonly mode: "write" | "check";
  readonly files: readonly string[];
  readonly issues: readonly GenerationIssue[];
}

const ALLOWED_GENERATED_ROOTS = [
  "registry/generated",
  "content/generated",
  "packages/ui/src/generated",
] as const;
const ALLOWED_GENERATED_FILES = [
  "packages/cli/src/generated-public-package-map.ts",
  "packages/ui/package.json",
  "packages/ui/src/index.ts",
] as const;
const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0)!;
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

export function assertPortableGeneratedPath(path: string): void {
  if (path !== path.normalize("NFKC")) {
    throw new Error(`Generated path ${JSON.stringify(path)} is not Unicode NFKC.`);
  }
  if (
    path === "" ||
    path.startsWith("/") ||
    /^[a-z]:/i.test(path) ||
    path.includes("\\") ||
    path.includes(":") ||
    path.includes("%")
  ) {
    throw new Error(`Generated path ${JSON.stringify(path)} is not project-relative and portable.`);
  }
  const segments = path.split("/");
  for (const segment of segments) {
    if (
      segment === "" ||
      segment === "." ||
      segment === ".." ||
      containsControlCharacter(segment) ||
      /[<>"|?*]/u.test(segment) ||
      /[. ]$/u.test(segment) ||
      WINDOWS_RESERVED.test(segment)
    ) {
      throw new Error(
        `Generated path ${JSON.stringify(path)} contains unsafe segment ${JSON.stringify(segment)}.`,
      );
    }
  }
  if (
    !ALLOWED_GENERATED_ROOTS.some((root) => path.startsWith(`${root}/`)) &&
    !(ALLOWED_GENERATED_FILES as readonly string[]).includes(path)
  ) {
    throw new Error(
      `Generated path ${JSON.stringify(path)} is outside the declared generator-owned outputs.`,
    );
  }
}

function resolveGeneratedTarget(workspaceRoot: string, path: string): string {
  assertPortableGeneratedPath(path);
  const resolvedWorkspace = resolve(workspaceRoot);
  const target = resolve(resolvedWorkspace, ...path.split("/"));
  if (!target.startsWith(`${resolvedWorkspace}${sep}`)) {
    throw new Error(`Generated target ${JSON.stringify(path)} escapes the workspace.`);
  }
  const belongsToAllowedRoot = ALLOWED_GENERATED_ROOTS.some((root) => {
    const resolvedRoot = resolve(resolvedWorkspace, ...root.split("/"));
    return target.startsWith(`${resolvedRoot}${sep}`);
  });
  const belongsToAllowedFile = ALLOWED_GENERATED_FILES.some(
    (file) => target === resolve(resolvedWorkspace, ...file.split("/")),
  );
  if (!belongsToAllowedRoot && !belongsToAllowedFile) {
    throw new Error(`Generated target ${JSON.stringify(path)} is outside an allowed output root.`);
  }
  return target;
}

function listFiles(directory: string): readonly string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : [path];
  });
}

function actualGeneratedPaths(workspaceRoot: string): readonly string[] {
  const resolvedWorkspace = resolve(workspaceRoot);
  return [
    ...ALLOWED_GENERATED_ROOTS.flatMap((root) =>
      listFiles(resolve(resolvedWorkspace, ...root.split("/"))).map((path) =>
        relative(resolvedWorkspace, path).split(sep).join("/"),
      ),
    ),
    ...ALLOWED_GENERATED_FILES.filter((file) =>
      existsSync(resolve(resolvedWorkspace, ...file.split("/"))),
    ),
  ].sort();
}

function pruneEmptyGeneratedDirectories(workspaceRoot: string): void {
  const pruneChildren = (directory: string): void => {
    if (!existsSync(directory)) return;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const child = resolve(directory, entry.name);
      pruneChildren(child);
      if (readdirSync(child).length === 0) rmdirSync(child);
    }
  };

  const resolvedWorkspace = resolve(workspaceRoot);
  for (const root of ALLOWED_GENERATED_ROOTS) {
    pruneChildren(resolve(resolvedWorkspace, ...root.split("/")));
  }
}

function validateFileSet(files: readonly GeneratedFile[]): readonly GeneratedFile[] {
  const paths = new Map<string, string>();
  const ordered = [...files].sort((left, right) => left.path.localeCompare(right.path, "en-US"));
  for (const file of ordered) {
    assertPortableGeneratedPath(file.path);
    const normalizedPath = file.path.normalize("NFKC").toLocaleLowerCase("en-US");
    const prior = paths.get(normalizedPath);
    if (prior !== undefined) {
      throw new Error(
        `Generated path ${JSON.stringify(file.path)} collides with ${JSON.stringify(prior)} after Unicode/case normalization.`,
      );
    }
    if (!file.content.endsWith("\n") || file.content.includes("\r")) {
      throw new Error(
        `Generated file ${JSON.stringify(file.path)} must use UTF-8-style LF text with a final newline.`,
      );
    }
    if (file.content !== file.content.normalize("NFKC")) {
      throw new Error(
        `Generated file ${JSON.stringify(file.path)} must use deterministic Unicode NFKC text.`,
      );
    }
    paths.set(normalizedPath, file.path);
  }
  return ordered;
}

export function syncGeneratedFiles(
  workspaceRoot: string,
  files: readonly GeneratedFile[],
  mode: "write" | "check",
): GenerationResult {
  const ordered = validateFileSet(files);
  const expectedPaths = new Set(ordered.map((file) => file.path));
  const issues: GenerationIssue[] = [];

  for (const file of ordered) {
    const target = resolveGeneratedTarget(workspaceRoot, file.path);
    if (!existsSync(target)) {
      issues.push({
        code: "missing",
        path: file.path,
        message: `Generated file ${file.path} is missing.`,
      });
      if (mode === "write") {
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.content, "utf8");
      }
      continue;
    }
    if (readFileSync(target, "utf8") !== file.content) {
      issues.push({
        code: "drift",
        path: file.path,
        message: `Generated file ${file.path} differs from canonical output.`,
      });
      if (mode === "write") writeFileSync(target, file.content, "utf8");
    }
  }

  for (const actualPath of actualGeneratedPaths(workspaceRoot)) {
    if (expectedPaths.has(actualPath)) continue;
    issues.push({
      code: "unexpected",
      path: actualPath,
      message: `Unexpected generated file ${actualPath} is not owned by the current generator graph.`,
    });
    if (mode === "write") {
      const target = resolveGeneratedTarget(workspaceRoot, actualPath);
      unlinkSync(target);
    }
  }

  if (mode === "write") pruneEmptyGeneratedDirectories(workspaceRoot);

  return {
    ok: mode === "write" || issues.length === 0,
    mode,
    files: ordered.map((file) => file.path),
    issues: mode === "write" ? [] : issues,
  };
}
