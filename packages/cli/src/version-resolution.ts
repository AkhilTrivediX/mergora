import { compare, maxSatisfying, parse, prerelease, satisfies, validRange } from "semver";

import { CliError } from "./contracts.js";

const MAX_RELEASE_VERSIONS = 4096;

export interface ImmutableReleaseVersionPolicy {
  readonly allowPrereleases: boolean;
}

function releaseError(message: string, code: string, target?: string): CliError {
  return new CliError(message, { code, exitCode: 4, ...(target === undefined ? {} : { target }) });
}

function canonicalExactVersion(value: string): string | null {
  const parsed = parse(value, { loose: false });
  if (parsed === null) return null;
  const canonical = `${parsed.version}${parsed.build.length === 0 ? "" : `+${parsed.build.join(".")}`}`;
  return canonical === value ? value : null;
}

function exactVersion(value: string, label: string): string {
  if (value.length === 0 || value.length > 160 || value !== value.trim()) {
    throw releaseError(`${label} is not an exact semantic version.`, "REGISTRY_RELEASE_INVALID");
  }
  const normalized = canonicalExactVersion(value);
  if (normalized === null) {
    throw releaseError(
      `${label} must use canonical semantic-version syntax.`,
      "REGISTRY_RELEASE_INVALID",
      value,
    );
  }
  return normalized;
}

export function immutableReleaseSatisfies(
  version: string,
  range: string,
  policy: ImmutableReleaseVersionPolicy,
): boolean {
  const normalizedVersion = exactVersion(version, "Immutable release");
  if (range.length === 0 || range.length > 160 || range !== range.trim()) {
    throw releaseError(
      "Release selector is not a bounded semantic-version range.",
      "REGISTRY_RELEASE_RANGE_INVALID",
    );
  }
  const normalizedRange = validRange(range, {
    loose: false,
    includePrerelease: policy.allowPrereleases,
  });
  if (normalizedRange === null) {
    throw releaseError(
      "Release selector is not a valid semantic-version range.",
      "REGISTRY_RELEASE_RANGE_INVALID",
      range,
    );
  }
  if (!policy.allowPrereleases && prerelease(normalizedVersion) !== null) return false;
  return satisfies(normalizedVersion, normalizedRange, {
    loose: false,
    includePrerelease: policy.allowPrereleases,
  });
}

/**
 * Resolves a mutable catalog's bounded version inventory to one exact immutable release.
 * Mutable aliases are deliberately not accepted here: callers must pass the catalog inventory and
 * record the exact returned version in plans and provenance.
 */
export function resolveImmutableReleaseVersion(
  availableVersions: readonly string[],
  selector: string | undefined,
  policy: ImmutableReleaseVersionPolicy,
): string {
  if (availableVersions.length === 0 || availableVersions.length > MAX_RELEASE_VERSIONS) {
    throw releaseError(
      "Registry release inventory has an invalid number of versions.",
      "REGISTRY_RELEASE_INVENTORY_INVALID",
    );
  }
  const versions = availableVersions.map((version) => exactVersion(version, "Registry release"));
  if (new Set(versions).size !== versions.length) {
    throw releaseError(
      "Registry release inventory repeats an immutable version.",
      "REGISTRY_RELEASE_INVENTORY_INVALID",
    );
  }
  const requested = selector ?? "*";
  if (requested.length === 0 || requested.length > 160 || requested !== requested.trim()) {
    throw releaseError(
      "Release selector is not a bounded semantic-version range.",
      "REGISTRY_RELEASE_RANGE_INVALID",
      requested,
    );
  }
  if (requested === "latest" || requested === "stable" || requested === "next") {
    throw releaseError(
      "Mutable release aliases must be resolved by a verified catalog before immutable selection.",
      "REGISTRY_RELEASE_ALIAS_UNRESOLVED",
      requested,
    );
  }
  const exact = canonicalExactVersion(requested);
  if (exact !== null) {
    if (!versions.includes(exact)) {
      throw releaseError(
        `Immutable release ${exact} is absent from the verified catalog.`,
        "REGISTRY_RELEASE_NOT_FOUND",
        exact,
      );
    }
    if (!policy.allowPrereleases && prerelease(exact) !== null) {
      throw releaseError(
        `Immutable release ${exact} is a prerelease and project policy does not allow it.`,
        "REGISTRY_PRERELEASE_FORBIDDEN",
        exact,
      );
    }
    return exact;
  }
  const normalizedRange = validRange(requested, {
    loose: false,
    includePrerelease: policy.allowPrereleases,
  });
  if (normalizedRange === null) {
    throw releaseError(
      "Release selector is not a valid semantic-version range.",
      "REGISTRY_RELEASE_RANGE_INVALID",
      requested,
    );
  }
  const eligible = versions.filter(
    (version) =>
      (policy.allowPrereleases || prerelease(version) === null) &&
      satisfies(version, normalizedRange, {
        loose: false,
        includePrerelease: policy.allowPrereleases,
      }),
  );
  const resolved = maxSatisfying(eligible, normalizedRange, {
    loose: false,
    includePrerelease: policy.allowPrereleases,
  });
  if (resolved === null) {
    throw releaseError(
      `No verified immutable release satisfies ${requested}.`,
      "REGISTRY_RELEASE_NOT_FOUND",
      requested,
    );
  }
  const precedenceTies = eligible.filter((version) => compare(version, resolved) === 0);
  if (precedenceTies.length > 1) {
    throw releaseError(
      `Release selector ${requested} is ambiguous across build-metadata variants.`,
      "REGISTRY_RELEASE_AMBIGUOUS",
      requested,
    );
  }
  return resolved;
}
