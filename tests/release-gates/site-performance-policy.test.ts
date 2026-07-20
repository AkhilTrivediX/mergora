import { describe, expect, it } from "vitest";

import {
  evaluatePerformanceSamples,
  maximumPerformanceSamples,
  samplingPolicy,
  sitePerformanceThresholds,
  type SitePerformanceMeasurement,
} from "../../scripts/site-performance-policy.mjs";

function measurement(
  values: Partial<{
    accessibility: number;
    bestPractices: number;
    performance: number;
    seo: number;
    cls: number;
    lcpMs: number;
    inpProxyBlockingMs: number;
  }> = {},
): SitePerformanceMeasurement {
  return {
    scores: {
      accessibility: values.accessibility ?? 1,
      bestPractices: values.bestPractices ?? 1,
      performance: values.performance ?? 0.96,
      seo: values.seo ?? 1,
    },
    metrics: {
      cls: values.cls ?? 0.01,
      lcpMs: values.lcpMs ?? 2200,
      inpProxyBlockingMs: values.inpProxyBlockingMs ?? 80,
    },
  };
}

describe("site performance sampling policy", () => {
  it("keeps the public Lighthouse and interaction budgets unchanged", () => {
    expect(sitePerformanceThresholds).toEqual({
      accessibility: 1,
      bestPractices: 0.95,
      performance: 0.95,
      seo: 0.95,
      lcpMs: 2500,
      cls: 0.1,
      inpProxyBlockingMs: 200,
    });
  });

  it("accepts a passing first measurement without extra audits", () => {
    const sample = measurement();
    expect(evaluatePerformanceSamples([sample])).toEqual({ kind: "pass", result: sample });
  });

  it("confirms every performance-only miss with exactly three bounded samples", () => {
    const outlier = measurement({ performance: 0.79, inpProxyBlockingMs: 670 });
    const recovery = measurement({ performance: 0.97, inpProxyBlockingMs: 70 });
    const confirmation = measurement({ performance: 0.96, inpProxyBlockingMs: 90 });

    expect(evaluatePerformanceSamples([outlier])).toEqual({ kind: "continue" });
    expect(evaluatePerformanceSamples([outlier, recovery])).toEqual({ kind: "continue" });
    expect(evaluatePerformanceSamples([outlier, recovery, confirmation])).toEqual({
      kind: "pass",
      result: measurement({ performance: 0.96, inpProxyBlockingMs: 90 }),
    });
    expect(maximumPerformanceSamples).toBe(3);
    expect(() => evaluatePerformanceSamples([outlier, recovery, confirmation, recovery])).toThrow(
      /between 1 and 3 samples/u,
    );
    expect(samplingPolicy).toContain("any performance-only miss");
    expect(samplingPolicy).toContain("exact median of three");
  });

  it("fails when the real three-sample median remains over budget", () => {
    const result = evaluatePerformanceSamples([
      measurement({ performance: 0.9, inpProxyBlockingMs: 350 }),
      measurement({ performance: 0.92, inpProxyBlockingMs: 300 }),
      measurement({ performance: 0.88, inpProxyBlockingMs: 400 }),
    ]);

    expect(result).toMatchObject({
      kind: "fail-performance",
      result: measurement({ performance: 0.9, inpProxyBlockingMs: 350 }),
    });
    if (result.kind !== "fail-performance") throw new Error("expected a median failure");
    expect(result.failures).toEqual([
      "Lighthouse performance is below 95: 90",
      "TBT interaction proxy 350ms exceeds 200ms",
    ]);
  });

  it("fails accessibility and audit invariants immediately", () => {
    const result = evaluatePerformanceSamples([
      measurement({ accessibility: 0.99, bestPractices: 0.94, seo: 0.94 }),
    ]);
    expect(result).toEqual({
      kind: "fail-invariant",
      failures: [
        "Lighthouse accessibility is below 100",
        "Lighthouse bestPractices is below 95: 94",
        "Lighthouse seo is below 95: 94",
      ],
    });

    const afterPerformanceMiss = evaluatePerformanceSamples([
      measurement({ performance: 0.8, inpProxyBlockingMs: 650 }),
      measurement({ accessibility: 0.99 }),
    ]);
    expect(afterPerformanceMiss).toEqual({
      kind: "fail-invariant",
      failures: ["Lighthouse accessibility is below 100"],
    });
  });
});
