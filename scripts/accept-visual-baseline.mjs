import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";

import {
  fontDigestForCommit,
  git,
  loadVisualManifest,
  manifestPath,
  resolveCommit,
  sha256,
  workspaceRoot,
} from "./visual-baseline-lib.mjs";

function usage() {
  return "Usage: node scripts/accept-visual-baseline.mjs --commit <sha> --bundle <summary.json>\n";
}

function argument(name) {
  const index = process.argv.indexOf(name);
  if (index === -1 || index === process.argv.length - 1) throw new Error(usage().trim());
  return process.argv[index + 1];
}

function requiredEnvironment(name, minimumLength = 1) {
  const value = process.env[name]?.trim();
  if (value === undefined || value.length < minimumLength) {
    throw new Error(`${name} is required and must contain at least ${minimumLength} characters`);
  }
  return value;
}

try {
  if (process.argv.length !== 6) throw new Error(usage().trim());
  const requestedCommit = resolveCommit(argument("--commit"));
  const bundlePath = resolve(argument("--bundle"));
  const artifactRoot = resolve(workspaceRoot, "artifacts", "browser-evidence", "visual-regression");
  if (
    !bundlePath.startsWith(`${artifactRoot}${sep}`) ||
    !bundlePath.endsWith(`${sep}summary.json`)
  ) {
    throw new Error("The review bundle must be a visual-regression summary under artifacts");
  }

  const status = git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim();
  if (status !== "") throw new Error("Baseline acceptance requires a clean checkout");
  const head = resolveCommit("HEAD");
  if (requestedCommit !== head) {
    throw new Error("The reviewed commit must be the clean checkout HEAD");
  }

  const manifest = loadVisualManifest();
  const bundleBytes = readFileSync(bundlePath);
  const bundle = JSON.parse(bundleBytes.toString("utf8"));
  if (
    bundle?.kind !== "mergora-cross-commit-visual-run" ||
    bundle.reviewMode !== true ||
    bundle.baseline?.commit !== manifest.acceptedCommit ||
    bundle.candidate?.commit !== requestedCommit ||
    bundle.candidate?.dirty !== false ||
    bundle.comparison?.complete !== true ||
    !["changes-detected", "unchanged"].includes(bundle.result)
  ) {
    throw new Error("The review bundle does not describe this clean baseline transition");
  }

  const label = requiredEnvironment("MERGORA_VISUAL_CHANGE_LABEL");
  if (label !== manifest.review.requiredLabel) {
    throw new Error(`Baseline acceptance requires the ${manifest.review.requiredLabel} label`);
  }
  const explanation = requiredEnvironment("MERGORA_VISUAL_CHANGE_EXPLANATION", 20);
  const affectedStories = requiredEnvironment("MERGORA_VISUAL_AFFECTED_STORIES")
    .split(",")
    .map((story) => story.trim())
    .filter(Boolean);
  if (affectedStories.length === 0) throw new Error("At least one affected story is required");
  const reviewer = requiredEnvironment("MERGORA_VISUAL_REVIEWER", 2);

  const updated = {
    ...manifest,
    acceptedCommit: requestedCommit,
    environmentPolicy: {
      ...manifest.environmentPolicy,
      acceptedFontDigest: fontDigestForCommit(requestedCommit),
    },
    review: {
      status: "approved",
      requiredLabel: manifest.review.requiredLabel,
      explanation,
      affectedStories,
      reviewer,
      reviewedAt: new Date().toISOString(),
      reviewBundleDigest: sha256(bundleBytes),
    },
  };
  const temporary = `${manifestPath}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(updated, null, 2)}\n`, "utf8");
  renameSync(temporary, manifestPath);
  process.stdout.write(
    `Accepted visual baseline ${requestedCommit}; review ${relative(workspaceRoot, bundlePath)} remains ignored evidence.\n`,
  );
} catch (error) {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  process.stderr.write(`visual baseline acceptance failed: ${message}\n`);
  process.exitCode = 1;
}
