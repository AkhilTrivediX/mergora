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
  tokenValueToCss,
} from "../../tooling/token-compiler/src/compiler.mjs";

function tokenDocument(value: Record<string, unknown>) {
  return value;
}

function normalizedCssValue(value: string): string {
  return value.replaceAll(/\s+/gu, " ").trim();
}

function resolvedColor(token: { readonly resolvedValue: unknown; readonly type: string }) {
  expect(token.type).toBe("color");
  expect(token.resolvedValue).toBeTypeOf("object");
  expect(token.resolvedValue).not.toBeNull();
  return token.resolvedValue as Record<string, unknown>;
}

function customProperties(css: string, selector: string): ReadonlyMap<string, string> {
  const marker = `${selector} {`;
  const start = css.indexOf(marker);
  expect(start, `${selector} should be emitted`).toBeGreaterThanOrEqual(0);
  const bodyStart = start + marker.length;
  const end = css.indexOf("\n}", bodyStart);
  expect(end, `${selector} should have a closing brace`).toBeGreaterThan(bodyStart);
  const properties = new Map<string, string>();
  for (const match of css.slice(bodyStart, end).matchAll(/^\s*(--[a-z0-9-]+):\s*([\s\S]*?);/gimu)) {
    properties.set(match[1]!, normalizedCssValue(match[2]!));
  }
  return properties;
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
    expect(result.contrastEvidence).toHaveLength(144);
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
    expect(css).toContain(':root[data-contrast="forced-colors"]');
    expect(css).toContain(':root[data-density="compact"]');
    expect(css).toContain(':root[data-density="touch"]');
    expect(css).toContain(':root[data-motion="reduced"]');
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("@media (forced-colors: active)");
    expect(css).toContain("--mrg-semantic-color-focus-ring: Highlight;");
    expect(css).toContain("--mrg-semantic-color-status-loading-border: Highlight;");
    expect(css).toContain("--mrg-component-control-background-selected: Highlight;");
    expect(css).toContain("--mrg-component-field-status-rail-danger: Highlight;");
    expect(css).toContain("--mrg-component-progress-error: Highlight;");
    expect(css).toContain("--mrg-semantic-density-control-padding-block: 12px;");
    expect(tailwind).toContain("@theme inline");
    expect(tailwind).toContain("--color-action: var(--mrg-semantic-color-action-background);");
    expect(tailwind).toContain("--radius-surface: var(--mrg-semantic-radius-surface);");
  });

  it("emits a complete enhanced-contrast context that safely overrides dark theme", () => {
    const result = compileWorkspace({ mode: "memory" });
    const css = result.artifacts.get(
      resolve(defaultWorkspaceRoot, "packages/tokens/src/generated/tokens.css"),
    )!;
    const dark = result.contexts.get("dark-comfortable")!;
    const enhanced = result.contexts.get("enhanced-contrast-comfortable")!;
    const darkDeclarations = customProperties(css, ':root[data-theme="dark"]');
    const enhancedDeclarations = customProperties(css, ':root[data-contrast="enhanced"]');
    const composedDeclarations = new Map([...darkDeclarations, ...enhancedDeclarations]);

    expect(enhancedDeclarations.size).toBe(enhanced.size);
    for (const [path, token] of enhanced) {
      const variable = cssVariableName(path);
      const expected = normalizedCssValue(tokenValueToCss(token.type, token.resolvedValue));
      expect(enhancedDeclarations.get(variable), path).toBe(expected);
      expect(composedDeclarations.get(variable), `dark + enhanced ${path}`).toBe(expected);
    }

    for (const density of ["compact", "touch"] as const) {
      const densityDeclarations = customProperties(css, `:root[data-density="${density}"]`);
      const enhancedDensity = result.contexts.get(`enhanced-contrast-${density}`)!;
      const composedDensity = new Map([
        ...darkDeclarations,
        ...enhancedDeclarations,
        ...densityDeclarations,
      ]);
      for (const [path, token] of enhancedDensity) {
        const variable = cssVariableName(path);
        const expected = normalizedCssValue(tokenValueToCss(token.type, token.resolvedValue));
        expect(composedDensity.get(variable), `dark + enhanced + ${density} ${path}`).toBe(
          expected,
        );
      }
    }

    const actionForeground = enhanced.get("semantic.color.action.foreground")!;
    const darkActionForeground = dark.get("semantic.color.action.foreground")!;
    const actionBackground = enhanced.get("semantic.color.action.background")!;
    expect(
      contrastRatio(resolvedColor(darkActionForeground), resolvedColor(actionBackground)),
    ).toBeLessThan(4.5);
    expect(
      contrastRatio(resolvedColor(actionForeground), resolvedColor(actionBackground)),
    ).toBeGreaterThanOrEqual(4.5);
    expect(enhancedDeclarations.get("--mrg-semantic-color-action-foreground")).toBe(
      normalizedCssValue(tokenValueToCss(actionForeground.type, actionForeground.resolvedValue)),
    );
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
