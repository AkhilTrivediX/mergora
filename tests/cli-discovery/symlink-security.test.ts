import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  applyInit,
  CliError,
  doctorProject,
  inspectProject,
  projectStatus,
} from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "../cli-fixtures/project-fixture.ts";

const temporaryDirectories: string[] = [];
const junctions: string[] = [];

afterEach(() => {
  for (const junction of junctions.splice(0).reverse()) {
    try {
      unlinkSync(junction);
    } catch {
      // A failed assertion must not make cleanup follow a directory junction.
    }
  }
  for (const directory of temporaryDirectories.splice(0).reverse()) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function outsideDirectory(prefix: string): string {
  const directory = mkdtempSync(resolve(tmpdir(), prefix));
  temporaryDirectories.push(directory);
  return directory;
}

function projectFixture() {
  const project = createProjectFixture();
  temporaryDirectories.push(project.root);
  return project;
}

function directoryJunction(target: string, junction: string): void {
  symlinkSync(target, junction, process.platform === "win32" ? "junction" : "dir");
  junctions.push(junction);
}

function thrownCliError(operation: () => unknown): CliError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error("Expected the operation to reject an unsafe filesystem path.");
}

function expectSafeSymlinkDiagnostic(error: CliError, outside: string): void {
  expect(error.code).toBe("PATH_SYMLINK_REJECTED");
  expect(error.exitCode).toBe(5);
  expect(`${error.message} ${error.target ?? ""}`).not.toContain(outside);
}

function digest(content: string): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

describe("project discovery no-follow policy", () => {
  it("rejects a linked manifest and returns a safe doctor diagnostic", () => {
    const project = projectFixture();
    applyInit({ projectRoot: project.root });
    const outside = outsideDirectory("mergora-outside-manifest-");
    writeFileSync(resolve(outside, "secret.txt"), "must not be read\n");
    const manifest = resolve(project.root, ".mergora/manifest.json");
    unlinkSync(manifest);
    directoryJunction(outside, manifest);

    expectSafeSymlinkDiagnostic(
      thrownCliError(() => projectStatus(project.root)),
      outside,
    );
    const doctor = doctorProject(project.root);
    expect(doctor.healthy).toBe(false);
    expect(doctor.checks.some(({ code }) => code === "PATH_SYMLINK_REJECTED")).toBe(true);
    expect(JSON.stringify(doctor)).not.toContain(outside);
  });

  it("rejects a linked transaction directory", () => {
    const project = projectFixture();
    applyInit({ projectRoot: project.root });
    const outside = outsideDirectory("mergora-outside-transactions-");
    writeFileSync(resolve(outside, "secret.txt"), "must not be read\n");
    const transactionDirectory = resolve(project.root, ".mergora/transactions");
    rmSync(transactionDirectory, { recursive: true });
    directoryJunction(outside, transactionDirectory);

    expectSafeSymlinkDiagnostic(
      thrownCliError(() => projectStatus(project.root)),
      outside,
    );
    expect(readFileSync(resolve(outside, "secret.txt"), "utf8")).toBe("must not be read\n");
  });

  it("rejects a linked owned-target ancestor", () => {
    const project = projectFixture();
    applyInit({ projectRoot: project.root });
    const target = "src/components/mergora/button/button.tsx";
    const targetDirectory = dirname(resolve(project.root, target));
    const content = "export const Button = true;\n";
    const base = digest(content);
    const hash = base.slice("sha256:".length);
    const basePath = resolve(
      project.root,
      `.mergora/bases/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.blob`,
    );
    mkdirSync(dirname(basePath), { recursive: true });
    writeFileSync(basePath, content);
    mkdirSync(targetDirectory, { recursive: true });
    writeFileSync(resolve(project.root, target), content);
    const manifest = resolve(project.root, ".mergora/manifest.json");
    const manifestDocument = JSON.parse(
      // The fixture manifest is trusted local setup for this focused filesystem test.
      readFileSync(manifest, "utf8"),
    ) as Record<string, unknown>;
    manifestDocument.items = {
      "official:button": { files: [{ target, base, installed: base }] },
    };
    writeFileSync(manifest, `${JSON.stringify(manifestDocument, null, 2)}\n`);

    rmSync(targetDirectory, { recursive: true });
    const outside = outsideDirectory("mergora-outside-target-");
    writeFileSync(resolve(outside, "button.tsx"), "outside\n");
    directoryJunction(outside, targetDirectory);

    expectSafeSymlinkDiagnostic(
      thrownCliError(() => projectStatus(project.root)),
      outside,
    );
  });

  it("rejects a linked immutable-base ancestor", () => {
    const project = projectFixture();
    applyInit({ projectRoot: project.root });
    const target = "src/components/mergora/button/button.tsx";
    const content = "export const Button = true;\n";
    const base = digest(content);
    const hash = base.slice("sha256:".length);
    const basePath = resolve(
      project.root,
      `.mergora/bases/sha256/${hash.slice(0, 2)}/${hash.slice(2)}.blob`,
    );
    mkdirSync(dirname(basePath), { recursive: true });
    writeFileSync(basePath, content);
    mkdirSync(dirname(resolve(project.root, target)), { recursive: true });
    writeFileSync(resolve(project.root, target), content);
    const manifest = resolve(project.root, ".mergora/manifest.json");
    const manifestDocument = JSON.parse(readFileSync(manifest, "utf8")) as Record<string, unknown>;
    manifestDocument.items = {
      "official:button": { files: [{ target, base, installed: base }] },
    };
    writeFileSync(manifest, `${JSON.stringify(manifestDocument, null, 2)}\n`);

    const baseDirectory = dirname(basePath);
    rmSync(baseDirectory, { recursive: true });
    const outside = outsideDirectory("mergora-outside-base-");
    writeFileSync(resolve(outside, basename(basePath)), "outside\n");
    directoryJunction(outside, baseDirectory);

    expectSafeSymlinkDiagnostic(
      thrownCliError(() => projectStatus(project.root)),
      outside,
    );
  });

  it("rejects linked tsconfig and global CSS paths", () => {
    const tsconfigProject = projectFixture();
    const outsideTsconfig = outsideDirectory("mergora-outside-tsconfig-");
    unlinkSync(resolve(tsconfigProject.root, "tsconfig.json"));
    directoryJunction(outsideTsconfig, resolve(tsconfigProject.root, "tsconfig.json"));
    expectSafeSymlinkDiagnostic(
      thrownCliError(() => inspectProject(tsconfigProject.root)),
      outsideTsconfig,
    );

    const cssProject = projectFixture();
    const outsideCss = outsideDirectory("mergora-outside-css-");
    writeFileSync(resolve(outsideCss, "globals.css"), '@import "tailwindcss";\n');
    rmSync(resolve(cssProject.root, "src/app"), { recursive: true });
    directoryJunction(outsideCss, resolve(cssProject.root, "src/app"));
    expectSafeSymlinkDiagnostic(
      thrownCliError(() => inspectProject(cssProject.root)),
      outsideCss,
    );
  });

  it("rejects a non-regular lockfile without following it", () => {
    const project = projectFixture();
    const outside = outsideDirectory("mergora-outside-lock-");
    unlinkSync(resolve(project.root, "pnpm-lock.yaml"));
    directoryJunction(outside, resolve(project.root, "pnpm-lock.yaml"));

    const error = thrownCliError(() => inspectProject(project.root));
    expect(error.code).toBe("PACKAGE_MANAGER_LOCK_UNSAFE");
    expect(error.exitCode).toBe(5);
    expect(`${error.message} ${error.target ?? ""}`).not.toContain(outside);
  });
});
