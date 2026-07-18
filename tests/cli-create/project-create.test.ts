import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyProjectCreate,
  planProjectCreate,
  PROJECT_CREATE_IGNORED_OS_METADATA,
  type ProjectCreateOptions,
} from "../../packages/cli/src/project-create.ts";
import type { PackageManagerInvocation } from "../../packages/cli/src/transaction-engine.ts";

const temporaryParents: string[] = [];

function parent(): string {
  const directory = mkdtempSync(resolve(tmpdir(), "mergora-create-"));
  temporaryParents.push(directory);
  return directory;
}

function options(
  root: string,
  overrides: Partial<ProjectCreateOptions> = {},
): ProjectCreateOptions {
  return {
    directory: resolve(root, "application"),
    template: "next",
    packageManager: "pnpm",
    preset: "minimal",
    noInstall: true,
    ...overrides,
  };
}

function digest(bytes: Buffer): string {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

afterEach(() => {
  for (const directory of temporaryParents.splice(0)) {
    rmSync(directory, { recursive: true, force: true, maxRetries: 4, retryDelay: 20 });
  }
});

describe("deterministic project creation planning", () => {
  it("is read-only, deterministic, path-private, and lists every authored digest", () => {
    const root = parent();
    writeFileSync(resolve(root, "parent-owned.txt"), "keep\n");
    const before = readdirSync(root);
    const first = planProjectCreate(options(root));
    const second = planProjectCreate(options(root));

    expect(first).toEqual(second);
    expect(readdirSync(root)).toEqual(before);
    expect(first.command).toBe("create");
    expect(first.publicationStatus).toBe("unreleased");
    expect(first.template).toMatchObject({ id: "next", version: "0.0.0" });
    expect(first.destination).toMatchObject({
      directoryName: "application",
      initialState: "absent",
      ignoredOsMetadataNames: PROJECT_CREATE_IGNORED_OS_METADATA,
    });
    expect(first.packageManager.install).toBeNull();
    expect(first.files.length).toBeGreaterThan(10);
    expect(first.files.map(({ target }) => target)).toContain("mergora.json");
    expect(first.files.map(({ target }) => target)).toContain(".mergora/manifest.json");
    expect(first.files.map(({ target }) => target)).toContain(
      "src/styles/mergora/tokens/workbench.css",
    );
    expect(first.files.every(({ digest: value }) => /^sha256:[a-f0-9]{64}$/u.test(value))).toBe(
      true,
    );
    expect(first.planDigest).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(JSON.stringify(first)).not.toContain(root);
  });

  it("requires all non-interactive selections and safe directory spelling", () => {
    const root = parent();
    const missingTemplate = {
      ...options(root),
      template: undefined,
    } as unknown as ProjectCreateOptions;
    const missingManager = {
      ...options(root),
      packageManager: undefined,
    } as unknown as ProjectCreateOptions;
    const missingPreset = {
      ...options(root),
      preset: undefined,
    } as unknown as ProjectCreateOptions;

    expect(() => planProjectCreate(missingTemplate)).toThrow(/requires --template/u);
    expect(() => planProjectCreate(missingManager)).toThrow(/explicit supported package manager/u);
    expect(() => planProjectCreate(missingPreset)).toThrow(/requires --preset/u);
    expect(() => planProjectCreate(options(root, { cwd: root, directory: "../escape" }))).toThrow(
      /unsafe path segments/u,
    );
  });

  it("rejects non-empty, symbolic-link, and portable-collision targets", () => {
    const nonEmptyParent = parent();
    mkdirSync(resolve(nonEmptyParent, "application"));
    writeFileSync(resolve(nonEmptyParent, "application", "consumer.txt"), "owned\n");
    expect(() => planProjectCreate(options(nonEmptyParent))).toThrow(/refusing to overwrite/u);

    const symlinkParent = parent();
    const outside = resolve(symlinkParent, "outside");
    mkdirSync(outside);
    symlinkSync(outside, resolve(symlinkParent, "application"), "junction");
    expect(() => planProjectCreate(options(symlinkParent))).toThrow(/real empty directory/u);

    const collisionParent = parent();
    mkdirSync(resolve(collisionParent, "Application"));
    expect(() => planProjectCreate(options(collisionParent))).toThrow(/collides portably/u);
  });
});

describe("transactional project creation apply", () => {
  it("creates and initializes a Next App Router project without Git or installation", () => {
    const root = parent();
    const createOptions = options(root);
    const plan = planProjectCreate(createOptions);
    const result = applyProjectCreate(createOptions, plan.planDigest);
    const target = resolve(root, "application");

    expect(result).toMatchObject({
      state: "created",
      projectRoot: ".",
      directoryName: "application",
      template: "next",
      templateVersion: "0.0.0",
      publicationStatus: "unreleased",
      preset: "minimal",
      packageManager: "pnpm",
      installInvoked: false,
      planDigest: plan.planDigest,
    });
    expect(existsSync(resolve(target, ".git"))).toBe(false);
    expect(existsSync(resolve(target, "src/app/page.tsx"))).toBe(true);
    expect(existsSync(resolve(target, "mergora.json"))).toBe(true);
    expect(existsSync(resolve(target, ".mergora/manifest.json"))).toBe(true);
    expect(readFileSync(resolve(target, "src/app/globals.css"), "utf8")).toContain(
      "styles/mergora/foundations.css",
    );
    for (const file of plan.files) {
      expect(digest(readFileSync(resolve(target, file.target)))).toBe(file.digest);
    }
    expect(() => planProjectCreate(createOptions)).toThrow(/refusing to overwrite/u);
  });

  it("uses the fixed shell-free manager contract at the rollback-protected final path", () => {
    const root = parent();
    const target = resolve(root, "application");
    const invocations: PackageManagerInvocation[] = [];
    const createOptions = options(root, {
      template: "vite",
      packageManager: "npm",
      preset: "application",
      noInstall: false,
      packageManagerRunner(invocation) {
        invocations.push(invocation);
        expect(invocation).toMatchObject({
          executable: "npm",
          arguments: ["install", "--ignore-scripts"],
        });
        expect(invocation.cwd).toBe(target);
        expect(existsSync(resolve(invocation.cwd, "src/App.tsx"))).toBe(true);
        expect(existsSync(resolve(invocation.cwd, "mergora.json"))).toBe(true);
        expect(existsSync(target)).toBe(true);
        return { status: 0 };
      },
    });
    const plan = planProjectCreate(createOptions);

    expect(plan.packageManager.install).toEqual({
      executable: "npm",
      arguments: ["install", "--ignore-scripts"],
      cwd: ".",
      shell: false,
    });
    const result = applyProjectCreate(createOptions, plan.planDigest);

    expect(invocations).toHaveLength(1);
    expect(result.installInvoked).toBe(true);
    expect(existsSync(resolve(target, "vite.config.ts"))).toBe(true);
    expect(readFileSync(resolve(target, "src/App.tsx"), "utf8")).toContain(
      "Mergora application preset",
    );
  });

  it("removes only its private stage when installation fails", () => {
    const root = parent();
    const sentinel = resolve(root, "parent-owned.txt");
    writeFileSync(sentinel, "keep\n");
    const createOptions = options(root, {
      noInstall: false,
      packageManagerRunner() {
        return { status: 1 };
      },
    });
    const plan = planProjectCreate(createOptions);

    expect(() => applyProjectCreate(createOptions, plan.planDigest)).toThrow(
      /project creation will roll back/u,
    );
    expect(readFileSync(sentinel, "utf8")).toBe("keep\n");
    expect(existsSync(resolve(root, "application"))).toBe(false);
    expect(readdirSync(root)).toEqual(["parent-owned.txt"]);
  });

  it("preserves explicitly allowed OS metadata and restores it after a commit fault", () => {
    const root = parent();
    const target = resolve(root, "application");
    mkdirSync(target);
    writeFileSync(resolve(target, ".DS_Store"), Buffer.from([0, 1, 2, 3]));
    const createOptions = options(root, {
      faultInjector(point) {
        if (point === "target-moved") throw new Error("fault after reversible target move");
      },
    });
    const plan = planProjectCreate(createOptions);

    expect(plan.destination.initialState).toBe("os-metadata-only");
    expect(plan.files.find(({ target: path }) => path === ".DS_Store")).toMatchObject({
      digest: digest(Buffer.from([0, 1, 2, 3])),
      source: "preserved-os-metadata",
    });
    expect(() => applyProjectCreate(createOptions, plan.planDigest)).toThrow(
      /fault after reversible target move/u,
    );
    expect(readFileSync(resolve(target, ".DS_Store"))).toEqual(Buffer.from([0, 1, 2, 3]));
    expect(readdirSync(root)).toEqual(["application"]);

    const installRoot = parent();
    const installTarget = resolve(installRoot, "application");
    mkdirSync(installTarget);
    writeFileSync(resolve(installTarget, "Thumbs.db"), Buffer.from([4, 5, 6]));
    const installOptions = options(installRoot, {
      noInstall: false,
      packageManagerRunner() {
        return { status: 1 };
      },
    });
    const installPlan = planProjectCreate(installOptions);
    expect(() => applyProjectCreate(installOptions, installPlan.planDigest)).toThrow(
      /project creation will roll back/u,
    );
    expect(readFileSync(resolve(installTarget, "Thumbs.db"))).toEqual(Buffer.from([4, 5, 6]));
    expect(readdirSync(installRoot)).toEqual(["application"]);
  });

  it("accepts an existing empty target, preserves metadata on success, and requires a fresh digest", () => {
    const emptyRoot = parent();
    mkdirSync(resolve(emptyRoot, "application"));
    const emptyOptions = options(emptyRoot, { preset: "none" });
    const emptyPlan = planProjectCreate(emptyOptions);
    expect(emptyPlan.destination.initialState).toBe("empty");
    applyProjectCreate(emptyOptions, emptyPlan.planDigest);
    expect(readFileSync(resolve(emptyRoot, "application/src/app/page.tsx"), "utf8")).toContain(
      "No starter preset was installed",
    );

    const metadataRoot = parent();
    mkdirSync(resolve(metadataRoot, "application"));
    writeFileSync(resolve(metadataRoot, "application", "desktop.ini"), "metadata\n");
    const metadataOptions = options(metadataRoot);
    const metadataPlan = planProjectCreate(metadataOptions);
    applyProjectCreate(metadataOptions, metadataPlan.planDigest);
    expect(readFileSync(resolve(metadataRoot, "application", "desktop.ini"), "utf8")).toBe(
      "metadata\n",
    );

    const staleRoot = parent();
    const staleOptions = options(staleRoot);
    const stalePlan = planProjectCreate(staleOptions);
    expect(() => applyProjectCreate(staleOptions, "sha256:stale")).toThrow(
      /plan changed before apply/u,
    );
    expect(existsSync(resolve(staleRoot, "application"))).toBe(false);
    expect(stalePlan.planDigest).not.toBe("sha256:stale");
  });

  it("requires the plan digest at runtime", () => {
    const root = parent();
    const createOptions = options(root);
    const invokeWithoutDigest = applyProjectCreate as unknown as (
      value: ProjectCreateOptions,
      digest?: string,
    ) => unknown;

    expect(() => invokeWithoutDigest(createOptions)).toThrow(/requires the reviewed plan digest/u);
    expect(existsSync(resolve(root, "application"))).toBe(false);
  });

  it("binds an opaque reviewed digest to the exact destination parent", () => {
    const reviewedRoot = parent();
    const otherRoot = parent();
    const reviewed = options(reviewedRoot);
    const other = options(otherRoot);
    const plan = planProjectCreate(reviewed);

    expect(() => applyProjectCreate(other, plan.planDigest)).toThrow(/plan changed before apply/u);
    expect(existsSync(resolve(reviewedRoot, "application"))).toBe(false);
    expect(existsSync(resolve(otherRoot, "application"))).toBe(false);
    expect(JSON.stringify(plan)).not.toContain(reviewedRoot);
  });
});
