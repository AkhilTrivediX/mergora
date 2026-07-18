export type ValidationIssueSeverity = "error" | "warning";

export interface ValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly path: string;
  readonly severity: ValidationIssueSeverity;
}

export type ValidationResult<T> =
  | { readonly ok: true; readonly value: T; readonly issues: readonly ValidationIssue[] }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

export const CATALOG_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;
export const SEMVER_PATTERN =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function issue(
  code: string,
  path: string,
  message: string,
  severity: ValidationIssueSeverity = "error",
): ValidationIssue {
  return { code, message, path, severity };
}

export function validationResult<T>(
  value: T,
  issues: readonly ValidationIssue[],
): ValidationResult<T> {
  return issues.some((entry) => entry.severity === "error")
    ? { ok: false, issues }
    : { ok: true, value, issues };
}

export function isCatalogId(value: string): boolean {
  return value.length <= 128 && CATALOG_ID_PATTERN.test(value);
}

export function isSha256(value: string): boolean {
  return SHA256_PATTERN.test(value);
}

export function isSemver(value: string): boolean {
  return SEMVER_PATTERN.test(value);
}

export function isImmutableHttpsUrl(value: string): boolean {
  if (value.length > 2048 || !/^https:\/\/[^\s?#]+$/.test(value)) return false;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

export function isProjectRelativePath(value: string): boolean {
  if (
    value.length === 0 ||
    value.length > 1024 ||
    value.startsWith("/") ||
    /^[A-Za-z]:/.test(value) ||
    value.includes("\\") ||
    value.includes("//") ||
    value.includes(":") ||
    value.normalize("NFKC") !== value ||
    [...value].some((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && (codePoint <= 31 || codePoint === 127);
    })
  ) {
    return false;
  }
  return value
    .split("/")
    .every((segment) => segment.length > 0 && segment !== ".." && !/[. ]$/.test(segment));
}

export function isExactIsoInstant(value: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function assertNever(value: never, context: string): never {
  throw new Error(`Unexpected ${context}: ${String(value)}`);
}

export function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
