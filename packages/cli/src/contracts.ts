import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

export const CLI_VERSION = "0.0.0" as const;
export const JSON_SCHEMA_VERSION = 1 as const;

export type StableExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export class CliError extends Error {
  public readonly exitCode: StableExitCode;
  public readonly code: string;
  public readonly target?: string;

  public constructor(
    message: string,
    options: { readonly code: string; readonly exitCode: StableExitCode; readonly target?: string },
  ) {
    super(message);
    this.name = "CliError";
    this.code = options.code;
    this.exitCode = options.exitCode;
    if (options.target !== undefined) this.target = options.target;
  }
}

export interface JsonError {
  readonly code: string;
  readonly message: string;
  readonly target?: string;
}

export interface JsonEnvelope<Result> {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION;
  readonly command: string;
  readonly ok: boolean;
  readonly status: string;
  readonly exitCode: StableExitCode;
  readonly result: Result;
  readonly warnings: readonly string[];
  readonly errors: readonly JsonError[];
}

export function successEnvelope<Result>(
  command: string,
  result: Result,
  options: {
    readonly status?: string | undefined;
    readonly warnings?: readonly string[] | undefined;
  } = {},
): JsonEnvelope<Result> {
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command: redactMessage(command),
    ok: true,
    status: options.status ?? "success",
    exitCode: 0,
    result,
    warnings: options.warnings ?? [],
    errors: [],
  };
}

export function errorEnvelope(
  command: string,
  error: unknown,
): JsonEnvelope<Record<string, never>> {
  const known =
    error instanceof CliError
      ? error
      : new CliError(error instanceof Error ? error.message : "Unexpected CLI failure.", {
          code: "INTERNAL_FAILURE",
          exitCode: 1,
        });
  const target = known.target === undefined ? {} : { target: redactMessage(known.target) };
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command: redactMessage(command),
    ok: false,
    status: "error",
    exitCode: known.exitCode,
    result: {},
    warnings: [],
    errors: [{ code: known.code, message: redactMessage(known.message), ...target }],
  };
}

export function canonicalJson(value: unknown): string {
  const assertUnicodeScalarSequence = (text: string, path: string): void => {
    for (let index = 0; index < text.length; index += 1) {
      const code = text.charCodeAt(index);
      if (code >= 0xd800 && code <= 0xdbff) {
        if (index + 1 >= text.length) {
          throw new TypeError(`Canonical JSON string at ${path} contains a lone surrogate.`);
        }
        const low = text.charCodeAt(index + 1);
        if (low < 0xdc00 || low > 0xdfff) {
          throw new TypeError(`Canonical JSON string at ${path} contains a lone surrogate.`);
        }
        index += 1;
      } else if (code >= 0xdc00 && code <= 0xdfff) {
        throw new TypeError(`Canonical JSON string at ${path} contains a lone surrogate.`);
      }
    }
  };

  const serialize = (entry: unknown, ancestors: WeakSet<object>, path: string): string => {
    if (entry === null || typeof entry === "boolean") return JSON.stringify(entry);
    if (typeof entry === "string") {
      assertUnicodeScalarSequence(entry, path);
      return JSON.stringify(entry);
    }
    if (typeof entry === "number") {
      if (!Number.isFinite(entry)) {
        throw new TypeError(`Canonical JSON number at ${path} must be finite.`);
      }
      return JSON.stringify(Object.is(entry, -0) ? 0 : entry);
    }
    if (typeof entry !== "object") {
      throw new TypeError(`Canonical JSON value at ${path} contains unsupported ${typeof entry}.`);
    }
    if (ancestors.has(entry)) {
      throw new TypeError(`Canonical JSON value at ${path} is cyclic.`);
    }
    ancestors.add(entry);
    try {
      if (Array.isArray(entry)) {
        const values: string[] = [];
        for (let index = 0; index < entry.length; index += 1) {
          if (!Object.hasOwn(entry, index)) {
            throw new TypeError(`Canonical JSON array at ${path} contains a hole.`);
          }
          values.push(serialize(entry[index], ancestors, `${path}/${String(index)}`));
        }
        return `[${values.join(",")}]`;
      }
      const prototype = Object.getPrototypeOf(entry) as unknown;
      if (prototype !== Object.prototype && prototype !== null) {
        throw new TypeError(`Canonical JSON value at ${path} is not a plain object.`);
      }
      const properties = Object.keys(entry).sort();
      return `{${properties
        .map((key) => {
          assertUnicodeScalarSequence(key, `${path}/<key>`);
          return `${JSON.stringify(key)}:${serialize(
            (entry as Record<string, unknown>)[key],
            ancestors,
            `${path}/${key}`,
          )}`;
        })
        .join(",")}}`;
    } finally {
      ancestors.delete(entry);
    }
  };

  return serialize(value, new WeakSet(), "$");
}

export function sha256(value: string | Uint8Array): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

const PORTABLE_SEGMENT = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;
const WINDOWS_DEVICE = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

export function assertPortableRelativePath(
  path: string,
  label: string,
  options: { readonly allowProjectRoot?: boolean } = {},
): readonly string[] {
  if (options.allowProjectRoot === true && path === ".") return [];
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    throw new CliError(`${label} contains invalid URL encoding.`, {
      code: "PATH_INVALID_ENCODING",
      exitCode: 2,
    });
  }
  if (decoded !== path || /%[0-9a-f]{2}/iu.test(decoded)) {
    throw new CliError(`${label} must not contain encoded path characters.`, {
      code: "PATH_ENCODED",
      exitCode: 2,
    });
  }
  if (
    path === "" ||
    isAbsolute(path) ||
    path.startsWith("/") ||
    path.startsWith("\\") ||
    /^[a-z]:/iu.test(path) ||
    path.includes("\\") ||
    path.includes(":") ||
    [...path].some((character) => {
      const code = character.codePointAt(0)!;
      return code <= 31 || code === 127;
    }) ||
    path.normalize("NFC") !== path
  ) {
    throw new CliError(`${label} must be a normalized portable project-relative path.`, {
      code: "PATH_UNSAFE",
      exitCode: 2,
    });
  }
  const segments = path.split("/");
  if (
    segments.some((segment, index) => {
      const portable =
        segment === ".mergora" ||
        segment === ".gitignore" ||
        (segment === ".lock" && index === 1 && segments[0] === ".mergora") ||
        PORTABLE_SEGMENT.test(segment);
      return (
        segment === "" ||
        segment === "." ||
        segment === ".." ||
        !portable ||
        segment.endsWith(".") ||
        segment.endsWith(" ") ||
        WINDOWS_DEVICE.test(segment)
      );
    })
  ) {
    throw new CliError(`${label} contains an unsafe path segment.`, {
      code: "PATH_UNSAFE_SEGMENT",
      exitCode: 2,
    });
  }
  return segments;
}

export function resolveInside(
  root: string,
  path: string,
  label: string,
  options: { readonly allowProjectRoot?: boolean } = {},
): string {
  const segments = assertPortableRelativePath(path, label, options);
  const target = resolve(root, ...segments);
  const fromRoot = relative(root, target);
  if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new CliError(`${label} escapes the project root.`, {
      code: "PATH_ESCAPES_PROJECT",
      exitCode: 5,
      target: path,
    });
  }
  return target;
}

export function assertNoSymlinkAncestors(root: string, relativePath: string): void {
  const segments = assertPortableRelativePath(relativePath, "Project path");
  let candidate = root;
  for (const segment of segments) {
    candidate = resolve(candidate, segment);
    try {
      if (lstatSync(candidate).isSymbolicLink()) {
        throw new CliError(`Refusing to access symbolic link ${JSON.stringify(relativePath)}.`, {
          code: "PATH_SYMLINK_REJECTED",
          exitCode: 5,
          target: relativePath,
        });
      }
    } catch (error) {
      if (error instanceof CliError) throw error;
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw new CliError(`Unable to safely inspect ${JSON.stringify(relativePath)}.`, {
          code: "PATH_INSPECTION_FAILED",
          exitCode: 5,
          target: relativePath,
        });
      }
    }
  }
}

export function validatedProjectRoot(candidate: string): string {
  const resolved = resolve(candidate);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new CliError("Project root candidate is not an existing directory.", {
      code: "PROJECT_ROOT_INVALID",
      exitCode: 3,
    });
  }
  const real = realpathSync(resolved);
  if (!existsSync(resolve(real, "package.json"))) {
    throw new CliError(
      "Project root must contain package.json; select the application package explicitly.",
      {
        code: "PROJECT_PACKAGE_MISSING",
        exitCode: 3,
      },
    );
  }
  if (lstatSync(resolve(real, "package.json")).isSymbolicLink()) {
    throw new CliError("Project package.json must not be a symbolic link.", {
      code: "PROJECT_PACKAGE_SYMLINK",
      exitCode: 5,
      target: "package.json",
    });
  }
  return real;
}

export function redactMessage(message: string): string {
  const home = homedir();
  let redacted = home === "" ? message : message.split(home).join("<home>");
  redacted = redacted.replace(
    /([?&](?:token|key|auth|password|secret)=)[^&#\s]*/giu,
    "$1<redacted>",
  );
  redacted = redacted.replace(
    /(--?(?:token|key|auth|password|secret)=)[^\s"']*/giu,
    "$1<redacted>",
  );
  redacted = redacted.replace(/(https?:\/\/)[^/@\s]+@/giu, "$1<redacted>@");
  redacted = redacted.replace(/(^|[\s"'(])(?:[A-Za-z]:[\\/]|\\\\)[^\s"']+/gu, "$1<path>");
  redacted = redacted.replace(/(^|[\s"'(])\/(?!\/)(?:[^/\s"']+\/)+[^\s"',)]*/gu, "$1<path>");
  return redacted;
}

export function portableSort(values: readonly string[]): readonly string[] {
  return [...values].sort((left, right) => left.localeCompare(right, "en-US"));
}

export function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(`${root}${sep}`);
}
