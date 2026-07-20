import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { evaluateBaselineChangePolicy } from "../../scripts/visual-baseline-lib.mjs";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const baselinePath = resolve(import.meta.dirname, "baseline.v1.json");
const visualEnvironmentKeys = new Set([
  "GITHUB_ACTIONS",
  "GITHUB_EVENT_NAME",
  "GITHUB_REF",
  "GITHUB_SHA",
]);

interface VisualManifest {
  readonly acceptedCommit: string;
  readonly comparison: { masks: unknown[]; maxDiffPixels: number; threshold: number };
  readonly environmentPolicy: {
    acceptedFontDigest: string;
    ciRunner: string;
    playwrightVersion: string;
  };
  readonly review: {
    readonly affectedStories: readonly string[];
    readonly explanation: string;
    readonly requiredLabel: string;
    readonly reviewBundleDigest: null | string;
    readonly reviewedAt: null | string;
    readonly reviewer: null | string;
    readonly status: "approved" | "provisional";
  };
}

const baseline = JSON.parse(readFileSync(baselinePath, "utf8")) as VisualManifest;
const policySource = [
  'import { loadVisualManifest, enforceBaselineChangePolicy } from "./scripts/visual-baseline-lib.mjs";',
  "const manifest = loadVisualManifest();",
  "process.stdout.write(JSON.stringify(enforceBaselineChangePolicy(manifest)));",
].join("\n");

function node(args: readonly string[], environment: Readonly<Record<string, string>> = {}) {
  const inheritedEnvironment: NodeJS.ProcessEnv = { ...process.env };
  for (const key of Object.keys(inheritedEnvironment)) {
    if (key.startsWith("MERGORA_VISUAL_") || visualEnvironmentKeys.has(key)) {
      delete inheritedEnvironment[key];
    }
  }
  const childEnvironment: NodeJS.ProcessEnv = { ...inheritedEnvironment, ...environment };
  return spawnSync(process.execPath, args, {
    cwd: workspaceRoot,
    encoding: "utf8",
    env: childEnvironment,
    shell: false,
  });
}

function headCommit(): string {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
  });
  expect(result.status, result.stderr).toBe(0);
  return result.stdout.trim();
}

function policyInput(
  overrides: Partial<Parameters<typeof evaluateBaselineChangePolicy>[0]> = {},
): Parameters<typeof evaluateBaselineChangePolicy>[0] {
  return {
    acceptedCommitIsAncestor: false,
    baseCommit: baseline.acceptedCommit,
    changed: true,
    directFeaturePushAuthority: false,
    hasPreviousManifest: false,
    labels: [],
    manifest: baseline,
    ...overrides,
  };
}

const completeApprovedReview = {
  affectedStories: ["Components/Button"],
  explanation:
    "Reviewed the intentional component presentation change in the rendered diff bundle.",
  requiredLabel: "visual-change",
  reviewBundleDigest: `sha256:${"a".repeat(64)}`,
  reviewedAt: "2026-07-20T00:00:00.000Z",
  reviewer: "visual-reviewer",
  status: "approved",
} as const;

describe("cross-commit visual baseline policy", () => {
  it("pins an immutable source and keeps the bootstrap review status honest", () => {
    expect(baseline.acceptedCommit).toMatch(/^[a-f0-9]{40}$/u);
    expect(baseline.environmentPolicy).toMatchObject({
      ciRunner: "ubuntu-24.04",
      playwrightVersion: "1.61.1",
      acceptedFontDigest: expect.stringMatching(/^sha256:[a-f0-9]{64}$/u),
    });
    expect(baseline.comparison).toEqual({ threshold: 0, maxDiffPixels: 0, masks: [] });
    expect(baseline.review.status).toBe("provisional");
  });

  it("plans two source renders followed by a real comparison", () => {
    const result = node(["scripts/run-visual-regression.mjs", "--plan"]);
    expect(result.status, result.stderr).toBe(0);
    const plan = JSON.parse(result.stdout) as {
      phases: string[];
      expectedComparisons: number;
      reviewStatus: string;
    };
    expect(plan.phases).toEqual([
      "render accepted commit",
      "render candidate",
      "compare and persist diffs",
    ]);
    expect(plan.expectedComparisons).toBe(16);
    expect(plan.reviewStatus).toBe("provisional");
  });

  it("records baseline-change authority without a pull-request-only summary field", () => {
    const runner = readFileSync(
      resolve(workspaceRoot, "scripts/run-visual-regression.mjs"),
      "utf8",
    );
    expect(runner).toContain("baselineChangePolicy");
    expect(runner).not.toContain("pullRequestPolicy");
  });

  it("preserves visual-change label authority for pull-request baseline changes", () => {
    const common = {
      MERGORA_VISUAL_POLICY_BASE_SHA: baseline.acceptedCommit,
    };
    const rejected = node(["--input-type=module", "--eval", policySource], common);
    expect(rejected.status).not.toBe(0);
    expect(rejected.stderr).toContain("visual-change");

    const accepted = node(["--input-type=module", "--eval", policySource], {
      ...common,
      MERGORA_VISUAL_PR_LABELS: "documentation,visual-change",
    });
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual({
      changed: true,
      bootstrap: true,
      authorization: "pull-request-label",
    });
  });

  it("permits only an exact-base provisional bootstrap on an authorized direct feature push", () => {
    const accepted = node(["--input-type=module", "--eval", policySource], {
      GITHUB_ACTIONS: "true",
      GITHUB_EVENT_NAME: "push",
      GITHUB_REF: "refs/heads/feature/foundation",
      GITHUB_SHA: headCommit(),
      MERGORA_VISUAL_DIRECT_FEATURE_PUSH_AUTHORITY: "true",
      MERGORA_VISUAL_POLICY_BASE_SHA: baseline.acceptedCommit,
    });
    expect(accepted.status, accepted.stderr).toBe(0);
    expect(JSON.parse(accepted.stdout)).toEqual({
      changed: true,
      bootstrap: true,
      authorization: "direct-feature-push-bootstrap",
    });

    expect(() =>
      evaluateBaselineChangePolicy(
        policyInput({
          baseCommit: "b".repeat(40),
          directFeaturePushAuthority: true,
        }),
      ),
    ).toThrow(/exact comparison base/u);
  });

  it("rejects spoofed direct-push authority on dispatch, main, and release refs", () => {
    for (const [event, ref] of [
      ["workflow_dispatch", "refs/heads/feature/foundation"],
      ["push", "refs/heads/main"],
      ["push", "refs/heads/release/1.x"],
    ] as const) {
      const result = node(["--input-type=module", "--eval", policySource], {
        GITHUB_ACTIONS: "true",
        GITHUB_EVENT_NAME: event,
        GITHUB_REF: ref,
        GITHUB_SHA: headCommit(),
        MERGORA_VISUAL_DIRECT_FEATURE_PUSH_AUTHORITY: "true",
        MERGORA_VISUAL_POLICY_BASE_SHA: baseline.acceptedCommit,
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        "invalid outside an exact GitHub Actions feature-branch push",
      );
    }
  });

  it("requires complete approved evidence and accepted-commit ancestry after bootstrap", () => {
    const approvedManifest = {
      ...baseline,
      acceptedCommit: "a".repeat(40),
      review: completeApprovedReview,
    };
    expect(() =>
      evaluateBaselineChangePolicy(
        policyInput({
          acceptedCommitIsAncestor: true,
          directFeaturePushAuthority: true,
          hasPreviousManifest: true,
          manifest: {
            ...approvedManifest,
            review: { ...completeApprovedReview, reviewer: "" },
          },
        }),
      ),
    ).toThrow(/structurally complete approved review record/u);

    expect(() =>
      evaluateBaselineChangePolicy(
        policyInput({
          acceptedCommitIsAncestor: false,
          directFeaturePushAuthority: true,
          hasPreviousManifest: true,
          manifest: approvedManifest,
        }),
      ),
    ).toThrow(/ancestor of the candidate HEAD/u);

    expect(
      evaluateBaselineChangePolicy(
        policyInput({
          acceptedCommitIsAncestor: true,
          directFeaturePushAuthority: true,
          hasPreviousManifest: true,
          manifest: approvedManifest,
        }),
      ),
    ).toEqual({
      changed: true,
      bootstrap: false,
      authorization: "direct-feature-push-review-record",
    });

    expect(
      evaluateBaselineChangePolicy(
        policyInput({
          acceptedCommitIsAncestor: true,
          directFeaturePushAuthority: true,
          hasPreviousManifest: false,
          manifest: approvedManifest,
        }),
      ),
    ).toEqual({
      changed: true,
      bootstrap: true,
      authorization: "direct-feature-push-review-record",
    });
  });

  it("never promotes unchanged metadata or a later provisional record", () => {
    expect(
      evaluateBaselineChangePolicy(
        policyInput({ changed: false, directFeaturePushAuthority: true }),
      ),
    ).toEqual({ changed: false, bootstrap: false, authorization: "not-required" });

    expect(() =>
      evaluateBaselineChangePolicy(
        policyInput({ directFeaturePushAuthority: true, hasPreviousManifest: true }),
      ),
    ).toThrow(/after bootstrap must contain an approved review record/u);
  });

  it("keeps acceptance separate and refuses incomplete review authority", () => {
    const before = readFileSync(baselinePath, "utf8");
    const result = node(["scripts/accept-visual-baseline.mjs"]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("--commit");
    expect(readFileSync(baselinePath, "utf8")).toBe(before);
  });
});
