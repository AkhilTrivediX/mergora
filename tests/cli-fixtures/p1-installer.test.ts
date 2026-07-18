import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { installP1Source } from "../../packages/cli/src/index.ts";

const temporaryDirectories: string[] = [];
const workspaceRoot = resolve(import.meta.dirname, "../..");
const templateDirectory = resolve(workspaceRoot, "registry/source/components");

function project(
  packageDocument: Record<string, unknown> = { name: "p1-consumer", private: true },
) {
  const directory = mkdtempSync(resolve(tmpdir(), "mergora-p1-installer-"));
  temporaryDirectories.push(directory);
  writeFileSync(resolve(directory, "package.json"), `${JSON.stringify(packageDocument)}\n`, "utf8");
  return directory;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("temporary packed P1 source installer", () => {
  it("installs all tracer components with dependencies and path-only provenance", () => {
    const projectRoot = project();
    const result = installP1Source({
      projectRoot,
      itemIds: ["dialog", "button", "combobox", "button"],
      templateDirectory,
    });

    expect(result.items).toEqual(["button", "combobox", "dialog"]);
    expect(result.writtenFiles).toHaveLength(13);
    expect(result.dependenciesAdded).toEqual({ "react-aria-components": "1.19.0" });
    expect(readFileSync(resolve(projectRoot, "src/components/button/button.tsx"), "utf8")).toBe(
      readFileSync(resolve(templateDirectory, "button/button.tsx"), "utf8"),
    );
    const packageDocument = JSON.parse(
      readFileSync(resolve(projectRoot, "package.json"), "utf8"),
    ) as { dependencies: Record<string, string> };
    expect(packageDocument.dependencies["react-aria-components"]).toBe("1.19.0");

    const manifestText = readFileSync(resolve(projectRoot, ".mergora/p1-manifest.json"), "utf8");
    expect(manifestText).toContain('"mode": "p1-temporary-source-installer"');
    expect(manifestText).not.toContain(projectRoot);
    expect(manifestText).not.toMatch(/[A-Z]:\\Users\\/iu);
  });

  it("preflights every target and leaves the project untouched on a collision", () => {
    const projectRoot = project();
    const target = resolve(projectRoot, "src/components/button");
    mkdirSync(target, { recursive: true });
    writeFileSync(resolve(target, "button.tsx"), "// consumer source\n", "utf8");
    const packageBefore = readFileSync(resolve(projectRoot, "package.json"), "utf8");

    expect(() =>
      installP1Source({
        projectRoot,
        itemIds: ["button", "dialog"],
        templateDirectory,
      }),
    ).toThrow(/Refusing to overwrite locally modified source/);
    expect(readFileSync(resolve(target, "button.tsx"), "utf8")).toBe("// consumer source\n");
    expect(readFileSync(resolve(projectRoot, "package.json"), "utf8")).toBe(packageBefore);
    expect(existsSync(resolve(projectRoot, ".mergora/p1-manifest.json"))).toBe(false);
  });

  it("refuses traversal and dependency replacement", () => {
    const projectRoot = project({
      name: "p1-consumer",
      dependencies: { "react-aria-components": "1.18.0" },
    });
    expect(() =>
      installP1Source({
        projectRoot,
        itemIds: ["button"],
        targetDirectory: "../outside",
        templateDirectory,
      }),
    ).toThrow(/unsafe path segment/);
    expect(() => installP1Source({ projectRoot, itemIds: ["dialog"], templateDirectory })).toThrow(
      /will not replace it/,
    );
  });
});
