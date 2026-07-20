import { describe, expect, it } from "vitest";

import {
  MANUAL_EVIDENCE_LANES,
  RISK_CLASS_POLICIES,
  STABLE_ARTIFACT_IDS,
  aggregateEvidence,
  scheduleQualityChecks,
  validateMaturityCandidate,
  validateRiskInheritance,
  type ContextEvidenceRecord,
  type ManualCoverageId,
  type ManualEvidenceRecord,
  type ManualEvidenceLaneId,
  type MaturityCandidate,
  type RiskClass,
} from "../../packages/test-utils/src/index.js";

const sourceDigest = `sha256:${"a".repeat(64)}`;
const behaviorDigest = `sha256:${"b".repeat(64)}`;
const browserDigest = `sha256:${"c".repeat(64)}`;
const artifactDigest = `sha256:${"d".repeat(64)}`;

function evidenceRecord(
  record: Pick<ContextEvidenceRecord, "context" | "state" | "aggregateState"> & {
    readonly evidenceId: string;
  },
): ContextEvidenceRecord {
  return {
    schemaVersion: 1,
    ...record,
    summary: `${record.context} evidence completed.`,
    sourceDigest,
    performedAt: "2026-07-18T00:00:00.000Z",
    expiresAt: "2026-08-18T00:00:00.000Z",
    references: [
      {
        id: `${record.evidenceId}-artifact`,
        artifact: `evidence/${record.evidenceId}.json`,
        digest: artifactDigest,
      },
    ],
  } as ContextEvidenceRecord;
}

type PolicyLane = (typeof MANUAL_EVIDENCE_LANES)[number];

function exactVersions(lane: PolicyLane): {
  readonly os: string;
  readonly browser: string;
  readonly assistiveTechnology: string;
} {
  const previous = "versionSlot" in lane && lane.versionSlot === "previous";
  const os =
    lane.environment.os === "Windows"
      ? "11.0"
      : lane.environment.os === "macOS"
        ? previous
          ? "14.0"
          : "15.0"
        : previous
          ? "17.0"
          : "18.0";
  const assistiveTechnology =
    lane.environment.assistiveTechnology === "JAWS" ? (previous ? "2025.1" : "2026.1") : "2026.1";
  return { os, browser: "126.0", assistiveTechnology };
}

function manualRecord(
  lane: PolicyLane,
  coverageIds: readonly ManualCoverageId[],
  riskClass: RiskClass,
): ManualEvidenceRecord {
  const versions = exactVersions(lane);
  return {
    schemaVersion: 1,
    recordId: `${lane.id}-release-1`,
    itemId: "button",
    riskClass,
    releaseId: "release-1",
    sourceDigest,
    behaviorDependencyDigest: behaviorDigest,
    browserPolicyDigest: browserDigest,
    contractVersion: "1.0.0",
    performedAt: "2026-07-18T00:00:00.000Z",
    expiresAt: "2026-08-18T00:00:00.000Z",
    tester: { id: "tester-1", name: "Test Operator" },
    reviewer: { id: "reviewer-1", name: "Review Operator" },
    environment: {
      laneId: lane.id,
      os: lane.environment.os,
      osVersion: versions.os,
      browser: lane.environment.browser,
      browserVersion: versions.browser,
      ...(lane.environment.assistiveTechnology === null
        ? {}
        : {
            assistiveTechnology: {
              name: lane.environment.assistiveTechnology,
              version: versions.assistiveTechnology,
            },
          }),
      input: lane.environment.input,
      locale: lane.environment.locale,
      direction: lane.environment.direction,
      viewport: lane.environment.viewport,
      zoomPercent: lane.environment.zoomPercent,
      theme: lane.environment.theme,
      motion: lane.environment.motion,
    },
    coverage: coverageIds
      .map((coverageId) => ({ coverageId, outcome: "pass" as const }))
      .sort((left, right) => left.coverageId.localeCompare(right.coverageId)),
    tasks: [
      {
        id: "complete-primary-task",
        instruction: "Complete the primary task in the named lane.",
        expected: "The task remains operable and accurately announced.",
        observed: "The task remained operable and accurately announced.",
        outcome: "pass",
      },
    ],
    overallOutcome: "pass",
    artifacts: [
      {
        id: `${lane.id}-artifact`,
        artifact: `evidence/${lane.id}.json`,
        digest: artifactDigest,
      },
    ],
  };
}

function manualRecords(riskClass: RiskClass): readonly ManualEvidenceRecord[] {
  const groupedClaims = new Map<ManualEvidenceLaneId, ManualCoverageId[]>();
  for (const claim of RISK_CLASS_POLICIES[riskClass].requiredManualLaneClaims) {
    const coverage = groupedClaims.get(claim.laneId) ?? [];
    coverage.push(claim.coverageId);
    groupedClaims.set(claim.laneId, coverage);
  }
  return [...groupedClaims.entries()]
    .map(([laneId, coverageIds]) => {
      const lane = MANUAL_EVIDENCE_LANES.find((entry) => entry.id === laneId);
      if (lane === undefined) throw new Error(`missing manual policy lane ${laneId}`);
      return manualRecord(lane, coverageIds, riskClass);
    })
    .sort((left, right) => left.environment.laneId.localeCompare(right.environment.laneId));
}

function stableCandidate(): MaturityCandidate {
  const records: readonly ContextEvidenceRecord[] = [
    evidenceRecord({
      evidenceId: "contract-main",
      context: "contract",
      state: "pass",
      aggregateState: "satisfied",
    }),
    evidenceRecord({
      evidenceId: "measurement-main",
      context: "measurement",
      state: "pass",
      aggregateState: "satisfied",
    }),
    evidenceRecord({
      evidenceId: "passport-main",
      context: "passport",
      state: "pass",
      aggregateState: "satisfied",
    }),
    evidenceRecord({
      evidenceId: "release-main",
      context: "release-gate",
      state: "pass",
      aggregateState: "satisfied",
    }),
  ];
  return {
    itemId: "button",
    targetMaturity: "stable",
    riskClass: 1,
    releaseId: "release-1",
    sourceDigest,
    behaviorDependencyDigest: behaviorDigest,
    browserPolicyDigest: browserDigest,
    contractVersion: "1.0.0",
    asOf: "2026-07-19T00:00:00.000Z",
    initialStable: true,
    releaseCandidate: true,
    changes: ["semantic"],
    artifacts: STABLE_ARTIFACT_IDS.map((id) => ({
      id,
      present: true,
      validationState: "pass" as const,
      digest: artifactDigest,
    })).sort((left, right) => left.id.localeCompare(right.id)),
    evidenceIndex: {
      schemaVersion: 1,
      itemId: "button",
      sourceDigest,
      contractVersion: "1.0.0",
      generatedAt: "2026-07-18T01:00:00.000Z",
      records,
    },
    manualEvidence: manualRecords(1),
    defects: [],
    limitations: [],
  };
}

describe("Stable maturity gate", () => {
  it("accepts only a fully bound, current candidate", () => {
    const result = validateMaturityCandidate(stableCandidate());
    expect(result.issues).toEqual([]);
    expect(result.aggregateState).toBe("satisfied");
    expect(result.eligible).toBe(true);
  });

  it("cannot promote when evidence is absent, stale, or blocked by a high-severity defect", () => {
    const { evidenceIndex: omittedEvidence, ...candidateWithoutEvidence } = stableCandidate();
    expect(omittedEvidence).toBeDefined();
    const withoutEvidence = validateMaturityCandidate(candidateWithoutEvidence);
    expect(withoutEvidence.eligible).toBe(false);
    expect(withoutEvidence.issues.map((entry) => entry.code)).toContain(
      "maturity.missing-evidence-index",
    );

    const withDefect = validateMaturityCandidate({
      ...stableCandidate(),
      defects: [
        {
          id: "focus-loss",
          severity: "A2",
          state: "open",
          issueUrl: "https://issues.example.test/focus-loss",
        },
      ],
    });
    expect(withDefect.eligible).toBe(false);
    expect(withDefect.issues.map((entry) => entry.code)).toContain("maturity.blocking-defect");

    const candidate = stableCandidate();
    if (candidate.evidenceIndex === undefined) throw new Error("expected evidence");
    const expired = validateMaturityCandidate({
      ...candidate,
      asOf: "2026-09-01T00:00:00.000Z",
    });
    expect(expired.eligible).toBe(false);
    expect(expired.issues.some((entry) => entry.code.includes("expired"))).toBe(true);
  });

  it("does not turn conditional evidence into an unowned pass", () => {
    const candidate = stableCandidate();
    if (candidate.evidenceIndex === undefined) throw new Error("expected evidence");
    const records = candidate.evidenceIndex.records.map((record) =>
      record.context === "measurement"
        ? ({ ...record, state: "warning", aggregateState: "conditional" } as const)
        : record,
    );
    const result = validateMaturityCandidate({
      ...candidate,
      evidenceIndex: { ...candidate.evidenceIndex, records },
    });
    expect(aggregateEvidence(records)).toBe("conditional");
    expect(result.eligible).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("maturity.unowned-conditional");
  });

  it("does not let one environment satisfy both semantic engines", () => {
    const candidate = stableCandidate();
    const keyboard = candidate.manualEvidence.find(
      (record) => record.environment.laneId === "windows-keyboard-edge",
    );
    const engineA = candidate.manualEvidence.find(
      (record) => record.environment.laneId === "windows-nvda-firefox",
    );
    if (keyboard === undefined || engineA === undefined) throw new Error("expected base records");

    const result = validateMaturityCandidate({
      ...candidate,
      manualEvidence: [
        keyboard,
        {
          ...engineA,
          coverage: [
            {
              coverageId: "desktop-screen-reader-semantic-engine-a",
              outcome: "pass",
            },
            {
              coverageId: "desktop-screen-reader-semantic-engine-b",
              outcome: "pass",
            },
          ],
        },
      ],
    });

    expect(result.eligible).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("maturity.manual.lane-coverage");
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "maturity.missing-manual-coverage",
          message: expect.stringContaining("macos-current-voiceover-safari"),
        }),
      ]),
    );
  });

  it("does not count a record whose candidate digests or artifacts are invalid", () => {
    const candidate = stableCandidate();
    const result = validateMaturityCandidate({
      ...candidate,
      manualEvidence: candidate.manualEvidence.map((record) =>
        record.environment.laneId === "windows-nvda-firefox"
          ? {
              ...record,
              sourceDigest: `sha256:${"e".repeat(64)}`,
              artifacts: [
                {
                  id: "manual-transcript",
                  artifact: "C:\\private\\record.txt",
                  digest: "latest",
                },
              ],
            }
          : record,
      ),
    });

    expect(result.eligible).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "maturity.manual-binding",
        "maturity.manual.invalid-artifact",
        "maturity.missing-manual-coverage",
      ]),
    );
  });

  it("requires current and previous support lanes to use different exact versions", () => {
    const candidate = stableCandidate();
    const current = candidate.manualEvidence.find(
      (record) => record.environment.laneId === "macos-current-voiceover-safari",
    );
    if (current === undefined) throw new Error("expected current macOS record");
    const result = validateMaturityCandidate({
      ...candidate,
      manualEvidence: candidate.manualEvidence.map((record) =>
        record.environment.laneId === "macos-previous-voiceover-safari"
          ? {
              ...record,
              environment: {
                ...record.environment,
                osVersion: current.environment.osVersion,
              },
            }
          : record,
      ),
    });

    expect(result.eligible).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain(
      "maturity.manual-version-slot-collision",
    );
  });

  it("invalidates a Risk Class 3 lane when the tester self-reviews", () => {
    const candidate = stableCandidate();
    const classThreeRecords = manualRecords(3);
    const result = validateMaturityCandidate({
      ...candidate,
      riskClass: 3,
      manualEvidence: classThreeRecords.map((record, index) =>
        index === 0 ? { ...record, reviewer: record.tester } : record,
      ),
    });

    expect(result.eligible).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "maturity.manual.independent-review",
        "maturity.missing-manual-coverage",
      ]),
    );
  });
});

describe("risk scheduling", () => {
  it("inherits the hardest behavior and expands Class 3 release coverage", () => {
    expect(validateRiskInheritance(2, [1, 3], [2])).toEqual({ valid: false, required: 3 });
    const schedule = scheduleQualityChecks({
      riskClass: 3,
      changes: ["focus", "virtualization"],
      sharedInfrastructureChanged: true,
    });
    expect(schedule.manualEvidenceInvalidated).toBe(true);
    expect(schedule.runAllDependentSuites).toBe(true);
    expect(schedule.nightly).toContain("performance-scale");
    expect(schedule.releaseCandidate).toContain("interruption-recovery");
    expect(schedule.manualCoverage).toContain("voice-control");
    expect(schedule.manualLaneClaims).toContainEqual({
      laneId: "android-switch-access-chrome",
      coverageId: "switch-control",
    });
  });
});
