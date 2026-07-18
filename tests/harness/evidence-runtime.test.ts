import { describe, expect, it } from "vitest";

import {
  RuntimeCapabilityError,
  aggregateEvidence,
  aggregateStateForEvidence,
  assessAxeResult,
  assessGeometry,
  canonicalJson,
  captureAriaSnapshot,
  captureVisual,
  runAxeContract,
  validateEvidenceIndex,
  validateEvidenceRecord,
  type ContextEvidenceRecord,
  type EvidenceReference,
} from "../../packages/test-utils/src/index.js";

const sourceDigest = `sha256:${"a".repeat(64)}`;
const artifactDigest = `sha256:${"b".repeat(64)}`;
const reference: EvidenceReference = {
  id: "axe-report",
  artifact: "evidence/axe-report.json",
  digest: artifactDigest,
};

const contractRecord: ContextEvidenceRecord = {
  schemaVersion: 1,
  evidenceId: "contract-main",
  context: "contract",
  state: "pass",
  aggregateState: "satisfied",
  summary: "All declared contract assertions passed.",
  sourceDigest,
  performedAt: "2026-07-18T00:00:00.000Z",
  expiresAt: "2026-08-18T00:00:00.000Z",
  references: [reference],
};

describe("evidence vocabulary and index", () => {
  it("maps each context explicitly and preserves blocking precedence", () => {
    expect(aggregateStateForEvidence(contractRecord)).toBe("satisfied");
    expect(
      aggregateStateForEvidence({
        ...contractRecord,
        context: "passport",
        state: "expired",
        aggregateState: "stale",
      }),
    ).toBe("stale");
    expect(
      aggregateEvidence([
        { aggregateState: "satisfied" },
        { aggregateState: "conditional" },
        { aggregateState: "blocked" },
      ]),
    ).toBe("blocked");
    expect(aggregateEvidence([])).toBe("unknown");
    expect(aggregateEvidence([{ aggregateState: "not-applicable" }])).toBe("not-applicable");
  });

  it("rejects mismatched aggregates, expiry, and noncanonical indexes", () => {
    const mismatch = validateEvidenceRecord(
      { ...contractRecord, aggregateState: "conditional" },
      "2026-07-19T00:00:00.000Z",
    );
    expect(mismatch.ok).toBe(false);
    expect(mismatch.issues.map((entry) => entry.code)).toContain("evidence.aggregate-mismatch");

    const expired = validateEvidenceRecord(contractRecord, "2026-09-01T00:00:00.000Z");
    expect(expired.ok).toBe(false);
    expect(expired.issues.map((entry) => entry.code)).toContain("evidence.expired");

    const index = validateEvidenceIndex(
      {
        schemaVersion: 1,
        itemId: "button",
        sourceDigest,
        contractVersion: "1.0.0",
        generatedAt: "2026-07-18T01:00:00.000Z",
        records: [
          { ...contractRecord, evidenceId: "z-contract" },
          { ...contractRecord, evidenceId: "a-contract" },
        ],
      },
      "2026-07-19T00:00:00.000Z",
    );
    expect(index.ok).toBe(false);
    expect(index.issues.map((entry) => entry.code)).toContain("evidence-index.record-order");
  });

  it("serializes evidence deterministically and rejects non-JSON values", () => {
    expect(canonicalJson({ z: 1, a: { d: 2, b: 1 } })).toBe('{"a":{"b":1,"d":2},"z":1}');
    expect(() => canonicalJson({ invalid: undefined })).toThrow(/undefined/);
  });
});

describe("runtime contracts", () => {
  it("fails serious axe violations with absent or expired waivers", () => {
    expect(
      assessAxeResult(
        { violations: [{ id: "label", impact: "serious", nodeCount: 1 }], incomplete: [] },
        "2026-07-18T00:00:00.000Z",
      ).state,
    ).toBe("fail");
    expect(
      assessAxeResult(
        {
          violations: [
            {
              id: "label",
              impact: "critical",
              nodeCount: 1,
              waiver: {
                criterion: "1.3.1",
                ruleId: "label",
                scope: "button/loading",
                rationale: "A replacement label is announced by the host.",
                compensatingEvidence: reference,
                owner: "accessibility-team",
                issueUrl: "https://issues.example.test/a11y-1",
                expiresAt: "2026-07-01T00:00:00.000Z",
              },
            },
          ],
          incomplete: [],
        },
        "2026-07-18T00:00:00.000Z",
      ).state,
    ).toBe("fail");
  });

  it("never treats an absent runtime adapter as a pass", async () => {
    await expect(
      runAxeContract(undefined, {}, {}, "2026-07-18T00:00:00.000Z"),
    ).rejects.toBeInstanceOf(RuntimeCapabilityError);
    await expect(
      captureAriaSnapshot(
        undefined,
        {},
        {
          itemId: "button",
          stateId: "default",
          environmentId: "desktop",
          format: "yaml",
        },
      ),
    ).rejects.toBeInstanceOf(RuntimeCapabilityError);
  });

  it("detects geometry failures and validates visual capture pinning", async () => {
    const geometry = assessGeometry({
      horizontalOverflowPx: 12,
      focusVisible: true,
      focusOccluded: true,
      targets: [
        {
          id: "trigger",
          width: 20,
          height: 20,
          minimumWidth: 24,
          minimumHeight: 24,
          touch: false,
        },
      ],
      overlays: [{ id: "popover", clipped: false, offscreen: true }],
    });
    expect(geometry.state).toBe("fail");
    expect(geometry.issues.map((entry) => entry.code)).toEqual([
      "geometry.horizontal-overflow",
      "geometry.focus-occluded",
      "geometry.target-size",
      "geometry.overlay-bounds",
    ]);

    await expect(
      captureVisual(
        undefined,
        {},
        {
          itemId: "button",
          stateId: "default",
          environmentId: "desktop",
          os: "Windows",
          osVersion: "latest",
          browser: "Chromium",
          browserVersion: "126.0",
          fontDigest: artifactDigest,
          width: 1280,
          height: 800,
          masks: [],
        },
      ),
    ).rejects.toThrow(/exact OS\/browser versions/i);
  });
});
