import { describe, expect, it } from "vitest";

import {
  MANUAL_EVIDENCE_LANES,
  validateManualEvidenceRecord,
  type ManualCoverageId,
  type ManualEvidenceRecord,
  type RiskClass,
} from "../../packages/test-utils/src/index.js";

const sourceDigest = `sha256:${"a".repeat(64)}`;
const behaviorDigest = `sha256:${"b".repeat(64)}`;
const browserDigest = `sha256:${"c".repeat(64)}`;
const artifactDigest = `sha256:${"d".repeat(64)}`;

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
  options: {
    readonly riskClass?: RiskClass;
    readonly coverage?: readonly ManualCoverageId[];
  } = {},
): ManualEvidenceRecord {
  const versions = exactVersions(lane);
  const coverage = options.coverage ?? [lane.allowedCoverage[0] as ManualCoverageId];
  return {
    schemaVersion: 1,
    recordId: `${lane.id}-record`,
    itemId: "button",
    riskClass: options.riskClass ?? lane.minimumRiskClass,
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
    coverage: coverage
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
        id: "manual-transcript",
        artifact: `evidence/${lane.id}.json`,
        digest: artifactDigest,
      },
    ],
  };
}

describe("manual evidence lane policy", () => {
  it("accepts a fully populated record for every exact policy lane", () => {
    for (const lane of MANUAL_EVIDENCE_LANES) {
      const result = validateManualEvidenceRecord(manualRecord(lane), "2026-07-19T00:00:00.000Z");
      expect(result.issues, lane.id).toEqual([]);
      expect(result.ok, lane.id).toBe(true);
    }
  });

  it("binds every claim to the lane's exact environment axes", () => {
    const lane = MANUAL_EVIDENCE_LANES.find((entry) => entry.id === "windows-nvda-firefox-rtl");
    if (lane === undefined) throw new Error("expected RTL lane");
    const record = manualRecord(lane);
    const result = validateManualEvidenceRecord(
      {
        ...record,
        environment: {
          ...record.environment,
          os: "macOS",
          osVersion: "current",
          browser: "Chrome",
          browserVersion: "latest",
          assistiveTechnology: { name: "JAWS", version: "latest" },
          input: "touch",
          locale: "en-US",
          direction: "ltr",
          viewport: { width: 390, height: 844 },
          zoomPercent: 200,
          theme: "dark",
          motion: "reduce",
        },
      },
      "2026-07-19T00:00:00.000Z",
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining([
        "manual.environment-os",
        "manual.environment-browser",
        "manual.environment-at",
      ]),
    );
    expect(
      result.issues.filter((entry) => entry.code === "manual.environment-lane-mismatch"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "environment.os" }),
        expect.objectContaining({ path: "environment.browser" }),
        expect.objectContaining({ path: "environment.assistiveTechnology" }),
        expect.objectContaining({ path: "environment.input" }),
        expect.objectContaining({ path: "environment.locale" }),
        expect.objectContaining({ path: "environment.direction" }),
        expect.objectContaining({ path: "environment.viewport" }),
        expect.objectContaining({ path: "environment.zoomPercent" }),
        expect.objectContaining({ path: "environment.theme" }),
        expect.objectContaining({ path: "environment.motion" }),
      ]),
    );
  });

  it("cannot claim both semantic engines from the engine A environment", () => {
    const lane = MANUAL_EVIDENCE_LANES.find((entry) => entry.id === "windows-nvda-firefox");
    if (lane === undefined) throw new Error("expected semantic engine A lane");
    const result = validateManualEvidenceRecord(
      manualRecord(lane, {
        coverage: [
          "desktop-screen-reader-semantic-engine-a",
          "desktop-screen-reader-semantic-engine-b",
        ],
      }),
      "2026-07-19T00:00:00.000Z",
    );

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "manual.lane-coverage",
          path: "coverage[1].coverageId",
        }),
      ]),
    );
  });

  it("rejects self-review for every Risk Class 3 record", () => {
    const lane = MANUAL_EVIDENCE_LANES.find((entry) => entry.id === "android-switch-access-chrome");
    if (lane === undefined) throw new Error("expected switch lane");
    const record = manualRecord(lane, { riskClass: 3 });
    const result = validateManualEvidenceRecord(
      { ...record, reviewer: record.tester },
      "2026-07-19T00:00:00.000Z",
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toContain("manual.independent-review");
  });

  it("requires immutable, digested, unique artifacts before a record is valid", () => {
    const lane = MANUAL_EVIDENCE_LANES[0];
    if (lane === undefined) throw new Error("expected manual lane");
    const record = manualRecord(lane);
    const result = validateManualEvidenceRecord(
      {
        ...record,
        artifacts: [
          { id: "manual-transcript", artifact: "C:\\private\\record.txt", digest: "latest" },
          { id: "manual-transcript", artifact: "C:\\private\\record.txt", digest: "latest" },
        ],
      },
      "2026-07-19T00:00:00.000Z",
    );

    expect(result.ok).toBe(false);
    expect(result.issues.map((entry) => entry.code)).toEqual(
      expect.arrayContaining(["manual.invalid-artifact", "manual.duplicate-artifact"]),
    );
  });
});
