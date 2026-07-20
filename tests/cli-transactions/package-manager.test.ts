import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  applySourceAdd,
  planInit,
  planSourceAdd,
  type PackageManager,
  type PackageManagerInvocation,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const workspaceRoot = resolve(import.meta.dirname, "../..");
const registryDirectory = resolve(workspaceRoot, "registry/generated");
const temporaryDirectories: string[] = [];

function lockfile(manager: PackageManager): string {
  if (manager === "pnpm") return "pnpm-lock.yaml";
  if (manager === "npm") return "package-lock.json";
  if (manager === "yarn") return "yarn.lock";
  return "bun.lock";
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("fixed package-manager policy", () => {
  it.each([
    ["pnpm", ["install", "--ignore-scripts", "--no-frozen-lockfile", "--offline"]],
    ["npm", ["install", "--ignore-scripts", "--offline"]],
    ["yarn", ["install", "--mode=skip-builds", "--immutable-cache"]],
    ["bun", ["install", "--ignore-scripts", "--offline"]],
  ] as const)("uses fixed no-hook argv for %s", (manager, expectedArguments) => {
    const project = createProjectFixture({ manager });
    temporaryDirectories.push(project.root);
    applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
    const lockPath = resolve(project.root, lockfile(manager));
    const lockBefore = readFileSync(lockPath);
    let invocation: PackageManagerInvocation | undefined;
    const options = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
      offline: true,
      packageManagerRunner: (next: PackageManagerInvocation) => {
        invocation = next;
        return { status: 0 };
      },
    };
    const plan = planSourceAdd(options);
    expect(plan.warnings.join(" ")).toContain(`detected ${manager}`);
    applySourceAdd(options, plan.planDigest);
    expect(invocation).toEqual({
      executable: manager,
      arguments: expectedArguments,
      // macOS exposes /var through /private/var; subprocesses receive the physical path.
      cwd: realpathSync.native(project.root),
    });
    expect(invocation?.arguments).not.toContain("--scripts");
    expect(readFileSync(lockPath)).toEqual(lockBefore);
  });

  it("honors --no-install without invoking a runner or touching the lockfile", () => {
    const project = createProjectFixture();
    temporaryDirectories.push(project.root);
    applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
    const lockPath = resolve(project.root, "pnpm-lock.yaml");
    const lockBefore = readFileSync(lockPath);
    let invoked = false;
    const options = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
      noInstall: true,
      packageManagerRunner: () => {
        invoked = true;
        return { status: 0 };
      },
    };
    const plan = planSourceAdd(options);
    expect(plan.warnings.join(" ")).toContain("--no-install");
    const result = applySourceAdd(options, plan.planDigest);
    expect(result.transaction.packageManager.invoked).toBe(false);
    expect(invoked).toBe(false);
    expect(readFileSync(lockPath)).toEqual(lockBefore);
    expect(readFileSync(resolve(project.root, "package.json"), "utf8")).toContain(
      '"react-aria-components": "1.19.0"',
    );
  });

  it("preserves consumer CRLF and indentation while applying dependency ownership", () => {
    const newline = "\r\n";
    const packageText = [
      "{",
      '    "name": "transaction-crlf",',
      '    "private": true,',
      '    "packageManager": "pnpm@11.14.0",',
      '    "dependencies": {',
      '        "next": "16.2.10",',
      '        "react": "19.2.7",',
      '        "tailwindcss": "4.3.3"',
      "    }",
      "}",
      "",
    ].join(newline);
    const project = createProjectFixture({ newline, packageText });
    temporaryDirectories.push(project.root);
    applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);
    const options = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
      noInstall: true,
    };
    applySourceAdd(options, planSourceAdd(options).planDigest);
    const after = readFileSync(resolve(project.root, "package.json"), "utf8");
    expect(after).toContain('        "react-aria-components": "1.19.0"');
    expect(after.replaceAll(newline, "")).not.toContain("\n");
    expect(after).toContain('    "private": true,\r\n');
  });

  it("refuses an out-of-root workspace lock mutation unless install is explicitly skipped", () => {
    const parent = mkdtempSync(resolve(tmpdir(), "mergora-workspace-transaction-"));
    temporaryDirectories.push(parent);
    writeFileSync(resolve(parent, "pnpm-workspace.yaml"), 'packages:\n  - "application"\n');
    const workspaceLockPath = resolve(parent, "pnpm-lock.yaml");
    writeFileSync(workspaceLockPath, "workspace-lock-before\n");
    const project = createProjectFixture({ parentDirectory: parent });
    rmSync(resolve(project.root, "pnpm-lock.yaml"));
    applyInit({ projectRoot: project.root }, planInit({ projectRoot: project.root }).planDigest);

    const installOptions = {
      projectRoot: project.root,
      itemIds: ["dialog"],
      registryDirectory,
    };
    expect(() => planSourceAdd(installOptions)).toThrow(/outside the selected project root/u);
    expect(readFileSync(workspaceLockPath, "utf8")).toBe("workspace-lock-before\n");

    const noInstallOptions = { ...installOptions, noInstall: true };
    const plan = planSourceAdd(noInstallOptions);
    expect(plan.warnings.join(" ")).toContain("--no-install");
    const result = applySourceAdd(noInstallOptions, plan.planDigest);
    expect(result.transaction.packageManager.invoked).toBe(false);
    expect(readFileSync(workspaceLockPath, "utf8")).toBe("workspace-lock-before\n");
    expect(readFileSync(resolve(project.root, "package.json"), "utf8")).toContain(
      '"react-aria-components": "1.19.0"',
    );
  });
});
