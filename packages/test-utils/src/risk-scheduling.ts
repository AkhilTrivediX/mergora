import { compareText } from "./validation.js";

export type RiskClass = 1 | 2 | 3;

export const MANUAL_COVERAGE_IDS = [
  "keyboard-manual-visual",
  "desktop-screen-reader-semantic-engine-a",
  "desktop-screen-reader-semantic-engine-b",
  "desktop-at-full",
  "touch-screen-reader-where-applicable",
  "forced-colors",
  "zoom-reflow",
  "rtl",
  "focus-restoration",
  "mobile-at-full",
  "voice-control",
  "switch-control",
  "task-workflow",
  "interruption-recovery",
  "performance-scale",
] as const;
export type ManualCoverageId = (typeof MANUAL_COVERAGE_IDS)[number];

export interface RiskClassPolicy {
  readonly riskClass: RiskClass;
  readonly requiredManualCoverage: readonly ManualCoverageId[];
  readonly refreshEachBehavioralReleaseCandidate: boolean;
}

const classOneCoverage = [
  "keyboard-manual-visual",
  "desktop-screen-reader-semantic-engine-a",
  "desktop-screen-reader-semantic-engine-b",
] as const satisfies readonly ManualCoverageId[];

const classTwoCoverage = [
  ...classOneCoverage,
  "desktop-at-full",
  "touch-screen-reader-where-applicable",
  "forced-colors",
  "zoom-reflow",
  "rtl",
  "focus-restoration",
] as const satisfies readonly ManualCoverageId[];

export const RISK_CLASS_POLICIES = {
  1: {
    riskClass: 1,
    requiredManualCoverage: classOneCoverage,
    refreshEachBehavioralReleaseCandidate: false,
  },
  2: {
    riskClass: 2,
    requiredManualCoverage: classTwoCoverage,
    refreshEachBehavioralReleaseCandidate: false,
  },
  3: {
    riskClass: 3,
    requiredManualCoverage: [
      ...classTwoCoverage,
      "mobile-at-full",
      "voice-control",
      "switch-control",
      "task-workflow",
      "interruption-recovery",
      "performance-scale",
    ],
    refreshEachBehavioralReleaseCandidate: true,
  },
} as const satisfies Record<RiskClass, RiskClassPolicy>;

export type QualityLane =
  | "static"
  | "unit"
  | "story-state"
  | "semantic-query"
  | "axe"
  | "aria-snapshot"
  | "geometry"
  | "visual"
  | "browser-chromium"
  | "browser-firefox"
  | "browser-webkit"
  | "consumer-contract"
  | "forced-colors"
  | "zoom-reflow"
  | "rtl-i18n"
  | "focus-restoration"
  | "workflow"
  | "interruption-recovery"
  | "performance-scale";

export const QUALITY_LANE_ORDER = [
  "static",
  "unit",
  "story-state",
  "semantic-query",
  "axe",
  "aria-snapshot",
  "geometry",
  "visual",
  "browser-chromium",
  "browser-firefox",
  "browser-webkit",
  "consumer-contract",
  "forced-colors",
  "zoom-reflow",
  "rtl-i18n",
  "focus-restoration",
  "workflow",
  "interruption-recovery",
  "performance-scale",
] as const satisfies readonly QualityLane[];

export type BehaviorChangeKind =
  | "semantic"
  | "focus"
  | "keyboard"
  | "overlay"
  | "virtualization"
  | "announcement"
  | "responsive"
  | "locale"
  | "core-dependency"
  | "visual-only"
  | "documentation-only";

export interface QualityScheduleRequest {
  readonly riskClass: RiskClass;
  readonly changes: readonly BehaviorChangeKind[];
  readonly sharedInfrastructureChanged?: boolean;
}

export interface QualitySchedule {
  readonly pullRequest: readonly QualityLane[];
  readonly nightly: readonly QualityLane[];
  readonly releaseCandidate: readonly QualityLane[];
  readonly manualCoverage: readonly ManualCoverageId[];
  readonly manualEvidenceInvalidated: boolean;
  readonly runAllDependentSuites: boolean;
}

const invalidatingChanges = new Set<BehaviorChangeKind>([
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

function inPolicyOrder(lanes: ReadonlySet<QualityLane>): readonly QualityLane[] {
  return QUALITY_LANE_ORDER.filter((lane) => lanes.has(lane));
}

export function highestRiskClass(classes: readonly RiskClass[]): RiskClass {
  return classes.reduce<RiskClass>(
    (highest, current) => (current > highest ? current : highest),
    1,
  );
}

export function validateRiskInheritance(
  declared: RiskClass,
  behaviorModes: readonly RiskClass[],
  childRiskClasses: readonly RiskClass[] = [],
): { readonly valid: boolean; readonly required: RiskClass } {
  const required = highestRiskClass([...behaviorModes, ...childRiskClasses]);
  return { valid: declared >= required, required };
}

export function scheduleQualityChecks(request: QualityScheduleRequest): QualitySchedule {
  const changed = new Set(request.changes);
  const docsOnly =
    changed.size > 0 && [...changed].every((entry) => entry === "documentation-only");
  const manualEvidenceInvalidated = [...changed].some((entry) => invalidatingChanges.has(entry));
  const runAllDependentSuites = request.sharedInfrastructureChanged === true;

  const pullRequest = new Set<QualityLane>(["static", "unit"]);
  const nightly = new Set<QualityLane>();
  const releaseCandidate = new Set<QualityLane>();

  if (!docsOnly || runAllDependentSuites) {
    pullRequest.add("story-state");
    pullRequest.add("semantic-query");
    pullRequest.add("axe");
    pullRequest.add("geometry");
    pullRequest.add("browser-chromium");
    pullRequest.add("consumer-contract");
    nightly.add("aria-snapshot");
    nightly.add("visual");
    nightly.add("browser-firefox");
    nightly.add("browser-webkit");
  }

  if (request.riskClass >= 2 || runAllDependentSuites) {
    nightly.add("forced-colors");
    nightly.add("zoom-reflow");
    nightly.add("rtl-i18n");
    nightly.add("focus-restoration");
  }

  if (request.riskClass === 3 || runAllDependentSuites) {
    nightly.add("workflow");
    nightly.add("interruption-recovery");
    nightly.add("performance-scale");
  }

  for (const lane of pullRequest) releaseCandidate.add(lane);
  for (const lane of nightly) releaseCandidate.add(lane);
  if (request.riskClass === 3 && (manualEvidenceInvalidated || runAllDependentSuites)) {
    releaseCandidate.add("workflow");
    releaseCandidate.add("interruption-recovery");
    releaseCandidate.add("performance-scale");
  }

  return {
    pullRequest: inPolicyOrder(pullRequest),
    nightly: inPolicyOrder(nightly),
    releaseCandidate: inPolicyOrder(releaseCandidate),
    manualCoverage: [...RISK_CLASS_POLICIES[request.riskClass].requiredManualCoverage].sort(
      compareText,
    ),
    manualEvidenceInvalidated,
    runAllDependentSuites,
  };
}
