import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { defaultWorkspaceRoot } from "../../tooling/token-compiler/src/compiler.mjs";

function readJson(path: string) {
  return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
}

describe("Mergora token distribution contract", () => {
  const source = resolve(defaultWorkspaceRoot, "registry/source/tokens");
  const generated = resolve(defaultWorkspaceRoot, "packages/tokens/src/generated");
  const fonts = resolve(defaultWorkspaceRoot, "assets/fonts");

  it("declares the final DTCG format and resolver schemas", () => {
    const primitives = readJson(resolve(source, "primitives.tokens.json"));
    const resolver = readJson(resolve(source, "mergora.resolver.json"));

    expect(primitives.$schema).toBe("https://www.designtokens.org/schemas/2025.10/format.json");
    expect(resolver.$schema).toBe("https://www.designtokens.org/schemas/2025.10/resolver.json");
    expect(resolver.version).toBe("2025.10");
  });

  it("pins the Living Workbench brand anchors exactly", () => {
    const docs = readJson(resolve(generated, "docs.json"));
    expect(docs.brandAnchors).toMatchObject({
      actionGreen: { components: [0.42, 0.13, 150] },
      canvas: { components: [1, 0, 0] },
      deepViolet: { components: [0.33, 0.135, 292] },
      ink: { components: [0.18, 0.018, 150] },
      line: { components: [0.875, 0.01, 150] },
      livingGreen: { components: [0.6, 0.158, 150] },
      mutedInk: { components: [0.47, 0.018, 150] },
      surface: { components: [0.97, 0.006, 150] },
    });
  });

  it("verifies the exact self-hosted font bytes and license files", () => {
    const manifest = readJson(resolve(fonts, "manifest.json")) as {
      families: Array<{
        asset: string;
        license: string;
        licenseSha256: string;
        normalization?: {
          maxpMaxZones: {
            maxTwilightPoints: number;
            output: number;
            source: number;
          };
        };
        sha256: string;
      }>;
    };

    expect(manifest.families.map((family) => family.asset)).toEqual([
      "schibsted-grotesk-latin-ext-wght.woff2",
      "commit-mono-latin-greek-wght.woff2",
    ]);
    for (const family of manifest.families) {
      const assetHash = createHash("sha256")
        .update(readFileSync(resolve(fonts, family.asset)))
        .digest("hex");
      const licenseHash = createHash("sha256")
        .update(readFileSync(resolve(fonts, family.license)))
        .digest("hex");
      expect(assetHash).toBe(family.sha256);
      expect(licenseHash).toBe(family.licenseSha256);
    }
    expect(manifest.families[1]?.normalization?.maxpMaxZones).toMatchObject({
      maxTwilightPoints: 0,
      output: 1,
      source: 0,
    });
  });

  it("publishes a schema, documentation data, and design-tool projection", () => {
    const schema = readJson(resolve(generated, "schema.json"));
    const docs = readJson(resolve(generated, "docs.json"));
    const interchange = readJson(resolve(generated, "design-tool-interchange.dtcg.json"));

    expect(schema.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
    expect(docs).toMatchObject({
      contractVersion: "1.1.0",
      dtcgVersion: "2025.10",
      name: "Mergora Living Workbench",
      tokenCount: 405,
    });
    expect(Object.keys(interchange.workbench as object)).toHaveLength(12);
  });

  it("publishes the reusable family signature without oversized radii or soft shadows", () => {
    const docs = readJson(resolve(generated, "docs.json")) as {
      tokens: Array<{ path: string; type: string; value: string }>;
    };
    const primitives = readJson(resolve(source, "primitives.tokens.json")) as {
      primitive: {
        shadow: {
          lg: { $value: { blur: { value: number } } };
          md: { $value: Array<{ blur: { value: number } }> };
        };
      };
    };
    const paths = new Set(docs.tokens.map(({ path }) => path));

    for (const path of [
      "component.control.backgroundSelected",
      "component.field.statusRailLoading",
      "component.focusIndicator.contrastBackground",
      "component.overlay.surface",
      "component.progress.indeterminate",
      "semantic.color.status.loading.foreground",
      "semantic.density.controlPaddingBlock",
      "semantic.radius.surface",
    ]) {
      expect(paths).toContain(path);
    }

    const radiusValues = docs.tokens
      .filter(({ path, type }) => type === "dimension" && path.includes("radius"))
      .map(({ value }) => Number.parseFloat(value));
    expect(radiusValues.length).toBeGreaterThan(10);
    expect(radiusValues.every((value) => value <= 16)).toBe(true);
    expect(primitives.primitive.shadow.md.$value.every(({ blur }) => blur.value <= 8)).toBe(true);
    expect(primitives.primitive.shadow.lg.$value.blur.value).toBeLessThanOrEqual(8);
  });
});
