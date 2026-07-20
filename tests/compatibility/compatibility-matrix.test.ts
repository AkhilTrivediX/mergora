import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");

interface FrameworkProfile {
  readonly id: string;
  readonly framework: "next" | "vite";
  readonly frameworkVersion: string;
  readonly manager: "npm";
  readonly managerVersion: string;
  readonly reactDomTypesVersion: string;
  readonly reactTypesVersion: string;
  readonly reactVersion: string;
  readonly typescriptVersion: string;
}

interface ManagerProfile {
  readonly id: string;
  readonly manager: "bun" | "npm" | "pnpm" | "yarn";
  readonly managerVersion: string;
}

interface CompatibilityMatrix {
  readonly artifactKind: string;
  readonly artifacts: readonly string[];
  readonly evidencePolicy: string;
  readonly frameworkProfiles: readonly FrameworkProfile[];
  readonly limitations: readonly string[];
  readonly managerProfiles: readonly ManagerProfile[];
  readonly nodeOsProfile: {
    readonly id: string;
    readonly managerVersion: string;
    readonly nodes: readonly string[];
    readonly operatingSystems: readonly string[];
  };
  readonly policy: {
    readonly frameworks: {
      readonly next: { readonly primary: string; readonly react18Compatibility: string };
      readonly vite: { readonly previousProbe: string; readonly primary: string };
    };
    readonly node: { readonly minimum: string; readonly primary: string };
    readonly packageManagers: Record<string, string>;
    readonly react: { readonly minimum: string; readonly primary: string };
    readonly typescript: {
      readonly latestEvaluatedUnsupported: string;
      readonly lowerBoundProbe: string;
      readonly primary: string;
    };
  };
  readonly schemaVersion: number;
  readonly verificationStatus: string;
}

function text(path: string): string {
  return readFileSync(resolve(workspaceRoot, path), "utf8");
}

const matrix = JSON.parse(text("tests/compatibility/matrix.v1.json")) as CompatibilityMatrix;

function plan(profile: string): Record<string, unknown> {
  return JSON.parse(
    execFileSync(
      process.execPath,
      ["scripts/compat-consumer.mjs", "--plan", "--profile", profile],
      { cwd: workspaceRoot, encoding: "utf8" },
    ),
  ) as Record<string, unknown>;
}

describe("executable compatibility matrix", () => {
  it("keeps scheduled lanes distinct from exact-commit pass evidence", () => {
    expect(matrix).toMatchObject({
      artifactKind: "compatibility-execution-matrix",
      schemaVersion: 1,
      verificationStatus: "scheduled",
    });
    expect(matrix.evidencePolicy).toContain("not pass evidence");
    expect(matrix.limitations).toContain(
      "Scheduled CI jobs remain not tested until an exact-commit workflow run succeeds; this file never records a pass result.",
    );
    expect(JSON.stringify(matrix)).not.toContain('"verificationStatus":"passed"');
  });

  it("covers declared React, Node, framework, and TypeScript boundaries without claiming probes", () => {
    expect(matrix.policy.node).toEqual({ minimum: "22.14.0", primary: "24.12.0" });
    expect(matrix.policy.react).toEqual({ minimum: "18.3.1", primary: "19.2.7" });
    expect(matrix.policy.typescript).toMatchObject({
      latestEvaluatedUnsupported: "7.0.2",
      lowerBoundProbe: "5.9.3",
      primary: "6.0.3",
    });
    expect(matrix.policy.frameworks).toEqual({
      next: { primary: "16.2.10", react18Compatibility: "15.5.9" },
      vite: { previousProbe: "7.3.6", primary: "8.1.5" },
    });

    const frameworkCoverage = matrix.frameworkProfiles
      .map(
        ({ framework, frameworkVersion, reactVersion, typescriptVersion }) =>
          `${framework}:${frameworkVersion}:${reactVersion}:${typescriptVersion}`,
      )
      .sort();
    expect(frameworkCoverage).toEqual([
      "next:15.5.9:18.3.1:5.9.3",
      "next:15.5.9:18.3.1:6.0.3",
      "next:16.2.10:19.2.7:5.9.3",
      "next:16.2.10:19.2.7:6.0.3",
      "vite:7.3.6:19.2.7:6.0.3",
      "vite:8.1.5:18.3.1:5.9.3",
      "vite:8.1.5:18.3.1:6.0.3",
      "vite:8.1.5:19.2.7:5.9.3",
      "vite:8.1.5:19.2.7:6.0.3",
    ]);
    expect(matrix.frameworkProfiles).toContainEqual(
      expect.objectContaining({
        framework: "vite",
        frameworkVersion: "7.3.6",
        id: "vite7-r19-ts60",
      }),
    );
    expect(matrix.nodeOsProfile).toMatchObject({
      managerVersion: "host-bundled",
      nodes: ["22.14.0", "24.12.0"],
      operatingSystems: ["linux", "win32", "darwin"],
    });
  });

  it("covers primary and smoke package-manager paths with exact versions", () => {
    expect(matrix.managerProfiles).toEqual([
      { id: "manager-npm", manager: "npm", managerVersion: "11.17.0" },
      { id: "manager-pnpm-pinned", manager: "pnpm", managerVersion: "11.14.0" },
      { id: "manager-pnpm-current", manager: "pnpm", managerVersion: "11.15.0" },
      { id: "manager-yarn", manager: "yarn", managerVersion: "4.17.1" },
      { id: "manager-bun", manager: "bun", managerVersion: "1.3.14" },
    ]);
    expect(matrix.policy.packageManagers).toMatchObject({
      bun: "1.3.14",
      npmLatestIncompatibleWithPinnedNode: "12.0.1",
      npmSupportedMajorCurrent: "11.17.0",
      pnpmCurrent: "11.15.0",
      pnpmPinned: "11.14.0",
      yarn: "4.17.1",
    });
  });

  it("generates deterministic, mutation-free plans for every scheduled profile", () => {
    const profileIds = [
      ...matrix.frameworkProfiles.map(({ id }) => id),
      ...matrix.managerProfiles.map(({ id }) => id),
      matrix.nodeOsProfile.id,
    ];
    for (const profileId of profileIds) {
      const first = plan(profileId);
      const second = plan(profileId);
      expect(second).toEqual(first);
      expect(first).toMatchObject({
        artifactKind: "compatibility-consumer-plan",
        schemaVersion: 1,
        verificationStatus: "scheduled",
      });
      expect(first).toHaveProperty("profile.id", profileId);
      expect(first).toHaveProperty("checks", expect.arrayContaining(["packed CLI startup"]));
    }
  });

  it("packs the exact public dependency closure used by compatibility consumers", () => {
    const output = execFileSync(process.execPath, ["scripts/compat-pack-artifacts.mjs", "--plan"], {
      cwd: workspaceRoot,
      encoding: "utf8",
    });
    const packingPlan = JSON.parse(output) as {
      artifactKind: string;
      packageManager: string;
      packages: Array<{ name: string }>;
    };
    expect(packingPlan).toMatchObject({
      artifactKind: "compatibility-pack-plan",
      packageManager: "pnpm@11.14.0",
    });
    expect(packingPlan.packages.map(({ name }) => name).sort()).toEqual(
      [...matrix.artifacts].sort(),
    );

    const unsafeOutput = spawnSync(
      process.execPath,
      ["scripts/compat-pack-artifacts.mjs", "--output", "../mergora-compat-unsafe"],
      { cwd: workspaceRoot, encoding: "utf8" },
    );
    expect(unsafeOutput.status).not.toBe(0);
    expect(unsafeOutput.stderr).toContain("dedicated directory");
  });

  it("matches public peer and runtime declarations", () => {
    const ui = JSON.parse(text("packages/ui/package.json")) as {
      exports: Record<
        string,
        | string
        | {
            default?: string;
            style?: string;
            types?: string;
          }
      >;
      peerDependencies: Record<string, string>;
    };
    const cli = JSON.parse(text("packages/cli/package.json")) as {
      engines: Record<string, string>;
    };
    const baseTypeScript = JSON.parse(text("tsconfig.base.json")) as {
      compilerOptions: Record<string, unknown>;
    };
    expect(ui.peerDependencies).toMatchObject({
      react: "^18.3.0 || ^19.0.0",
      "react-dom": "^18.3.0 || ^19.0.0",
    });
    const cssExports = Object.entries(ui.exports).filter(([subpath]) => subpath.endsWith(".css"));
    expect(cssExports.length).toBeGreaterThan(100);
    for (const [, target] of cssExports) {
      expect(target).toMatchObject({
        default: expect.stringMatching(/\.css$/u),
        style: expect.stringMatching(/\.css$/u),
        types: "./dist/style.d.ts",
      });
    }
    expect(text("packages/ui/dist/style.d.ts")).toContain("export default stylesheet");
    expect(text("packages/ui/dist/style.d.ts")).not.toContain('declare module "*.css"');
    expect(text("packages/ui/dist/generated/button/button.d.ts")).not.toContain(".css");
    expect(cli.engines.node).toBe(">=22.14.0");
    expect(baseTypeScript.compilerOptions).toMatchObject({
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      skipLibCheck: false,
      strict: true,
    });
    const consumerRunner = text("scripts/compat-consumer.mjs");
    expect(consumerRunner).toContain("package-owned CSS export typing");
    expect(consumerRunner).toContain('lib: ["ES2024", "DOM", "DOM.Iterable"]');
    expect(consumerRunner).toContain("pnpm-workspace.yaml");
    expect(consumerRunner).toContain("strictDepBuilds: false");
    expect(consumerRunner).not.toContain('declare module "*.css"');
  });

  it("wires every profile into fail-closed nightly jobs", () => {
    const workflow = text(".github/workflows/nightly.yml");
    for (const profile of [...matrix.frameworkProfiles, ...matrix.managerProfiles]) {
      expect(workflow).toContain(profile.id);
    }
    expect(workflow).toContain("compatibility-artifacts:");
    expect(workflow).toContain("compatibility-frameworks:");
    expect(workflow).toContain("compatibility-node-os:");
    expect(workflow).toContain("compatibility-managers:");
    expect(workflow).toContain("--profile node-os-smoke");
    expect(workflow).toContain("22.14.0");
    expect(workflow).toContain("24.12.0");
    expect(workflow).toContain("os: windows-latest");
    expect(workflow).toContain("os: macos-latest");
    expect(workflow).toContain("os: ubuntu-latest");
    expect(workflow).not.toContain("continue-on-error");
  });
});
