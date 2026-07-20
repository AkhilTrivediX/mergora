import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import * as cli from "../../packages/cli/src/index.ts";
import { createProjectFixture } from "./project-fixture.ts";

const temporaryDirectories: string[] = [];
const workspaceRoot = resolve(import.meta.dirname, "../..");

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("legacy P1 compatibility boundary", () => {
  it("does not expose or compile the non-transactional P1 source mutator", () => {
    expect(cli).not.toHaveProperty("installP1Source");
    expect(cli).not.toHaveProperty("planP1SourceInstall");
    expect(cli).not.toHaveProperty("P1_SOURCE_ITEM_IDS");
    expect(existsSync(resolve(workspaceRoot, "packages/cli/src/p1-installer.ts"))).toBe(false);
    expect(readFileSync(resolve(workspaceRoot, "packages/cli/src/index.ts"), "utf8")).not.toMatch(
      /p1-installer|installP1Source|planP1SourceInstall/u,
    );
  });

  it("retains read-only recognition of an existing legacy path manifest", () => {
    const project = createProjectFixture({ directoryPrefix: "mergora-p1-legacy-read-only-" });
    temporaryDirectories.push(project.root);
    mkdirSync(resolve(project.root, ".mergora"), { recursive: true });
    writeFileSync(
      resolve(project.root, ".mergora/p1-manifest.json"),
      `${JSON.stringify({
        schemaVersion: 1,
        mode: "p1-temporary-source-installer",
        items: [],
        files: [],
      })}\n`,
      "utf8",
    );

    expect(cli.projectStatus(project.root)).toMatchObject({ manifest: "p1-legacy", items: [] });
    expect(existsSync(resolve(project.root, "mergora.json"))).toBe(false);
  });
});
