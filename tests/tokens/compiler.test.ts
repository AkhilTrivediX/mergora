import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  compileWorkspace,
  contrastRatio,
  cssVariableName,
  defaultWorkspaceRoot,
  resolveTokenDocument,
} from "../../tooling/token-compiler/src/compiler.mjs";

function tokenDocument(value: Record<string, unknown>) {
  return value;
}

describe("Mergora token compiler", () => {
  it("reproduces every committed artifact without drift", () => {
    const result = compileWorkspace({ mode: "check" });

    expect(result.tokenCount).toBeGreaterThanOrEqual(300);
    expect([...result.contexts.keys()].sort()).toEqual([
      "dark-comfortable",
      "dark-compact",
      "dark-touch",
      "enhanced-contrast-comfortable",
      "enhanced-contrast-compact",
      "enhanced-contrast-touch",
      "forced-colors-comfortable",
      "forced-colors-compact",
      "forced-colors-touch",
      "light-comfortable",
      "light-compact",
      "light-touch",
    ]);
    expect(result.contrastEvidence).toHaveLength(120);
    expect(result.contrastEvidence.every((entry) => entry.passes === true)).toBe(true);
  });

  it("keeps aliases in canonical DTCG and removes them from resolved DTCG", () => {
    const generated = resolve(defaultWorkspaceRoot, "packages/tokens/src/generated");
    const canonical = readFileSync(resolve(generated, "canonical.dtcg.json"), "utf8");
    const resolved = readFileSync(
      resolve(generated, "resolved/light-comfortable.dtcg.json"),
      "utf8",
    );

    expect(canonical).toContain('"{primitive.color.neutral.0}"');
    expect(resolved).not.toMatch(/"\{[A-Za-z0-9_.-]+\}"/);
    expect(resolved).toContain('"colorSpace": "oklch"');
  });

  it("emits deliberate mode, density, reduced-motion, and forced-color CSS", () => {
    const generated = resolve(defaultWorkspaceRoot, "packages/tokens/src/generated");
    const css = readFileSync(resolve(generated, "tokens.css"), "utf8");
    const tailwind = readFileSync(resolve(generated, "tailwind.css"), "utf8");

    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain(':root[data-contrast="enhanced"]');
    expect(css).toContain(':root[data-density="compact"]');
    expect(css).toContain(':root[data-density="touch"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("--mrg-semantic-color-focus-ring: Highlight;");
    expect(tailwind).toContain("@theme inline");
    expect(tailwind).toContain("--color-action: var(--mrg-semantic-color-action-background);");
  });

  it("emits interoperable unqualified WOFF2 sources for variable font faces", () => {
    const fonts = readFileSync(
      resolve(defaultWorkspaceRoot, "packages/tokens/src/generated/fonts.css"),
      "utf8",
    );

    expect(fonts).toContain('format("woff2")');
    expect(fonts).not.toContain("tech(");
  });

  it("does not put timestamps or private machine paths in generated text", () => {
    const result = compileWorkspace({ mode: "memory" });
    for (const content of result.artifacts.values()) {
      expect(content).not.toContain(defaultWorkspaceRoot);
      expect(content).not.toMatch(/[A-Z]:\\Users\\/i);
      expect(content).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    }
  });

  it("detects circular aliases with the complete cycle", () => {
    const document = tokenDocument({
      a: { $type: "dimension", $value: "{b}" },
      b: { $type: "dimension", $value: "{c}" },
      c: { $type: "dimension", $value: "{a}" },
    });

    expect(() => resolveTokenDocument(document, "cycle-fixture")).toThrow(
      /Circular token reference detected: a -> b -> c -> a/,
    );
  });

  it("rejects unresolved aliases and cross-type aliases", () => {
    expect(() =>
      resolveTokenDocument(
        tokenDocument({ a: { $type: "dimension", $value: "{missing}" } }),
        "missing-fixture",
      ),
    ).toThrow(/references unknown token missing/);

    expect(() =>
      resolveTokenDocument(
        tokenDocument({
          color: {
            $type: "color",
            $value: { colorSpace: "oklch", components: [0.5, 0.1, 150] },
          },
          size: { $type: "dimension", $value: "{color}" },
        }),
        "type-fixture",
      ),
    ).toThrow(/token types differ/);
  });

  it("rejects non-OKLCH and malformed token values", () => {
    expect(() =>
      resolveTokenDocument(
        tokenDocument({
          bad: {
            $type: "color",
            $value: { colorSpace: "srgb", components: [1, 0, 0] },
          },
        }),
        "color-fixture",
      ),
    ).toThrow(/must use an OKLCH/);

    expect(() =>
      resolveTokenDocument(
        tokenDocument({ bad: { $type: "duration", $value: { value: -1, unit: "ms" } } }),
        "duration-fixture",
      ),
    ).toThrow(/non-negative/);
  });

  it("computes WCAG contrast from OKLCH and exposes stable CSS variable names", () => {
    const black = { colorSpace: "oklch", components: [0, 0, 0] };
    const white = { colorSpace: "oklch", components: [1, 0, 0] };

    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(cssVariableName("component.dataGrid.selectionBackground")).toBe(
      "--mrg-component-data-grid-selection-background",
    );
  });

  it("fails closed on byte drift and repairs it only in write mode", () => {
    const temporaryDirectory = mkdtempSync(resolve(tmpdir(), "mergora-token-drift-"));
    const generatedDirectory = resolve(temporaryDirectory, "generated");
    const packageIndexPath = resolve(temporaryDirectory, "index.ts");
    try {
      compileWorkspace({ generatedDirectory, mode: "write", packageIndexPath });
      const cssPath = resolve(generatedDirectory, "tokens.css");
      writeFileSync(cssPath, `${readFileSync(cssPath, "utf8")}/* drift */\n`, "utf8");

      expect(() =>
        compileWorkspace({ generatedDirectory, mode: "check", packageIndexPath }),
      ).toThrow(/Generated token artifacts have drifted/);

      const repaired = compileWorkspace({ generatedDirectory, mode: "write", packageIndexPath });
      expect(repaired.drift).toContain(cssPath);
      expect(() =>
        compileWorkspace({ generatedDirectory, mode: "check", packageIndexPath }),
      ).not.toThrow();
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  });
});
