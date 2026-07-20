import { describe, expect, it } from "vitest";

import { MANUAL_EVIDENCE_LANES, RISK_CLASS_POLICIES } from "../../packages/test-utils/src/index.js";
import * as manualPreparation from "../../scripts/prepare-manual-evidence.mjs";
import { validateDependencyLicenseReport } from "../../scripts/validate-licenses.mjs";

const { createManualEvidencePreparation, renderManualEvidenceChecklist } = manualPreparation;

interface CampaignLane {
  readonly id: string;
  readonly title: string;
  readonly versionSlot?: "current" | "previous";
  readonly claims: readonly {
    readonly coverageId: string;
    readonly minimumRiskClass: 1 | 2 | 3;
  }[];
  readonly environment: {
    readonly os: string;
    readonly browser: string;
    readonly assistiveTechnology: string | null;
    readonly input: string;
    readonly locale: string;
    readonly direction: string;
    readonly viewport: { readonly width: number; readonly height: number };
    readonly zoomPercent: number;
    readonly theme: string;
    readonly motion: string;
  };
}

interface PlannedPreparation {
  readonly items: readonly {
    readonly id: string;
    readonly riskClass: 1 | 2 | 3;
    readonly requiredCoverage: readonly string[];
    readonly sessions: readonly {
      readonly laneId: string;
      readonly status: "not-run";
      readonly reviewer: null;
      readonly binding: {
        readonly sourceDigest: null;
        readonly behaviorDependencyDigest: null;
        readonly browserPolicyDigest: null;
        readonly contractVersion: null;
      };
      readonly coverage: readonly { readonly outcome: null }[];
      readonly tasks: readonly {
        readonly status: "not-run";
        readonly observed: null;
        readonly outcome: null;
      }[];
      readonly artifactReferences: readonly never[];
      readonly overallOutcome: null;
    }[];
  }[];
}

describe("manual evidence preparation", () => {
  it("creates deterministic risk-derived NOT RUN sessions without manufacturing a pass", () => {
    const preparation = createManualEvidencePreparation(
      {
        items: [
          {
            id: "dialog",
            displayName: "Dialog",
            family: "overlays",
            layer: "component",
            maturity: { target: "stable" },
          },
          {
            id: "button",
            displayName: "Button",
            family: "actions-selection",
            layer: "component",
            maturity: { target: "stable" },
          },
        ],
      },
      "a".repeat(40),
      "dirty",
    );

    expect(preparation).toMatchObject({
      evidenceStatus: "not-run",
      evidenceClaim: "none",
      workingTreeState: "dirty",
    });
    expect(preparation.items.map(({ id }) => id)).toEqual(["button", "dialog"]);
    expect(
      preparation.items.every(
        ({ status, reviewer, environmentRecord, taskRecord, artifactReferences }) =>
          status === "not-run" &&
          reviewer === null &&
          environmentRecord === null &&
          taskRecord === null &&
          artifactReferences.length === 0,
      ),
    ).toBe(true);

    const planned = preparation as unknown as PlannedPreparation;
    expect(planned.items.map(({ id, riskClass }) => ({ id, riskClass }))).toEqual([
      { id: "button", riskClass: 1 },
      { id: "dialog", riskClass: 2 },
    ]);
    expect(planned.items.find(({ id }) => id === "button")?.sessions).toHaveLength(4);
    expect(planned.items.find(({ id }) => id === "dialog")?.sessions).toHaveLength(22);
    expect(
      planned.items.every((item) =>
        item.sessions.every(
          (session) =>
            session.status === "not-run" &&
            session.reviewer === null &&
            Object.values(session.binding).every((value) => value === null) &&
            session.coverage.every(({ outcome }) => outcome === null) &&
            session.tasks.every(
              ({ status, observed, outcome }) =>
                status === "not-run" && observed === null && outcome === null,
            ) &&
            session.artifactReferences.length === 0 &&
            session.overallOutcome === null,
        ),
      ),
    ).toBe(true);

    const checklist = renderManualEvidenceChecklist(preparation);
    expect(checklist).toContain("Status: **NOT RUN**");
    expect(checklist).toContain("contains no pass, conformance, maturity, or release claim");
    expect(checklist).toContain("Button (`button`)");
    expect(checklist).toContain("Risk Class 1 — **NOT RUN**");
    expect(checklist).toContain("`windows-nvda-firefox`");
  });

  it("rejects duplicate inventory identifiers", () => {
    expect(() =>
      createManualEvidencePreparation(
        {
          items: [
            { id: "button", displayName: "Button", family: "actions" },
            { id: "button", displayName: "Button copy", family: "actions" },
          ],
        },
        "b".repeat(40),
        "clean",
      ),
    ).toThrow(/duplicated/u);
  });

  it("keeps the Node campaign policy identical to the typed maturity policy", () => {
    const campaignLanes = Reflect.get(
      manualPreparation,
      "MANUAL_EVIDENCE_CAMPAIGN_LANES",
    ) as readonly CampaignLane[];

    expect(
      campaignLanes.map((lane) => ({
        id: lane.id,
        title: lane.title,
        minimumRiskClass: Math.min(...lane.claims.map((entry) => entry.minimumRiskClass)),
        versionSlot: lane.versionSlot ?? null,
        allowedCoverage: lane.claims
          .map((entry) => entry.coverageId)
          .sort((left, right) => left.localeCompare(right)),
        environment: lane.environment,
      })),
    ).toEqual(
      MANUAL_EVIDENCE_LANES.map((lane) => ({
        id: lane.id,
        title: lane.title,
        minimumRiskClass: lane.minimumRiskClass,
        versionSlot: "versionSlot" in lane ? lane.versionSlot : null,
        allowedCoverage: [...lane.allowedCoverage].sort((left, right) => left.localeCompare(right)),
        environment: lane.environment,
      })),
    );

    for (const riskClass of [1, 2, 3] as const) {
      const campaignClaims = campaignLanes
        .flatMap((lane) =>
          lane.claims
            .filter((entry) => entry.minimumRiskClass <= riskClass)
            .map((entry) => `${lane.id}:${entry.coverageId}`),
        )
        .sort((left, right) => left.localeCompare(right));
      const maturityClaims = RISK_CLASS_POLICIES[riskClass].requiredManualLaneClaims
        .map((entry) => `${entry.laneId}:${entry.coverageId}`)
        .sort((left, right) => left.localeCompare(right));
      expect(campaignClaims, `Risk Class ${riskClass}`).toEqual(maturityClaims);
      expect(
        [...new Set(maturityClaims.map((entry) => entry.slice(entry.indexOf(":") + 1)))].sort(
          (left, right) => left.localeCompare(right),
        ),
        `Risk Class ${riskClass} coverage summary`,
      ).toEqual(
        [...RISK_CLASS_POLICIES[riskClass].requiredManualCoverage].sort((left, right) =>
          left.localeCompare(right),
        ),
      );
    }
  });
});

describe("production dependency license policy", () => {
  it("accepts reviewed permissive licenses and the constrained Sharp runtime exception", () => {
    expect(
      validateDependencyLicenseReport({
        MIT: [{ name: "example", versions: ["1.0.0"], license: "MIT" }],
        "Apache-2.0 AND LGPL-3.0-or-later": [
          {
            name: "@img/sharp-win32-x64",
            versions: ["0.34.5"],
            license: "Apache-2.0 AND LGPL-3.0-or-later",
          },
        ],
      }),
    ).toEqual([]);
  });

  it("rejects unknown licenses, missing versions, and an over-broad LGPL exception", () => {
    const issues = validateDependencyLicenseReport({
      UNKNOWN: [{ name: "mystery", versions: ["1.0.0"], license: "UNKNOWN" }],
      "LGPL-3.0-or-later": [
        { name: "unrelated-runtime", versions: [], license: "LGPL-3.0-or-later" },
      ],
    });
    expect(issues).toEqual(
      expect.arrayContaining([
        expect.stringContaining('license "UNKNOWN" is not allowed'),
        expect.stringContaining("has no concrete installed version"),
        expect.stringContaining("narrowly allowed Sharp/libvips runtime license"),
      ]),
    );
  });
});
