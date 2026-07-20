import { createHash } from "node:crypto";
import { existsSync, lstatSync, realpathSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, relative, resolve, sep } from "node:path";

import {
  isJsonResultStatus,
  normalizeCliCommand,
  type JsonResultStatus,
} from "./command-contract.js";

export const CLI_VERSION = "0.0.0" as const;
export const JSON_SCHEMA_VERSION = 1 as const;

export type StableExitCode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;

export interface CliErrorOptions {
  readonly code: string;
  readonly docs?: string;
  readonly exitCode: StableExitCode;
  readonly recovery?: string;
  readonly reportId?: string;
  readonly target?: string;
  readonly transactionId?: string;
}

export class CliError extends Error {
  public readonly exitCode: StableExitCode;
  public readonly code: string;
  public readonly docs?: string;
  public readonly recovery?: string;
  public readonly reportId?: string;
  public readonly target?: string;
  public readonly transactionId?: string;

  public constructor(message: string, options: CliErrorOptions) {
    super(message);
    this.name = "CliError";
    this.code = options.code;
    this.exitCode = options.exitCode;
    if (options.docs !== undefined) this.docs = options.docs;
    if (options.recovery !== undefined) this.recovery = options.recovery;
    if (options.reportId !== undefined) this.reportId = options.reportId;
    if (options.target !== undefined) this.target = options.target;
    if (options.transactionId !== undefined) this.transactionId = options.transactionId;
  }
}

/**
 * Authorization is an opaque HTTP field value supplied by the consumer. Keep validation shared so
 * every registry transport applies the same bounded, injection-safe policy without interpreting
 * or persisting the credential.
 */
export function isValidAuthorizationHeaderValue(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 8_192 &&
    ![...value].some((character) => {
      const codePoint = character.codePointAt(0)!;
      return codePoint <= 0x1f || codePoint === 0x7f;
    })
  );
}

export interface JsonError {
  readonly code: string;
  readonly docs?: string;
  readonly message: string;
  readonly recovery?: string;
  readonly reportId?: string;
  readonly target?: string;
  readonly transactionId?: string;
}

export interface JsonEnvelope<Result> {
  readonly schemaVersion: typeof JSON_SCHEMA_VERSION;
  readonly command: string;
  readonly ok: boolean;
  readonly status: JsonResultStatus;
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
  const status = options.status ?? "success";
  if (!isJsonResultStatus(status)) {
    throw new TypeError(`Unsupported JSON result status ${JSON.stringify(status)}.`);
  }
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command: normalizeCliCommand(command),
    ok: true,
    status,
    exitCode: 0,
    result,
    warnings: (options.warnings ?? []).map(redactMessage),
    errors: [],
  };
}

const NETWORK_ERROR_CODES = new Set([
  "REGISTRY_EVIDENCE_MISSING",
  "REGISTRY_HTTP_FAILURE",
  "REGISTRY_NETWORK_FAILURE",
  "REGISTRY_NOT_FOUND",
  "REGISTRY_TIMEOUT",
]);

function internalReportId(error: unknown): string {
  const candidate = error instanceof Error ? error.name : typeof error;
  const errorClass = /^[A-Za-z][A-Za-z0-9]{0,79}$/u.test(candidate) ? candidate : "UnknownError";
  return `report-${createHash("sha256")
    .update(`${CLI_VERSION}\0${errorClass}`)
    .digest("hex")
    .slice(0, 16)}`;
}

function stableExitCode(error: CliError): StableExitCode {
  if (
    /(?:AUTHENTICATION|AUTHORIZATION)_REQUIRED$/u.test(error.code) ||
    error.code === "REGISTRY_AUTH_REQUIRED" ||
    (error.code === "REGISTRY_HTTP_FAILURE" && /\b(?:401|403)\b/u.test(error.message))
  ) {
    return 11;
  }
  if (NETWORK_ERROR_CODES.has(error.code)) return 4;
  return error.exitCode;
}

function defaultRecovery(exitCode: StableExitCode): string {
  switch (exitCode) {
    case 1:
      return "Re-run with --verbose and report the stable report ID without including secrets.";
    case 2:
      return "Review mergora <command> --help and retry with supported arguments.";
    case 3:
      return "Run mergora doctor and repair the reported project configuration or provenance file.";
    case 4:
      return "Retry the immutable artifact request or provide the exact verified cache/vendor artifact.";
    case 5:
      return "Inspect and verify the registry identity, digest, schema, license, and security policy.";
    case 6:
      return "Review the conflict details and use the narrow remove or resolve workflow.";
    case 7:
      return "Select a supported framework, runtime, dependency, item version, or audit capability.";
    case 8:
      return "Run mergora recover and review the recorded transaction before retrying.";
    case 9:
      return "Resolve the package-manager failure, restore a consistent lockfile, and retry the exact plan.";
    case 10:
      return "Review the failed Contract assertions and their remediation context.";
    case 11:
      return "Set the enrolled registry authentication environment variable and retry without logging its value.";
    case 12:
      return "Review the exact plan and pass the narrow acceptance flag named by the command.";
    case 0:
      return "No recovery is required.";
  }
}

function normalizedError(error: unknown): CliError {
  if (!(error instanceof CliError)) {
    return new CliError("Unexpected CLI failure.", {
      code: "INTERNAL_FAILURE",
      exitCode: 1,
      recovery: defaultRecovery(1),
      reportId: internalReportId(error),
    });
  }
  const exitCode = stableExitCode(error);
  return new CliError(error.message, {
    code: error.code,
    exitCode,
    ...(error.docs === undefined ? {} : { docs: error.docs }),
    recovery: error.recovery ?? defaultRecovery(exitCode),
    ...(error.reportId === undefined && exitCode !== 1
      ? {}
      : { reportId: error.reportId ?? internalReportId(error) }),
    ...(error.target === undefined ? {} : { target: error.target }),
    ...(error.transactionId === undefined ? {} : { transactionId: error.transactionId }),
  });
}

function portableErrorTarget(target: string | undefined): string | undefined {
  if (target === undefined) return undefined;
  const redacted = redactMessage(target);
  try {
    assertPortableRelativePath(redacted, "Error target");
    return redacted;
  } catch {
    return undefined;
  }
}

export function errorEnvelope(
  command: string,
  error: unknown,
): JsonEnvelope<Record<string, never>> {
  const known = normalizedError(error);
  const target = portableErrorTarget(known.target);
  const details: JsonError = {
    code: known.code,
    message: redactMessage(known.message),
    recovery: redactMessage(known.recovery ?? defaultRecovery(known.exitCode)),
    ...(known.docs === undefined ? {} : { docs: redactMessage(known.docs) }),
    ...(known.reportId === undefined ? {} : { reportId: known.reportId }),
    ...(target === undefined ? {} : { target }),
    ...(known.transactionId === undefined
      ? {}
      : { transactionId: redactMessage(known.transactionId) }),
  };
  return {
    schemaVersion: JSON_SCHEMA_VERSION,
    command: normalizeCliCommand(command),
    ok: false,
    status: "error",
    exitCode: known.exitCode,
    result: {},
    warnings: [],
    errors: [details],
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
