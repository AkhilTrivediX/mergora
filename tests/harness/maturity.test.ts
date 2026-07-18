import { describe, expect, it } from "vitest";

import {
  STABLE_ARTIFACT_IDS,
  aggregateEvidence,
  scheduleQualityChecks,
  validateMaturityCandidate,
  validateRiskInheritance,
  type ContextEvidenceRecord,
  type ManualEvidenceRecord,
  type MaturityCandidate,
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

function manualRecord(): ManualEvidenceRecord {
  return {
    schemaVersion: 1,
    recordId: "button-manual-release-1",
    itemId: "button",
    riskClass: 1,
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
      os: "Windows",
      osVersion: "11.0",
      browser: "Chromium",
      browserVersion: "126.0",
      assistiveTechnology: { name: "Screen Reader", version: "2024.1" },
      input: "keyboard",
      locale: "en-US",
      direction: "ltr",
      viewport: { width: 1280, height: 800 },
      zoomPercent: 100,
      theme: "light",
      motion: "reduce",
    },
    coverage: [
      {
        coverageId: "desktop-screen-reader-semantic-engine-a",
        outcome: "pass",
      },
      {
        coverageId: "desktop-screen-reader-semantic-engine-b",
        outcome: "pass",
      },
      { coverageId: "keyboard-manual-visual", outcome: "pass" },
    ],
    tasks: [
      {
        id: "activate-button",
        instruction: "Focus and activate the button.",
        expected: "The action runs once and focus remains visible.",
        observed: "The action ran once and focus remained visible.",
        outcome: "pass",
      },
    ],
    overallOutcome: "pass",
    artifacts: [
      {
        id: "manual-transcript",
        artifact: "evidence/manual-transcript.txt",
        digest: artifactDigest,
      },
    ],
  };
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
    manualEvidence: [manualRecord()],
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
  });
});
