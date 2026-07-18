import type { Direction, MotionPreference, Theme } from "./environment.js";
import type { EvidenceReference } from "./evidence.js";
import { MANUAL_COVERAGE_IDS } from "./risk-scheduling.js";
import type { ManualCoverageId, RiskClass } from "./risk-scheduling.js";
import {
  compareText,
  isCatalogId,
  isExactIsoInstant,
  isImmutableHttpsUrl,
  isProjectRelativePath,
  isSemver,
  isSha256,
  issue,
  validationResult,
} from "./validation.js";
import type { ValidationIssue, ValidationResult } from "./validation.js";

export type ManualOutcome = "pass" | "fail" | "not-applicable";

export interface ManualCoverageResult {
  readonly coverageId: ManualCoverageId;
  readonly outcome: ManualOutcome;
  readonly rationale?: string;
}

export interface ManualTaskResult {
  readonly id: string;
  readonly instruction: string;
  readonly expected: string;
  readonly observed: string;
  readonly outcome: "pass" | "fail";
}

export interface ManualTester {
  readonly id: string;
  readonly name: string;
}

export interface ManualEnvironment {
  readonly os: string;
  readonly osVersion: string;
  readonly browser: string;
  readonly browserVersion: string;
  readonly assistiveTechnology?: {
    readonly name: string;
    readonly version: string;
  };
  readonly input: "keyboard" | "pointer" | "touch" | "switch" | "voice";
  readonly locale: string;
  readonly direction: Direction;
  readonly viewport: { readonly width: number; readonly height: number };
  readonly zoomPercent: number;
  readonly theme: Theme;
  readonly motion: MotionPreference;
}

export interface CarryForwardDeclaration {
  readonly originReleaseId: string;
  readonly reason: string;
  readonly sourceDigest: string;
  readonly behaviorDependencyDigest: string;
  readonly browserPolicyDigest: string;
  readonly contractVersion: string;
}

export interface ManualEvidenceRecord {
  readonly schemaVersion: 1;
  readonly recordId: string;
  readonly itemId: string;
  readonly riskClass: RiskClass;
  readonly releaseId: string;
  readonly sourceDigest: string;
  readonly behaviorDependencyDigest: string;
  readonly browserPolicyDigest: string;
  readonly contractVersion: string;
  readonly performedAt: string;
  readonly expiresAt: string;
  readonly tester: ManualTester;
  readonly reviewer: ManualTester;
  readonly environment: ManualEnvironment;
  readonly coverage: readonly ManualCoverageResult[];
  readonly tasks: readonly ManualTaskResult[];
  readonly overallOutcome: "pass" | "fail";
  readonly artifacts: readonly EvidenceReference[];
  readonly carryForward?: CarryForwardDeclaration;
}

const exactVersionPattern = /^\d+(?:\.\d+)+(?:-[a-z0-9.]+)?$/;
const localePattern = /^[a-z]{2,3}(?:-[A-Z]{2}|-[0-9]{3})?$/;

function nonEmpty(value: string): boolean {
  return value.trim().length > 0;
}

function validateEnvironment(
  environment: ManualEnvironment,
  path: string,
): readonly ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!nonEmpty(environment.os) || !exactVersionPattern.test(environment.osVersion)) {
    issues.push(
      issue(
        "manual.environment-os",
        `${path}.osVersion`,
        "Manual evidence requires a named OS and an exact numeric OS version.",
      ),
    );
  }
  if (!nonEmpty(environment.browser) || !exactVersionPattern.test(environment.browserVersion)) {
    issues.push(
      issue(
        "manual.environment-browser",
        `${path}.browserVersion`,
        "Manual evidence requires a named browser and an exact numeric browser version.",
      ),
    );
  }
  if (
    environment.assistiveTechnology !== undefined &&
    (!nonEmpty(environment.assistiveTechnology.name) ||
      !exactVersionPattern.test(environment.assistiveTechnology.version))
  ) {
    issues.push(
      issue(
        "manual.environment-at",
        `${path}.assistiveTechnology`,
        "Assistive technology must include a name and exact numeric version.",
      ),
    );
  }
  if (!localePattern.test(environment.locale)) {
    issues.push(issue("manual.environment-locale", `${path}.locale`, "Locale is not canonical."));
  }
  if (
    !Number.isSafeInteger(environment.viewport.width) ||
    !Number.isSafeInteger(environment.viewport.height) ||
    environment.viewport.width <= 0 ||
    environment.viewport.height <= 0
  ) {
    issues.push(
      issue(
        "manual.environment-viewport",
        `${path}.viewport`,
        "Viewport dimensions must be positive safe integers.",
      ),
    );
  }
  if (
    !Number.isSafeInteger(environment.zoomPercent) ||
    environment.zoomPercent < 50 ||
    environment.zoomPercent > 500
  ) {
    issues.push(
      issue(
        "manual.environment-zoom",
        `${path}.zoomPercent`,
        "Zoom percentage must be an integer from 50 through 500.",
      ),
    );
  }
  return issues;
}

export function validateManualEvidenceRecord(
  record: ManualEvidenceRecord,
  asOf: string,
): ValidationResult<ManualEvidenceRecord> {
  const issues: ValidationIssue[] = [];
  if (record.schemaVersion !== 1) {
    issues.push(issue("manual.schema-version", "schemaVersion", "schemaVersion must be 1."));
  }
  if (!isCatalogId(record.recordId) || !isCatalogId(record.itemId)) {
    issues.push(
      issue("manual.identity", "recordId", "recordId and itemId must both be catalog ids."),
    );
  }
  if (!isCatalogId(record.releaseId)) {
    issues.push(issue("manual.release-id", "releaseId", "releaseId must be a catalog id."));
  }
  for (const [field, digest] of [
    ["sourceDigest", record.sourceDigest],
    ["behaviorDependencyDigest", record.behaviorDependencyDigest],
    ["browserPolicyDigest", record.browserPolicyDigest],
  ] as const) {
    if (!isSha256(digest)) {
      issues.push(issue("manual.digest", field, `${field} must be sha256:<64 hex>.`));
    }
  }
  if (!isSemver(record.contractVersion)) {
    issues.push(
      issue("manual.contract-version", "contractVersion", "contractVersion must be exact semver."),
    );
  }
  if (!isExactIsoInstant(asOf)) {
    issues.push(issue("manual.as-of", "$asOf", "asOf must be an exact ISO instant."));
  }
  if (!isExactIsoInstant(record.performedAt) || !isExactIsoInstant(record.expiresAt)) {
    issues.push(
      issue(
        "manual.validity-window",
        "performedAt",
        "performedAt and expiresAt must be exact ISO instants.",
      ),
    );
  } else {
    if (Date.parse(record.expiresAt) <= Date.parse(record.performedAt)) {
      issues.push(
        issue("manual.invalid-expiry", "expiresAt", "expiresAt must follow performedAt."),
      );
    }
    if (isExactIsoInstant(asOf) && Date.parse(record.expiresAt) <= Date.parse(asOf)) {
      issues.push(
        issue("manual.expired", "expiresAt", `Manual evidence expired at ${record.expiresAt}.`),
      );
    }
    if (isExactIsoInstant(asOf) && Date.parse(record.performedAt) > Date.parse(asOf)) {
      issues.push(
        issue("manual.future", "performedAt", "Manual evidence cannot be performed in the future."),
      );
    }
  }
  if (!nonEmpty(record.tester.id) || !nonEmpty(record.tester.name)) {
    issues.push(issue("manual.tester", "tester", "Tester identity must be explicit."));
  }
  if (!nonEmpty(record.reviewer.id) || !nonEmpty(record.reviewer.name)) {
    issues.push(issue("manual.reviewer", "reviewer", "Reviewer identity must be explicit."));
  }
  if (record.riskClass === 3 && record.tester.id === record.reviewer.id) {
    issues.push(
      issue(
        "manual.independent-review",
        "reviewer.id",
        "Risk Class 3 evidence requires an independent reviewer.",
      ),
    );
  }
  issues.push(...validateEnvironment(record.environment, "environment"));

  const coverageIds = new Set<ManualCoverageId>();
  for (const [index, coverage] of record.coverage.entries()) {
    if (!(MANUAL_COVERAGE_IDS as readonly string[]).includes(coverage.coverageId)) {
      issues.push(
        issue(
          "manual.coverage-id",
          `coverage[${index}].coverageId`,
          `Unknown coverage id "${coverage.coverageId}".`,
        ),
      );
    }
    if (coverageIds.has(coverage.coverageId)) {
      issues.push(
        issue(
          "manual.duplicate-coverage",
          `coverage[${index}].coverageId`,
          `Coverage "${coverage.coverageId}" appears more than once.`,
        ),
      );
    }
    coverageIds.add(coverage.coverageId);
    if (
      (coverage.outcome === "fail" || coverage.outcome === "not-applicable") &&
      (coverage.rationale === undefined || !nonEmpty(coverage.rationale))
    ) {
      issues.push(
        issue(
          "manual.coverage-rationale",
          `coverage[${index}].rationale`,
          "Failed and not-applicable coverage requires a rationale.",
        ),
      );
    }
  }
  const sortedCoverage = [...record.coverage].sort((left, right) =>
    compareText(left.coverageId, right.coverageId),
  );
  if (sortedCoverage.some((entry, index) => entry !== record.coverage[index])) {
    issues.push(
      issue("manual.coverage-order", "coverage", "Coverage must be ordered lexically by id."),
    );
  }

  if (record.tasks.length === 0) {
    issues.push(issue("manual.no-tasks", "tasks", "Manual evidence requires at least one task."));
  }
  const taskIds = new Set<string>();
  for (const [index, task] of record.tasks.entries()) {
    if (
      !isCatalogId(task.id) ||
      !nonEmpty(task.instruction) ||
      !nonEmpty(task.expected) ||
      !nonEmpty(task.observed)
    ) {
      issues.push(
        issue(
          "manual.invalid-task",
          `tasks[${index}]`,
          "Each task requires an id, instruction, expected result, and observation.",
        ),
      );
    }
    if (taskIds.has(task.id)) {
      issues.push(
        issue("manual.duplicate-task", `tasks[${index}].id`, `Task "${task.id}" is duplicated.`),
      );
    }
    taskIds.add(task.id);
  }
  const hasFailure =
    record.tasks.some((task) => task.outcome === "fail") ||
    record.coverage.some((coverage) => coverage.outcome === "fail");
  if ((record.overallOutcome === "pass") === hasFailure) {
    issues.push(
      issue(
        "manual.outcome-mismatch",
        "overallOutcome",
        hasFailure
          ? "A record with a failed task or coverage result cannot pass."
          : "A record without a failed task or coverage result cannot fail.",
      ),
    );
  }

  if (record.artifacts.length === 0) {
    issues.push(
      issue(
        "manual.no-artifacts",
        "artifacts",
        "Manual evidence requires at least one captured artifact.",
      ),
    );
  }
  for (const [index, artifact] of record.artifacts.entries()) {
    if (
      !isCatalogId(artifact.id) ||
      !isSha256(artifact.digest) ||
      (!isImmutableHttpsUrl(artifact.artifact) && !isProjectRelativePath(artifact.artifact))
    ) {
      issues.push(
        issue(
          "manual.invalid-artifact",
          `artifacts[${index}]`,
          "Manual artifacts require an id, location, and digest.",
        ),
      );
    }
  }

  if (record.carryForward !== undefined) {
    const carry = record.carryForward;
    if (
      !isCatalogId(carry.originReleaseId) ||
      carry.originReleaseId === record.releaseId ||
      !nonEmpty(carry.reason)
    ) {
      issues.push(
        issue(
          "manual.invalid-carry-forward",
          "carryForward",
          "Carry-forward must disclose a different origin release and a reason.",
        ),
      );
    }
    for (const [field, expected, actual] of [
      ["sourceDigest", record.sourceDigest, carry.sourceDigest],
      ["behaviorDependencyDigest", record.behaviorDependencyDigest, carry.behaviorDependencyDigest],
      ["browserPolicyDigest", record.browserPolicyDigest, carry.browserPolicyDigest],
      ["contractVersion", record.contractVersion, carry.contractVersion],
    ] as const) {
      if (expected !== actual) {
        issues.push(
          issue(
            "manual.carry-forward-mismatch",
            `carryForward.${field}`,
            `Carry-forward ${field} must exactly match the candidate.`,
          ),
        );
      }
    }
  }

  return validationResult(record, issues);
}
