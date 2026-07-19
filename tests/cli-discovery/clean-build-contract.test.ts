import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workspaceRoot = resolve(import.meta.dirname, "../..");

interface PackageManifest {
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly exports?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  readonly publishConfig?: {
    readonly exports?: Readonly<Record<string, Readonly<Record<string, string>>>>;
  };
  readonly scripts?: Readonly<Record<string, string>>;
}

function readManifest(relativePath: string): PackageManifest {
  return JSON.parse(readFileSync(resolve(workspaceRoot, relativePath), "utf8")) as PackageManifest;
}

describe("clean workspace CLI build contract", () => {
  it("uses registry source only for development and keeps publication dist-only", () => {
    const manifest = readManifest("packages/registry/package.json");

    expect(manifest.exports?.["."]).toEqual({
      types: "./src/index.ts",
      development: "./src/index.ts",
      import: "./dist/index.js",
    });
    expect(manifest.publishConfig?.exports?.["."]).toEqual({
      types: "./dist/index.d.ts",
      import: "./dist/index.js",
    });
  });

  it("routes build and prepack through the same self-contained builder", () => {
    const manifest = readManifest("packages/cli/package.json");
    const workspaceDependencies = Object.entries(manifest.dependencies ?? {})
      .filter(([, version]) => version.startsWith("workspace:"))
      .map(([name]) => name)
      .sort((left, right) => left.localeCompare(right, "en-US"));
    const builder = readFileSync(resolve(workspaceRoot, "packages/cli/scripts/build.mjs"), "utf8");

    expect(workspaceDependencies).toEqual([
      "mergora-contracts",
      "mergora-registry",
      "mergora-schema",
    ]);
    expect(manifest.scripts).toMatchObject({
      build: "node scripts/build.mjs",
      prepack: "node scripts/build.mjs",
    });
    expect(manifest.scripts?.prebuild).toBeUndefined();
    for (const dependency of workspaceDependencies) {
      expect(builder).toContain(`name: "${dependency}"`);
    }
    expect(builder).toContain("compileTypeScriptPackage(dependency)");
  });
});
