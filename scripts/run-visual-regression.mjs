import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve, sep } from "node:path";

import {
  enforceBaselineChangePolicy,
  expectedComparisonCount,
  git,
  loadVisualManifest,
  workspaceRoot,
} from "./visual-baseline-lib.mjs";

const corepack =
  process.platform === "win32"
    ? {
        command: process.execPath,
        prefix: [
          resolve(dirname(process.execPath), "node_modules", "corepack", "dist", "corepack.js"),
        ],
      }
    : { command: "corepack", prefix: [] };

function usage() {
  return "Usage: node scripts/run-visual-regression.mjs [--plan|--review]\n";
}

function safeRemove(target, parent, subject) {
  const resolvedTarget = resolve(target);
  const resolvedParent = resolve(parent);
  if (!resolvedTarget.startsWith(`${resolvedParent}${sep}`) || resolvedTarget === resolvedParent) {
    throw new Error(`Refusing to remove unsafe ${subject} path: ${resolvedTarget}`);
  }
  rmSync(resolvedTarget, { force: true, recursive: true });
}

function runPlaywright({ allowChanges, fixtureRoot, phase, runId, sourceId }) {
  const result = spawnSync(
    corepack.command,
    [
      ...corepack.prefix,
      "pnpm@11.14.0",
      "exec",
      "playwright",
      "test",
      "--config",
      "playwright.config.ts",
      "--grep",
      "@visual",
    ],
    {
      cwd: workspaceRoot,
      env: {
        ...process.env,
        CI: process.env.CI ?? "1",
        COREPACK_ENABLE_DOWNLOAD_PROMPT: "0",
        MERGORA_VISUAL_ALLOW_CHANGES: allowChanges ? "1" : "0",
        MERGORA_VISUAL_FIXTURE_ROOT: fixtureRoot,
        MERGORA_VISUAL_PHASE: phase,
        MERGORA_VISUAL_RUN_ID: runId,
        MERGORA_VISUAL_SOURCE_ID: sourceId,
      },
      shell: false,
      stdio: "inherit",
      windowsHide: true,
    },
  );
  if (result.error !== undefined) throw result.error;
  return result.status ?? 1;
}

function collectJson(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return collectJson(path);
    return entry.isFile() && entry.name.endsWith(".json")
      ? [{ path, value: JSON.parse(readFileSync(path, "utf8")) }]
      : [];
  });
}

function stageCommittedTokenAssets(worktreeRoot) {
  const source = resolve(worktreeRoot, "packages", "tokens", "src", "generated");
  const output = resolve(worktreeRoot, "packages", "tokens", "dist");
  const fonts = resolve(output, "fonts");
  mkdirSync(fonts, { recursive: true });
  for (const filename of ["tokens.css", "fonts.css"]) {
    copyFileSync(resolve(source, filename), resolve(output, filename));
  }
  for (const filename of [
    "commit-mono-latin-greek-wght.woff2",
    "schibsted-grotesk-latin-ext-wght.woff2",
  ]) {
    copyFileSync(resolve(worktreeRoot, "assets", "fonts", filename), resolve(fonts, filename));
  }
}

function writeSummary({
  baselineCommit,
  baselineChangePolicy,
  candidateCommit,
  candidateDirty,
  manifest,
  platform,
  reviewMode,
  runId,
  runRoot,
  statuses,
}) {
  const comparisons = collectJson(resolve(runRoot, "comparisons")).map(({ value }) => value);
  const changed = comparisons.filter(({ result }) => result === "changed").length;
  const expected = expectedComparisonCount(manifest);
  const complete = comparisons.length === expected;
  const platformEligible = manifest.environmentPolicy.eligibleEvidencePlatforms.includes(platform);
  const crossCommit = baselineCommit !== candidateCommit;
  const approved = manifest.review.status === "approved";
  const passed = statuses.baseline === 0 && statuses.candidate === 0 && complete && changed === 0;
  const releaseEligible =
    passed && approved && platformEligible && crossCommit && !candidateDirty && !reviewMode;
  const result = !complete
    ? "incomplete"
    : changed > 0
      ? "changes-detected"
      : passed
        ? "unchanged"
        : "failed";
  const limitations = [...manifest.limitations];
  if (!approved) limitations.push("The accepted baseline review is provisional.");
  if (!platformEligible)
    limitations.push(`The ${platform} platform is diagnostic-only under the visual policy.`);
  if (candidateDirty)
    limitations.push("The candidate contains uncommitted source and cannot be release evidence.");
  if (!crossCommit)
    limitations.push(
      "The dirty working tree differs from the baseline commit, but this is not a clean cross-commit release comparison.",
    );
  if (reviewMode)
    limitations.push("Review mode records intentional differences and is never a blocking pass.");

  const summary = {
    schemaVersion: 1,
    kind: "mergora-cross-commit-visual-run",
    runId,
    baseline: {
      commit: baselineCommit,
      review: manifest.review,
    },
    candidate: {
      commit: candidateCommit,
      dirty: candidateDirty,
      sourceId: candidateDirty
        ? `working-tree-${candidateCommit.slice(0, 12)}`
        : `commit-${candidateCommit.slice(0, 12)}`,
    },
    environment: {
      platform,
      policy: manifest.environmentPolicy,
    },
    comparison: {
      changed,
      complete,
      expected,
      observed: comparisons.length,
      policy: manifest.comparison,
    },
    baselineChangePolicy,
    reviewMode,
    result,
    releaseEligible,
    statuses,
    limitations,
  };
  writeFileSync(resolve(runRoot, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  return summary;
}

const arguments_ = process.argv.slice(2);
if (
  arguments_.length > 1 ||
  (arguments_.length === 1 && !["--plan", "--review"].includes(arguments_[0]))
) {
  process.stderr.write(usage());
  process.exitCode = 2;
} else {
  try {
    const manifest = loadVisualManifest();
    const reviewMode = arguments_[0] === "--review";
    if (arguments_[0] === "--plan") {
      process.stdout.write(
        `${JSON.stringify(
          {
            schemaVersion: 1,
            gate: "visual",
            baselineCommit: manifest.acceptedCommit,
            reviewStatus: manifest.review.status,
            comparison: manifest.comparison,
            expectedComparisons: expectedComparisonCount(manifest),
            phases: ["render accepted commit", "render candidate", "compare and persist diffs"],
          },
          null,
          2,
        )}\n`,
      );
    } else {
      const baselineChangePolicy = enforceBaselineChangePolicy(manifest);
      const candidateCommit = git(["rev-parse", "HEAD"]).stdout.trim();
      const candidateDirty =
        git(["status", "--porcelain=v1", "--untracked-files=all"]).stdout.trim() !== "";
      if (!candidateDirty && candidateCommit === manifest.acceptedCommit) {
        throw new Error(
          "Candidate and accepted baseline are the same clean commit; refusing a same-source visual pass",
        );
      }

      const runId = `visual-${manifest.acceptedCommit.slice(0, 8)}-${candidateCommit.slice(0, 8)}-${candidateDirty ? "working" : "commit"}`;
      const visualRoot = resolve(
        workspaceRoot,
        "artifacts",
        "browser-evidence",
        "visual-regression",
      );
      const runRoot = resolve(visualRoot, runId);
      safeRemove(runRoot, visualRoot, "visual run");
      mkdirSync(runRoot, { recursive: true });

      const worktreeRoot = resolve(workspaceRoot, "artifacts", "visual-worktrees");
      const baselineRoot = resolve(worktreeRoot, manifest.acceptedCommit.slice(0, 16));
      mkdirSync(worktreeRoot, { recursive: true });
      git(["worktree", "remove", "--force", baselineRoot], { allowFailure: true });
      safeRemove(baselineRoot, worktreeRoot, "visual worktree");

      const statuses = { baseline: 1, candidate: 1 };
      let summary;
      try {
        git(["worktree", "add", "--detach", baselineRoot, manifest.acceptedCommit]);
        stageCommittedTokenAssets(baselineRoot);

        process.stdout.write(
          `\n[visual 1/2] render immutable baseline ${manifest.acceptedCommit}\n`,
        );
        statuses.baseline = runPlaywright({
          allowChanges: false,
          fixtureRoot: baselineRoot,
          phase: "baseline",
          runId,
          sourceId: `commit-${manifest.acceptedCommit.slice(0, 12)}`,
        });
        if (statuses.baseline !== 0) {
          throw new Error(
            `Immutable baseline capture failed with exit status ${statuses.baseline}`,
          );
        }

        process.stdout.write(`\n[visual 2/2] compare candidate with immutable baseline\n`);
        statuses.candidate = runPlaywright({
          allowChanges: reviewMode,
          fixtureRoot: workspaceRoot,
          phase: "candidate",
          runId,
          sourceId: candidateDirty
            ? `working-tree-${candidateCommit.slice(0, 12)}`
            : `commit-${candidateCommit.slice(0, 12)}`,
        });
        summary = writeSummary({
          baselineCommit: manifest.acceptedCommit,
          baselineChangePolicy,
          candidateCommit,
          candidateDirty,
          manifest,
          platform: process.platform,
          reviewMode,
          runId,
          runRoot,
          statuses,
        });
      } finally {
        git(["worktree", "remove", "--force", baselineRoot], { allowFailure: true });
        if (existsSync(baselineRoot)) safeRemove(baselineRoot, worktreeRoot, "visual worktree");
        git(["worktree", "prune"], { allowFailure: true });
      }

      process.stdout.write(
        `\nvisual comparison ${summary.result}: artifacts/browser-evidence/visual-regression/${runId}/summary.json\n`,
      );
      if (statuses.candidate !== 0 || summary.result === "incomplete") {
        throw new Error("Cross-commit visual comparison failed");
      }
      if (!reviewMode && summary.result !== "unchanged") {
        throw new Error("Cross-commit visual changes require an explicit review bundle");
      }
    }
  } catch (error) {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`visual regression gate failed: ${message}\n`);
    process.exitCode = 1;
  }
}
