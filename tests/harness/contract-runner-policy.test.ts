import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  REQUIRED_LOCALES,
  REQUIRED_PARITY_PROBES,
  REQUIRED_STORY_STATES,
  RISK_CLASS_POLICIES,
  VIEWPORT_PRESETS,
  aggregateEvidence,
  aggregateStateForEvidence,
  type AggregateState,
  type ContextEvidenceRecord,
} from "../../packages/test-utils/src/index.js";
import {
  ContractConfigurationError,
  runContractSuite,
  type ContractSuite,
} from "../../tooling/contract-runner/src/index.js";
import { EVIDENCE_STATE_MAP } from "../../registry/schemas/evidence.js";

const sourceDigest = `sha256:${"a".repeat(64)}`;

function suite(): ContractSuite<{ readonly rendered: boolean }> {
  return {
    schemaVersion: 1,
    suiteId: "button-contract",
    itemId: "button",
    contractVersion: "1.0.0",
    sourceDigest,
    checks: [
      {
        id: "a-rendered",
        category: "structure",
        applicability: "applicable",
        run: (context) => ({
          state: "pass",
          assertions: [
            { id: "rendered", passed: context.rendered, message: "The component rendered." },
          ],
        }),
      },
      {
        id: "b-geometry",
        category: "geometry",
        applicability: "applicable",
        requiredCapabilities: ["geometry"],
        run: () => ({
          state: "pass",
          assertions: [{ id: "bounds", passed: true, message: "Bounds are valid." }],
        }),
      },
      {
        id: "c-selection",
        category: "interaction",
        applicability: "not-applicable",
        rationale: "Buttons do not expose a selection model.",
      },
    ],
  };
}

describe("deterministic contract runner", () => {
  it("records missing capabilities as failures instead of skips", async () => {
    const result = await runContractSuite(suite(), { rendered: true }, { capabilities: new Set() });
    expect(result.state).toBe("fail");
    expect(result.aggregateState).toBe("failed");
    expect(result.results.map((entry) => entry.state)).toEqual(["pass", "fail", "not-applicable"]);
    expect(result.results[1]?.failures[0]?.code).toBe("runtime-capability-unavailable");
  });

  it("rejects empty passes and malformed suite ordering", async () => {
    const emptyPass = suite();
    const first = emptyPass.checks[0];
    if (first?.applicability !== "applicable") throw new Error("expected applicable check");
    const result = await runContractSuite(
      {
        ...emptyPass,
        checks: [{ ...first, run: () => ({ state: "pass", assertions: [] }) }],
      },
      { rendered: true },
      { capabilities: new Set() },
    );
    expect(result.state).toBe("fail");
    expect(result.results[0]?.failures[0]?.code).toBe("pass.empty");

    await expect(
      runContractSuite(
        { ...suite(), checks: [...suite().checks].reverse() },
        { rendered: true },
        { capabilities: new Set(["geometry"]) },
      ),
    ).rejects.toBeInstanceOf(ContractConfigurationError);
  });
});

describe("versioned quality policy", () => {
  const qualityRoot = resolve(import.meta.dirname, "../../registry/quality");
  const readPolicy = (name: string): unknown =>
    JSON.parse(readFileSync(resolve(qualityRoot, name), "utf8")) as unknown;

  it("keeps registry state and risk policies aligned with executable contracts", () => {
    const statePolicy = readPolicy("story-state-policy.v1.json") as {
      readonly requiredStates: readonly string[];
    };
    const riskPolicy = readPolicy("risk-class-policy.v1.json") as {
      readonly classes: Record<string, { readonly requiredManualCoverage: readonly string[] }>;
    };
    expect(statePolicy.requiredStates).toEqual(REQUIRED_STORY_STATES);
    expect(riskPolicy.classes["1"]?.requiredManualCoverage).toEqual(
      RISK_CLASS_POLICIES[1].requiredManualCoverage,
    );
    expect(riskPolicy.classes["2"]?.requiredManualCoverage).toEqual(
      RISK_CLASS_POLICIES[2].requiredManualCoverage,
    );
    expect(riskPolicy.classes["3"]?.requiredManualCoverage).toEqual(
      RISK_CLASS_POLICIES[3].requiredManualCoverage,
    );
    const parityPolicy = readPolicy("package-source-parity-policy.v1.json") as {
      readonly requiredProbes: readonly string[];
    };
    expect(parityPolicy.requiredProbes).toEqual(REQUIRED_PARITY_PROBES);
    const environmentPolicy = readPolicy("environment-policy.v1.json") as {
      readonly requiredLocales: readonly string[];
      readonly viewports: readonly {
        readonly id: string;
        readonly width: number;
        readonly height: number;
      }[];
    };
    expect(environmentPolicy.requiredLocales).toEqual(REQUIRED_LOCALES);
    expect(environmentPolicy.viewports).toEqual(VIEWPORT_PRESETS);
  });

  it("keeps every registry vocabulary mapping executable", () => {
    const policy = readPolicy("evidence-vocabulary.v1.json") as {
      readonly contexts: Record<string, Record<string, string>>;
      readonly aggregatePrecedence: readonly string[];
    };
    expect(policy.contexts).toEqual(EVIDENCE_STATE_MAP);
    for (const [context, mappings] of Object.entries(policy.contexts)) {
      for (const [state, aggregateState] of Object.entries(mappings)) {
        const record = {
          schemaVersion: 1,
          evidenceId: "policy-check",
          context,
          state,
          aggregateState,
          summary: "Policy alignment check.",
          references: [],
        } as ContextEvidenceRecord;
        expect(aggregateStateForEvidence(record)).toBe(aggregateState);
      }
    }
    expect(
      aggregateEvidence(
        policy.aggregatePrecedence.map((aggregateState) => ({
          aggregateState: aggregateState as AggregateState,
        })),
      ),
    ).toBe("failed");
  });
});
