import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import {
  captureFixtureVisual,
  persistJsonEvidence,
  stageFixtureVisualBaseline,
} from "./support/evidence.ts";
import { test, expect, loadFixture } from "./support/test.ts";

interface VisualMode {
  readonly id: string;
  readonly path: string;
  readonly colorScheme?: "dark" | "light";
  readonly forcedColors?: "active";
  readonly projects?: readonly string[];
  readonly reducedMotion?: "reduce";
}

interface VisualBaselineManifest {
  readonly acceptedCommit: string;
  readonly comparison: {
    readonly masks: readonly unknown[];
    readonly maxDiffPixels: number;
    readonly threshold: number;
  };
  readonly limitations: readonly string[];
  readonly modes: readonly VisualMode[];
  readonly review: {
    readonly status: string;
  };
}

const manifestPath = fileURLToPath(new URL("../visual/baseline.v1.json", import.meta.url));
const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as VisualBaselineManifest;
const requestedPhase = process.env.MERGORA_VISUAL_PHASE ?? "standalone";
if (!(["baseline", "candidate", "standalone"] as const).includes(requestedPhase as never)) {
  throw new Error(`Unsupported MERGORA_VISUAL_PHASE: ${requestedPhase}`);
}
const phase = requestedPhase as "baseline" | "candidate" | "standalone";
const runId = process.env.MERGORA_VISUAL_RUN_ID ?? "standalone";
const allowChanges = process.env.MERGORA_VISUAL_ALLOW_CHANGES === "1";

for (const mode of manifest.modes) {
  test(`@visual ${phase} ${mode.id}`, async ({ browser, browserName, page }, testInfo) => {
    test.skip(
      mode.projects !== undefined && !mode.projects.includes(browserName),
      `${mode.id} is not supported by the ${browserName} visual project.`,
    );
    const width = 1280;
    const height = 800;
    await page.setViewportSize({ width, height });
    await page.emulateMedia({
      ...(mode.colorScheme === undefined ? {} : { colorScheme: mode.colorScheme }),
      ...(mode.forcedColors === undefined ? {} : { forcedColors: mode.forcedColors }),
      ...(mode.reducedMotion === undefined ? {} : { reducedMotion: mode.reducedMotion }),
    });
    await loadFixture(page, mode.path);

    const capture = await captureFixtureVisual({
      browser,
      mode: mode.id,
      page,
      phase,
      projectName: testInfo.project.name,
      runId,
      width,
      height,
    });

    if (phase !== "candidate") {
      await testInfo.attach(`${mode.id}-${phase}-visual-evidence`, {
        body: JSON.stringify(capture, null, 2),
        contentType: "application/json",
      });
      return;
    }

    const snapshotName = `${mode.id}.png`;
    const baseline = await stageFixtureVisualBaseline({
      mode: mode.id,
      projectName: testInfo.project.name,
      runId,
      snapshotPath: testInfo.snapshotPath(snapshotName),
    });
    let result: "changed" | "unchanged" = "unchanged";
    let comparisonFailure: unknown;
    try {
      await expect(page).toHaveScreenshot(snapshotName, {
        animations: "disabled",
        caret: "hide",
        fullPage: false,
        maxDiffPixels: manifest.comparison.maxDiffPixels,
        scale: "css",
        threshold: manifest.comparison.threshold,
      });
    } catch (error) {
      result = "changed";
      comparisonFailure = error;
    }

    const comparison = {
      schemaVersion: 1,
      kind: "cross-commit-visual-comparison",
      baseline: {
        commit: process.env.MERGORA_VISUAL_BASELINE_COMMIT ?? manifest.acceptedCommit,
        reviewStatus: manifest.review.status,
        ...baseline,
      },
      candidate: {
        sourceId: process.env.MERGORA_VISUAL_SOURCE_ID ?? "working-tree",
        ...capture,
      },
      environment: {
        project: testInfo.project.name,
        viewport: { width, height },
      },
      mode: mode.id,
      policy: manifest.comparison,
      result,
      limitations: manifest.limitations,
    };
    const evidence = await persistJsonEvidence(
      `visual-regression/${runId}/comparisons/${testInfo.project.name}/${mode.id}.json`,
      comparison,
    );
    await testInfo.attach(`${mode.id}-cross-commit-comparison`, {
      body: JSON.stringify({ ...comparison, evidence }, null, 2),
      contentType: "application/json",
    });

    if (comparisonFailure !== undefined && !allowChanges) throw comparisonFailure;
  });
}
