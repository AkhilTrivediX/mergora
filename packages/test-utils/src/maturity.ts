import { validateEvidenceIndex } from "./evidence.js";
import type { AggregateState, EvidenceContext, EvidenceIndex } from "./evidence.js";
import { validateManualEvidenceRecord } from "./manual-evidence.js";
import type { ManualEvidenceRecord } from "./manual-evidence.js";
import { RISK_CLASS_POLICIES } from "./risk-scheduling.js";
import type { BehaviorChangeKind, ManualCoverageId, RiskClass } from "./risk-scheduling.js";
import { compareText, isCatalogId, isExactIsoInstant, isSemver, isSha256 } from "./validation.js";

export type Maturity = "experimental" | "beta" | "stable" | "deprecated";
export type DefectSeverity = "A0" | "A1" | "A2" | "A3";

export const STABLE_ARTIFACT_IDS = [
  "metadata",
  "canonical-source",
  "package-export",
  "native-registry",
  "compatible-registry",
  "stories",
  "unit-fixtures",
  "browser-fixtures",
  "component-contract",
  "contract-fixtures",
  "accessibility-fixtures",
  "visual-fixtures",
  "documentation",
  "quality-passport",
  "updater-fixtures",
  "package-source-parity",
] as const;
export type StableArtifactId = (typeof STABLE_ARTIFACT_IDS)[number];

export interface StableArtifactStatus {
  readonly id: StableArtifactId;
  readonly present: boolean;
  readonly validationState: "pass" | "fail" | "not-run";
  readonly digest?: string;
}

export interface KnownDefect {
  readonly id: string;
  readonly severity: DefectSeverity;
  readonly state: "open" | "closed";
  readonly issueUrl: string;
}

export interface AcceptedLimitation {
  readonly id: string;
  readonly severity: "A3";
  readonly summary: string;
  readonly owner: string;
  readonly issueUrl: string;
  readonly expiresAt: string;
}

export interface MaturityCandidate {
  readonly itemId: string;
  readonly targetMaturity: Maturity;
  readonly riskClass: RiskClass;
  readonly releaseId: string;
  readonly sourceDigest: string;
  readonly behaviorDependencyDigest: string;
  readonly browserPolicyDigest: string;
  readonly contractVersion: string;
  readonly asOf: string;
  readonly initialStable: boolean;
  readonly releaseCandidate: boolean;
  readonly changes: readonly BehaviorChangeKind[];
  readonly artifacts: readonly StableArtifactStatus[];
  readonly evidenceIndex?: EvidenceIndex;
  readonly manualEvidence: readonly ManualEvidenceRecord[];
  readonly defects: readonly KnownDefect[];
  readonly limitations: readonly AcceptedLimitation[];
}

export interface MaturityIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

export interface MaturityValidation {
  readonly eligible: boolean;
  readonly aggregateState: AggregateState;
  readonly issues: readonly MaturityIssue[];
}

const requiredStableContexts = [
  "contract",
  "measurement",
  "passport",
  "release-gate",
] as const satisfies readonly EvidenceContext[];
const disallowedStableAggregates = new Set<AggregateState>([
  "failed",
  "blocked",
  "stale",
  "unknown",
]);
const manualInvalidatingChanges = new Set<BehaviorChangeKind>([
  "semantic",
  "focus",
  "keyboard",
  "overlay",
  "virtualization",
  "announcement",
  "responsive",
  "locale",
  "core-dependency",
]);

function addIssue(
  issues: MaturityIssue[],
  code: string,
  path: string,
  message: string,
  severity: "error" | "warning" = "error",
): void {
  issues.push({ code, path, message, severity });
}

function baseCandidateIssues(candidate: MaturityCandidate): MaturityIssue[] {
  const issues: MaturityIssue[] = [];
  if (!isCatalogId(candidate.itemId) || !isCatalogId(candidate.releaseId)) {
    addIssue(issues, "maturity.identity", "itemId", "itemId and releaseId must be catalog ids.");
  }
  for (const [field, digest] of [
    ["sourceDigest", candidate.sourceDigest],
    ["behaviorDependencyDigest", candidate.behaviorDependencyDigest],
    ["browserPolicyDigest", candidate.browserPolicyDigest],
  ] as const) {
    if (!isSha256(digest)) {
      addIssue(issues, "maturity.digest", field, `${field} must be sha256:<64 hex>.`);
    }
  }
  if (!isSemver(candidate.contractVersion)) {
    addIssue(
      issues,
      "maturity.contract-version",
      "contractVersion",
      "Contract version must be exact semver.",
    );
  }
  if (!isExactIsoInstant(candidate.asOf)) {
    addIssue(issues, "maturity.as-of", "asOf", "asOf must be an exact ISO instant.");
  }
  return issues;
}

function validateStableArtifacts(candidate: MaturityCandidate, issues: MaturityIssue[]): void {
  const artifactIds = new Set<StableArtifactId>();
  for (const [index, artifact] of candidate.artifacts.entries()) {
    if (artifactIds.has(artifact.id)) {
      addIssue(
        issues,
        "maturity.duplicate-artifact",
        `artifacts[${index}].id`,
        `Artifact "${artifact.id}" appears more than once.`,
      );
    }
    artifactIds.add(artifact.id);
    if (!artifact.present) {
      addIssue(
        issues,
        "maturity.missing-artifact",
        `artifacts[${index}]`,
        `Stable artifact "${artifact.id}" is absent.`,
      );
    } else if (artifact.validationState !== "pass") {
      addIssue(
        issues,
        "maturity.unvalidated-artifact",
        `artifacts[${index}].validationState`,
        `Stable artifact "${artifact.id}" must pass its validator.`,
      );
    }
    if (artifact.present && (artifact.digest === undefined || !isSha256(artifact.digest))) {
      addIssue(
        issues,
        "maturity.unpinned-artifact",
        `artifacts[${index}].digest`,
        `Stable artifact "${artifact.id}" must have a sha256 digest.`,
      );
    }
  }
  for (const required of STABLE_ARTIFACT_IDS) {
    if (!artifactIds.has(required)) {
      addIssue(
        issues,
        "maturity.undeclared-artifact",
        "artifacts",
        `Stable artifact "${required}" was not declared.`,
      );
    }
  }
  const sorted = [...candidate.artifacts].sort((left, right) => compareText(left.id, right.id));
  if (sorted.some((entry, index) => entry !== candidate.artifacts[index])) {
    addIssue(
      issues,
      "maturity.artifact-order",
      "artifacts",
      "Stable artifacts must be ordered lexically by id.",
    );
  }
}

function validateStableEvidence(
  candidate: MaturityCandidate,
  issues: MaturityIssue[],
): AggregateState {
  if (candidate.evidenceIndex === undefined) {
    addIssue(
      issues,
      "maturity.missing-evidence-index",
      "evidenceIndex",
      "Stable requires a current evidence index; absence is never treated as a pass.",
    );
    return "unknown";
  }

  const index = candidate.evidenceIndex;
  const validation = validateEvidenceIndex(index, candidate.asOf);
  for (const validationIssue of validation.issues) {
    addIssue(
      issues,
      `maturity.${validationIssue.code}`,
      `evidenceIndex.${validationIssue.path}`,
      validationIssue.message,
      validationIssue.severity,
    );
  }
  if (index.itemId !== candidate.itemId) {
    addIssue(
      issues,
      "maturity.evidence-item",
      "evidenceIndex.itemId",
      "Evidence itemId does not match candidate.",
    );
  }
  if (index.sourceDigest !== candidate.sourceDigest) {
    addIssue(
      issues,
      "maturity.evidence-source",
      "evidenceIndex.sourceDigest",
      "Evidence sourceDigest does not match candidate.",
    );
  }
  if (index.contractVersion !== candidate.contractVersion) {
    addIssue(
      issues,
      "maturity.evidence-contract",
      "evidenceIndex.contractVersion",
      "Evidence contractVersion does not match candidate.",
    );
  }
  if (index.records.length === 0) {
    addIssue(
      issues,
      "maturity.empty-evidence",
      "evidenceIndex.records",
      "Stable evidence cannot be empty.",
    );
  }

  for (const context of requiredStableContexts) {
    const contextRecords = index.records.filter((record) => record.context === context);
    const hasPositive = contextRecords.some(
      (record) => record.aggregateState === "satisfied" || record.aggregateState === "conditional",
    );
    if (!hasPositive) {
      addIssue(
        issues,
        "maturity.missing-evidence-context",
        "evidenceIndex.records",
        `Stable requires current positive ${context} evidence.`,
      );
    }
  }

  for (const [indexPosition, record] of index.records.entries()) {
    if (disallowedStableAggregates.has(record.aggregateState)) {
      addIssue(
        issues,
        "maturity.disallowed-evidence-state",
        `evidenceIndex.records[${indexPosition}].aggregateState`,
        `Stable cannot include ${record.aggregateState} evidence.`,
      );
    }
    if (record.aggregateState !== "not-applicable") {
      if (record.sourceDigest !== candidate.sourceDigest) {
        addIssue(
          issues,
          "maturity.unbound-evidence",
          `evidenceIndex.records[${indexPosition}].sourceDigest`,
          "Applicable Stable evidence must be bound to the candidate source digest.",
        );
      }
      if (record.performedAt === undefined || record.expiresAt === undefined) {
        addIssue(
          issues,
          "maturity.undated-evidence",
          `evidenceIndex.records[${indexPosition}]`,
          "Applicable Stable evidence requires performedAt and expiresAt.",
        );
      }
      if (record.references.length === 0) {
        addIssue(
          issues,
          "maturity.unreferenced-evidence",
          `evidenceIndex.records[${indexPosition}].references`,
          "Applicable Stable evidence requires at least one immutable reference.",
        );
      }
    }
  }

  const states = index.records.map((record) => record.aggregateState);
  if (states.includes("failed")) return "failed";
  if (states.includes("blocked")) return "blocked";
  if (states.includes("stale")) return "stale";
  if (states.includes("unknown")) return "unknown";
  if (states.includes("conditional")) return "conditional";
  if (states.includes("satisfied")) return "satisfied";
  return "not-applicable";
}

function validateManualCoverage(candidate: MaturityCandidate, issues: MaturityIssue[]): void {
  const covered = new Map<ManualCoverageId, "pass" | "not-applicable">();
  const behavioralChange = candidate.changes.some(
    (change) => change !== "documentation-only" && change !== "visual-only",
  );
  const manualEvidenceInvalidated = candidate.changes.some((change) =>
    manualInvalidatingChanges.has(change),
  );

  for (const [recordIndex, record] of candidate.manualEvidence.entries()) {
    const validation = validateManualEvidenceRecord(record, candidate.asOf);
    for (const validationIssue of validation.issues) {
      addIssue(
        issues,
        `maturity.${validationIssue.code}`,
        `manualEvidence[${recordIndex}].${validationIssue.path}`,
        validationIssue.message,
        validationIssue.severity,
      );
    }
    if (record.itemId !== candidate.itemId || record.riskClass !== candidate.riskClass) {
      addIssue(
        issues,
        "maturity.manual-scope",
        `manualEvidence[${recordIndex}]`,
        "Manual evidence item and risk class must match the candidate.",
      );
    }
    if (record.releaseId !== candidate.releaseId) {
      addIssue(
        issues,
        "maturity.manual-release",
        `manualEvidence[${recordIndex}].releaseId`,
        "Manual evidence releaseId must match the candidate release.",
      );
    }
    for (const [field, expected, actual] of [
      ["sourceDigest", candidate.sourceDigest, record.sourceDigest],
      [
        "behaviorDependencyDigest",
        candidate.behaviorDependencyDigest,
        record.behaviorDependencyDigest,
      ],
      ["browserPolicyDigest", candidate.browserPolicyDigest, record.browserPolicyDigest],
      ["contractVersion", candidate.contractVersion, record.contractVersion],
    ] as const) {
      if (expected !== actual) {
        addIssue(
          issues,
          "maturity.manual-binding",
          `manualEvidence[${recordIndex}].${field}`,
          `Manual ${field} must exactly match the candidate.`,
        );
      }
    }
    if (candidate.initialStable && record.carryForward !== undefined) {
      addIssue(
        issues,
        "maturity.initial-stable-carry-forward",
        `manualEvidence[${recordIndex}].carryForward`,
        "Initial Stable promotion requires newly performed evidence.",
      );
    }
    if (manualEvidenceInvalidated && record.carryForward !== undefined) {
      addIssue(
        issues,
        "maturity.invalidated-manual-carry-forward",
        `manualEvidence[${recordIndex}].carryForward`,
        "Semantic, focus, keyboard, overlay, virtualization, announcement, responsive, locale, and core dependency changes invalidate carried manual evidence.",
      );
    }
    if (
      candidate.riskClass === 3 &&
      candidate.releaseCandidate &&
      behavioralChange &&
      record.carryForward !== undefined
    ) {
      addIssue(
        issues,
        "maturity.class-three-rc-refresh",
        `manualEvidence[${recordIndex}].carryForward`,
        "Risk Class 3 behavior changes require refreshed manual evidence for every release candidate.",
      );
    }
    if (record.overallOutcome === "pass") {
      for (const coverage of record.coverage) {
        if (coverage.outcome === "pass") covered.set(coverage.coverageId, "pass");
        if (coverage.outcome === "not-applicable" && !covered.has(coverage.coverageId)) {
          covered.set(coverage.coverageId, "not-applicable");
        }
      }
    }
  }

  for (const required of RISK_CLASS_POLICIES[candidate.riskClass].requiredManualCoverage) {
    const outcome = covered.get(required);
    const mayBeNotApplicable = required === "touch-screen-reader-where-applicable";
    if (outcome === undefined || (outcome === "not-applicable" && !mayBeNotApplicable)) {
      addIssue(
        issues,
        "maturity.missing-manual-coverage",
        "manualEvidence",
        `Stable Risk Class ${candidate.riskClass} requires passing ${required} evidence.`,
      );
    }
  }
}

function validateDefectsAndLimitations(
  candidate: MaturityCandidate,
  aggregateState: AggregateState,
  issues: MaturityIssue[],
): void {
  for (const [index, defect] of candidate.defects.entries()) {
    if (!isCatalogId(defect.id) || !/^https:\/\/[^\s]+$/.test(defect.issueUrl)) {
      addIssue(
        issues,
        "maturity.invalid-defect",
        `defects[${index}]`,
        "Defects require an id and HTTPS issue URL.",
      );
    }
    if (defect.state === "open" && defect.severity !== "A3") {
      addIssue(
        issues,
        "maturity.blocking-defect",
        `defects[${index}]`,
        `Stable cannot ship with open ${defect.severity} defects.`,
      );
    }
  }

  for (const [index, limitation] of candidate.limitations.entries()) {
    if (
      !isCatalogId(limitation.id) ||
      !limitation.summary.trim() ||
      !limitation.owner.trim() ||
      !/^https:\/\/[^\s]+$/.test(limitation.issueUrl) ||
      !isExactIsoInstant(limitation.expiresAt) ||
      (isExactIsoInstant(candidate.asOf) &&
        Date.parse(limitation.expiresAt) <= Date.parse(candidate.asOf))
    ) {
      addIssue(
        issues,
        "maturity.invalid-limitation",
        `limitations[${index}]`,
        "A Stable limitation must be owned, tracked, current, A3, and explicit.",
      );
    }
  }
  if (aggregateState === "conditional" && candidate.limitations.length === 0) {
    addIssue(
      issues,
      "maturity.unowned-conditional",
      "limitations",
      "Conditional evidence requires at least one current accepted A3 limitation.",
    );
  }
}

export function validateMaturityCandidate(candidate: MaturityCandidate): MaturityValidation {
  const issues = baseCandidateIssues(candidate);
  if (candidate.targetMaturity !== "stable") {
    return {
      eligible: !issues.some((entry) => entry.severity === "error"),
      aggregateState: "unknown",
      issues,
    };
  }

  validateStableArtifacts(candidate, issues);
  const aggregateState = validateStableEvidence(candidate, issues);
  validateManualCoverage(candidate, issues);
  validateDefectsAndLimitations(candidate, aggregateState, issues);

  return {
    eligible: !issues.some((entry) => entry.severity === "error"),
    aggregateState,
    issues,
  };
}
