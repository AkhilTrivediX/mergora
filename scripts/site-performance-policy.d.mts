export interface SitePerformanceMeasurement {
  readonly scores: {
    readonly accessibility: number;
    readonly bestPractices: number;
    readonly performance: number;
    readonly seo: number;
  };
  readonly metrics: {
    readonly cls: number;
    readonly lcpMs: number;
    readonly inpProxyBlockingMs: number;
  };
}

export const maximumPerformanceSamples: 3;

export const sitePerformanceThresholds: Readonly<{
  accessibility: 1;
  bestPractices: 0.95;
  performance: 0.95;
  seo: 0.95;
  lcpMs: 2500;
  cls: 0.1;
  inpProxyBlockingMs: 200;
}>;

export const samplingPolicy: string;

export type PerformanceSamplingDecision =
  | { readonly kind: "continue" }
  | { readonly kind: "fail-invariant"; readonly failures: readonly string[] }
  | { readonly kind: "pass"; readonly result: SitePerformanceMeasurement }
  | {
      readonly kind: "fail-performance";
      readonly result: SitePerformanceMeasurement;
      readonly failures: readonly string[];
    };

export function evaluatePerformanceSamples(
  samples: readonly SitePerformanceMeasurement[],
): PerformanceSamplingDecision;
