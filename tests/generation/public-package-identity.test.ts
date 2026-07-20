import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const ignoredDirectories = new Set([
  ".git",
  ".next",
  ".turbo",
  "PLANS",
  "artifacts",
  "coverage",
  "dist",
  "node_modules",
  "storybook-static",
]);
const textExtensions = new Set([
  ".cjs",
  ".css",
  ".html",
  ".js",
  ".json",
  ".md",
  ".mjs",
  ".ts",
  ".tsx",
  ".txt",
  ".yaml",
  ".yml",
]);

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as Record<string, unknown>;
}

function textFiles(directory = root): readonly string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : textFiles(join(directory, entry.name));
    }
    return entry.isFile() && textExtensions.has(extname(entry.name))
      ? [join(directory, entry.name)]
      : [];
  });
}

describe("verified public package identity", () => {
  const packageMap = readJson("config/public-packages.json") as {
    selectionStatus: string;
    selectionTier: string;
    resolvedBlockerId: string;
    cli: { package: string; bin: string };
    public: Record<string, string>;
    availabilityEvidence: {
      authenticatedOwner: string;
      credentialMaterialRecorded: boolean;
      legalClearanceClaimed: boolean;
      selectedPackageLookups: Record<string, string>;
    };
  };

  it("locks the authenticated approved unscoped tier and redacted evidence", () => {
    expect(packageMap).toMatchObject({
      selectionStatus: "verified",
      selectionTier: "approved-unscoped",
      resolvedBlockerId: "EXT-NPM-AUTH-001",
      cli: { package: "mergora", bin: "mergora" },
      public: {
        contracts: "mergora-contracts",
        mcp: "mergora-mcp",
        registry: "mergora-registry",
        schema: "mergora-schema",
        tokens: "mergora-tokens",
        ui: "mergora-ui",
      },
      availabilityEvidence: {
        authenticatedOwner: "redacted",
        credentialMaterialRecorded: false,
        legalClearanceClaimed: false,
      },
    });
    expect(packageMap.availabilityEvidence.selectedPackageLookups).toEqual(
      Object.fromEntries(
        [packageMap.cli.package, ...Object.values(packageMap.public)].map((name) => [name, "e404"]),
      ),
    );
  });

  it("derives every public workspace manifest and CLI constant from the map", () => {
    const packageDirectories = {
      contracts: "packages/contracts",
      mcp: "packages/mcp",
      registry: "packages/registry",
      schema: "packages/schema",
      tokens: "packages/tokens",
      ui: "packages/ui",
    } as const;
    for (const [role, directory] of Object.entries(packageDirectories)) {
      expect(readJson(`${directory}/package.json`).name).toBe(packageMap.public[role]);
    }
    expect(readJson("packages/cli/package.json").name).toBe(packageMap.cli.package);

    const generated = readFileSync(
      join(root, "packages/cli/src/generated-public-package-map.ts"),
      "utf8",
    );
    expect(generated).toContain(
      `export const PUBLIC_CLI_PACKAGE = ${JSON.stringify(packageMap.cli.package)}`,
    );
    expect(generated).toContain(
      `export const PUBLIC_CLI_BIN = ${JSON.stringify(packageMap.cli.bin)}`,
    );
    expect(generated).toContain(
      `export const PUBLIC_UI_PACKAGE = ${JSON.stringify(packageMap.public.ui)}`,
    );
  });

  it("contains no obsolete exact scoped public package names outside private plans", () => {
    const scopedPrefix = ["@", "mergora", "/"].join("");
    const obsolete = ["ui", "tokens", "schema", "registry", "contracts", "mcp"].map(
      (role) => `${scopedPrefix}${role}`,
    );
    const violations: string[] = [];
    for (const path of textFiles()) {
      const source = readFileSync(path, "utf8");
      for (const name of obsolete) {
        const match = source.indexOf(name);
        if (match !== -1 && !/[A-Za-z0-9_-]/u.test(source[match + name.length] ?? "")) {
          violations.push(`${relative(root, path).replaceAll("\\", "/")}: ${name}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("preserves internal workspace scopes", () => {
    expect(readJson("apps/storybook/package.json").name).toBe("@mergora/storybook");
    expect(readJson("packages/eslint-config/package.json").name).toBe("@mergora/eslint-config");
    expect(readJson("packages/test-utils/package.json").name).toBe("@mergora/test-utils");
    expect(readJson("packages/typescript-config/package.json").name).toBe(
      "@mergora/typescript-config",
    );
    expect(readJson("tooling/registry-builder/package.json").name).toBe(
      "@mergora-internal/registry-builder",
    );
  });
});
