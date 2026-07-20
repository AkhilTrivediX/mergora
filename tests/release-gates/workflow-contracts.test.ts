import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Script } from "node:vm";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const workflowPaths = [
  ".github/workflows/ci.yml",
  ".github/workflows/nightly.yml",
  ".github/workflows/release-verify.yml",
  ".github/workflows/security.yml",
] as const;
const publicationWorkflowPaths = [
  ".github/workflows/changesets.yml",
  ".github/workflows/pages.yml",
  ".github/workflows/publish-next.yml",
  ".github/workflows/publish-production.yml",
] as const;

function text(path: string): string {
  return readFileSync(resolve(workspaceRoot, path), "utf8");
}

function occurrences(value: string, fragment: string): number {
  return value.split(fragment).length - 1;
}

function job(workflow: string, id: string): string {
  const marker = `  ${id}:\n`;
  const start = workflow.indexOf(marker);
  expect(start, `missing workflow job ${id}`).toBeGreaterThanOrEqual(0);
  const next = /^ {2}[a-z0-9-]+:\n/gmu;
  next.lastIndex = start + marker.length;
  const match = next.exec(workflow);
  return workflow.slice(start, match?.index ?? workflow.length);
}

function expectInOrder(value: string, fragments: readonly string[]): void {
  let cursor = -1;
  for (const fragment of fragments) {
    const index = value.indexOf(fragment, cursor + 1);
    expect(index, `missing or out-of-order workflow fragment: ${fragment}`).toBeGreaterThan(cursor);
    cursor = index;
  }
}

const workflows = Object.fromEntries(workflowPaths.map((path) => [path, text(path)])) as Record<
  (typeof workflowPaths)[number],
  string
>;
const allWorkflows = Object.values(workflows).join("\n");
const publicationWorkflows = publicationWorkflowPaths.map((path) => text(path));
const packageScripts = (
  JSON.parse(text("package.json")) as { readonly scripts: Readonly<Record<string, string>> }
).scripts;

const reviewedActionPins = new Map([
  ["actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0", "v7.0.0"],
  ["actions/setup-node@820762786026740c76f36085b0efc47a31fe5020", "v7.0.0"],
  ["actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a", "v7.0.1"],
  ["actions/download-artifact@3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c", "v8.0.1"],
  ["actions/github-script@3a2844b7e9c422d3c10d287c895573f7108da1b3", "v9.0.0"],
  ["oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6", "v2.2.0"],
  ["actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294", "v5.0.0"],
  ["github/codeql-action/init@7188fc363630916deb702c7fdcf4e481b751f97a", "v4.37.1"],
  ["github/codeql-action/autobuild@7188fc363630916deb702c7fdcf4e481b751f97a", "v4.37.1"],
  ["github/codeql-action/analyze@7188fc363630916deb702c7fdcf4e481b751f97a", "v4.37.1"],
]);

describe("GitHub workflow contracts", () => {
  it("uses only reviewed immutable action revisions and never persists checkout credentials", () => {
    const uses = [...allWorkflows.matchAll(/^\s*uses:\s*([^\s#]+)\s+#\s+(\S+)\s*$/gmu)];
    expect(uses.length).toBeGreaterThan(0);
    for (const match of uses) {
      const action = match[1] ?? "";
      const documentedVersion = match[2] ?? "";
      expect(action, `unreviewed action pin ${action}`).toMatch(/@[a-f0-9]{40}$/u);
      expect(reviewedActionPins.get(action), `unreviewed action pin ${action}`).toBe(
        documentedVersion,
      );
    }

    const checkoutNeedle = "uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0";
    for (const workflow of Object.values(workflows)) {
      const checkoutCount = occurrences(workflow, checkoutNeedle);
      expect(occurrences(workflow, "persist-credentials: false")).toBe(checkoutCount);
    }
  });

  it("routes every workflow-level pnpm quality command to a real root alias", () => {
    const pnpmCommands = [
      ...allWorkflows.matchAll(/^\s*run:\s+pnpm\s+([a-z][a-z0-9:-]*)\s*$/gmu),
    ].map((match) => match[1] ?? "");
    const pnpmBuiltins = new Set(["exec", "install"]);
    for (const command of pnpmCommands) {
      if (!pnpmBuiltins.has(command)) {
        expect(packageScripts, `missing root alias pnpm ${command}`).toHaveProperty(command);
      }
    }
  });

  it("fans CI out into serial, independently owned evidence lanes", () => {
    const ci = workflows[".github/workflows/ci.yml"];
    expect(ci).toContain("quality:\n    name: Repository quality");
    expect(ci).toContain("site-contracts:\n    name: Storybook, site export, and performance");
    expect(ci).toContain(
      "browser-contracts:\n    name: Browser, accessibility, and visual contracts",
    );
    expect(ci).toContain("packed-consumers:\n    name: Packed Next and Vite consumers");
    expect(occurrences(ci, "needs: quality")).toBe(3);
    expect(occurrences(ci, "run: pnpm check")).toBe(1);
    expect(occurrences(ci, "run: pnpm test:browser")).toBe(1);
    expect(occurrences(ci, "run: pnpm test:performance")).toBe(1);
    expect(occurrences(ci, "run: pnpm test:consumer")).toBe(1);
    expect(ci).toContain("run: pnpm install --frozen-lockfile");
    expect(ci).toContain("fetch-depth: 0");
    expect(ci).not.toContain("strategy:\n      matrix:");
  });

  it("builds and assembles ignored static outputs before fresh-checkout consumers", () => {
    const ciSite = job(workflows[".github/workflows/ci.yml"], "site-contracts");
    expectInOrder(ciSite, [
      "MERGORA_BASE_PATH: /mergora",
      "run: pnpm build",
      "run: node scripts/assemble-quality-lab.mjs",
      "run: node scripts/verify-static-export.mjs",
      "run: pnpm test:performance",
    ]);

    const nightlyPolicy = job(
      workflows[".github/workflows/nightly.yml"],
      "policy-security-performance",
    );
    expectInOrder(nightlyPolicy, [
      "MERGORA_BASE_PATH: /mergora",
      "run: pnpm build",
      "run: node scripts/assemble-quality-lab.mjs",
      "run: pnpm test:performance",
    ]);
  });

  it("verifies exact feature-branch checkpoints without requiring a pull-request event", () => {
    const exactCandidate = "${{ github.event.pull_request.head.sha || github.sha }}";
    const checkoutNeedle = "uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0";
    for (const workflow of [
      workflows[".github/workflows/ci.yml"],
      workflows[".github/workflows/security.yml"],
    ]) {
      expect(workflow).toContain('      - "feature/**"');
      expect(workflow).toContain("  workflow_dispatch:");
      expect(workflow).not.toContain("pull_request_target:");
      expect(occurrences(workflow, `ref: ${exactCandidate}`)).toBe(
        occurrences(workflow, checkoutNeedle),
      );
      expect(workflow).toContain(`run-name:`);
      expect(workflow).toContain(exactCandidate);
      expect(workflow).toContain("startsWith(github.ref, 'refs/heads/feature/')");
    }

    const ci = workflows[".github/workflows/ci.yml"];
    expect(ci).toContain("pull-requests: read");
    expect(occurrences(ci, "pull-requests: read")).toBe(1);
    expect(ci).toContain(
      "github.paginate(\n                github.rest.repos.listPullRequestsAssociatedWithCommit",
    );
    expect(ci).toContain("listPullRequestsAssociatedWithCommit");
    expect(ci).toContain("pull.head.sha === candidateSha");
    expect(ci).toContain("pull.merge_commit_sha === candidateSha");
    expect(ci).toContain('context.ref.startsWith("refs/heads/feature/")');
    expect(ci).toContain('if (context.eventName === "push")');
    expect(ci).toContain("directFeaturePushAuthority = true");
    expect(ci).toContain("compareCommitsWithBasehead");
    expect(ci).toContain("comparison.merge_base_commit.sha");
    expect(ci).toContain("candidateCommit.parents[0]?.sha ?? candidateSha");
    expect(ci).toContain('core.setOutput(\n              "direct-feature-push-authority"');
    expect(ci).toContain(
      "MERGORA_VISUAL_DIRECT_FEATURE_PUSH_AUTHORITY: ${{ steps.visual-context.outputs.direct-feature-push-authority }}",
    );
    expect(ci).toContain(
      "MERGORA_VISUAL_POLICY_BASE_SHA: ${{ steps.visual-context.outputs.base-sha }}",
    );
    expect(ci).toContain("MERGORA_VISUAL_PR_LABELS: ${{ steps.visual-context.outputs.labels }}");
    const visualScriptMarker = "          script: |\n";
    const visualScriptStart = ci.indexOf(visualScriptMarker) + visualScriptMarker.length;
    const visualScriptEnd = ci.indexOf(
      "\n      - name: Compare candidate visuals",
      visualScriptStart,
    );
    const visualScript = ci.slice(visualScriptStart, visualScriptEnd).replace(/^ {12}/gmu, "");
    expect(() => new Script(`(async () => {\n${visualScript}\n})()`)).not.toThrow();

    const security = workflows[".github/workflows/security.yml"];
    expect(security).toContain("${{ github.event_name }}");
    expect(security).toContain("if: github.event_name == 'pull_request'");

    for (const workflow of publicationWorkflows) {
      expect(workflow).not.toContain('      - "feature/**"');
      expect(workflow).not.toContain("refs/heads/feature/");
    }
  });

  it("keeps nightly coverage broad and isolates issue-write authority", () => {
    const nightly = workflows[".github/workflows/nightly.yml"];
    for (const required of [
      'cron: "17 2 * * *"',
      "ubuntu-latest",
      "windows-latest",
      "macos-latest",
      "chromium firefox webkit",
      "run: pnpm check",
      "run: pnpm test:browser",
      "run: pnpm test:visual",
      "run: pnpm test:a11y",
      "run: pnpm test:e2e",
      "run: pnpm test:consumer",
      "run: pnpm test:compat",
      "run: pnpm test:performance",
      "run: pnpm audit:production",
      "run: pnpm audit:high",
      "run: pnpm licenses:check",
      "run: pnpm docs:validate",
      "pnpm outdated --recursive --format json",
      "fetch-depth: 0",
    ]) {
      expect(nightly).toContain(required);
    }
    expect(occurrences(nightly, "issues: write")).toBe(1);
    expect(nightly).toContain("if: always() && github.event_name == 'schedule'");
    expect(nightly).toContain('workflow_id: "nightly.yml"');
    expect(nightly).toContain('status: "success"');
    expect(nightly).toContain('"nightly-failure"');
    expect(nightly).toContain('"subsystem:compatibility"');
    expect(nightly).toContain('"subsystem:full-matrix"');
    expect(nightly).toContain('"subsystem:policy"');
    expect(nightly).toContain("Last known good");
    expect(nightly).not.toContain("continue-on-error");

    const scriptMarker = "          script: |\n";
    const embeddedScript = nightly
      .slice(nightly.indexOf(scriptMarker) + scriptMarker.length)
      .replace(/^ {12}/gmu, "");
    expect(() => new Script(`(async () => {\n${embeddedScript}\n})()`)).not.toThrow();
  });

  it("verifies the labeled PR head without gaining publication authority", () => {
    const release = workflows[".github/workflows/release-verify.yml"];
    expect(release).toContain("cancel-in-progress: false");
    expect(release).toContain("ref: ${{ github.event.pull_request.head.sha || github.sha }}");
    expect(release).toContain(
      "name: release-candidate-${{ github.event.pull_request.head.sha || github.sha }}",
    );
    expect(release).toContain("fetch-depth: 0");
    expect(release).toContain("run: pnpm install --frozen-lockfile");
    expect(release).toContain("run: pnpm release:verify");
    expect(release).toContain("MERGORA_VISUAL_POLICY_BASE_SHA");
    expect(release).toContain("MERGORA_VISUAL_PR_LABELS");
    expect(release).not.toContain("MERGORA_VISUAL_DIRECT_FEATURE_PUSH_AUTHORITY");
    expect(release).not.toMatch(
      /(?:npm\s+publish|changeset\s+publish|id-token:\s*write|pages:\s*write)/u,
    );
    expect(release).not.toMatch(/^\s*environment:/mu);
  });

  it("blocks dependency and license regressions without broad permissions", () => {
    const security = workflows[".github/workflows/security.yml"];
    expect(security).toContain("run: pnpm audit:production");
    expect(security).toContain("run: pnpm audit:high");
    expect(security).toContain("run: pnpm licenses:check");
    expect(security).toContain("fail-on-severity: high");
    expect(security).toContain("security-events: write");
    expect(security).not.toContain("id-token: write");
    expect(security).not.toContain("write-all");
  });

  it("does not publish or deploy from any verification workflow", () => {
    expect(allWorkflows).not.toMatch(/(?:npm\s+publish|changeset\s+publish)/u);
    expect(allWorkflows).not.toContain("actions/deploy-pages");
    expect(allWorkflows).not.toContain("NODE_AUTH_TOKEN");
    expect(allWorkflows).not.toContain("NPM_TOKEN");
  });
});
