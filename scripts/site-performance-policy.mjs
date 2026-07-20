export const maximumPerformanceSamples = 3;

export const sitePerformanceThresholds = Object.freeze({
  accessibility: 1,
  bestPractices: 0.95,
  performance: 0.95,
  seo: 0.95,
  lcpMs: 2500,
  cls: 0.1,
  inpProxyBlockingMs: 200,
});

export const samplingPolicy =
  "One sample when it passes; any performance-only miss is confirmed by an exact median of three. Accessibility, best-practice, and SEO invariants fail immediately, and every performance budget remains unchanged.";

function invariantFailures({ scores }) {
  const failures = [];
  if (scores.accessibility < sitePerformanceThresholds.accessibility) {
    failures.push("Lighthouse accessibility is below 100");
  }
  if (scores.bestPractices < sitePerformanceThresholds.bestPractices) {
    failures.push(`Lighthouse bestPractices is below 95: ${String(scores.bestPractices * 100)}`);
  }
  if (scores.seo < sitePerformanceThresholds.seo) {
    failures.push(`Lighthouse seo is below 95: ${String(scores.seo * 100)}`);
  }
  return failures;
}

function performanceFailures({ metrics, scores }) {
  const failures = [];
  if (scores.performance < sitePerformanceThresholds.performance) {
    failures.push(`Lighthouse performance is below 95: ${String(scores.performance * 100)}`);
  }
  if (metrics.lcpMs > sitePerformanceThresholds.lcpMs) {
    failures.push(`LCP ${String(metrics.lcpMs)}ms exceeds 2500ms`);
  }
  if (metrics.cls > sitePerformanceThresholds.cls) {
    failures.push(`CLS ${String(metrics.cls)} exceeds 0.1`);
  }
  if (metrics.inpProxyBlockingMs > sitePerformanceThresholds.inpProxyBlockingMs) {
    failures.push(`TBT interaction proxy ${String(metrics.inpProxyBlockingMs)}ms exceeds 200ms`);
  }
  return failures;
}

function median(values) {
  const ordered = [...values].sort((left, right) => left - right);
  return ordered[Math.floor(ordered.length / 2)];
}

function medianMeasurement(samples) {
  if (samples.length !== maximumPerformanceSamples) {
    throw new Error(
      `performance confirmation requires exactly ${maximumPerformanceSamples} samples`,
    );
  }
  return {
    scores: {
      accessibility: median(samples.map(({ scores }) => scores.accessibility)),
      bestPractices: median(samples.map(({ scores }) => scores.bestPractices)),
      performance: median(samples.map(({ scores }) => scores.performance)),
      seo: median(samples.map(({ scores }) => scores.seo)),
    },
    metrics: {
      cls: median(samples.map(({ metrics }) => metrics.cls)),
      lcpMs: median(samples.map(({ metrics }) => metrics.lcpMs)),
      inpProxyBlockingMs: median(samples.map(({ metrics }) => metrics.inpProxyBlockingMs)),
    },
  };
}

export function evaluatePerformanceSamples(samples) {
  if (samples.length < 1 || samples.length > maximumPerformanceSamples) {
    throw new Error(
      `performance sampling requires between 1 and ${maximumPerformanceSamples} samples`,
    );
  }

  const latest = samples.at(-1);
  const invariant = invariantFailures(latest);
  if (invariant.length > 0) return { kind: "fail-invariant", failures: invariant };

  const latestPerformanceFailures = performanceFailures(latest);
  if (samples.length === 1 && latestPerformanceFailures.length === 0) {
    return { kind: "pass", result: latest };
  }
  if (samples.length < maximumPerformanceSamples) return { kind: "continue" };

  const result = medianMeasurement(samples);
  const failures = performanceFailures(result);
  return failures.length === 0
    ? { kind: "pass", result }
    : { kind: "fail-performance", result, failures };
}
