import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const packedRoot = join(root, "tests", "packed-consumers");

function text(path: string): string {
  return readFileSync(join(root, path), "utf8");
}

const packageMap = JSON.parse(text("config/public-packages.json")) as {
  selectionStatus: string;
  selectionTier: string;
  cli: { package: string; bin: string };
  public: {
    contracts: string;
    mcp: string;
    registry: string;
    schema: string;
    tokens: string;
    ui: string;
  };
};
const packedSourceRequestIds = ["button", "dialog", "combobox"];

function expectedPackedSourceFileCount(): number {
  const visited = new Set<string>();
  let count = 0;
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id);
    const payload = JSON.parse(text(`registry/generated/native-source-items/${id}.json`)) as {
      files: readonly unknown[];
      registryDependencies: readonly string[];
    };
    for (const dependency of payload.registryDependencies) visit(dependency);
    count += payload.files.length;
  };
  for (const id of packedSourceRequestIds) visit(id);
  return count;
}

describe("P1 packed consumer proof", () => {
  it("locks the verified approved unscoped package tier", () => {
    expect(packageMap).toMatchObject({
      selectionStatus: "verified",
      selectionTier: "approved-unscoped",
      cli: { package: "mergora", bin: "mergora" },
      public: {
        contracts: "mergora-contracts",
        mcp: "mergora-mcp",
        registry: "mergora-registry",
        schema: "mergora-schema",
        tokens: "mergora-tokens",
        ui: "mergora-ui",
      },
    });
  });

  it("locks the complete current Next/Vite source/package matrix", () => {
    const matrix = JSON.parse(text("tests/packed-consumers/matrix.json")) as {
      packageManager: string;
      consumers: Array<{ id: string; framework: string; mode: string }>;
    };

    expect(matrix.packageManager).toBe("pnpm@11.14.0");
    expect(matrix.consumers).toEqual([
      { id: "next-package", framework: "next", mode: "package" },
      { id: "vite-package", framework: "vite", mode: "package" },
      { id: "next-source", framework: "next", mode: "source" },
      { id: "vite-source", framework: "vite", mode: "source" },
    ]);
  });

  it("uses public UI subpaths in package mode and CLI-owned files in source mode", () => {
    const packageFixtures = [
      text("tests/packed-consumers/fixtures/next/package/src/app/showcase.tsx"),
      text("tests/packed-consumers/fixtures/vite/package/src/App.tsx"),
    ];
    for (const fixture of packageFixtures) {
      expect(fixture).toContain(`from "${packageMap.public.ui}/button"`);
      expect(fixture).toContain(`from "${packageMap.public.ui}/dialog"`);
      expect(fixture).toContain(`from "${packageMap.public.ui}/combobox"`);
    }

    const sourceFixtures = [
      text("tests/packed-consumers/fixtures/next/source/src/app/showcase.tsx"),
      text("tests/packed-consumers/fixtures/vite/source/src/App.tsx"),
    ];
    for (const fixture of sourceFixtures) {
      expect(fixture).toContain("components/button/button");
      expect(fixture).toContain("components/dialog");
      expect(fixture).toContain("components/combobox/combobox");
      expect(fixture).not.toContain(`${packageMap.public.ui}/`);
    }
  });

  it("keeps the external runner fail closed", () => {
    const runner = text("scripts/verify-p1-consumers.mjs");
    expect(runner).toContain('"--offline", "--frozen-lockfile"');
    expect(runner).toContain("Packed consumer evidence is missing");
    expect(runner).toContain("Consumer lockfile contains a workspace-only protocol");
    expect(runner).toContain('const packedSourceRequestIds = ["button", "dialog", "combobox"]');
    expect(runner).toContain('${packedSourceRequestIds.join(" ")}');
    expect(runner).toContain("const packedCli = join(");
    expect(runner).toContain("process.execPath");
    expect(existsSync(packedRoot)).toBe(true);
  });

  it("tracks path-free digest evidence for every exact tarball and consumer", () => {
    const evidencePath = join(packedRoot, "evidence.json");
    expect(existsSync(evidencePath)).toBe(true);
    const source = readFileSync(evidencePath, "utf8");
    const evidence = JSON.parse(source) as {
      artifactKind: string;
      artifacts: Array<{ name: string; sha256: string }>;
      consumers: Array<{ id: string; result: string; sourceInstall: null | { files: number } }>;
      publicationStatus: string;
    };

    expect(evidence.artifactKind).toBe("p1-packed-consumer-evidence");
    expect(evidence.publicationStatus).toBe("unreleased");
    expect(evidence.artifacts.map(({ name }) => name)).toEqual(
      [
        packageMap.public.schema,
        packageMap.public.tokens,
        packageMap.public.ui,
        packageMap.cli.package,
      ].sort((left, right) => left.localeCompare(right, "en-US")),
    );
    expect(evidence.artifacts.every(({ sha256 }) => /^[a-f0-9]{64}$/u.test(sha256))).toBe(true);
    expect(evidence.consumers.map(({ id }) => id)).toEqual([
      "next-package",
      "next-source",
      "vite-package",
      "vite-source",
    ]);
    expect(evidence.consumers.every(({ result }) => result === "passed")).toBe(true);
    expect(
      evidence.consumers
        .filter(({ sourceInstall }) => sourceInstall !== null)
        .every(({ sourceInstall }) => sourceInstall?.files === expectedPackedSourceFileCount()),
    ).toBe(true);
    expect(source).not.toMatch(/(?:[A-Z]:[\\/]|AppData|Temp|workspace:|catalog:|link:)/u);
  });
});
