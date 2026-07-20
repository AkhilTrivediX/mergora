import { requireRuntimeAdapter } from "./runtime-capability.js";
import {
  compareText,
  isCatalogId,
  isSemver,
  isSha256,
  issue,
  validationResult,
} from "./validation.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";

export const REQUIRED_PARITY_PROBES = [
  "behavior",
  "dependency-closure",
  "exports",
  "semantics",
  "server-client-boundary",
  "styles",
  "types",
] as const;
export type RequiredParityProbe = (typeof REQUIRED_PARITY_PROBES)[number];

export type ParityProbe =
  | {
      readonly id: string;
      readonly state: "pass";
      readonly digest: string;
      readonly summary: string;
    }
  | { readonly id: string; readonly state: "fail"; readonly summary: string }
  | { readonly id: string; readonly state: "not-applicable"; readonly reason: string };

export interface DistributionObservation {
  readonly schemaVersion: 1;
  readonly mode: "package" | "source";
  readonly itemId: string;
  readonly canonicalSourceDigest: string;
  readonly artifactDigest: string;
  readonly contractVersion: string;
  readonly probes: readonly ParityProbe[];
}

export interface PackageSourceParityIssue {
  readonly code: string;
  readonly message: string;
  readonly probeId?: string;
}

export interface PackageSourceParityResult {
  readonly state: "pass" | "fail";
  readonly packageObservation: DistributionObservation;
  readonly sourceObservation: DistributionObservation;
  readonly issues: readonly PackageSourceParityIssue[];
}

export interface PackageSourceParityAdapter<TPackageTarget, TSourceTarget> {
  observePackage(
    target: TPackageTarget,
  ): DistributionObservation | Promise<DistributionObservation>;
  observeSource(target: TSourceTarget): DistributionObservation | Promise<DistributionObservation>;
}

export function validateDistributionObservation(
  observation: DistributionObservation,
): ValidationResult<DistributionObservation> {
  const issues: ValidationIssue[] = [];
  if (observation.schemaVersion !== 1) {
    issues.push(issue("parity.schema-version", "schemaVersion", "schemaVersion must be 1."));
  }
  if (!isCatalogId(observation.itemId)) {
    issues.push(issue("parity.item-id", "itemId", "itemId must be a catalog id."));
  }
  if (!isSha256(observation.canonicalSourceDigest) || !isSha256(observation.artifactDigest)) {
    issues.push(
      issue(
        "parity.digest",
        "canonicalSourceDigest",
        "Canonical source and observed artifact digests must use sha256:<64 hex>.",
      ),
    );
  }
  if (!isSemver(observation.contractVersion)) {
    issues.push(
      issue("parity.contract-version", "contractVersion", "contractVersion must be exact semver."),
    );
  }

  const probeIds = new Set<string>();
  for (const [index, probe] of observation.probes.entries()) {
    if (!isCatalogId(probe.id)) {
      issues.push(
        issue("parity.probe-id", `probes[${index}].id`, "Probe id must be a catalog id."),
      );
    }
    if (probeIds.has(probe.id)) {
      issues.push(
        issue(
          "parity.duplicate-probe",
          `probes[${index}].id`,
          `Probe "${probe.id}" appears more than once.`,
        ),
      );
    }
    probeIds.add(probe.id);
    if (probe.state === "pass" && (!isSha256(probe.digest) || probe.summary.trim().length === 0)) {
      issues.push(
        issue(
          "parity.invalid-pass",
          `probes[${index}]`,
          "Passing probes require a normalized-result digest and summary.",
        ),
      );
    }
    if (probe.state === "fail" && probe.summary.trim().length === 0) {
      issues.push(
        issue(
          "parity.invalid-fail",
          `probes[${index}].summary`,
          "Failed probes require a summary.",
        ),
      );
    }
    if (probe.state === "not-applicable" && probe.reason.trim().length === 0) {
      issues.push(
        issue(
          "parity.invalid-not-applicable",
          `probes[${index}].reason`,
          "Not-applicable probes require a reason.",
        ),
      );
    }
    if (
      probe.state === "not-applicable" &&
      (REQUIRED_PARITY_PROBES as readonly string[]).includes(probe.id)
    ) {
      issues.push(
        issue(
          "parity.required-probe-not-applicable",
          `probes[${index}]`,
          `Required parity probe "${probe.id}" must execute in both distribution modes.`,
        ),
      );
    }
  }
  for (const requiredProbe of REQUIRED_PARITY_PROBES) {
    if (!probeIds.has(requiredProbe)) {
      issues.push(
        issue(
          "parity.missing-probe",
          "probes",
          `Required package/source parity probe "${requiredProbe}" is absent.`,
        ),
      );
    }
  }
  const sorted = [...observation.probes].sort((left, right) => compareText(left.id, right.id));
  if (sorted.some((probe, index) => probe !== observation.probes[index])) {
    issues.push(
      issue("parity.probe-order", "probes", "Parity probes must be ordered lexically by id."),
    );
  }
  return validationResult(observation, issues);
}

export function comparePackageSourceParity(
  packageObservation: DistributionObservation,
  sourceObservation: DistributionObservation,
): PackageSourceParityResult {
  const issues: PackageSourceParityIssue[] = [];
  for (const [name, observation] of [
    ["package", packageObservation],
    ["source", sourceObservation],
  ] as const) {
    const validation = validateDistributionObservation(observation);
    for (const validationIssue of validation.issues) {
      issues.push({
        code: validationIssue.code,
        message: `${name}.${validationIssue.path}: ${validationIssue.message}`,
      });
    }
    if (observation.mode !== name) {
      issues.push({
        code: "parity.mode-mismatch",
        message: `Expected ${name} observation mode, received ${observation.mode}.`,
      });
    }
  }

  if (packageObservation.itemId !== sourceObservation.itemId) {
    issues.push({ code: "parity.item-mismatch", message: "Package and source item ids differ." });
  }
  if (packageObservation.contractVersion !== sourceObservation.contractVersion) {
    issues.push({
      code: "parity.contract-mismatch",
      message: "Package and source contract versions differ.",
    });
  }
  if (packageObservation.canonicalSourceDigest !== sourceObservation.canonicalSourceDigest) {
    issues.push({
      code: "parity.source-mismatch",
      message: "Package and source observations are not bound to the same canonical source digest.",
    });
  }

  const packageProbes = new Map(packageObservation.probes.map((probe) => [probe.id, probe]));
  const sourceProbes = new Map(sourceObservation.probes.map((probe) => [probe.id, probe]));
  const allProbeIds = [...new Set([...packageProbes.keys(), ...sourceProbes.keys()])].sort(
    compareText,
  );
  for (const probeId of allProbeIds) {
    const packageProbe = packageProbes.get(probeId);
    const sourceProbe = sourceProbes.get(probeId);
    if (packageProbe === undefined || sourceProbe === undefined) {
      issues.push({
        code: "parity.probe-set-mismatch",
        message: `Probe "${probeId}" is not present in both modes.`,
        probeId,
      });
      continue;
    }
    if (packageProbe.state === "fail" || sourceProbe.state === "fail") {
      issues.push({
        code: "parity.probe-failed",
        message: `Probe "${probeId}" failed in ${packageProbe.state === "fail" ? "package" : "source"} mode.`,
        probeId,
      });
      continue;
    }
    if (packageProbe.state !== sourceProbe.state) {
      issues.push({
        code: "parity.probe-state-mismatch",
        message: `Probe "${probeId}" has different applicability between modes.`,
        probeId,
      });
      continue;
    }
    if (
      packageProbe.state === "pass" &&
      sourceProbe.state === "pass" &&
      packageProbe.digest !== sourceProbe.digest
    ) {
      issues.push({
        code: "parity.probe-digest-mismatch",
        message: `Probe "${probeId}" produced different normalized results.`,
        probeId,
      });
    }
  }

  return {
    state: issues.length === 0 ? "pass" : "fail",
    packageObservation,
    sourceObservation,
    issues,
  };
}

export async function runPackageSourceParity<TPackageTarget, TSourceTarget>(
  adapter: PackageSourceParityAdapter<TPackageTarget, TSourceTarget> | undefined,
  packageTarget: TPackageTarget,
  sourceTarget: TSourceTarget,
): Promise<PackageSourceParityResult> {
  const runtime = requireRuntimeAdapter(adapter, "package-source-parity");
  const packageObservation = await runtime.observePackage(packageTarget);
  const sourceObservation = await runtime.observeSource(sourceTarget);
  return comparePackageSourceParity(packageObservation, sourceObservation);
}
