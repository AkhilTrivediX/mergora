import type { EvidenceReference } from "./evidence.js";
import { HarnessConfigurationError, requireRuntimeAdapter } from "./runtime-capability.js";
import {
  isCatalogId,
  isExactIsoInstant,
  isImmutableHttpsUrl,
  isProjectRelativePath,
  isSha256,
} from "./validation.js";

export type ContractAssessmentState = "pass" | "fail";

export interface ContractAssessmentIssue {
  readonly code: string;
  readonly message: string;
  readonly severity: "error" | "warning";
  readonly subject?: string;
}

export interface ContractAssessment {
  readonly state: ContractAssessmentState;
  readonly issues: readonly ContractAssessmentIssue[];
}

export type AxeImpact = "minor" | "moderate" | "serious" | "critical" | null;

export interface AccessibilityWaiver {
  readonly criterion: string;
  readonly ruleId: string;
  readonly scope: string;
  readonly rationale: string;
  readonly compensatingEvidence: EvidenceReference;
  readonly owner: string;
  readonly issueUrl: string;
  readonly expiresAt: string;
}

export interface AxeViolation {
  readonly id: string;
  readonly impact: AxeImpact;
  readonly nodeCount: number;
  readonly waiver?: AccessibilityWaiver;
}

export interface AxeRunResult {
  readonly violations: readonly AxeViolation[];
  readonly incomplete: readonly { readonly id: string; readonly nodeCount: number }[];
}

export interface AxeAdapter<TTarget = unknown, TOptions = unknown> {
  run(target: TTarget, options: TOptions): AxeRunResult | Promise<AxeRunResult>;
}

function waiverProblems(
  waiver: AccessibilityWaiver,
  violation: AxeViolation,
  asOf: string,
): readonly string[] {
  const problems: string[] = [];
  if (waiver.criterion.trim().length === 0) problems.push("criterion is empty");
  if (waiver.ruleId !== violation.id) problems.push("waiver ruleId does not match the violation");
  if (waiver.scope.trim().length === 0) problems.push("scope is empty");
  if (waiver.rationale.trim().length === 0) problems.push("rationale is empty");
  if (waiver.owner.trim().length === 0) problems.push("owner is empty");
  if (!/^https:\/\/[^\s]+$/.test(waiver.issueUrl)) problems.push("issueUrl is not HTTPS");
  if (!isExactIsoInstant(waiver.expiresAt)) problems.push("expiresAt is not an exact ISO instant");
  if (isExactIsoInstant(waiver.expiresAt) && Date.parse(waiver.expiresAt) <= Date.parse(asOf)) {
    problems.push("waiver has expired");
  }
  if (!isCatalogId(waiver.compensatingEvidence.id)) problems.push("evidence id is invalid");
  if (!isSha256(waiver.compensatingEvidence.digest)) problems.push("evidence digest is invalid");
  if (
    !isImmutableHttpsUrl(waiver.compensatingEvidence.artifact) &&
    !isProjectRelativePath(waiver.compensatingEvidence.artifact)
  ) {
    problems.push("evidence artifact is invalid");
  }
  return problems;
}

export function assessAxeResult(result: AxeRunResult, asOf: string): ContractAssessment {
  if (!isExactIsoInstant(asOf)) {
    throw new HarnessConfigurationError(
      "axe.invalid-as-of",
      "Axe assessment requires an exact ISO asOf instant.",
    );
  }

  const issues: ContractAssessmentIssue[] = [];
  for (const violation of result.violations) {
    const gateImpact = violation.impact === "serious" || violation.impact === "critical";
    if (violation.nodeCount < 1 || !Number.isSafeInteger(violation.nodeCount)) {
      issues.push({
        code: "axe.invalid-node-count",
        message: `Rule ${violation.id} reported an invalid node count.`,
        severity: "error",
        subject: violation.id,
      });
      continue;
    }

    if (violation.waiver !== undefined) {
      const problems = waiverProblems(violation.waiver, violation, asOf);
      if (problems.length === 0) {
        issues.push({
          code: "axe.active-waiver",
          message: `Rule ${violation.id} is covered by a current, scoped waiver.`,
          severity: "warning",
          subject: violation.id,
        });
      } else {
        issues.push({
          code: "axe.invalid-waiver",
          message: `Rule ${violation.id} waiver is invalid: ${problems.join(", ")}.`,
          severity: gateImpact ? "error" : "warning",
          subject: violation.id,
        });
      }
    } else {
      issues.push({
        code: gateImpact ? "axe.blocking-violation" : "axe.nonblocking-violation",
        message: `Rule ${violation.id} affects ${violation.nodeCount} node(s).`,
        severity: gateImpact ? "error" : "warning",
        subject: violation.id,
      });
    }
  }

  for (const incomplete of result.incomplete) {
    issues.push({
      code: "axe.incomplete",
      message: `Rule ${incomplete.id} needs manual review for ${incomplete.nodeCount} node(s).`,
      severity: "warning",
      subject: incomplete.id,
    });
  }

  return {
    state: issues.some((entry) => entry.severity === "error") ? "fail" : "pass",
    issues,
  };
}

export async function runAxeContract<TTarget, TOptions>(
  adapter: AxeAdapter<TTarget, TOptions> | undefined,
  target: TTarget,
  options: TOptions,
  asOf: string,
): Promise<{ readonly result: AxeRunResult; readonly assessment: ContractAssessment }> {
  const runtime = requireRuntimeAdapter(adapter, "axe");
  const result = await runtime.run(target, options);
  return { result, assessment: assessAxeResult(result, asOf) };
}

export interface AriaSnapshotRequest {
  readonly itemId: string;
  readonly stateId: string;
  readonly environmentId: string;
  readonly format: "json" | "yaml";
}

export interface AriaSnapshot {
  readonly content: string;
  readonly sourceDigest: string;
}

export interface AriaSnapshotAdapter<TTarget = unknown> {
  capture(target: TTarget, request: AriaSnapshotRequest): AriaSnapshot | Promise<AriaSnapshot>;
}

export async function captureAriaSnapshot<TTarget>(
  adapter: AriaSnapshotAdapter<TTarget> | undefined,
  target: TTarget,
  request: AriaSnapshotRequest,
): Promise<AriaSnapshot> {
  if (![request.itemId, request.stateId, request.environmentId].every(isCatalogId)) {
    throw new HarnessConfigurationError(
      "aria-snapshot.invalid-request",
      "ARIA snapshot item, state, and environment ids must be catalog ids.",
    );
  }
  const snapshot = await requireRuntimeAdapter(adapter, "aria-snapshot").capture(target, request);
  if (snapshot.content.trim().length === 0 || !isSha256(snapshot.sourceDigest)) {
    throw new HarnessConfigurationError(
      "aria-snapshot.invalid-result",
      "ARIA snapshot adapters must return non-empty content and an exact source digest.",
    );
  }
  return snapshot;
}

export interface GeometryTargetMeasurement {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly minimumWidth: number;
  readonly minimumHeight: number;
  readonly touch: boolean;
}

export interface GeometryOverlayMeasurement {
  readonly id: string;
  readonly clipped: boolean;
  readonly offscreen: boolean;
}

export interface GeometryMeasurement {
  readonly horizontalOverflowPx: number;
  readonly focusVisible: boolean;
  readonly focusOccluded: boolean;
  readonly targets: readonly GeometryTargetMeasurement[];
  readonly overlays: readonly GeometryOverlayMeasurement[];
}

export interface GeometryAdapter<TTarget = unknown> {
  measure(target: TTarget): GeometryMeasurement | Promise<GeometryMeasurement>;
}

export function assessGeometry(measurement: GeometryMeasurement): ContractAssessment {
  const issues: ContractAssessmentIssue[] = [];
  if (!Number.isFinite(measurement.horizontalOverflowPx) || measurement.horizontalOverflowPx > 1) {
    issues.push({
      code: "geometry.horizontal-overflow",
      message: `Horizontal overflow is ${measurement.horizontalOverflowPx}px; at most 1px is tolerated.`,
      severity: "error",
    });
  }
  if (!measurement.focusVisible) {
    issues.push({
      code: "geometry.focus-hidden",
      message: "Focused element is not visible.",
      severity: "error",
    });
  }
  if (measurement.focusOccluded) {
    issues.push({
      code: "geometry.focus-occluded",
      message: "Focused element is occluded by another surface.",
      severity: "error",
    });
  }
  for (const target of measurement.targets) {
    const policyMinimum = target.touch ? 44 : 24;
    if (
      target.width < target.minimumWidth ||
      target.height < target.minimumHeight ||
      target.minimumWidth < policyMinimum ||
      target.minimumHeight < policyMinimum
    ) {
      issues.push({
        code: "geometry.target-size",
        message: `${target.id} is ${target.width}x${target.height}; expected at least ${target.minimumWidth}x${target.minimumHeight}.`,
        severity: "error",
        subject: target.id,
      });
    }
  }
  for (const overlay of measurement.overlays) {
    if (overlay.clipped || overlay.offscreen) {
      issues.push({
        code: "geometry.overlay-bounds",
        message: `${overlay.id} is ${overlay.clipped ? "clipped" : "offscreen"}.`,
        severity: "error",
        subject: overlay.id,
      });
    }
  }
  return { state: issues.length === 0 ? "pass" : "fail", issues };
}

export async function runGeometryContract<TTarget>(
  adapter: GeometryAdapter<TTarget> | undefined,
  target: TTarget,
): Promise<{ readonly measurement: GeometryMeasurement; readonly assessment: ContractAssessment }> {
  const measurement = await requireRuntimeAdapter(adapter, "geometry").measure(target);
  return { measurement, assessment: assessGeometry(measurement) };
}

export interface VisualMask {
  readonly selector: string;
  readonly reason: string;
}

export interface VisualCaptureRequest {
  readonly itemId: string;
  readonly stateId: string;
  readonly environmentId: string;
  readonly os: string;
  readonly osVersion: string;
  readonly browser: string;
  readonly browserVersion: string;
  readonly fontDigest: string;
  readonly width: number;
  readonly height: number;
  readonly masks: readonly VisualMask[];
}

export interface VisualCaptureAdapter<TTarget = unknown> {
  capture(
    target: TTarget,
    request: VisualCaptureRequest,
  ): EvidenceReference | Promise<EvidenceReference>;
}

function validateVisualRequest(request: VisualCaptureRequest): void {
  const idsValid = [request.itemId, request.stateId, request.environmentId].every(isCatalogId);
  const versionsPinned =
    /^\d+(?:\.\d+)+$/.test(request.osVersion) && /^\d+(?:\.\d+)+$/.test(request.browserVersion);
  const dimensionsValid =
    Number.isSafeInteger(request.width) &&
    Number.isSafeInteger(request.height) &&
    request.width > 0 &&
    request.height > 0;
  const masksValid = request.masks.every(
    (mask) => mask.selector.trim().length > 0 && mask.reason.trim().length > 0,
  );
  if (
    !idsValid ||
    request.os.trim().length === 0 ||
    request.browser.trim().length === 0 ||
    !versionsPinned ||
    !isSha256(request.fontDigest) ||
    !dimensionsValid ||
    !masksValid
  ) {
    throw new HarnessConfigurationError(
      "visual-capture.invalid-request",
      "Visual captures require catalog ids, exact OS/browser versions, font digest, positive dimensions, and justified masks.",
    );
  }
}

export async function captureVisual<TTarget>(
  adapter: VisualCaptureAdapter<TTarget> | undefined,
  target: TTarget,
  request: VisualCaptureRequest,
): Promise<EvidenceReference> {
  validateVisualRequest(request);
  const reference = await requireRuntimeAdapter(adapter, "visual-capture").capture(target, request);
  if (
    !isCatalogId(reference.id) ||
    !isSha256(reference.digest) ||
    (!isImmutableHttpsUrl(reference.artifact) && !isProjectRelativePath(reference.artifact))
  ) {
    throw new HarnessConfigurationError(
      "visual-capture.invalid-result",
      "Visual capture adapters must return an id, immutable artifact location, and digest.",
    );
  }
  return reference;
}
