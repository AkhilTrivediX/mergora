import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");

interface GatePlan {
  readonly gate: string;
  readonly steps: readonly {
    readonly label: string;
    readonly runner: "node" | "pnpm";
    readonly args: readonly string[];
    readonly env: Readonly<Record<string, string>>;
  }[];
}

function plan(gate: string): GatePlan {
  const result = spawnSync(process.execPath, ["scripts/run-quality-gate.mjs", "--plan", gate], {
    cwd: workspaceRoot,
    encoding: "utf8",
    shell: false,
  });
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout) as GatePlan;
}

describe("root quality gates", () => {
  it("routes public commands to the executable gate runner", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(workspaceRoot, "package.json"), "utf8"),
    ) as {
      scripts: Record<string, string>;
    };
    expect(packageJson.scripts).toMatchObject({
      "audit:production": "pnpm audit --prod --audit-level moderate",
      "audit:high": "pnpm audit --audit-level high",
      "test:unit": "node scripts/run-quality-gate.mjs unit",
      "test:stories": "node scripts/run-quality-gate.mjs stories",
      "test:cli": "node scripts/run-quality-gate.mjs cli",
      "test:registry": "node scripts/run-quality-gate.mjs registry",
      "test:merge": "node scripts/run-quality-gate.mjs merge",
      "test:site": "node scripts/run-quality-gate.mjs site",
      "test:manual:prepare": "node scripts/run-quality-gate.mjs manual-prepare",
      "test:evidence": "node scripts/run-quality-gate.mjs evidence",
      "test:e2e": "node scripts/run-quality-gate.mjs e2e",
      "test:visual": "node scripts/run-quality-gate.mjs visual",
      "test:a11y": "node scripts/run-quality-gate.mjs a11y",
      "test:performance": "node scripts/run-quality-gate.mjs performance",
      "test:compat": "node scripts/run-quality-gate.mjs compat",
      "api:check": "node scripts/run-quality-gate.mjs api",
      "registry:validate": "node scripts/run-quality-gate.mjs registry-validate",
      "docs:validate": "node scripts/run-quality-gate.mjs docs-validate",
      "licenses:check": "node scripts/run-quality-gate.mjs licenses",
      "release:verify": "node scripts/run-quality-gate.mjs release",
    });
  });

  it("routes the contributor test surface to concrete, independently executable suites", () => {
    const unit = JSON.stringify(plan("unit").steps);
    expect(unit).toContain("tests/components");
    expect(unit).toContain("tests/contracts");
    expect(unit).toContain("tests/harness");

    const stories = plan("stories");
    expect(JSON.stringify(stories.steps)).toContain("tests/storybook");
    expect(JSON.stringify(stories.steps)).toContain(
      "tests/generation/implementation-matrix.test.ts",
    );
    expect(stories.steps).toContainEqual(
      expect.objectContaining({
        runner: "pnpm",
        args: ["--filter", "@mergora/storybook", "build"],
      }),
    );

    const cli = plan("cli");
    expect(cli.steps).toHaveLength(2);
    expect(cli.steps[0]?.args).toContain("--exclude");
    expect(cli.steps[1]?.args).toContain("tests/cli-browser-audit/official-browser-cli.test.ts");

    expect(JSON.stringify(plan("registry").steps)).toContain("tests/cli-registry-management");
    expect(JSON.stringify(plan("merge").steps)).toContain("tests/merge-fixtures");
    expect(JSON.stringify(plan("site").steps)).toContain("tests/web");
  });

  it("keeps manual preparation explicitly separate from evidence validation", () => {
    expect(plan("manual-prepare").steps).toEqual([
      expect.objectContaining({
        runner: "node",
        args: ["scripts/prepare-manual-evidence.mjs"],
      }),
    ]);
    const evidence = JSON.stringify(plan("evidence").steps);
    expect(evidence).toContain("tests/harness/evidence-runtime.test.ts");
    expect(evidence).toContain("tests/harness/maturity.test.ts");
    expect(evidence).toContain("tests/generation/implementation-matrix.test.ts");
  });

  it("binds API, registry, docs, and license validation to real repository evidence", () => {
    const api = JSON.stringify(plan("api").steps);
    expect(api).toContain("tests/generation/generation.test.ts");
    expect(api).toContain("tests/generation/public-package-identity.test.ts");
    expect(api).toContain("tests/harness/package-source-parity.test.ts");

    const registry = JSON.stringify(plan("registry-validate").steps);
    expect(registry).toContain("generated:check");
    expect(registry).toContain("registry/definitions/catalog.test.ts");
    expect(registry).toContain("tests/schemas/schema-source.test.ts");

    const docs = JSON.stringify(plan("docs-validate").steps);
    expect(docs).toContain("scripts/verify-document-links.mjs");
    expect(docs).toContain("tests/web/site-search-index.test.ts");

    expect(plan("licenses").steps).toEqual([
      expect.objectContaining({
        runner: "node",
        args: ["scripts/validate-licenses.mjs"],
      }),
    ]);
  });

  it("uses production-mode web flows and concrete browser evidence suites", () => {
    expect(plan("e2e").steps).toEqual([
      expect.objectContaining({
        runner: "pnpm",
        args: expect.arrayContaining(["playwright", "tests/web/playwright.config.ts"]),
      }),
    ]);
    expect(plan("visual").steps).toEqual([
      expect.objectContaining({
        runner: "node",
        args: ["scripts/run-visual-regression.mjs"],
      }),
    ]);
    expect(plan("a11y").steps[0]).toMatchObject({
      runner: "pnpm",
      args: expect.arrayContaining(["playwright.config.ts", "@a11y"]),
    });
    expect(plan("performance").steps).toEqual([
      expect.objectContaining({
        runner: "node",
        args: ["scripts/verify-site-performance.mjs"],
        env: {},
      }),
    ]);
  });

  it("binds compatibility to workspace, declaration, and pinned shadcn checks", () => {
    const serialized = JSON.stringify(plan("compat").steps);
    expect(serialized).toContain("scripts/verify-workspace.mjs");
    expect(serialized).toContain("tests/compatibility");
    expect(serialized).toContain("scripts/verify-shadcn-client.mjs");
  });

  it("keeps release verification non-publishing, non-recursive, and evidence based", () => {
    const release = plan("release");
    const serialized = JSON.stringify(release.steps);
    for (const required of [
      "generated:check",
      "audit:production",
      "audit:high",
      "validate-licenses.mjs",
      "assemble-quality-lab.mjs",
      "tests/generation/generation.test.ts",
      "tests/generation/implementation-matrix.test.ts",
      "tests/schemas/schema-source.test.ts",
      "verify-static-export.mjs",
      "test:performance",
      "test:browser",
      "test:visual",
      "test:consumer",
      "test:compat",
      "verify-workspace.mjs",
    ]) {
      expect(serialized).toContain(required);
    }
    const assemblyIndex = release.steps.findIndex(({ args }) =>
      args.includes("scripts/assemble-quality-lab.mjs"),
    );
    const staticVerificationIndex = release.steps.findIndex(({ args }) =>
      args.includes("scripts/verify-static-export.mjs"),
    );
    expect(assemblyIndex).toBeGreaterThan(-1);
    expect(staticVerificationIndex).toBeGreaterThan(assemblyIndex);
    expect(release.steps.some(({ args }) => args.includes("check"))).toBe(false);
    expect(serialized).not.toMatch(/publish|npm\s+publish|changeset\s+publish/iu);

    const runner = readFileSync(resolve(workspaceRoot, "scripts/run-quality-gate.mjs"), "utf8");
    expect(runner).toContain("artifacts/release-evidence/${workspaceManifest.version}");
    expect(runner).toContain("tests/packed-consumers/evidence.json");
    expect(runner).toContain("packedEvidence.artifacts");
  });
});
