import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export const workspaceRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
export const manifestPath = resolve(workspaceRoot, "tests", "visual", "baseline.v1.json");

export function sha256(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

export function git(args, options = {}) {
  const encoding = Object.hasOwn(options, "encoding") ? options.encoding : "utf8";
  const result = spawnSync("git", args, {
    cwd: workspaceRoot,
    encoding,
    shell: false,
    windowsHide: true,
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(`git ${args.join(" ")} failed: ${String(result.stderr).trim()}`);
  }
  return result;
}

export function resolveCommit(reference) {
  const value = git(["rev-parse", "--verify", `${reference}^{commit}`]).stdout.trim();
  if (!/^[a-f0-9]{40}$/u.test(value)) {
    throw new Error(`Visual baseline reference did not resolve to a full commit: ${reference}`);
  }
  return value;
}

export function readGitFile(commit, path, options = {}) {
  const result = git(["show", `${commit}:${path}`], {
    allowFailure: options.allowFailure,
    encoding: options.encoding ?? null,
  });
  if (result.status !== 0) return undefined;
  return result.stdout;
}

export function fontDigestForCommit(commit) {
  const manifestBytes = readGitFile(commit, "assets/fonts/manifest.json");
  if (manifestBytes === undefined) throw new Error(`${commit} has no font manifest`);
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (!Array.isArray(manifest.families) || manifest.families.length === 0) {
    throw new Error(`${commit} has no font family records`);
  }

  const records = manifest.families.map((family) => {
    if (
      typeof family.asset !== "string" ||
      typeof family.family !== "string" ||
      !/^[a-f0-9]{64}$/u.test(family.sha256 ?? "")
    ) {
      throw new Error(`${commit} has an incomplete font family record`);
    }
    const bytes = readGitFile(commit, `assets/fonts/${family.asset}`);
    if (bytes === undefined) throw new Error(`${commit} is missing ${family.asset}`);
    const actual = sha256(bytes).slice("sha256:".length);
    if (actual !== family.sha256) {
      throw new Error(`${commit} font bytes disagree with the manifest: ${family.asset}`);
    }
    return { asset: family.asset, family: family.family, sha256: actual };
  });
  records.sort((left, right) => left.family.localeCompare(right.family));
  return sha256(Buffer.from(JSON.stringify(records), "utf8"));
}

function isSafeSegment(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value);
}

function isCanonicalIsoTimestamp(value) {
  if (typeof value !== "string") return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

export function hasCompleteApprovedReview(review) {
  return (
    review?.status === "approved" &&
    typeof review.reviewer === "string" &&
    review.reviewer.trim().length >= 2 &&
    isCanonicalIsoTimestamp(review.reviewedAt) &&
    /^sha256:[a-f0-9]{64}$/u.test(review.reviewBundleDigest ?? "") &&
    typeof review.explanation === "string" &&
    review.explanation.trim().length >= 20 &&
    Array.isArray(review.affectedStories) &&
    review.affectedStories.length > 0 &&
    review.affectedStories.every((story) => typeof story === "string" && story.trim().length > 0)
  );
}

export function evaluateBaselineChangePolicy({
  acceptedCommitIsAncestor,
  baseCommit,
  changed,
  directFeaturePushAuthority,
  hasPreviousManifest,
  labels,
  manifest,
}) {
  if (!changed) {
    return { changed: false, bootstrap: false, authorization: "not-required" };
  }

  const bootstrap = !hasPreviousManifest;
  const labelSet = labels instanceof Set ? labels : new Set(labels);
  if (labelSet.has(manifest.review.requiredLabel)) {
    if (!bootstrap && manifest.review.status !== "approved") {
      throw new Error(
        "A visual baseline update after bootstrap must contain an approved review record",
      );
    }
    return { changed: true, bootstrap, authorization: "pull-request-label" };
  }

  if (!directFeaturePushAuthority) {
    throw new Error(
      `Visual baseline metadata changed without the ${manifest.review.requiredLabel} label or authorized direct feature-push evidence`,
    );
  }

  if (bootstrap && manifest.review.status === "provisional") {
    if (manifest.acceptedCommit !== baseCommit) {
      throw new Error(
        "A provisional direct feature-push bootstrap must accept the exact comparison base",
      );
    }
    return {
      changed: true,
      bootstrap: true,
      authorization: "direct-feature-push-bootstrap",
    };
  }

  if (manifest.review.status !== "approved") {
    throw new Error(
      "A direct feature-push baseline update after bootstrap must contain an approved review record",
    );
  }
  if (!hasCompleteApprovedReview(manifest.review)) {
    throw new Error(
      "Direct feature-push baseline authority requires a structurally complete approved review record",
    );
  }
  if (!acceptedCommitIsAncestor) {
    throw new Error(
      "The approved visual baseline commit must be an ancestor of the candidate HEAD",
    );
  }
  return {
    changed: true,
    bootstrap,
    authorization: "direct-feature-push-review-record",
  };
}

export function loadVisualManifest() {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (
    manifest?.schemaVersion !== 1 ||
    manifest.kind !== "mergora-cross-commit-visual-baseline" ||
    !isSafeSegment(manifest.suiteId) ||
    !/^[a-f0-9]{40}$/u.test(manifest.acceptedCommit ?? "")
  ) {
    throw new Error("Visual baseline manifest identity is invalid");
  }
  if (
    manifest.comparison?.threshold !== 0 ||
    manifest.comparison?.maxDiffPixels !== 0 ||
    !Array.isArray(manifest.comparison?.masks) ||
    manifest.comparison.masks.length !== 0
  ) {
    throw new Error("The global visual comparison must remain exact and unmasked");
  }
  if (
    !Array.isArray(manifest.projects) ||
    manifest.projects.length === 0 ||
    manifest.projects.some((project) => !isSafeSegment(project)) ||
    !Array.isArray(manifest.modes) ||
    manifest.modes.length === 0
  ) {
    throw new Error("Visual baseline projects and modes must be explicit");
  }
  for (const mode of manifest.modes) {
    if (
      !isSafeSegment(mode.id) ||
      typeof mode.path !== "string" ||
      (mode.projects !== undefined &&
        (!Array.isArray(mode.projects) ||
          mode.projects.some((project) => !manifest.projects.includes(project))))
    ) {
      throw new Error(`Visual baseline mode is invalid: ${JSON.stringify(mode)}`);
    }
  }
  if (
    !["approved", "provisional"].includes(manifest.review?.status) ||
    manifest.review?.requiredLabel !== "visual-change" ||
    typeof manifest.review?.explanation !== "string" ||
    manifest.review.explanation.trim().length < 20 ||
    !Array.isArray(manifest.review?.affectedStories) ||
    manifest.review.affectedStories.length === 0
  ) {
    throw new Error("Visual baseline review metadata is incomplete");
  }
  if (manifest.review.status === "approved" && !hasCompleteApprovedReview(manifest.review)) {
    throw new Error("Approved visual baseline review metadata is incomplete");
  }

  const acceptedCommit = resolveCommit(manifest.acceptedCommit);
  for (const path of [manifest.source?.fixture, manifest.source?.spec]) {
    if (
      typeof path !== "string" ||
      readGitFile(acceptedCommit, path, { allowFailure: true }) === undefined
    ) {
      throw new Error(`Accepted visual commit does not contain required source: ${String(path)}`);
    }
  }
  const actualFontDigest = fontDigestForCommit(acceptedCommit);
  if (actualFontDigest !== manifest.environmentPolicy?.acceptedFontDigest) {
    throw new Error(
      `Accepted visual font digest drifted: ${actualFontDigest} != ${String(manifest.environmentPolicy?.acceptedFontDigest)}`,
    );
  }
  const playwrightPackage = JSON.parse(
    readFileSync(
      resolve(workspaceRoot, "node_modules", "@playwright", "test", "package.json"),
      "utf8",
    ),
  );
  if (playwrightPackage.version !== manifest.environmentPolicy?.playwrightVersion) {
    throw new Error(
      `Installed Playwright ${String(playwrightPackage.version)} does not match visual policy ${String(manifest.environmentPolicy?.playwrightVersion)}`,
    );
  }
  return manifest;
}

function isAncestor(ancestor, descendant) {
  const result = git(["merge-base", "--is-ancestor", ancestor, descendant], {
    allowFailure: true,
  });
  if (result.status === 0) return true;
  if (result.status === 1) return false;
  throw new Error(`Could not verify visual baseline ancestry: ${String(result.stderr).trim()}`);
}

function hasDirectFeaturePushAuthority(candidateCommit) {
  const authority = process.env.MERGORA_VISUAL_DIRECT_FEATURE_PUSH_AUTHORITY?.trim();
  if (authority === undefined || authority === "" || authority === "false") return false;

  const prefix = "refs/heads/feature/";
  const ref = process.env.GITHUB_REF ?? "";
  const branch = ref.startsWith(prefix) ? ref.slice(prefix.length) : "";
  const githubSha = process.env.GITHUB_SHA ?? "";
  const validBranch =
    branch !== "" &&
    !branch.startsWith("/") &&
    !branch.endsWith("/") &&
    !branch.includes("//") &&
    !branch.includes("..");
  if (
    authority !== "true" ||
    process.env.GITHUB_ACTIONS !== "true" ||
    process.env.GITHUB_EVENT_NAME !== "push" ||
    !validBranch ||
    !/^[a-f0-9]{40}$/u.test(githubSha) ||
    resolveCommit(githubSha) !== candidateCommit
  ) {
    throw new Error(
      "Direct feature-push visual authority is invalid outside an exact GitHub Actions feature-branch push",
    );
  }
  return true;
}

export function enforceBaselineChangePolicy(manifest) {
  const baseSha = process.env.MERGORA_VISUAL_POLICY_BASE_SHA?.trim();
  if (baseSha === undefined || baseSha === "") {
    return { changed: false, bootstrap: false, authorization: "not-required" };
  }
  const baseCommit = resolveCommit(baseSha);
  const previousBytes = readGitFile(baseCommit, "tests/visual/baseline.v1.json", {
    allowFailure: true,
  });
  const currentBytes = readFileSync(manifestPath);
  const changed = previousBytes === undefined || !previousBytes.equals(currentBytes);
  const labels = new Set(
    (process.env.MERGORA_VISUAL_PR_LABELS ?? "")
      .split(",")
      .map((label) => label.trim())
      .filter(Boolean),
  );
  const candidateCommit = resolveCommit("HEAD");
  const hasLabelAuthority = labels.has(manifest.review.requiredLabel);
  const directFeaturePushAuthority =
    changed && !hasLabelAuthority && hasDirectFeaturePushAuthority(candidateCommit);
  const acceptedCommitIsAncestor =
    directFeaturePushAuthority && manifest.review.status === "approved"
      ? isAncestor(resolveCommit(manifest.acceptedCommit), candidateCommit)
      : false;

  return evaluateBaselineChangePolicy({
    acceptedCommitIsAncestor,
    baseCommit,
    changed,
    directFeaturePushAuthority,
    hasPreviousManifest: previousBytes !== undefined,
    labels,
    manifest,
  });
}

// Compatibility export for unreleased callers while evidence wording migrates.
export const enforcePullRequestBaselinePolicy = enforceBaselineChangePolicy;

export function expectedComparisonCount(manifest) {
  return manifest.modes.reduce(
    (count, mode) => count + (mode.projects?.length ?? manifest.projects.length),
    0,
  );
}
